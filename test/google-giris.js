'use strict';
/**
 * GOOGLE HESABIYLA GİRİŞ UYUMLULUĞU — birim sınamaları. AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/google-giris.js   (npm test de koşar)
 *
 * ⛔ NEDEN VAR (Burak, 03.10.2026): YouTube'da Google ile oturum açarken Google
 *    "Bu tarayıcı veya uygulama güvenli olmayabilir" diyerek girişi reddediyordu.
 *    Çözüm yalnız Google giriş sayfasında tutarlı bir Firefox kimliği. Bu sınama
 *    iki şeyi birlikte kilitler: giriş ÇALIŞSIN diye kimlik her katmanda aynı
 *    olsun, ve istisna giriş sayfasının DIŞINA taşmasın (YouTube'un kendisi,
 *    Google araması, benzer görünen alan adları Chrome kimliğinde ve kalkanlı kalır).
 */
const G = require('../src/main/google-giris.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  → ' + d : ''}`); }
};
const g = (x) => JSON.stringify(x);

// ── 1. Kapsam: yalnız giriş sayfası ───────────────────────────────────────
console.log('\n\x1b[1m1) Kapsam — istisna yalnız Google giriş sayfasında\x1b[0m');
{
  ol('accounts.google.com giriş sayfası', G.girisSayfasiMi('https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fwww.youtube.com'));
  ol('accounts.youtube.com (YouTube oturum eşitlemesi)', G.girisSayfasiMi('https://accounts.youtube.com/accounts/SetSID'));
  const DISARI = ['https://www.youtube.com/', 'https://www.google.com/search?q=x', 'https://mail.google.com/',
                  'https://myaccount.google.com/', 'http://accounts.google.com/', 'https://accounts.google.com.kotu.com/',
                  'https://kotu.com/accounts.google.com', 'javascript:alert(1)', '', null];
  ol('⛔ YouTube, Google arama, Gmail, http://, benzer görünen alan adı: istisna YOK',
     DISARI.every((u) => !G.girisSayfasiMi(u)), g(DISARI.filter((u) => G.girisSayfasiMi(u))));
}

// ── 2. Firefox kimliği ────────────────────────────────────────────────────
console.log('\n\x1b[1m2) Firefox kimliği — güncel, gerçekçi\x1b[0m');
{
  ol('taban: 2024-07-09 → 128', G.firefoxSurumu(Date.UTC(2024, 6, 9)) === 128);
  ol('dört haftada bir artıyor, bir eksiği alınıyor', G.firefoxSurumu(Date.UTC(2025, 6, 9)) === 128 + 13 - 1, G.firefoxSurumu(Date.UTC(2025, 6, 9)));
  ol('geçmiş tarihte tabanın altına inmiyor', G.firefoxSurumu(Date.UTC(2020, 0, 1)) === 128);
  const uaW = G.firefoxUA('win32', Date.UTC(2026, 9, 3));
  ol('Windows biçimi gerçek Firefox gibi', uaW === 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0', uaW);
  ol('macOS ve Linux biçimleri', /Macintosh; Intel Mac OS X 10\.15; rv:\d+\.0\) Gecko\/20100101 Firefox\/\d+\.0$/.test(G.firefoxUA('darwin'))
     && /\(X11; Linux x86_64; rv:\d+\.0\) Gecko\/20100101 Firefox\/\d+\.0$/.test(G.firefoxUA('linux')));
  ol('Electron ya da Chrome izi yok', !/Electron|Chrome|İlgezdi|Ilgezdi/i.test(G.firefoxUA()));
}

// ── 3. Hangi istek Firefox kimliğiyle gider ───────────────────────────────
console.log('\n\x1b[1m3) İstek kararı — başlıklar arası tutarlılık\x1b[0m');
{
  const GIRIS = 'https://accounts.google.com/v3/signin';
  ol('giriş sayfasının kendi isteği', G.firefoxKimligiMi(GIRIS, 'https://www.youtube.com/', 'mainFrame'));
  ol('giriş sayfasının yüklediği alt kaynak (gstatic)', G.firefoxKimligiMi('https://ssl.gstatic.com/x.js', GIRIS, 'script'));
  ol('⛔ girişten YouTube\'a DÖNÜŞ isteği Chrome kimliğiyle', !G.firefoxKimligiMi('https://www.youtube.com/', GIRIS, 'mainFrame'));
  ol('YouTube sayfasındaki alt kaynak Chrome kimliğiyle', !G.firefoxKimligiMi('https://i.ytimg.com/a.jpg', 'https://www.youtube.com/', 'image'));
}

// ── 4. Başlıklar ──────────────────────────────────────────────────────────
console.log('\n\x1b[1m4) Başlıklar — Firefox istemci ipucu göndermez\x1b[0m');
{
  const ua = G.firefoxUA('win32');
  const h = G.basliklariCevir({ 'User-Agent': 'Mozilla/5.0 … Chrome/140', 'sec-ch-ua': '"Chromium";v="140"',
    'Sec-CH-UA-Mobile': '?0', 'sec-ch-ua-platform': '"Windows"', 'Sec-GPC': '1', Accept: 'text/html' }, ua);
  ol('tüm Sec-CH-UA* başlıkları silindi (büyük/küçük harf fark etmez)', !Object.keys(h).some((k) => /^sec-ch-ua/i.test(k)), g(Object.keys(h)));
  ol('tek bir User-Agent var ve Firefox', Object.keys(h).filter((k) => /^user-agent$/i.test(k)).length === 1 && h['User-Agent'] === ua);
  ol('diğer başlıklar (Sec-GPC dahil) korunuyor', h['Sec-GPC'] === '1' && h.Accept === 'text/html');
}

// ── 5. Sayfa içi kimlik başlıkla aynı ─────────────────────────────────────
console.log('\n\x1b[1m5) Sayfa içi kimlik — başlıkla aynı\x1b[0m');
{
  const ua = G.firefoxUA('win32');
  const N = { userAgentData: { brands: [{ brand: 'Chromium' }] } };
  Object.defineProperty(N, 'userAgentData', { value: N.userAgentData, configurable: true, writable: true });
  const betik = G.anaDunyaBetigi(ua);
  new Function('Navigator', betik)({ prototype: N });
  ol('navigator.userAgent başlıktaki UA ile aynı', N.userAgent === ua, N.userAgent);
  ol('appVersion "Mozilla/" olmadan', N.appVersion === ua.slice(8));
  ol('vendor boş, productSub 20100101 (Firefox değerleri)', N.vendor === '' && N.productSub === '20100101');
  ol('navigator.userAgentData kaldırıldı (Firefox\'ta yok)', !('userAgentData' in N));
  ol('betik değer döndürmüyor (executeJavaScript seri hale getirmesin)', betik.endsWith('void 0;'));
  ol('UA metni betiğe kaçışlı giriyor (tırnak betiği kıramaz)', (() => {
    const N2 = {}; new Function('Navigator', G.anaDunyaBetigi('a"b\'c'))({ prototype: N2 }); return N2.userAgent === 'a"b\'c';
  })());
}

console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
process.exit(kalan ? 1 : 0);
