'use strict';
/**
 * İlgezdi — Google hesabıyla giriş uyumluluğu (saf mantık).
 *
 * ⛔ SORUN (Burak, 03.10.2026): YouTube'da "Google ile oturum aç" deyince Google
 *    "Bu tarayıcı veya uygulama güvenli olmayabilir" diyerek girişi reddediyor.
 *    Google 2021'den beri gömülü tarayıcı çatılarından (CEF/Electron) girişi
 *    engelliyor; bunu UA'nın yanında sayfa içi ölçümlerle de anlıyor.
 *
 * ⛔ İLK DENEME BAŞARISIZ (04.10.2026, Burak ölçtü): giriş sayfasında başlığı
 *    Firefox yapıp sayfa içindeki navigator.userAgent'ı JAVASCRIPT ile yeniden
 *    tanımladık. Google kimlik sayfasını geçirdi, sonraki adımda (geçiş anahtarı
 *    iptal edilince) yine reddetti. En güçlü şüphe: JS ile tanımlanan alıcılar
 *    yerel kod gibi görünmüyor ("[native code]" değil) — bot denetimi bunu
 *    "üzerinde oynanmış ortam" sayar. Bu yüzden ARTIK JS TAKLİDİ YOK: kimlik
 *    Chromium'un kendi kullanıcı aracısı geçersiz kılmasıyla (CDP
 *    Emulation.setUserAgentOverride, main.js) verilir; navigator değerleri,
 *    istemci ipuçları ve worker'lar dahil hepsi YEREL ve tutarlı olur.
 *
 * ⚠️ DENEME KİPLERİ (Burak, 04.10.2026 — "seçmeli deneme sürümü"): hangi kimliğin
 *    Google'dan geçtiği ancak Burak'ın gerçek hesabıyla ölçülebiliyor. Ayarlar ›
 *    Genel'de geçici bir seçim var; çalışan kip kalıcı yapılıp seçim kaldırılacak.
 *      firefox — Firefox (istemci ipucu yok; Firefox göndermez)
 *      chrome  — Chrome (kısaltılmış UA + "Google Chrome" markalı istemci ipuçları)
 *      edge    — Edge (aynısı, "Microsoft Edge" markası)
 *      kapali  — hiçbir şey yapılmaz (karşılaştırma için)
 *
 * Her kipte giriş sayfasında parmak izi gürültüsü kapalıdır (kapali hariç).
 * ⚠️ GİZLİLİK: istisna yalnız giriş sayfasında; orada kullanıcı zaten kendi
 *    hesabıyla kimliğini bildiriyor. YouTube'un kendisi Chrome kimliğinde ve
 *    kalkanlı kalır.
 */

// Yalnız giriş akışının kendisi. youtube.com, google.com aramaları vb. DEĞİL.
const GIRIS_HOSTLARI = new Set(['accounts.google.com', 'accounts.youtube.com']);
const KIPLER = Object.freeze(['firefox', 'chrome', 'edge', 'kapali']);
const VARSAYILAN_KIP = 'firefox';

function kipDuzelt(kip) {
  return KIPLER.includes(kip) ? kip : VARSAYILAN_KIP;
}

function girisSayfasiMi(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && GIRIS_HOSTLARI.has(u.hostname.toLowerCase());
  } catch { return false; }
}

/**
 * Güncel Firefox sürüm numarası, tarihten. Firefox 2024-07-09'dan (128) beri dört
 * haftada bir sürüm çıkarıyor; bir eksiği alınır (kullanıcıların çoğu bir sürüm geride).
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

const CHROMIUM_OS = (platform) =>
  platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' :
  platform === 'linux'  ? 'X11; Linux x86_64' :
                          'Windows NT 10.0; Win64; x64';
const IPUCU_PLATFORM = (platform) =>
  platform === 'darwin' ? { ad: 'macOS', surum: '14.0.0' } :
  platform === 'linux'  ? { ad: 'Linux', surum: '6.0.0' } :
                          { ad: 'Windows', surum: '10.0.0' };

/**
 * Kipin kimliği: { userAgent, metadata, basliklar } ya da null (kapali).
 *  - userAgent: hem istek başlığı hem navigator.userAgent (yerel geçersiz kılma)
 *  - metadata : CDP userAgentMetadata (navigator.userAgentData) — Firefox'ta yok
 *  - basliklar: giriş isteklerine konacak Sec-CH-UA* başlıkları — Firefox'ta yok
 * ⚠️ Chrome/Edge UA'sı KISALTILMIŞ biçimde ("Chrome/152.0.0.0"): gerçek Chrome 2023'ten
 *    beri böyle gönderiyor. Tam sürüm ("152.0.7977.78") tek başına bir iz.
 */
