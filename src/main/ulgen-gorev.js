/**
 * İlgezdi — ANA ÜLGEN GÖREVLERİ (Katman 2)
 *
 * Burak (20.09.2026): *"Ülgen içerisinde bilgi araştırması yapmak
 * istediğimizde… İlgezdi olmalı"* + *"İlgezdi içerisinde klon Ülgen AI var,
 * çakışma olmayacak şekilde tasarlamamız gerekiyor; Ana Ülgen komut verip
 * klon Ülgen sayfa özeti vs. yapabilmeli."*
 *
 * NE YAPAR: Ana Ülgen bir sayfanın METNİNE ihtiyaç duyduğunda, İlgezdi o
 * sayfayı TEMİZ bir oturumda açar, klon Ülgen'in kendi ayıklayıcısıyla metni
 * çıkarır ve YALNIZ METNİ geri verir.
 *
 * ⛔ SAYFAYI BU MODÜL AÇMAZ. İlk hâlinde kendi `BrowserWindow`'unu açıyordu;
 * ilgezdi-15 doğru yakaladı: korumalar (parmak izi kalkanı, GPC, engelleyici,
 * tehdit listesi, sertifika denetimi, oturum yapılandırması) `createTab`
 * yolunda kuruluyor. Kendi pencereni açmak, "İlgezdi'den geziyoruz" sözünü
 * kâğıt üstünde bırakırdı. Artık sayfayı İLGEZDİ'NİN KENDİ YOLU getirir
 * (`kur({ sayfaGetir })`); yol verilmemişse görev DÜRÜSTÇE reddedilir.
 *
 * ╭─ ÇAKIŞMA KURALI ──────────────────────────────────────────────────────╮
 * │ Sayfaya dokunan tek akıl KLON'dur. Ana Ülgen sayfayı kendisi okumaz,  │
 * │ iş ister. Kullanıcının gördüğü sekmelere DOKUNULMAZ: görev İlgezdi'nin │
 * │ kendi yolunda, görünmez ve çerezsiz olarak yapılır. Aynı anda TEK iş.  │
 * │ Klonun kullanıcıya verdiği hizmet (özet, sayfada bul, çeviri) bundan  │
 * │ etkilenmez — ikisi aynı motoru paylaşır, aynı sekmeyi değil.          │
 * ╰───────────────────────────────────────────────────────────────────────╯
 *
 * YÖN: bağlantıyı HER ZAMAN İlgezdi açar (Ülgen'e bağlanır). İlgezdi'de
 * sunucu YOKTUR ve açılmayacaktır.
 *
 * GİZLİLİK:
 *   · Varsayılan KAPALI; `ulgenTasks` izni açılmadan tek bir iş alınmaz.
 *   · TEMİZ OTURUM (Burak kararı): kullanıcının çerezleri/oturumları
 *     kullanılmaz, iş bitince oturum verisi silinir. Üyelik gerektiren
 *     sayfalar okunamaz — bu bilerek böyle.
 *   · Gizli pencere açıkken görev alınmaz.
 *   · Yalnız METİN döner: HTML, çerez, ekran görüntüsü GÖNDERİLMEZ.
 *   · Jeton işletim sistemi kasasıyla şifreli saklanır; kasa yoksa eşleşme
 *     KURULMAZ (şifresiz saklamak yerine hiç saklamamak).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const osCrypto = require('./os-crypto');

const ULGEN_TABAN = process.env.ILGEZDI_ULGEN_TABAN || 'http://127.0.0.1:8765';
const JETON_DOSYA = () => path.join(app.getPath('userData'), 'ulgen-gorev.bin');
const BEKLE_SN = 20;                    // uzun yoklama
const HATA_BEKLEME_MS = 15000;          // Ülgen kapalıysa boşuna dönme
const YUKLEME_ZAMAN_ASIMI_MS = 30000;   // görev sayfası bu süreyi aşarsa bırakılır
const AZAMI_METIN = 200000;

let jeton = '';
let calisiyor = false;
let durdur = false;
let sonDurum = { bagli: false, sonIs: null, hata: '' };
let izinVar = () => false;              // main.js bağlar (data-catalog: ulgenTasks)
let gizliAcik = () => false;            // gizli pencere açıkken görev alınmaz

/* ── Jeton ─────────────────────────────────────────────────────────────── */
async function jetonOku() {
  try {
    const p = JETON_DOSYA();
    if (!fs.existsSync(p) || !(await osCrypto.isAvailable())) return '';
    const { text } = await osCrypto.decryptBuffer(fs.readFileSync(p));
    return typeof text === 'string' ? text.trim() : '';
  } catch { return ''; }
}

async function jetonYaz(deger) {
  if (!(await osCrypto.isAvailable())) return false;   // şifresiz saklamaktansa hiç saklama
  fs.writeFileSync(JETON_DOSYA(), await osCrypto.encryptText(String(deger)));
  return true;
}

function jetonSil() {
  jeton = '';
  try { fs.rmSync(JETON_DOSYA(), { force: true }); return true; } catch { return false; }
}

