'use strict';
/**
 * GOOGLE HESABIYLA GİRİŞ — birim sınamaları. AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/google-giris.js   (npm test de koşar)
 *
 * ⛔ NEDEN VAR (Burak, 03-06.10.2026): YouTube'da Google ile oturum açarken Google
 *    "Bu tarayıcı veya uygulama güvenli olmayabilir" diyor. Kimlik taklidi (Firefox /
 *    Chrome / Edge kipleri) ölçümde işe yaramadı ve kaldırıldı. Asıl neden Electron'un
 *    BOŞ window.chrome nesnesi: Google "Chrome diyor ama chrome.app yok" görünce gömülü
 *    tarayıcı sayıyor (chrome-nesnesi.js başlığında kanıt). Bu sınama kilitler:
 *    (1) window.chrome Chrome 152'deki biçim, değer ve niteliklerle tamamlanır, sayfaya
 *        giden betik kendi kendine yeter;
 *    (2) var olan üyeye dokunulmaz, chrome nesnesi olmayan ortama eklenmez;
 *    (3) gürültü istisnası giriş sayfasının DIŞINA taşmaz;
 *    (4) tanılama kaydı Google'ın reddini tanır ve adres sorgusunu YAZMAZ;
 *    (5) kimlik taklidi geri gelmez.
 */
