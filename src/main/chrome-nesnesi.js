'use strict';
/**
 * İlgezdi — sayfanın gördüğü window.chrome nesnesini Chrome'daki gibi tamamlar.
 *
 * ⛔ NEDEN (Burak, 03-06.10.2026): YouTube'da "Google ile oturum aç" deyince Google
 *    "Bu tarayıcı veya uygulama güvenli olmayabilir" diyerek girişi reddediyordu
 *    (accounts.google.com/v3/signin/rejected). Kimliği Firefox/Chrome/Edge gibi göstermek
 *    İŞE YARAMADI: 05.10 test.3 tanılama günlüğünde kimlik sayfaya uygulanmıştı
 *    (uyum: true), Google yine reddetti. Asıl neden kimlik dizesi değil:
 *      Chrome her http(s) sayfasına window.chrome içinde app, csi() ve loadTimes() verir.
 *      Electron nesneyi oluşturur ama BOŞ ({}) bırakır. Google'ın bot denetimi "Chrome
 *      diyor ama chrome.app yok" görünce bunu uygulama içine gömülü tarayıcı sayar.
 *    Aynı Electron 44 / Chrome 152 üzerinde Zenium değişkenleri tek tek ayırarak ölçtü
 *    (github.com/BenItBuhner/Zenium PR #142, 18.09.2026): boş nesne → reddedildi;
 *    yalnız { app } → geçti; csi/loadTimes tek başına → reddedildi; UA dizesi, istek
 *    başlıkları, engelleme listeleri → etkisiz. Moon Browser (#25) ve Lumen (#197) aynı
 *    sonuca vardı.
 *
 * Değerler ve özellik nitelikleri Chrome 152'deki gibi: hepsi yazılabilir, sayılabilir,
 * yapılandırılabilir veri özellikleri; sıra loadTimes, csi, app. Var olan üyeye dokunulmaz;
 * window.chrome hiç yoksa eklenmez (Chrome olmayan motorlar onu hiç taşımaz).
 *
 * ⚠️ GİZLİLİK: bu, İlgezdi'yi sıradan bir Chrome'dan AYIRAN bir izi kapatır; yeni bilgi
 *    açmaz. Her sayfada uygulanır, çünkü Chrome da her sayfada verir. Yalnız Google'da
 *    uygulansaydı İlgezdi diğer sitelere karşı yine "boş chrome nesneli tarayıcı" olarak
 *    ayırt edilirdi.
 *
 * Kendi kendine yeten bir işlev: dizeye çevrilip sayfanın kendi dünyasına, sayfa
 * betiklerinden ÖNCE ve her çerçevede konur (page-preload.js → 'fp-script', main.js).
 * Bu yüzden içinde dışarıdaki hiçbir şeye başvurulamaz.
 */
function chromeNesnesiniTamamla(w) {
  const chrome = w && w.chrome;
  if (!chrome || typeof chrome !== 'object') return false;
  const tanimla = (hedef, ad, deger) => {
    try {
      Object.defineProperty(hedef, ad, { value: deger, writable: true, enumerable: true, configurable: true });
    } catch (e) { /* nesneyi önce donduran sayfa onu olduğu gibi tutar */ }
  };
  const zamanlama = () => {
    try { return (w.performance && w.performance.timing) || null; } catch (e) { return null; }
  };
  const saniye = (ms) => (ms > 0 ? ms / 1000 : 0);
  if (!('loadTimes' in chrome)) {
    // Chrome'da kullanımdan kalktı (yerini Navigation Timing 2 aldı) ama hâlâ var ve okunuyor.
    tanimla(chrome, 'loadTimes', function () {
      const t = zamanlama();
      const bas = (t && t.navigationStart) || 0;
      return {
        requestTime: saniye(bas),
        startLoadTime: saniye(bas),
        commitLoadTime: saniye((t && t.responseStart) || 0),
        finishDocumentLoadTime: saniye((t && t.domContentLoadedEventEnd) || 0),
        finishLoadTime: saniye((t && t.loadEventEnd) || 0),
        firstPaintTime: saniye((t && t.responseStart) || 0),
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
        npnNegotiatedProtocol: 'unknown',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'unknown',
      };
    });
  }
  if (!('csi' in chrome)) {
    tanimla(chrome, 'csi', function () {
      const t = zamanlama();
      const bas = (t && t.navigationStart) || 0;
      return { startE: bas, onloadT: (t && t.domContentLoadedEventEnd) || 0, pageT: bas > 0 ? Date.now() - bas : 0, tran: 15 };
    });
  }
  if (!('app' in chrome)) {
    const app = {};
    tanimla(app, 'isInstalled', false);
    tanimla(app, 'getDetails', function getDetails() { return null; });
    tanimla(app, 'getIsInstalled', function getIsInstalled() { return false; });
    // Chrome geri çağırmayı EŞZAMANSIZ yanıtlar, eksikse yok sayar; işlevin biçimsel
    // parametresi yoktur (length 0) — bu yüzden kalan parametre.
    tanimla(app, 'installState', function installState(...args) {
      const geri = args[0];
      if (typeof geri === 'function') w.setTimeout(() => geri('not_installed'), 0);
    });
    tanimla(app, 'runningState', function runningState() { return 'cannot_run'; });
    const kurulum = {};
    tanimla(kurulum, 'DISABLED', 'disabled');
    tanimla(kurulum, 'INSTALLED', 'installed');
    tanimla(kurulum, 'NOT_INSTALLED', 'not_installed');
    tanimla(app, 'InstallState', kurulum);
    const calisma = {};
    tanimla(calisma, 'CANNOT_RUN', 'cannot_run');
    tanimla(calisma, 'READY_TO_RUN', 'ready_to_run');
    tanimla(calisma, 'RUNNING', 'running');
    tanimla(app, 'RunningState', calisma);
    tanimla(chrome, 'app', app);
  }
  return 'app' in chrome;
}

// Sayfaya giden betik. Hata verirse sessizce geçilir: arkasından gelen parmak izi
// kalkanı (aynı dizede) yine çalışır.
const BETIK = 'try { (' + chromeNesnesiniTamamla.toString() + ')(window); } catch (e) {}\n';

module.exports = { chromeNesnesiniTamamla, BETIK };