function kimlik(kip, { platform = process.platform, chromeSurumu = process.versions.chrome || '140.0.0.0', simdi = Date.now() } = {}) {
  const k = kipDuzelt(kip);
  if (k === 'kapali') return null;
  if (k === 'firefox') return { kip: k, userAgent: firefoxUA(platform, simdi), metadata: null, basliklar: null };

  const tam = String(chromeSurumu);
  const ana = tam.split('.')[0];
  const marka = k === 'edge' ? 'Microsoft Edge' : 'Google Chrome';
  const ek = k === 'edge' ? ` Edg/${ana}.0.0.0` : '';
  const userAgent = `Mozilla/5.0 (${CHROMIUM_OS(platform)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ana}.0.0.0 Safari/537.36${ek}`;
  const p = IPUCU_PLATFORM(platform);
  const markalar = [{ brand: 'Chromium', version: ana }, { brand: marka, version: ana }, { brand: 'Not=A?Brand', version: '24' }];
  const metadata = {
    brands: markalar,
    fullVersionList: [{ brand: 'Chromium', version: tam }, { brand: marka, version: tam }, { brand: 'Not=A?Brand', version: '24.0.0.0' }],
    fullVersion: tam,
    platform: p.ad, platformVersion: p.surum,
    architecture: 'x86', model: '', mobile: false, bitness: '64', wow64: false,
  };
  const basliklar = {
    'Sec-CH-UA': markalar.map((m) => `"${m.brand}";v="${m.version}"`).join(', '),
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': `"${p.ad}"`,
  };
  return { kip: k, userAgent, metadata, basliklar };
}

/**
 * Bu istek giriş kimliğiyle mi gider? Ana belge isteğinde YALNIZ gidilen adrese
 * bakılır (girişten YouTube'a dönüş Chrome kimliğiyle). Alt kaynaklarda isteği
 * yapan sekmenin o anki sayfasına da bakılır: giriş sayfasının yüklediği her şey
 * aynı kimlikle gitsin, yoksa başlıklar arası tutarsızlık iz olur.
 */
function girisIstegiMi(istekUrl, sekmeUrl, kaynakTuru) {
  if (girisSayfasiMi(istekUrl)) return true;
  if (kaynakTuru === 'mainFrame') return false;
  return girisSayfasiMi(sekmeUrl);
}

/** İstek başlıklarını kimliğe çevirir (yeni nesne döner). */
function basliklariCevir(basliklar, k) {
  const cikti = {};
  for (const [ad, deger] of Object.entries(basliklar || {})) {
    const kucuk = ad.toLowerCase();
    if (kucuk.startsWith('sec-ch-ua') || kucuk === 'user-agent') continue;
    cikti[ad] = deger;
  }
  cikti['User-Agent'] = k.userAgent;
  if (k.basliklar) Object.assign(cikti, k.basliklar);
  return cikti;
}

/** CDP Emulation.setUserAgentOverride parametreleri. */
function cdpParametreleri(k) {
  const p = { userAgent: k.userAgent };
  if (k.metadata) p.userAgentMetadata = k.metadata;
  return p;
}

module.exports = {
  GIRIS_HOSTLARI, KIPLER, VARSAYILAN_KIP, kipDuzelt, girisSayfasiMi,
  firefoxSurumu, firefoxUA, kimlik, girisIstegiMi, basliklariCevir, cdpParametreleri,
};