/** Panodaki kodla eşleşir; jetonu ALIR ve şifreli saklar. */
async function esles(kod) {
  const temiz = String(kod || '').replace(/\D/g, '').slice(0, 6);
  if (temiz.length !== 6) return { ok: false, sebep: 'kod_bicimi' };
  try {
    const r = await fetch(`${ULGEN_TABAN}/api/ilgezdi/esles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kod: temiz, cihaz: `İlgezdi ${app.getVersion()}` }),
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    if (!d || !d.ok || !d.jeton) return { ok: false, sebep: d?.sebep || 'reddedildi' };
    if (!(await jetonYaz(d.jeton))) return { ok: false, sebep: 'kasa_yok' };
    jeton = d.jeton;
    baslat();
    return { ok: true };
  } catch (e) {
    return { ok: false, sebep: `ulasilamadi: ${String(e.message || e).slice(0, 60)}` };
  }
}

/* ── Sayfa getirme: İLGEZDİ'NİN KENDİ KORUMALI YOLU ────────────────────── */
// main.js bağlar; İlgezdi'nin sekme yolundan geçen, görünmez, temiz oturumlu
// getirici. Burada kasten YOK: bu modül sayfa açmaz.
let sayfaGetir = null;

async function sayfaMetni(url) {
  if (typeof sayfaGetir !== 'function') return { ok: false, sebep: 'sayfa_yolu_yok' };
  // Sözleşme (ilgezdi-15): temizOturum ZORUNLU true — Burak'ın kararı; false
  // geçmek doğrudan reddedilir ki yanlışlıkla girişli oturum kullanılmasın.
  const s = await sayfaGetir(url, { temizOturum: true, zamanAsimiMs: YUKLEME_ZAMAN_ASIMI_MS });
  if (!s || !s.ok || !s.metin) return { ok: false, sebep: (s && s.sebep) || 'metin_yok' };
  // Yalnız METİN döner: HTML, çerez, ekran görüntüsü taşınmaz.
  // `kirpildi` aynen aktarılır: yarım metni TAM sanmak, araştırmayı sessizce
  // yanlış sonuca götürürdü.
  return { ok: true, metin: String(s.metin).slice(0, AZAMI_METIN),
           baslik: String(s.baslik || '').slice(0, 300), url: String(s.url || url).slice(0, 2000),
           kirpildi: !!s.kirpildi || String(s.metin).length > AZAMI_METIN };
}

/* ── Döngü ─────────────────────────────────────────────────────────────── */
async function isAl() {
  const r = await fetch(`${ULGEN_TABAN}/api/ilgezdi/gorev?bekle=${BEKLE_SN}`, {
    headers: { 'X-Ilgezdi-Jeton': jeton },
    signal: AbortSignal.timeout((BEKLE_SN + 10) * 1000),
  });
  if (r.status === 204) return null;
  if (r.status === 401) { jetonSil(); throw new Error('jeton_gecersiz'); }
  if (!r.ok) throw new Error(`http_${r.status}`);
  return r.json();
}

async function sonucYaz(govde) {
  await fetch(`${ULGEN_TABAN}/api/ilgezdi/gorev/sonuc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ilgezdi-Jeton': jeton },
    body: JSON.stringify(govde), signal: AbortSignal.timeout(15000),
  });
}

async function dongu() {
  while (!durdur) {
    if (!izinVar() || !jeton) { await bekle(HATA_BEKLEME_MS); continue; }
    if (gizliAcik()) { await bekle(HATA_BEKLEME_MS); continue; }   // gizli pencerede iş alınmaz
    try {
      const is_ = await isAl();
      sonDurum = { bagli: true, sonIs: sonDurum.sonIs, hata: '' };
      if (!is_) continue;
      // ⚠️ Adres ÜLGEN'den gelir ve Ülgen'in Dış Kapısı'ndan geçmiştir; burada
      // yine de biçim denetimi yapılır (http/https dışına çıkılmaz).
      if (!/^https?:\/\//i.test(is_.url || '')) {
        await sonucYaz({ id: is_.id, ok: false, sebep: 'gecersiz_adres' });
        continue;
      }
      const sonuc = await sayfaMetni(is_.url);
      // ⛔ Ziyaret edilen ADRES tutulmaz: panelde gerekmiyor ve kişisel veri
      //    hiçbir yere yazılmaz (ilgezdi-15 uyarısı, 21.09.2026).
      sonDurum = { bagli: true, sonIs: { zaman: Date.now(), ok: !!sonuc.ok }, hata: '' };
      await sonucYaz({ id: is_.id, ...sonuc });
    } catch (e) {
      sonDurum = { bagli: false, sonIs: sonDurum.sonIs, hata: String(e.message || e).slice(0, 80) };
      await bekle(HATA_BEKLEME_MS);      // Ülgen kapalı olabilir: boşuna dönme
    }
  }
  calisiyor = false;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function baslat() {
  if (calisiyor) return;
  if (!jeton) jeton = await jetonOku();
  if (!jeton) return;                    // eşleşme yoksa döngü hiç başlamaz
  calisiyor = true; durdur = false;
  dongu();
}

function dur() { durdur = true; }

function durum() {
  return { eslesti: !!jeton, calisiyor, izin: izinVar(), sayfaYolu: typeof sayfaGetir === 'function', ...sonDurum };
}

/** main.js bağlar: izin okuma ve gizli pencere durumu. */
function kur({ izin, gizli, sayfaGetir: getirici }) {
  if (typeof izin === 'function') izinVar = izin;
  if (typeof gizli === 'function') gizliAcik = gizli;
  if (typeof getirici === 'function') sayfaGetir = getirici;
}

module.exports = { kur, baslat, dur, esles, jetonSil, durum, sayfaMetni, ULGEN_TABAN };
