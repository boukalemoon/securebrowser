'use strict';
/**
 * GÜVEN DÜZEYİ — kör nokta sınaması. AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/guven.js
 *
 * ⛔ NEDEN VAR: ilk sürüm bağımsızlığı `hostname` ile ölçüyordu ve
 *    ilgezdi-15 (22.09.2026) dört sahte "yüksek" ölçtü. Aşağıdaki satırların
 *    her biri o dört vakadan ya da onları doğuran varsayımdan geliyor.
 *    Bu sınama olmadan aynı hata sessizce geri gelir.
 */
const assert = require('node:assert');
const { guvenDuzeyi } = require('../src/main/ulgen-arastir.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d ? '  → ' + d : ''}`); }
};
const k = (...u) => u.map((url) => ({ url, baslik: '' }));

console.log('\n\x1b[1mGüven düzeyi — bağımsızlık gerçekten ölçülüyor mu\x1b[0m');

// ── ilgezdi-15'in bulduğu DÖRT kör nokta ──
ol('⛔ Vikipedi TR + EN bağımsız SAYILMAZ (aynı kaynak, iki dil)',
   guvenDuzeyi(k('https://tr.wikipedia.org/wiki/A', 'https://en.wikipedia.org/wiki/A')) === 'orta',
   guvenDuzeyi(k('https://tr.wikipedia.org/wiki/A', 'https://en.wikipedia.org/wiki/A')));
ol('⛔ mobil sürüm bağımsız SAYILMAZ (tr.m.wikipedia.org)',
   guvenDuzeyi(k('https://tr.wikipedia.org/wiki/A', 'https://tr.m.wikipedia.org/wiki/A')) === 'orta');
ol('⛔ www öneki bağımsız SAYILMAZ (ornek.com = www.ornek.com)',
   guvenDuzeyi(k('https://ornek.com/a', 'https://www.ornek.com/b')) === 'orta');
ol('⛔ HİÇ kaynak yoksa güven "dusuk" (orta DEĞİL)',
   guvenDuzeyi([]) === 'dusuk', guvenDuzeyi([]));

// ── ilk sürümde zaten tutan davranışlar: geri gitmesinler ──
console.log('\n  — önceden tutan davranışlar (gerileme koruması)');
ol('aynı alan adından iki sayfa → orta',
   guvenDuzeyi(k('https://tr.wikipedia.org/wiki/A', 'https://tr.wikipedia.org/wiki/B')) === 'orta');
ol('iki GERÇEKTEN farklı site → yuksek',
   guvenDuzeyi(k('https://tr.wikipedia.org/wiki/A', 'https://dergipark.org.tr/x')) === 'yuksek');
ol('hepsi PDF → dusuk',
   guvenDuzeyi(k('https://a.edu.tr/x.pdf', 'https://b.gov.tr/y.pdf')) === 'dusuk');
ol('tek kaynak → orta', guvenDuzeyi(k('https://tr.wikipedia.org/wiki/A')) === 'orta');
ol('tek alan adı + biri PDF → orta',
   guvenDuzeyi(k('https://a.edu.tr/s', 'https://a.edu.tr/y.pdf')) === 'orta');

// ── Türkiye alan adları: .edu.tr/.gov.tr iki seviyeli, ayrı kurum ayrı sayılmalı
console.log('\n  — Türkçe alan adı ekleri (com.tr/edu.tr/gov.tr tek kurum değildir)');
ol('ankara.edu.tr ile tubitak.gov.tr bağımsız → yuksek',
   guvenDuzeyi(k('https://acikders.ankara.edu.tr/a', 'https://bilimgenc.tubitak.gov.tr/b')) === 'yuksek');
ol('aynı üniversitenin iki alt alanı bağımsız DEĞİL → orta',
   guvenDuzeyi(k('https://acikders.ankara.edu.tr/a', 'https://kutuphane.ankara.edu.tr/b')) === 'orta');

// ── bozuk girdi çökertmemeli
console.log('\n  — bozuk girdi');
ol('geçersiz adres çökertmiyor', ['orta', 'dusuk', 'yuksek'].includes(guvenDuzeyi(k('bu bir adres değil'))));
ol('null kaynak listesi → dusuk', guvenDuzeyi(null) === 'dusuk');

console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
process.exit(kalan ? 1 : 0);
