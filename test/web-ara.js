'use strict';
/**
 * ÜLGEN WEB ARAMASI — birim sınamaları. AĞA ÇIKMAZ, saf fonksiyonlar.
 *
 * Çalıştır:  node test/web-ara.js   (npm test de koşar)
 *
 * ⛔ NEDEN VAR (Burak, 24.09.2026): araştırma zinciri aramayı
 *    `http://127.0.0.1:8888`'deki SearXNG'e gönderiyordu. İlgezdi halka açık
 *    bir uygulama: kullanıcının bilgisayarında orada bir şey yok (her soru
 *    "bulamadım"), olsaydı o porttaki süreç cevaba içerik enjekte edebilirdi.
 *    Arama artık kullanıcının kendi bağlantısından, dış kaynakta yapılıyor.
 *    Aşağıdaki sınamalar bu sözün koddaki karşılığını kilitler:
 *      · Sonuç sayfası ne gösterirse göstersin, zincir YEREL ya da EV AĞI
 *        adresine yönlendirilemez.
 *      · Reklam cevap kaynağı olamaz.
 *      · Görev sayfasına betik değil yalnız bilinen bir kaynak ADI geçer.
 */
const W = require('../src/main/ulgen-web-ara.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  → ' + d : ''}`); }
};
const g = (x) => JSON.stringify(x);
const ddgSar = (hedef) => '//duckduckgo.com/l/?uddg=' + encodeURIComponent(hedef) + '&rut=3eea28764f24';

// ── 1. Arama adresi ───────────────────────────────────────────────────────
console.log('\n\x1b[1m1) Arama adresi — dış kaynak, kullanıcının kendi bağlantısından\x1b[0m');
{
  const d = W.aramaAdresi("Türkiye'nin en yüksek barajları");
  ol('DuckDuckGo JS\'siz sonuç sayfası, https', /^https:\/\/html\.duckduckgo\.com\/html\/\?q=/.test(d), d);
  ol('sorgu kodlanıyor, bölge tr-tr', d.includes('T%C3%BCrkiye') && d.endsWith('&kl=tr-tr'), d);
  const v = W.aramaAdresi('Göktürk kağanları', 'viki');
  ol('yedek: Vikipedi arama sayfası, yalnız madde ad alanı', /^https:\/\/tr\.wikipedia\.org\/w\/index\.php\?search=/.test(v) && v.includes('ns0=1'), v);
  ol('⛔ hiçbir kaynak yerel ya da bizim sunucumuza gitmiyor',
     W.KAYNAK_SIRASI.every((k) => { const u = new URL(W.aramaAdresi('x', k)); return u.protocol === 'https:' && !/^(127\.|localhost|10\.|192\.168\.)/.test(u.hostname) && !/ilgezdi/.test(u.hostname); }),
     g(W.KAYNAK_SIRASI.map((k) => W.aramaAdresi('x', k))));
  ol('boş sorgu → adres yok', W.aramaAdresi('   ') === null && W.aramaAdresi(null) === null);
  ol('sorgu 300 karakterle sınırlı', decodeURIComponent(new URL(W.aramaAdresi('a'.repeat(900))).searchParams.get('q')).length === 300);
  ol('bilinmeyen kaynak → adres yok', W.aramaAdresi('x', 'searx') === null);
}

// ── 2. DuckDuckGo sonuçları ───────────────────────────────────────────────
console.log('\n\x1b[1m2) DuckDuckGo — yönlendirme açılır, reklam elenir\x1b[0m');
{
  // Gerçek sonuç sayfasındaki biçim (24.09.2026 örneğinden).
  const GERCEK = '//duckduckgo.com/l/?uddg=https%3A%2F%2Ftr.wikipedia.org%2Fwiki%2FT%25C3%25BCrkiye%2527deki_barajlar_listesi&rut=620947bf05520a5436b0b2eb12e158ae';
  ol('gerçek sonuç bağlantısı asıl adrese açılıyor',
     W.ddgHedef(GERCEK) === "https://tr.wikipedia.org/wiki/T%C3%BCrkiye%27deki_barajlar_listesi", W.ddgHedef(GERCEK));
  ol('reklam yönlendirmesi (y.js) sonuç değil', W.ddgHedef('https://duckduckgo.com/y.js?ad_domain=x.com&u3=abc') === null);
  ol('DuckDuckGo\'nun kendi sayfası sonuç değil', W.ddgHedef('https://duckduckgo.com/settings') === null);
  ol('iç içe yönlendirme (DuckDuckGo → DuckDuckGo) sonuç değil', W.ddgHedef(ddgSar('https://duckduckgo.com/y.js?ad=1')) === null);
  ol('doğrudan dış bağlantı olduğu gibi', W.ddgHedef('https://ornek.org/a') === 'https://ornek.org/a');

  const s = W.sonuclariAyikla([
    { href: ddgSar('https://reklamci.com/kampanya'), baslik: 'Reklam', parcacik: '', reklam: true },
    { href: GERCEK, baslik: "Türkiye'deki barajlar listesi - Vikipedi", parcacik: '  Barajlar ve\n baraj göllerinin   listesi ', reklam: false },
    { href: 'https://duckduckgo.com/y.js?ad_domain=x.com', baslik: 'Reklam 2', parcacik: '', reklam: false },
  ]);
  ol('reklam kutusu (result--ad) elendi, reklam yönlendirmesi elendi, sonuç kaldı',
     s.length === 1 && s[0].url.startsWith('https://tr.wikipedia.org/'), g(s.map((x) => x.url)));
  ol('özet boşlukları toparlanıyor', s[0] && s[0].parcacik === 'Barajlar ve baraj göllerinin listesi', g(s[0] && s[0].parcacik));
}

// ── 3. Adres kuralı: sonuç sayfası zinciri ev ağına yönlendiremez ─────────
console.log('\n\x1b[1m3) ⛔ Adres kuralı — sonuç zinciri yerel/ev ağı adresine götüremez\x1b[0m');
{
  const TUZAK = [
    'http://127.0.0.1:8888/search?q=x',     // eski SearXNG adresi
    'http://localhost:3000/admin',
    'http://192.168.1.1/',                   // modem arayüzü
    'http://10.0.0.5/panel',
    'http://[::1]/',
    'file:///C:/Windows/win.ini',
    'https://kullanici:parola@ornek.org/',
    // Yayın öncesi denetim (04.10.2026): IPv4-eşlemeli IPv6 ve CGNAT (100.64/10) yasağı aşıyordu
    'http://[::ffff:127.0.0.1]:8765/',
    'http://[::ffff:192.168.1.1]/',
    'http://100.64.0.1/',
  ];
  const s = W.sonuclariAyikla(TUZAK.map((h) => ({ href: ddgSar(h), baslik: 'tuzak', parcacik: '', reklam: false })));
  ol('yönlendirme içine gizlenmiş 10 tuzak adresin HİÇBİRİ sonuç olmadı', s.length === 0, g(s.map((x) => x.url)));
  const d = W.sonuclariAyikla(TUZAK.map((h) => ({ href: h, baslik: 'tuzak', parcacik: '', reklam: false })));
  ol('doğrudan verilen aynı adresler de elendi', d.length === 0, g(d.map((x) => x.url)));
}

// ── 4. Vikipedi (yedek kaynak) ────────────────────────────────────────────
console.log('\n\x1b[1m4) Vikipedi yedeği — yalnız madde sayfaları\x1b[0m');
{
  ol('göreli madde bağlantısı tam adrese', W.vikiHedef('/wiki/Bilim_insan%C4%B1') === 'https://tr.wikipedia.org/wiki/Bilim_insan%C4%B1');
  ol('özel sayfa elendi (Özel:)', W.vikiHedef('/wiki/%C3%96zel:Ara') === null);
  ol('tartışma sayfası elendi', W.vikiHedef('/wiki/Tart%C4%B1%C5%9Fma:Bilim') === null);
  ol('başka alan adı elendi', W.vikiHedef('https://en.wikipedia.org/wiki/Science') === null && W.vikiHedef('https://kotu.com/wiki/X') === null);
  ol('sorgu ve parça atılıyor', W.vikiHedef('/wiki/Bilim?action=edit#Tarih') === 'https://tr.wikipedia.org/wiki/Bilim');
  const s = W.sonuclariAyikla([
    { href: '/wiki/Bilim_insan%C4%B1', baslik: 'Bilim insanı', parcacik: 'bilimsel yöntem kullanan bireydir', reklam: false },
    { href: '/wiki/%C3%96zel:Ara', baslik: 'Ara', parcacik: '', reklam: false },
  ], 12, 'viki');
  ol('Vikipedi sonucu zincirin biçiminde', s.length === 1 && s[0].baslik === 'Bilim insanı' && s[0].url === 'https://tr.wikipedia.org/wiki/Bilim_insan%C4%B1', g(s));
}

// ── 5. Tekrar, sınır, bozuk girdi ─────────────────────────────────────────
console.log('\n\x1b[1m5) Tekrar, sınır, bozuk girdi\x1b[0m');
{
  const s = W.sonuclariAyikla([
    { href: ddgSar('https://ornek.org/sayfa'), baslik: 'A' },
    { href: ddgSar('https://ornek.org/sayfa/'), baslik: 'A sondaki /' },
    { href: ddgSar('https://ornek.org/sayfa#bolum'), baslik: 'A parça' },
    { href: ddgSar('https://baska.org/'), baslik: 'B' },
  ]);
  ol('aynı sayfanın üç yazımı tek sonuç', s.length === 2, g(s.map((x) => x.url)));
  const cok = Array.from({ length: 30 }, (_, i) => ({ href: ddgSar('https://s' + i + '.org/'), baslik: 'x' }));
  ol('azami sonuç sayısına uyuluyor', W.sonuclariAyikla(cok, 5).length === 5);
  ol('uzun özet 500 karakterde kesiliyor', W.sonuclariAyikla([{ href: 'https://a.org/', parcacik: 'x'.repeat(2000) }])[0].parcacik.length === 500);
  ol('bozuk girdi çökertmiyor', g(W.sonuclariAyikla(null)) === '[]' && g(W.sonuclariAyikla([null, 7, 'x', { href: '::::' }])) === '[]');
}

// ── 6. Görev sayfasına betik değil kaynak adı geçer ───────────────────────
console.log('\n\x1b[1m6) Görev sayfası — betik değil, bilinen kaynak adı\x1b[0m');
{
  ol('bilinen kaynakların sayım betiği var', typeof W.betik('ddg') === 'string' && typeof W.betik('viki') === 'string');
  ol('DuckDuckGo betiği doğrulama sayfasını tanıyor (engel)', W.betik('ddg').includes('#challenge-form') && W.betik('ddg').includes('.anomaly-modal__modal'));
  ol('betikler dışarıdan değer almıyor (sabit metin, ${…} yok)', !/\$\{/.test(W.betik('ddg')) && !/\$\{/.test(W.betik('viki')));
  const PROTO = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'searx', '', null, 42];
  ol('⛔ bilinmeyen / prototip adı → betik YOK, adres YOK, sonuç YOK (çökme yok)',
     PROTO.every((k) => W.betik(k) === null && W.aramaAdresi('x', k) === null && W.sonuclariAyikla([{ href: 'https://a.org/' }], 5, k).length === 0));
}

// ── 7. Ağa çıkan ölçüm aracı ürünle aynı davranıyor ─────────────────────────
console.log('\n\x1b[1m7) Ölçüm aracı (test/helpers/ddg-baglantilar.js) — ürünle aynı sıra\x1b[0m');
{
  // ⛔ ulgen-79 ölçtü (04.10.2026): araç bot sayfasında Vikipedi'ye düşmüyordu; ölçüm
  //    "kaynak_yok" diyordu, ürün ise Vikipedi'den 10 sonuç alıyordu.
  const H = require('./helpers/ddg-baglantilar.js');
  const VIKI = '<ul><li class="mw-search-result mw-search-result-ns-0"><div class="mw-search-result-heading">' +
    '<a href="/wiki/Bilim_insan%C4%B1" title="Bilim insan&#039;ı">Bilim</a></div>' +
    '<div class="searchresult">bilimsel <span>yöntem</span></div></li></ul>';
  const v = H.vikiBaglantilar(VIKI);
  ol('Vikipedi sonucu ayrıştırılıyor, kesme işareti (&#039;) çözülüyor',
     v.length === 1 && v[0].baslik === "Bilim insan'ı" && v[0].parcacik === 'bilimsel yöntem', g(v));
  ol('bot doğrulama sayfası tanınıyor (202 ya da challenge-form)',
     H.ddgEngelMi(202, '') && H.ddgEngelMi(200, '<form id="challenge-form">') && !H.ddgEngelMi(200, '<div class="result ">'));
  // Hız sınırı (denetim B): sorgular doğrulama gelmeden önce seyreltiliyor.
  const hs = W.hizSiniri({ aralikMs: 8000, saatlikAzami: 3 });
  const t0 = 1e9;
  const ilk = hs.izinVar(t0); hs.kaydet(t0);
  const erken = hs.izinVar(t0 + 7999);
  const sonra = hs.izinVar(t0 + 8000); hs.kaydet(t0 + 8000); hs.kaydet(t0 + 16000);
  const saatDolu = hs.izinVar(t0 + 30000);
  const saatSonra = hs.izinVar(t0 + 60 * 60 * 1000 + 1);
  ol('hız sınırı: ilk sorgu serbest, 8 sn dolmadan ikinci yok, sonra var',
     ilk && !erken && sonra, g({ ilk, erken, sonra }));
  ol('hız sınırı: saatlik tavan dolunca yok, bir saat sonra yeniden var',
     !saatDolu && saatSonra, g({ saatDolu, saatSonra }));
  ol('varsayılan sınır insan hızına göre: 8 sn aralık, saatte 30',
     W.DDG_ARALIK_MS === 8000 && W.DDG_SAATLIK_AZAMI === 30);
  const getir = async (u) => (u.includes('duckduckgo')
    ? { kod: 202, govde: '<form id="challenge-form"></form>' }
    : { kod: 200, govde: VIKI });
  H.aramaKancasi(getir)('Bilim insanı').then((s) => {
    ol("DDG engelliyken Vikipedi'ye düşüyor (ürünle aynı)", s.kaynak === 'viki' && s.length === 1, g(s));
    console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
    process.exit(kalan ? 1 : 0);
  });
}
