'use strict';
/**
 * TABLO SATIRLARI ve GÜVEN–ALAKA BAĞI — birim sınamaları. AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/tablo.js   (npm test de koşar)
 *
 * ⛔ NEDEN VAR (gerçek ölçüm, 23.09.2026): "Türkiye'nin en yüksek barajları
 *    hangileri?" sorusunda HER sayfada `varlik: 0` çıkıyordu. Cevap sayfada
 *    duruyordu ama zincire hiç ulaşmıyordu: barajlar Vikipedi'de TABLODA ve
 *    her td/th ayrı blok olduğu için satır hücre hücre bölünüyor, parçalar
 *    `cok_kisa` diye eleniyordu. Üstelik soru Türkiye'yi sorarken "Dünya'nın
 *    en yüksek barajları listesi…" cümlesi cevapta kalıyor ve iki kaynakta
 *    geçtiği için `yuksek` güven alıyordu.
 *
 * Aşağıdaki bölümler o ölçümün düzeltmelerini kilitler.
 */
const A = require('../src/main/ulgen-arastir.js');
const M = require('../src/main/ulgen-motor.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  → ' + d : ''}`); }
};
const g = (x) => JSON.stringify(x);
const SORU = "Türkiye'nin en yüksek barajları hangileri?";
const TERIM = A.ayirtEdiciTerimler(SORU);                 // ["türkiy","baraj"]
const kaynak = (...u) => u.map((url) => ({ url, baslik: '' }));

// ── 1. Satır kalitesi ─────────────────────────────────────────────────────
console.log('\n\x1b[1m1) Satır kalitesi — cümle kuralları satıra uygulanmaz\x1b[0m');
{
  const KISA = 'Yusufeli Barajı | 275 m';
  ol('⛔ ÖLÇÜLEN VAKA: 45 karakterden kısa satır artık GEÇİYOR',
     A.metinKalitesi(KISA, { satir: true, terimler: TERIM }).ok, g(A.metinKalitesi(KISA, { satir: true, terimler: TERIM })));
  ol('   aynı metin CÜMLE sayılsaydı elenirdi (eski davranışın kanıtı)',
     A.metinKalitesi(KISA).sebep === 'cok_kisa', g(A.metinKalitesi(KISA)));

  const SAYILI = 'Yusufeli Barajı | 275 | 2022 | 1.500 | 3,7 | 2.130';
  ol('harf oranı düşük satır geçiyor (tablo sayıdan ibarettir)',
     A.metinKalitesi(SAYILI, { satir: true, terimler: TERIM }).ok, g(A.metinKalitesi(SAYILI, { satir: true, terimler: TERIM })));
  ol('   aynı metin CÜMLE sayılsaydı harf oranından elenirdi',
     A.metinKalitesi(SAYILI).sebep === 'harf_orani_dusuk', g(A.metinKalitesi(SAYILI)));

  // ⚠️ Denetimi kaldırmak çöp kapısı açardı; yerine iki ölçü kondu.
  ol('tek hücre satır sayılmıyor (kırıntıdır)',
     A.metinKalitesi('Kaynakça', { satir: true, terimler: TERIM }).sebep === 'tek_hucre',
     g(A.metinKalitesi('Kaynakça', { satir: true, terimler: TERIM })));
  ol('konu terimi taşımayan satır eleniyor (gezinti/kaynakça satırı)',
     A.metinKalitesi('Bölüm | Düzenle | Kaynağı değiştir', { satir: true, terimler: TERIM }).sebep === 'konu_disi');
  ol('dipnot satırı satır kipinde de eleniyor (çöp desenleri geçerli)',
     A.metinKalitesi('^ a b Baraj raporu | 2023', { satir: true, terimler: TERIM }).sebep === 'dipnot_satiri');
  ol('bozuk/yabancı bayt satırı eleniyor',
     A.metinKalitesi('三峡大坝 | 185 | 中国 | 2006 | barajı', { satir: true, terimler: TERIM }).sebep === 'yabanci_karakter');
  ol('terim listesi boşsa terim aranmıyor (geriye dönük)',
     A.metinKalitesi('Bölüm | Düzenle', { satir: true, terimler: [] }).ok);
  ol('satır işareti verilmeyince eski davranış aynen duruyor',
     A.metinKalitesi("Türkiye'nin en yüksek barajı 275 metre yüksekliğindeki Yusufeli Barajı'dır.").ok);
}

// ── 2. Satır maddeleri ────────────────────────────────────────────────────
console.log('\n\x1b[1m2) Satır maddeleri — liste sorusunda tablo satırı madde adayı\x1b[0m');
{
  const coz = A.soruCoz(SORU);
  const bloklar = [
    "Türkiye'nin barajları enerji ve sulama amacıyla inşa edilmiştir.",   // düz metin
    M.satirBlogu('Baraj | Yükseklik | İl'),
    M.satirBlogu('Yusufeli Barajı | 275 m | Artvin'),
    M.satirBlogu("Türkiye'nin en yüksek barajı | Yusufeli | 275 m"),      // iki terim
    M.satirBlogu('Kaynakça'),
    M.satirBlogu('Bölüm | Düzenle'),
    M.satirBlogu('^ a b Enerji raporu | 2023'),
  ];
  const satirlar = A.satirMaddeleri(bloklar, coz);

  ol('⛔ ÖLÇÜLEN VAKA: tablo satırı madde adayı oluyor (önce hiç görülmüyordu)',
     satirlar.length >= 2, g(satirlar));
  ol('⚠️ en çok konu terimi karşılayan satır ÖNDE',
     satirlar[0] === "Türkiye'nin en yüksek barajı | Yusufeli | 275 m", g(satirlar));
  ol('düz metin bloğu satır yoluna karışmıyor',
     !satirlar.some((x) => x.startsWith("Türkiye'nin barajları enerji")), g(satirlar));
  ol('tek hücre, konu dışı ve dipnot satırları alınmıyor',
     !satirlar.some((x) => /Kaynakça|Düzenle|\^/.test(x)), g(satirlar));

  // ⚠️ Aynı bilgi iki yoldan girmemeli: satırın cümle yolu YOKTUR.
  const cumleler = A.cevapCumleleri(bloklar, coz, 8);
  ol('satır bloğu cümle yolundan GEÇMİYOR (cevaba iki kez girmesin)',
     !cumleler.some((c) => c.includes(M.HUCRE_AYRAC)), g(cumleler));
}

// ── 3. Güven, terim kapsamına bağlandı ────────────────────────────────────
console.log('\n\x1b[1m3) Güven — iki kaynak yetmez, madde konuyu da tutmalı\x1b[0m');
{
  const iki = kaynak('https://tr.wikipedia.org/wiki/A', 'https://dergipark.org.tr/x');
  ol('⛔ ÖLÇÜLEN VAKA: eksik terimli madde "yuksek" OLAMIYOR',
     A.guvenDuzeyi(iki, { eksik: ['türkiy'] }) === 'orta', A.guvenDuzeyi(iki, { eksik: ['türkiy'] }));
  ol('tam kapsamlı madde iki bağımsız kaynakla "yuksek"',
     A.guvenDuzeyi(iki, { eksik: [] }) === 'yuksek');
  ol('kapsam belirtilmezse eski davranış (gerileme koruması)',
     A.guvenDuzeyi(iki) === 'yuksek');
  ol('tek kaynak kapsam tamken bile "orta"',
     A.guvenDuzeyi(kaynak('https://tr.wikipedia.org/wiki/A'), { eksik: [] }) === 'orta');
  ol('kaynaksız iddia kapsam tamken bile "dusuk"',
     A.guvenDuzeyi([], { eksik: [] }) === 'dusuk');
}

// ── 4. Sıralama ve satır ayrıştırma ───────────────────────────────────────
console.log('\n\x1b[1m4) Sıralama — önce konu kapsamı, sonra kaynak sayısı\x1b[0m');
{
  const coz = A.soruCoz(SORU);
  const EKSIK = "Dünya'nın en yüksek barajları listesi ayrı bir maddede ele alınmaktadır.";
  const TAM = "Türkiye'nin en yüksek barajı Yusufeli Barajı olarak kayıtlara geçmiştir.";
  const maddeler = A.birlestir([
    { url: 'https://a.org/1', baslik: 'A', cumleler: [EKSIK, TAM], varliklar: [] },
    { url: 'https://b.org/1', baslik: 'B', cumleler: [EKSIK], varliklar: [] },
  ], coz);

  ol('⛔ ÖLÇÜLEN VAKA: iki kaynaklı ama eksik terimli cümle, tam isabetli maddenin ARDINDA',
     maddeler[0].metin === TAM, g(maddeler.map((m) => m.metin)));
  ol('eksik terimli madde iki kaynakta geçse de "yuksek" değil',
     maddeler.find((m) => m.metin === EKSIK).guven === 'orta',
     g(maddeler.find((m) => m.metin === EKSIK)));
  ol('madde hangi terimi taşımadığını yanında taşıyor',
     g(maddeler.find((m) => m.metin === EKSIK).eksik) === g(['türkiy']));

  // Eşit kapsamda kaynak sayısı belirler — eski ölçüt korunuyor.
  const AZ = "Türkiye'nin barajları sulama amacıyla da kullanılmaktadır.";
  const COK = "Türkiye'de baraj yapımı cumhuriyet döneminde hız kazanmıştır.";
  const esit = A.birlestir([
    { url: 'https://a.org/1', baslik: 'A', cumleler: [AZ, COK], varliklar: [] },
    { url: 'https://b.org/1', baslik: 'B', cumleler: [COK], varliklar: [] },
  ], coz);
  ol('eşit kapsamda çok kaynaklı madde önde (eski ölçüt duruyor)',
     esit[0].metin === COK, g(esit.map((m) => [m.metin, m.kaynaklar.length])));

  // ⛔ Satırlar ayrı kayıtlardır: sözcük örtüşmesi onları birbirine katmasın.
  const S1 = 'Yusufeli Barajı | 275 m | Artvin | 2022';
  const S2 = 'Deriner Barajı | 249 m | Artvin | 2012';
  const satir = A.birlestir([{ url: 'https://a.org/1', baslik: 'A', cumleler: [S1, S2], varliklar: [] }], coz);
  ol('⛔ ÖLÇÜLEN VAKA: iki farklı baraj satırı AYRI madde kalıyor (%67 örtüşme birleştirmiyor)',
     satir.length === 2, g(satir.map((m) => m.metin)));
  ol('   aynı satırlar düzyazı ölçüsüyle tartılsaydı birleşirdi (ölçünün kanıtı)',
     A.birlestir([{ url: 'https://a.org/1', baslik: 'A',
                   cumleler: [S1.split(' | ').join(' '), S2.split(' | ').join(' ')], varliklar: [] }], coz).length === 1);

  const ayni = A.birlestir([
    { url: 'https://a.org/1', baslik: 'A', cumleler: [S1], varliklar: [] },
    { url: 'https://b.org/1', baslik: 'B', cumleler: [S1], varliklar: [] },
  ], coz);
  ol('birebir aynı satır iki kaynaktan gelince TEK madde, İKİ kaynak',
     ayni.length === 1 && ayni[0].kaynaklar.length === 2, g(ayni));
}

// ── 5. Uçtan uca: tablolu sayfa ───────────────────────────────────────────
console.log('\n\x1b[1m5) Uçtan uca — tablolu sayfa, sahte kanca, ağ yok\x1b[0m');
{
  const hucreSatiri = (...h) => ['tr', null, h.map((x) => ['td', null, [x]])];
  const agac = [
    ['p', null, ["Türkiye'nin barajları enerji üretimi ve sulama amacıyla inşa edilmiştir."]],
    ['p', null, ["Dünya'nın en yüksek barajları listesi ayrı bir maddede ele alınmaktadır."]],
    ['table', null, [
      hucreSatiri('Yusufeli Barajı', '275 m', 'Artvin', '2022'),
      hucreSatiri('Deriner Barajı', '249 m', 'Artvin', '2012'),
      hucreSatiri('Ermenek Barajı', '210 m', 'Karaman', '2009'),
    ]],
    ['table', null, [hucreSatiri('^ a b Enerji Bakanlığı', '2023')]],
  ];
  const duz = M.duzMetin(agac);
  const kanca = {
    ara: async () => [
      { baslik: 'T', url: 'https://tr.wikipedia.org/wiki/Barajlar', parcacik: '' },
      { baslik: 'E', url: 'https://ornek-enerji.gov.tr/barajlar', parcacik: '' },
    ],
    sayfaAc: async () => ({ ok: true, bloklar: duz.bloklar, basliklar: [], baslik: 'Barajlar' }),
  };

  (async () => {
    const s = await A.arastir(SORU, kanca);
    const sayfa = s.iz.adimlar.filter((x) => x.adim === 'sayfa' && x.ok);
    const metinler = (s.maddeler || []).map((m) => m.metin);

    ol('zincir cevap üretiyor', s.ok === true, g(s.sebep));
    ol('⛔ ÖLÇÜLEN VAKA: sayfa izinde satır sayısı 0 DEĞİL', sayfa.every((x) => x.satir >= 3),
       g(sayfa.map((x) => ({ cumle: x.cumle, varlik: x.varlik, satir: x.satir }))));
    ol('baraj satırları cevaba giriyor',
       ['Yusufeli', 'Deriner', 'Ermenek'].every((ad) => metinler.some((m) => m.startsWith(ad))), g(metinler));
    ol('dipnot satırı cevaba GİRMİYOR', !metinler.some((m) => m.includes('^')), g(metinler));
    ol('hiçbir madde iki kez yok (satır + cümle yolu çakışmıyor)',
       new Set(metinler).size === metinler.length, g(metinler));

    const dunya = s.maddeler.find((m) => m.metin.startsWith("Dünya'nın"));
    ol('konuyu yarım tutan cümle iki kaynakta geçse de "yuksek" değil',
       dunya && dunya.guven === 'orta', g(dunya));
    ol('tam kapsamlı madde listenin başında', metinler[0].startsWith("Türkiye'nin barajları"), g(metinler[0]));

    console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
    process.exit(kalan ? 1 : 0);
  })();
}
