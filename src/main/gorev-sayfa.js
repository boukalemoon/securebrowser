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
  if (isLocalOrReserved(normalizeHost(u.hostname))) return { ok: false, sebep: 'yerel_adres' };
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

module.exports = { gecerliGorevAdresi, metniKirp, nodlardanMetin, basligiKirp, METIN_SINIRI, BASLIK_SINIRI };
