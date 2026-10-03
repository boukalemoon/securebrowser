'use strict';
/**
 * GOOGLE HESABIYLA GİRİŞ UYUMLULUĞU — birim sınamaları. AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/google-giris.js   (npm test de koşar)
 *
 * ⛔ NEDEN VAR (Burak, 03-04.10.2026): YouTube'da Google ile oturum açarken Google
 *    "Bu tarayıcı veya uygulama güvenli olmayabilir" diyor. İlk deneme (JS ile
 *    navigator taklidi) kimlik sayfasını geçti, sonraki adımda reddedildi. Şimdi
 *    kimlik tarayıcının yerel geçersiz kılmasıyla veriliyor ve dört deneme kipi var.
 *    Bu sınama kilitler: (1) her kipte başlık, navigator ve istemci ipuçları AYNI
 *    tarayıcıyı anlatır; (2) istisna giriş sayfasının DIŞINA taşmaz; (3) JS taklidi
 *    geri gelmez.
 */
const G = require('../src/main/google-giris.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  → ' + d : ''}`); }
};
const g = (x) => JSON.stringify(x);
const ORTAM = { platform: 'win32', chromeSurumu: '152.0.7977.78', simdi: Date.UTC(2026, 9, 4) };

// ── 1. Kapsam ─────────────────────────────────────────────────────────────
console.log('\n\x1b[1m1) Kapsam — istisna yalnız Google giriş sayfasında\x1b[0m');
{
  ol('accounts.google.com ve accounts.youtube.com', G.girisSayfasiMi('https://accounts.google.com/v3/signin/challenge/pk') && G.girisSayfasiMi('https://accounts.youtube.com/accounts/SetSID'));
  const DISARI = ['https://www.youtube.com/', 'https://www.google.com/search?q=x', 'https://mail.google.com/',
                  'https://myaccount.google.com/', 'http://accounts.google.com/', 'https://accounts.google.com.kotu.com/',
                  'https://kotu.com/accounts.google.com', 'javascript:alert(1)', '', null];
  ol('⛔ YouTube, Google arama, Gmail, http://, benzer görünen alan adı: istisna YOK',
     DISARI.every((u) => !G.girisSayfasiMi(u)), g(DISARI.filter((u) => G.girisSayfasiMi(u))));
  const GIRIS = 'https://accounts.google.com/v3/signin';
  ol('giriş sayfası isteği ve onun alt kaynakları giriş kimliğiyle',
     G.girisIstegiMi(GIRIS, 'https://www.youtube.com/', 'mainFrame') && G.girisIstegiMi('https://ssl.gstatic.com/x.js', GIRIS, 'script'));
  ol('⛔ girişten YouTube\'a dönüş ve YouTube\'un kendi kaynakları normal kimlikle',
     !G.girisIstegiMi('https://www.youtube.com/', GIRIS, 'mainFrame') && !G.girisIstegiMi('https://i.ytimg.com/a.jpg', 'https://www.youtube.com/', 'image'));
}

// ── 2. Kipler ─────────────────────────────────────────────────────────────
console.log('\n\x1b[1m2) Deneme kipleri\x1b[0m');
{
  ol('dört kip, varsayılan firefox, bilinmeyen değer varsayılana düşer',
     g(G.KIPLER) === g(['firefox', 'chrome', 'edge', 'kapali']) && G.kipDuzelt('xyz') === 'firefox' && G.kipDuzelt(undefined) === 'firefox' && G.kipDuzelt('__proto__') === 'firefox');
  ol('kapali → kimlik yok (hiçbir şey değişmez)', G.kimlik('kapali', ORTAM) === null);

  const f = G.kimlik('firefox', ORTAM);
  ol('firefox: gerçek Firefox UA, istemci ipucu ve userAgentData yok',
     f.userAgent === 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0' && f.metadata === null && f.basliklar === null, f.userAgent);

  const c = G.kimlik('chrome', ORTAM);
  ol('chrome: KISALTILMIŞ UA (gerçek Chrome gibi "152.0.0.0", tam sürüm değil)',
     c.userAgent === 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', c.userAgent);
  ol('chrome: istemci ipuçlarında "Google Chrome" markası, Electron/İlgezdi YOK',
     c.metadata.brands.some((b) => b.brand === 'Google Chrome' && b.version === '152') && !/Electron|lgezdi/i.test(g(c)));
  ol('chrome: başlık ipuçları ile userAgentData aynı markaları anlatıyor',
     c.basliklar['Sec-CH-UA'] === c.metadata.brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', ')
     && c.basliklar['Sec-CH-UA-Platform'] === `"${c.metadata.platform}"` && c.basliklar['Sec-CH-UA-Mobile'] === '?0');
  ol('chrome: tam sürüm yalnız fullVersionList\'te (gerçek Chrome gibi)',
     c.metadata.fullVersion === '152.0.7977.78' && c.metadata.fullVersionList.some((b) => b.brand === 'Google Chrome' && b.version === '152.0.7977.78'));

  const e = G.kimlik('edge', ORTAM);
  ol('edge: UA sonunda "Edg/152.0.0.0", markada "Microsoft Edge", Chrome markası yok',
     e.userAgent.endsWith(' Edg/152.0.0.0') && e.metadata.brands.some((b) => b.brand === 'Microsoft Edge') && !e.metadata.brands.some((b) => b.brand === 'Google Chrome'));
  ol('macOS ve Linux platform adları', G.kimlik('chrome', { ...ORTAM, platform: 'darwin' }).metadata.platform === 'macOS' && G.kimlik('chrome', { ...ORTAM, platform: 'linux' }).metadata.platform === 'Linux');
}

// ── 3. Başlıklar ve yerel geçersiz kılma parametreleri ────────────────────
console.log('\n\x1b[1m3) Başlıklar ve yerel geçersiz kılma — aynı kimlik\x1b[0m');
{
  const ELECTRON = { 'User-Agent': 'Mozilla/5.0 … Chrome/152.0.7977.78 Safari/537.36', 'sec-ch-ua': '"Chromium";v="152", "Not-A.Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0', 'sec-ch-ua-platform': '"Windows"', 'Sec-GPC': '1', Accept: 'text/html' };
  const f = G.basliklariCevir(ELECTRON, G.kimlik('firefox', ORTAM));
  ol('firefox: Electron\'un ipuçları silindi, tek User-Agent ve Firefox', !Object.keys(f).some((k) => /^sec-ch-ua/i.test(k))
     && Object.keys(f).filter((k) => /^user-agent$/i.test(k)).length === 1 && /Firefox\/156\.0$/.test(f['User-Agent']));
  const ck = G.kimlik('chrome', ORTAM);
  const c = G.basliklariCevir(ELECTRON, ck);
  ol('chrome: Electron ipuçları yerine Chrome ipuçları; tek kopya',
     Object.keys(c).filter((k) => /^sec-ch-ua$/i.test(k)).length === 1 && c['Sec-CH-UA'].includes('"Google Chrome"'));
  ol('Sec-GPC ve diğer başlıklar korunuyor', f['Sec-GPC'] === '1' && c.Accept === 'text/html');
  ol('yerel geçersiz kılma (CDP) başlıkla AYNI UA ve aynı markalar',
     g(G.cdpParametreleri(ck)) === g({ userAgent: ck.userAgent, userAgentMetadata: ck.metadata })
     && g(G.cdpParametreleri(G.kimlik('firefox', ORTAM))) === g({ userAgent: G.kimlik('firefox', ORTAM).userAgent }));
}

// ── 4. JS taklidi geri gelmesin ───────────────────────────────────────────
console.log('\n\x1b[1m4) JS taklidi yok\x1b[0m');
{
  ol('modülde sayfaya enjekte edilen navigator betiği yok (ilk denemenin izi)',
     !('anaDunyaBetigi' in G) && !/defineProperty\(N|Navigator\.prototype/.test(require('fs').readFileSync(require.resolve('../src/main/google-giris.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
}

console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
process.exit(kalan ? 1 : 0);