const vm = require('vm');
const G = require('../src/main/google-giris.js');
const C = require('../src/main/chrome-nesnesi.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  → ' + d : ''}`); }
};
const g = (x) => JSON.stringify(x);
const ZAMAN = { navigationStart: 1759700000000, responseStart: 1759700000120, domContentLoadedEventEnd: 1759700000480, loadEventEnd: 1759700000900 };
const pencere = (chrome) => ({ chrome, performance: { timing: ZAMAN }, setTimeout: (f, ms) => setTimeout(f, ms) });

// ── 1. window.chrome tamamlanıyor ─────────────────────────────────────────
console.log('\n\x1b[1m1) window.chrome — Chrome 152 gibi\x1b[0m');
{
  const w = pencere({});
  ol('boş {} → app, csi, loadTimes eklendi; sonuç true', C.chromeNesnesiniTamamla(w) === true
     && typeof w.chrome.app === 'object' && typeof w.chrome.csi === 'function' && typeof w.chrome.loadTimes === 'function');
  ol('anahtar sırası Chrome\'daki gibi: loadTimes, csi, app', g(Object.keys(w.chrome)) === g(['loadTimes', 'csi', 'app']), g(Object.keys(w.chrome)));
  const nitelikTamam = (o) => Object.getOwnPropertyNames(o).every((k) => {
    const d = Object.getOwnPropertyDescriptor(o, k);
    return 'value' in d && d.writable && d.enumerable && d.configurable;
  });
  ol('her üye yazılabilir, sayılabilir, yapılandırılabilir VERİ özelliği (alıcı yok)',
     nitelikTamam(w.chrome) && nitelikTamam(w.chrome.app) && nitelikTamam(w.chrome.app.InstallState) && nitelikTamam(w.chrome.app.RunningState));
  const a = w.chrome.app;
  ol('chrome.app üyeleri ve sırası',
     g(Object.keys(a)) === g(['isInstalled', 'getDetails', 'getIsInstalled', 'installState', 'runningState', 'InstallState', 'RunningState']), g(Object.keys(a)));
  ol('chrome.app değerleri: kurulu değil, ayrıntı yok, çalışamaz',
     a.isInstalled === false && a.getDetails() === null && a.getIsInstalled() === false && a.runningState() === 'cannot_run');
  ol('InstallState / RunningState sabitleri',
     g(a.InstallState) === g({ DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' })
     && g(a.RunningState) === g({ CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }));
  ol('işlev adları ve parametre sayıları (installState.length 0)',
     a.getDetails.name === 'getDetails' && a.installState.name === 'installState' && a.installState.length === 0
     && w.chrome.loadTimes.length === 0 && w.chrome.csi.length === 0);
  let senkron = true, gelen = null;
  a.installState((d) => { gelen = { d, senkron }; });
  senkron = false;
  ol('installState geri çağırmasız çağrılınca hata yok',
     (() => { try { a.installState(); return true; } catch { return false; } })(), 'hata fırlattı');
  setTimeout(() => {
    ol('installState: eşzamansız "not_installed" geldi', gelen && gelen.d === 'not_installed' && gelen.senkron === false, g(gelen));
    son();
  }, 5);
  const lt = w.chrome.loadTimes();
  ol('loadTimes(): saniye cinsinden zamanlar ve Chrome\'un alanları',
     lt.requestTime === ZAMAN.navigationStart / 1000 && lt.finishLoadTime === ZAMAN.loadEventEnd / 1000
     && lt.navigationType === 'Other' && lt.connectionInfo === 'unknown' && Object.keys(lt).length === 13, g(lt));
  const csi = w.chrome.csi();
  ol('csi(): milisaniye, Chrome\'un dört alanı', csi.startE === ZAMAN.navigationStart && csi.onloadT === ZAMAN.domContentLoadedEventEnd
     && csi.tran === 15 && g(Object.keys(csi)) === g(['startE', 'onloadT', 'pageT', 'tran']), g(csi));
  ol('zamanlama okunamazsa sıfırlar (hata yok)', (() => {
    const w2 = { chrome: {}, get performance() { throw new Error('yok'); }, setTimeout };
    C.chromeNesnesiniTamamla(w2);
    return w2.chrome.loadTimes().requestTime === 0 && w2.chrome.csi().pageT === 0;
  })());
}

// ── 2. Dokunulmayacak durumlar ────────────────────────────────────────────
console.log('\n\x1b[1m2) Var olana dokunma, olmayana ekleme\x1b[0m');
{
  const kendi = { ozel: 1 };
  const w = pencere({ app: kendi });
  C.chromeNesnesiniTamamla(w);
  ol('var olan chrome.app aynen kalıyor; eksik csi/loadTimes ekleniyor',
     w.chrome.app === kendi && typeof w.chrome.csi === 'function' && typeof w.chrome.loadTimes === 'function');
  const yok = { performance: {}, setTimeout };
  ol('window.chrome hiç yoksa EKLENMİYOR (Chrome olmayan motor gibi kalır); sonuç false',
     C.chromeNesnesiniTamamla(yok) === false && !('chrome' in yok));
  ol('chrome nesne değilse dokunulmuyor', C.chromeNesnesiniTamamla({ chrome: 'x' }) === false && C.chromeNesnesiniTamamla(null) === false);
  const donuk = pencere(Object.freeze({}));
  ol('sayfa nesneyi dondurduysa hata fırlatmıyor', (() => { try { C.chromeNesnesiniTamamla(donuk); return true; } catch { return false; } })());
}

// ── 3. Sayfaya giden betik ────────────────────────────────────────────────
console.log('\n\x1b[1m3) Sayfaya giden betik — kendi kendine yeter\x1b[0m');
{
  const w = pencere({});
  const ctx = vm.createContext({ window: w });   // yalnız window: dışarıya başvuru olursa düşer
  let hata = null;
  try { vm.runInContext(C.BETIK, ctx); } catch (e) { hata = e; }
  ol('boş bağlamda yalnız window ile çalışıp nesneyi tamamlıyor', !hata && typeof w.chrome.app === 'object' && typeof w.chrome.csi === 'function', hata && hata.message);
  ol('hata verse bile arkasındaki kalkanı DURDURMUYOR (try/catch, satır sonuyla biter)',
     (() => { const c2 = vm.createContext({ window: { get chrome() { throw new Error('x'); } }, sonra: 0 });
              vm.runInContext(C.BETIK + 'sonra = 1;', c2); return c2.sonra === 1; })());
  ol('betik yalnız tamamlama yapıyor: navigator / userAgent / prototip değişikliği YOK',
     !/navigator|userAgent|\.prototype|toString/.test(C.BETIK.replace(/\/\/.*$/gm, '')));
}

// ── 4. Gürültü istisnasının kapsamı ───────────────────────────────────────
console.log('\n\x1b[1m4) Kapsam — gürültü istisnası yalnız Google giriş sayfasında\x1b[0m');
{
  ol('accounts.google.com ve accounts.youtube.com', G.girisSayfasiMi('https://accounts.google.com/v3/signin/challenge/pk') && G.girisSayfasiMi('https://accounts.youtube.com/accounts/SetSID'));
  const DISARI = ['https://www.youtube.com/', 'https://www.google.com/search?q=x', 'https://mail.google.com/',
                  'https://myaccount.google.com/', 'http://accounts.google.com/', 'https://accounts.google.com.kotu.com/',
                  'https://kotu.com/accounts.google.com', 'javascript:alert(1)', '', null];
  ol('⛔ YouTube, Google arama, Gmail, http://, benzer görünen alan adı: istisna YOK',
     DISARI.every((u) => !G.girisSayfasiMi(u)), g(DISARI.filter((u) => G.girisSayfasiMi(u))));
}

// ── 5. Tanılama: ret ve adım ──────────────────────────────────────────────
console.log('\n\x1b[1m5) Tanılama — Google\'ın reddi ve girişin geldiği adım\x1b[0m');
{
  ol('bugünkü ret sayfası ve ret kodu', g(G.reddedildiMi('https://accounts.google.com/v3/signin/rejected?rrk=46&hl=tr')) === g({ rrk: 46 }));
  ol('eski akışların ret sayfaları; kod yoksa null',
     g(G.reddedildiMi('https://accounts.google.com/signin/rejected')) === g({ rrk: null })
     && g(G.reddedildiMi('https://accounts.google.com/signin/v2/deniedsigninrejected?rrk=x')) === g({ rrk: null }));
  const RET_DEGIL = ['https://accounts.google.com/v3/signin/identifier', 'https://accounts.google.com/v3/signin/challenge/pwd',
                     'https://kotu.com/v3/signin/rejected', 'http://accounts.google.com/v3/signin/rejected',
                     'https://accounts.google.com/v3/signin/rejectedx', 'https://www.youtube.com/', '', null];
  ol('⛔ ret olmayan adımlar, başka alan adı, http: ret SAYILMIYOR', RET_DEGIL.every((u) => G.reddedildiMi(u) === null),
     g(RET_DEGIL.filter((u) => G.reddedildiMi(u) !== null)));
  const ADIM = 'https://accounts.google.com/v3/signin/challenge/pwd?TL=gizli&checkConnection=youtube&Email=ben%40ornek.com#x';
  ol('adım yalnız YOL: sorgu, e-posta, belirteç, parça yazılmıyor',
     G.girisAdimi(ADIM) === '/v3/signin/challenge/pwd' && !/gizli|ornek|Email|TL=|#/.test(G.girisAdimi(ADIM)), G.girisAdimi(ADIM));
  ol('giriş sayfası değilse adım boş', G.girisAdimi('https://www.youtube.com/watch?v=x') === '' && G.girisAdimi('') === '');
}

// ── 6. Kimlik taklidi geri gelmesin ───────────────────────────────────────
console.log('\n\x1b[1m6) Kimlik taklidi yok\x1b[0m');
{
  ol('modülde kip, kimlik ve başlık çevirme kalmadı',
     ['KIPLER', 'kipDuzelt', 'kimlik', 'firefoxUA', 'girisIstegiMi', 'basliklariCevir', 'cdpParametreleri', 'anaDunyaBetigi'].every((k) => !(k in G)));
}

let bitti = false;
function son() {
  if (bitti) return; bitti = true;
  console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
  process.exit(kalan ? 1 : 0);
}
