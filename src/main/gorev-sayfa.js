/**
 * İlgezdi — Ülgen görev sayfası: adres denetimi ve metin sınırları (saf mantık)
 *
 * Ana Ülgen, İlgezdi'ye "şu sayfayı aç ve metnini ver" diyebiliyor (ulgen-gorev.js).
 * Adres UZAKTAN geliyor, yani burası bir dış girdi sınırı. Denetimler:
 *
 *   • Yalnız http ve https. `file:`, `data:`, `blob:`, `view-source:` ve dahili
 *     adresler reddedilir — yoksa "şu yerel dosyayı oku" diyen bir yol açılırdı.
 *   • Yerel ve ayrılmış adresler (localhost, 127.x, 10.x, 192.168.x, .local, ::1,
 *     fc00::/7, fe80::) reddedilir. Aksi hâlde uzaktan gelen bir iş, kullanıcının
 *     EV AĞINDAKİ modem arayüzünü ya da yerelde çalışan bir yönetim panelini
 *     okutabilirdi; İlgezdi o ağın içinde olduğu için güvenlik duvarı korumaz.
 *   • Kimlik bilgisi gömülü adres (http://kullanici:parola@site) reddedilir.
 *   • Yönlendirme zinciri de aynı denetimden geçer (main.js), yoksa dış bir sayfa
 *     302 ile 127.0.0.1'e yönlendirip aynı kapıyı açardı.
 *
 * Metin sınırı: IPC üzerinden 50 MB'lık bir sayfa metni geçirmek ana süreci
 * kilitler. Kırpılan metin `kirpildi: true` ile bildirilir — Ülgen yarım metni
 * TAM sanmamalı.
 */

'use strict';

const { isLocalOrReserved, normalizeHost } = require('./threat-lists');

// ⛔ ÖLÇÜLDÜ (04.10.2026, yayın öncesi denetim): IPv4-EŞLEMELİ IPv6 adresler yerel ağ yasağını aşıyordu —
//    `http://[::ffff:127.0.0.1]:8765/` ve `http://[::ffff:192.168.1.1]/` ok:true dönüyordu (URL ayrıştırıcısı
//    bunları `::ffff:7f00:1` biçimine çevirir, ortak denetim yalnız `::1`, `fc00::/7`, `fe80::` bakıyordu).
//    CGNAT aralığı 100.64.0.0/10 (operatör iç ağı) da açıktı. Ortak `isLocalOrReserved` tehdit listesi
//    ayrıştırmasında da kullanıldığı için orada değil, GÖREV adresine özel burada genişletildi.
function ipv4Esle(host) {
  const m = /^(?:0{0,4}:){0,5}:?(?:ffff:)?(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(host);
  if (!m || !host.includes(':')) return null;
  if (m[1]) return m[1];
  const a = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return [a >> 8, a & 255, b >> 8, b & 255].join('.');
}

function yerelAdresMi(hostname) {
  const h = normalizeHost(hostname);
  if (isLocalOrReserved(h)) return true;
  const v4 = ipv4Esle(h);
  if (v4 && isLocalOrReserved(v4)) return true;
  const ip = v4 || h;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 100 && b >= 64 && b <= 127) return true;          // 100.64.0.0/10 — CGNAT
  }
  return false;
}

const METIN_SINIRI = 100 * 1024;        // 100 KB — IPC ve model bağlamı için yeterli
const BASLIK_SINIRI = 300;
const IZINLI_SEMALAR = new Set(['http:', 'https:']);

/**
 * Görev için kabul edilebilir bir adres mi?
 * @returns {{ok: true, url: string}|{ok: false, sebep: string}}
 */
function gecerliGorevAdresi(deger) {
  const ham = typeof deger === 'string' ? deger.trim() : '';
  if (!ham || ham.length > 2048) return { ok: false, sebep: 'gecersiz_adres' };
  let u;
  try { u = new URL(ham); } catch { return { ok: false, sebep: 'gecersiz_adres' }; }
  if (!IZINLI_SEMALAR.has(u.protocol)) return { ok: false, sebep: 'gecersiz_adres' };
  // Kimlik gömülü adres: hem kimlik sızdırır hem de bazı sunucularda adresin
  // gerçek hedefini gizlemek için kullanılır.
  if (u.username || u.password) return { ok: false, sebep: 'gecersiz_adres' };
  if (yerelAdresMi(u.hostname)) return { ok: false, sebep: 'yerel_adres' };
  return { ok: true, url: u.toString() };
}

/** Metni sınıra indirir; kelime ortasında kesmemeye çalışır. */
function metniKirp(metin, sinir = METIN_SINIRI) {
  const s = String(metin == null ? '' : metin);
  if (s.length <= sinir) return { metin: s, kirpildi: false };
  let kesik = s.slice(0, sinir);
  const bosluk = kesik.lastIndexOf(' ');
  if (bosluk > sinir * 0.9) kesik = kesik.slice(0, bosluk);
  return { metin: kesik, kirpildi: true };
}

/**
 * Okuma modunun düğümlerinden düz metin. Başlıklar ve paragraflar arasında boş
 * satır bırakılır; liste öğeleri tire ile yazılır.
 */
function nodlardanMetin(nodes) {
  if (!Array.isArray(nodes)) return '';
  const parcalar = [];
  const gez = (liste) => {
    for (const n of liste) {
      if (!n || typeof n !== 'object') continue;
      if (typeof n.text === 'string' && n.text.trim()) {
        parcalar.push(n.tag === 'li' ? '- ' + n.text.trim() : n.text.trim());
      }
      if (Array.isArray(n.children)) gez(n.children);
    }
  };
  gez(nodes);
  return parcalar.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function basligiKirp(baslik) {
  return String(baslik == null ? '' : baslik).replace(/\s+/g, ' ').trim().slice(0, BASLIK_SINIRI);
}

module.exports = { gecerliGorevAdresi, yerelAdresMi, metniKirp, nodlardanMetin, basligiKirp, METIN_SINIRI, BASLIK_SINIRI };
