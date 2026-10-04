'use strict';
/**
 * AĞA ÇIKAN ölçüm betikleri (arastir.js, arastir-dusmanca.js) için arama kancası.
 *
 * Üründe arama sonuç sayfası İlgezdi'nin korumalı görev sayfasında açılır ve
 * sonuç bağlantıları yalıtılmış dünyadaki DOM betiğiyle sayılır
 * (ulgen-web-ara.js BAGLANTI_BETIGI). Burada DOM yok: aynı alanlar
 * (href, baslik, parcacik, reklam) düz HTML'den aynı sırayla çıkarılır ve
 * ÜRETİMDEKİ ayıklayıcıya (`sonuclariAyikla`) verilir. Böylece ölçüm, gerçek
 * ayıklayıcıyı canlı sonuçla sınar.
 *
 * ⛔ SearXNG YOK (Burak, 24.09.2026): halka açık uygulama aramayı kullanıcının
 *    kendi bağlantısından yapar; ölçüm de öyle yapar.
 */
const webAra = require('../../src/main/ulgen-web-ara.js');

const varlik = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&#x27;|&#0*39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const etiketsiz = (s) => varlik(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** DuckDuckGo JS'siz sonuç sayfası HTML'i → BAGLANTI_BETIGI'nin döndürdüğü biçim. */
function hamBaglantilar(html) {
  const cikti = [];
  for (const kutu of String(html || '').split('<div class="result ').slice(1)) {
    const sinif = kutu.slice(0, kutu.indexOf('"'));
    const a = kutu.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const oz = kutu.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    cikti.push({ href: varlik(a[1]), baslik: etiketsiz(a[2]), parcacik: oz ? etiketsiz(oz[1]) : '',
                 reklam: /\bresult--ad\b/.test(sinif) });
  }
  return cikti;
}

/** Vikipedi arama sayfası HTML'i → VIKI_BETIGI'nin döndürdüğü biçim. */
function vikiBaglantilar(html) {
  const cikti = [];
  for (const kutu of String(html || '').split('<li class="mw-search-result').slice(1)) {
    // Etiket bütün alınır, nitelikler ayrı okunur: tek kalıpta isteğe bağlı `title`
    // tembel eşleşmede hep atlanıyordu (başlık yerine bağlantı metni geliyordu).
    const a = kutu.match(/<div class="mw-search-result-heading"><a([^>]*)>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const href = (a[1].match(/\bhref="([^"]*)"/) || [])[1];
    if (!href) continue;
    const title = (a[1].match(/\btitle="([^"]*)"/) || [])[1];
    const oz = kutu.match(/<div class="searchresult">([\s\S]*?)<\/div>/);
    cikti.push({ href: varlik(href), baslik: title ? varlik(title) : etiketsiz(a[2]), parcacik: oz ? etiketsiz(oz[1]) : '', reklam: false });
  }
  return cikti;
}

// DuckDuckGo bot doğrulama sayfası (ürünün DDG_BETIGI'ndeki `engel` ile aynı işaretler).
function ddgEngelMi(kod, html) {
  return kod === 202 || /id="challenge-form"|anomaly-modal__modal/.test(String(html || ''));
}

/**
 * `getir(url) → {kod, govde}` alan bir arama kancası kurar. ÜRÜNLE AYNI SIRA:
 * DuckDuckGo; bot doğrulaması ya da sonuçsuzluk → Vikipedi (main.js ulgenWebAra).
 * ⛔ NEDEN (ulgen-79 ölçtü, 04.10.2026): eskiden yalnız DDG deneniyordu; IP bot
 *    sayfasına alınınca ölçüm "kaynak_yok" diyordu, oysa ürün Vikipedi'ye düşüp
 *    10 sonuç alıyordu. Ölçüm aracı ürünü olduğundan KÖTÜ gösteriyordu.
 * `kaynak` alanı sonuç dizisine eklenir: hangi kaynağın cevap verdiği görünsün.
 */
function aramaKancasi(getir, azami = 12) {
  return async function ara(sorgu) {
    for (const kaynak of webAra.KAYNAK_SIRASI) {
      const adres = webAra.aramaAdresi(sorgu, kaynak);
      if (!adres) return [];
      let r;
      try { r = await getir(adres); } catch { continue; }
      if (!r || r.kod >= 400) continue;
      if (kaynak === 'ddg' && ddgEngelMi(r.kod, r.govde)) continue;
      const ham = kaynak === 'ddg' ? hamBaglantilar(r.govde) : vikiBaglantilar(r.govde);
      const sonuc = webAra.sonuclariAyikla(ham, azami, kaynak);
      if (sonuc.length) { sonuc.kaynak = kaynak; return sonuc; }
    }
    return [];
  };
}

module.exports = { hamBaglantilar, vikiBaglantilar, ddgEngelMi, aramaKancasi };
