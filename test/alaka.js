'use strict';
/**
 * ALAKA DENETİMİ — birim sınamaları. AĞA ÇIKMAZ, saf fonksiyonlar.
 *
 * Çalıştır:  node test/alaka.js
 *
 * ⛔ NEDEN VAR (gerçek ölçüm, 23.09.2026): "Türkiye'nin en yüksek barajları
 *    hangileri?" sorusunda konu terimleri YALNIZCA ["türkiy"] çıkıyordu.
 *    Sonuç: "Türkiye" geçen her sayfa konuyu doğrulamış sayıldı; dünya
 *    barajlarıyla ilgili cümle ve "^A 300m ve 280m yükseklikteki tasarımlar…"
 *    Vikipedi dipnotu cevaba girdi. Kullanıcı bunu KAYNAKLI bir cevap olarak
 *    görüyor — pratikte uydurmadan farkı yok.
 *
 * Aşağıdaki dört bölüm o ölçümün dört ayrı düzeltmesini kilitler. Bu sınama
 * olmadan aynı gevşeklik sessizce geri gelir.
 */
const A = require('../src/main/ulgen-arastir.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  → ' + d : ''}`); }
};
const g = (x) => JSON.stringify(x);

const BARAJ_SORU = "Türkiye'nin en yüksek barajları hangileri?";

// ── 1. Konu terimleri: özel ad VARKEN de içerik sözcüğü giriyor ───────────
console.log('\n\x1b[1m1) Ayırt edici terimler — özel ad içerik sözcüğünü artık susturmuyor\x1b[0m');
{
  const t = A.ayirtEdiciTerimler(BARAJ_SORU);
  ol('⛔ ÖLÇÜLEN VAKA: baraj sorusunda hem "türkiy" hem "baraj" terim',
     t.includes('türkiy') && t.includes('baraj'), g(t));
  ol('⛔ eski davranış geri gelmedi (terim listesi tek başına ["türkiy"] değil)',
     !(t.length === 1 && t[0] === 'türkiy'), g(t));

  const nobel = A.ayirtEdiciTerimler('Nobel Fizik Ödülü kazanan Türk bilim insanları kimlerdir?');
  ol('özel adların TAMAMI duruyor (nobel + fizik + türk)',
     ['nobel', 'fizik', 'türk'].every((x) => nobel.includes(x)), g(nobel));

  // Sınır: her terim sayfadan geçmek ZORUNDA (konuGecti "hepsi" kuralı).
  // Sınırsız içerik sözcüğü, doğru sayfayı da eleyen bir denetim olurdu.
  const uzun = A.ayirtEdiciTerimler('Bor madeninin sanayideki kullanım alanları ve ihracat payı nedir?');
  ol('içerik sözcüğü EN ÇOK 2 tane ekleniyor (özel ad: "Bor" → toplam ≤ 3)',
     uzun.length <= 3, g(uzun));

  ol('soru kalıbı terim olmuyor ("hangileri" konu değildir)',
     !A.ayirtEdiciTerimler(BARAJ_SORU).some((x) => 'hangileri'.startsWith(x)), g(t));
  ol('sıralama sıfatı terim olmuyor ("yüksek" her dağ sayfasında da geçer)',
     !t.some((x) => 'yüksek'.startsWith(x)), g(t));

  // ⛔ GERİLEME KORUMASI: özel ad yokken içerik yolu eskisi gibi çalışmalı.
  const ozelsiz = A.ayirtEdiciTerimler('kuantum dolanıklığı deneyleri nasıl yapılır?');
  ol('özel ad yokken içerik sözcükleri hâlâ terim üretiyor', ozelsiz.length >= 1, g(ozelsiz));

  // ⛔ GERİLEME KORUMASI (Göktürk ölçümü): ESANLAM tablosunun varlık sebebi
  //    sayfanın başka sözcük kullanabilmesi ("hükümdar" → "kağan"). Böyle bir
  //    sözcüğü "sayfa bunu taşımalı" diye dayatırsak doğru sayfayı eleriz.
  const gok = A.ayirtEdiciTerimler('Göktürk tarihindeki önemli hükümdarları sıralamanı istiyorum');
  ol('eşanlamlısı bilinen sözcük ("hükümdar") terime KONMUYOR',
     gok.includes('göktür') && !gok.some((x) => 'hükümdar'.startsWith(x)), g(gok));

  // ⛔ Kök altı harfe kesilince "barajları" → "barajl" oluyordu; sayfa
  //    "Yusufeli Barajı" yazınca eşleşme kaçıyor, yani DOĞRU sayfa eleniyordu.
  ol('çoğul eki kırpılıyor: kök sayfadaki "Barajı" ile eşleşiyor',
     A.konuGecti("Türkiye'nin en yüksek yapısı Yusufeli Barajı'dır.", t), g(t));
  ol('fazla kırpma yok: "Dolar" kökü "do" değil',
     !A.ayirtEdiciTerimler('Dolar kuru bugün ne kadar?').includes('do'),
     g(A.ayirtEdiciTerimler('Dolar kuru bugün ne kadar?')));
}

// ── 2. Cümle düzeyi alaka ─────────────────────────────────────────────────
console.log('\n\x1b[1m2) Cümle düzeyi alaka — konuya değmeyen cümle cevaba giremez\x1b[0m');
{
  const coz = A.soruCoz(BARAJ_SORU);
  const ALAKALI = "Türkiye'nin en yüksek barajı, 275 metre gövde yüksekliğiyle Yusufeli Barajı'dır.";
  const ALAKASIZ = 'Dünya genelinde en yüksek yapıların tasarımları uzun yıllar boyunca tartışma konusu olmuştur.';
  const cumleler = A.cevapCumleleri([ALAKALI, ALAKASIZ], coz, 5);

  // Önce kanıt: alakasız cümle KALİTE süzgecinden geçiyor. Yani onu eleyen
  // şey çöp denetimi değil, alaka denetimidir — sınama doğru şeyi ölçüyor.
  ol('alakasız cümle kalite süzgecini geçiyor (eleyen şey ALAKA)',
     A.metinKalitesi(ALAKASIZ).ok, g(A.metinKalitesi(ALAKASIZ)));
  ol('⛔ ÖLÇÜLEN VAKA: konu terimi taşımayan cümle cevaba GİRMİYOR',
     !cumleler.includes(ALAKASIZ), g(cumleler));
  ol('konuya değen cümle duruyor (denetim her şeyi elemiyor)',
     cumleler.includes(ALAKALI), g(cumleler));

  ol('cümle düzeyinde "en az biri" yetiyor — "hepsi" değil',
     A.cumleAlakali('Barajın gövde yüksekliği 275 metredir.', ['türkiy', 'baraj']));
  ol('hiçbir terimi taşımayan cümle eleniyor',
     !A.cumleAlakali('Bu yapı uzun yıllar tartışıldı.', ['türkiy', 'baraj']));
  ol('terim yoksa denetlenecek bir şey yok — cümle elenmiyor',
     A.cumleAlakali('Herhangi bir cümle.', []));

  // ⚠️ Sıra: kalite süzgeci ÖNCE, alaka SONRA. Dipnot satırı ikisine de takılır.
  const DIPNOT = '^A 300m ve 280m yükseklikteki tasarımlar daha sonra terk edilmiştir.';
  ol('dipnot satırı cümle seçiminden de çıkıyor',
     !A.cevapCumleleri([ALAKALI, DIPNOT], coz, 5).includes(DIPNOT));
}

// ── 3. Vikipedi dipnot satırı ─────────────────────────────────────────────
console.log('\n\x1b[1m3) Çöp süzgeci — Vikipedi dipnot satırı cümle değildir\x1b[0m');
{
  const d1 = A.metinKalitesi('^A 300m ve 280m yükseklikteki tasarımlar daha sonra terk edilmiştir.');
  ol('⛔ ÖLÇÜLEN VAKA: "^A …" dipnotu eleniyor', d1.ok === false && d1.sebep === 'dipnot_satiri', g(d1));

  const d2 = A.metinKalitesi('^ a b Yusufeli Barajı açılış töreni, Anadolu Ajansı, 12 Kasım 2022 tarihli haber.');
  ol('"^ a b …" geri bağlantı satırı eleniyor', d2.ok === false && d2.sebep === 'dipnot_satiri', g(d2));

  const d3 = A.metinKalitesi('  ^ Kaynakça girdisi olarak verilen bu satır bir cevap cümlesi değildir.');
  ol('baştaki boşluk dipnotu gizleyemiyor', d3.ok === false && d3.sebep === 'dipnot_satiri', g(d3));

  // ⚠️ Eleme YALNIZ satır başındaki işaret içindir: ortada geçen ^ cümleyi
  //    öldürmemeli, yoksa üs alma anlatan her matematik cümlesi çöpe gider.
  const d4 = A.metinKalitesi('Fonksiyonun tanımında x^2 terimi bulunur ve bu ifade karesel artışı gösterir.');
  ol('ortada geçen ^ cümleyi ÖLDÜRMÜYOR (x^2 matematik metni)', d4.ok === true, g(d4));

  const d5 = A.metinKalitesi("Türkiye'nin en yüksek barajı 275 metre gövde yüksekliğiyle Yusufeli Barajı'dır.");
  ol('gerçek cümle hâlâ geçiyor (gerileme koruması)', d5.ok === true, g(d5));
}

// ── 4. İz kaydı: konu_disi elemesinde hangi terim bulunamadı ─────────────
console.log('\n\x1b[1m4) İz kaydı — "konu_disi" tek başına denetimi açıklamıyor\x1b[0m');
{
  ol('eksikTerimler yalnız bulunamayanı döndürüyor',
     g(A.eksikTerimler("Türkiye'nin coğrafyası üzerine bir yazı.", ['türkiy', 'baraj'])) === g(['baraj']));
  ol('hepsi geçiyorsa eksik yok',
     A.eksikTerimler("Türkiye'nin barajları hakkında.", ['türkiy', 'baraj']).length === 0);
  ol('konuGecti ile eksikTerimler aynı kuralı kullanıyor (ayrışamazlar)',
     A.konuGecti("Türkiye'nin coğrafyası.", ['türkiy', 'baraj']) === false);

  // Uçtan uca: sahte kanca, ağ yok. Bir sayfa konu dışı, biri konuya değiyor.
  const KONU_DISI = ["Türkiye'nin yüzölçümü 783.562 kilometrekaredir ve yedi coğrafi bölgeye ayrılır.",
                     "Türkiye'nin en yüksek dağı 5.137 metre ile Ağrı Dağı olarak kabul edilir."];
  const KONULU = ["Türkiye'nin en yüksek barajı, 275 metre gövde yüksekliğiyle Yusufeli Barajı'dır.",
                  "Deriner Barajı 249 metre gövde yüksekliğiyle Türkiye'nin ikinci en yüksek barajıdır.",
                  'Dünya genelinde en yüksek yapıların tasarımları uzun yıllar boyunca tartışma konusu olmuştur.',
                  '^A 300m ve 280m yükseklikteki tasarımlar daha sonra terk edilmiştir.'];
  const kanca = {
    ara: async () => [
      { baslik: 'Türkiye', url: 'https://ornek-a.org/turkiye', parcacik: '' },
      { baslik: 'Barajlar', url: 'https://ornek-b.org/barajlar', parcacik: '' },
    ],
    sayfaAc: async (url) => ({
      ok: true, basliklar: [], baslik: url,
      bloklar: url.includes('ornek-a') ? KONU_DISI : KONULU,
    }),
  };

  (async () => {
    const s = await A.arastir(BARAJ_SORU, kanca);
    const iz = (s.iz && s.iz.adimlar) || [];
    const kayit = iz.find((x) => x.adim === 'konu_disi');

    ol('konu dışı sayfa elenince ize KAYIT düşüyor', !!kayit, g(iz.map((x) => x.adim)));
    ol('⛔ hangi terim bulunamadı, ize yazılıyor', kayit && g(kayit.eksik) === g(['baraj']), g(kayit));
    ol('bu kayıtta ADRES yok', !!kayit && !('url' in kayit), g(kayit));
    ol('elenen sayfa cevaba girmedi (tek kaynak kaldı)', s.ok === true && s.kaynakSayisi === 1, g(s.sebep || s.kaynakSayisi));

    const metinler = (s.maddeler || []).map((m) => m.metin);
    ol('cevapta dünya barajları cümlesi YOK', !metinler.some((m) => m.startsWith('Dünya genelinde')), g(metinler));
    ol('cevapta dipnot satırı YOK', !metinler.some((m) => m.trim().startsWith('^')), g(metinler));
    ol('cevap boş kalmadı — konuya değen cümle geldi', metinler.length >= 1, g(metinler));

    console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
    process.exit(kalan ? 1 : 0);
  })();
}
