'use strict';
/**
 * İlgezdi — Google hesabıyla giriş uyumluluğu (saf mantık).
 *
 * ⛔ SORUN (Burak, 03.10.2026): YouTube'da "Google ile oturum aç" deyince Google
 *    "Bu tarayıcı veya uygulama güvenli olmayabilir" diyerek girişi reddediyor.
 *    Google, 2021'den beri gömülü tarayıcı çatılarından (CEF/Electron) girişi
 *    engelliyor ve bunu yalnız UA'dan değil sayfa içi ölçümlerden de anlıyor.
 *    İlgezdi'nin UA'sı zaten temiz Chrome (main.js CLEAN_UA); kalan iki iz:
 *      · parmak izi kalkanı tuval/ses/WebGL okumalarına site başına gürültü
 *        ekliyor — Google'ın giriş sayfasındaki bot denetimi tam bunları ölçüyor;
 *      · UA "Chrome" derken istemci ipuçları (Sec-CH-UA başlıkları,
 *        navigator.userAgentData) Electron'un marka listesini taşıyor.
 *
 * ÇÖZÜM (Electron tabanlı tarayıcıların yerleşik yolu): YALNIZ Google giriş
 * sayfasında İlgezdi kendini TUTARLI biçimde Firefox olarak tanıtır — istek
 * başlığı, navigator.userAgent, istemci ipucu yok (Firefox göndermez) — ve o
 * sayfada parmak izi gürültüsü kapalıdır. Giriş bitip YouTube'a dönülünce her
 * şey eski hâline döner; YouTube'un kendisi Chrome kimliğini görmeye devam eder.
 *
 * ⚠️ GİZLİLİK: giriş sayfasında parmak izi koruması kapanır. Orada kullanıcı
 *    Google'a ZATEN kendi hesabıyla kimliğini bildiriyor; o sayfada gürültünün
 *    koruduğu bir anonimlik yok. Kapsam yalnız aşağıdaki iki adres.
 */

// Yalnız giriş akışının kendisi. youtube.com, google.com aramaları vb. DEĞİL.
const GIRIS_HOSTLARI = new Set(['accounts.google.com', 'accounts.youtube.com']);

function girisSayfasiMi(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && GIRIS_HOSTLARI.has(u.hostname.toLowerCase());
  } catch { return false; }
}

/**
 * Güncel Firefox sürüm numarası, tarihten. Firefox 2024-07-09'dan (128) beri dört
 * haftada bir sürüm çıkarıyor. Çok eski bir sürüm "tarayıcınız eski" uyarısı
 * alır, var olmayan bir sürüm de kendini belli eder; bu yüzden takvimden
 * hesaplanır ve bir eksiği alınır (kullanıcıların çoğu bir sürüm geriden gelir).
 */
const FIREFOX_TABAN = { surum: 128, tarih: Date.UTC(2024, 6, 9) };
const DORT_HAFTA_MS = 28 * 24 * 60 * 60 * 1000;
function firefoxSurumu(simdi = Date.now()) {
  const gecen = Math.floor((Number(simdi) - FIREFOX_TABAN.tarih) / DORT_HAFTA_MS);
  return Math.max(FIREFOX_TABAN.surum, FIREFOX_TABAN.surum + gecen - 1);
}

function firefoxUA(platform = process.platform, simdi = Date.now()) {
  const v = firefoxSurumu(simdi) + '.0';
  const os =
    platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15' :
    platform === 'linux'  ? 'X11; Linux x86_64' :
                            'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}; rv:${v}) Gecko/20100101 Firefox/${v}`;
}

/**
 * Bu isteğe Firefox kimliği mi gidecek? Ana belge isteğinde YALNIZ gidilen
 * adrese bakılır (giriş sayfasından YouTube'a dönüş isteği Chrome'la gitsin).
 * Alt kaynaklarda (gstatic, apis.google.com…) isteği yapan sekmenin o anki
 * sayfasına da bakılır: giriş sayfasının yüklediği her şey aynı kimlikle gitsin,
 * yoksa başlıklar arası tutarsızlık yine iz olur.
 */
function firefoxKimligiMi(istekUrl, sekmeUrl, kaynakTuru) {
  if (girisSayfasiMi(istekUrl)) return true;
  if (kaynakTuru === 'mainFrame') return false;
  return girisSayfasiMi(sekmeUrl);
}

/** İstek başlıklarını Firefox kimliğine çevirir (yeni nesne döner). */
function basliklariCevir(basliklar, ua) {
  const cikti = {};
  for (const [k, v] of Object.entries(basliklar || {})) {
    const kucuk = k.toLowerCase();
    if (kucuk.startsWith('sec-ch-ua')) continue;          // Firefox istemci ipucu göndermez
    if (kucuk === 'user-agent') continue;
    cikti[k] = v;
  }
  cikti['User-Agent'] = ua;
  return cikti;
}

/**
 * Giriş sayfasının KENDİ dünyasında, sayfa betiklerinden önce çalışan parça
 * (ön yükleme fp-script kanalıyla gelir). Başlıkla aynı kimliği JS tarafında da
 * kurar. Değer döndürmez (executeJavaScript sonucu seri hale getirir).
 */
function anaDunyaBetigi(ua) {
  const u = JSON.stringify(String(ua));
  return '(function(){try{var N=Navigator.prototype;' +
    "var d=function(k,v){try{Object.defineProperty(N,k,{get:function(){return v;},configurable:true,enumerable:true});}catch(e){}};" +
    'd("userAgent",' + u + ');' +
    'd("appVersion",' + u + '.slice(8));' +
    'd("vendor","");' +
    'd("productSub","20100101");' +
    'try{delete N.userAgentData;}catch(e){}' +
    '}catch(e){}})(); void 0;';
}

module.exports = {
  GIRIS_HOSTLARI, girisSayfasiMi, firefoxSurumu, firefoxUA,
  firefoxKimligiMi, basliklariCevir, anaDunyaBetigi,
};
