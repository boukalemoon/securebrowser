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
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
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

/** `getir(url) → {kod, govde}` alan bir arama kancası kurar. */
function aramaKancasi(getir, azami = 12) {
  return async function ara(sorgu) {
    const adres = webAra.aramaAdresi(sorgu);
    if (!adres) return [];
    const { kod, govde } = await getir(adres);
    if (kod >= 400) return [];
    return webAra.sonuclariAyikla(hamBaglantilar(govde), azami);
  };
}

module.exports = { hamBaglantilar, aramaKancasi };
