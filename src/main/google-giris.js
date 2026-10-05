'use strict';
/**
 * İlgezdi — Google hesabıyla giriş: giriş sayfasını tanıma ve sonucu tanılamaya yazma
 * (saf mantık).
 *
 * ⛔ SORUN (Burak, 03.10.2026): YouTube'da "Google ile oturum aç" deyince Google
 *    "Bu tarayıcı veya uygulama güvenli olmayabilir" diyerek girişi reddediyor.
 *
 * ⛔ YANLIŞ İZ — KİMLİK TAKLİDİ (04-06.10.2026, KALDIRILDI): önce sayfa içi navigator
 *    JS ile, sonra Chromium'un yerel geçersiz kılmasıyla (CDP) giriş sayfasında
 *    Firefox / Chrome / Edge kimliği denendi; Ayarlar › Genel'de geçici bir seçim vardı.
 *    05.10 test.3 tanılama günlüğü: firefox ve chrome kiplerinde kimlik sayfaya
 *    UYGULANMIŞTI (uyum: true), Google yine reddetti. Firefox kimliği üstelik Chromium
 *    motoruyla çelişiyordu; Burak 0.8.9'da girişin daha ileri gittiğini gördü. Kipler,
 *    seçim ve başlık çevirme kaldırıldı; tarayıcı her yerde aynı temiz Chromium kimliğiyle
 *    gider (main.js CLEAN_UA).
 *
 * ✅ ASIL NEDEN: Electron'un boş window.chrome nesnesi — bkz. chrome-nesnesi.js.
 *
 * Bu modülde kalan:
 *   girisSayfasiMi — giriş sayfasında parmak izi gürültüsü yok (main.js
 *                    fingerprintScriptFor; orada kullanıcı zaten kendi hesabıyla
 *                    kimliğini bildiriyor, korunacak anonimlik yok).
 *   reddedildiMi / girisAdimi — sonuç tanılama günlüğüne: Google reddettiyse ret kodu,
 *                    değilse girişin hangi adıma geldiği. ADRES SORGUSU YAZILMAZ.
 */

// Yalnız giriş akışının kendisi. youtube.com, google.com aramaları vb. DEĞİL.
const GIRIS_HOSTLARI = new Set(['accounts.google.com', 'accounts.youtube.com']);

function girisSayfasiMi(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && GIRIS_HOSTLARI.has(u.hostname.toLowerCase());
  } catch { return false; }
}

// Google'ın ret sayfası: /v3/signin/rejected (bugün), /signin/rejected ve
// /signin/v2/deniedsigninrejected (eski akışlar).
const RET_YOLU = /\/(?:signin\/rejected|deniedsigninrejected)\/?$/;

/**
 * Google girişi reddettiyse { rrk } (Google'ın ret kodu; yoksa null), değilse null.
 */
function reddedildiMi(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'accounts.google.com') return null;
    if (!RET_YOLU.test(u.pathname)) return null;
    const rrk = Number(u.searchParams.get('rrk'));
    return { rrk: Number.isInteger(rrk) && rrk > 0 ? rrk : null };
  } catch { return null; }
}

/**
 * Girişin geldiği adım, tanılama için: yalnız yol (ör. /v3/signin/challenge/pwd).
 * Sorgu ve parça YOK — oralarda e-posta ipucu ve oturum belirteçleri olabilir.
 * Giriş sayfası değilse ''.
 */
function girisAdimi(url) {
  if (!girisSayfasiMi(url)) return '';
  try { return new URL(String(url)).pathname.slice(0, 80); } catch { return ''; }
}

module.exports = { GIRIS_HOSTLARI, girisSayfasiMi, reddedildiMi, girisAdimi };
