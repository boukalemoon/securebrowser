/**
 * Ülgen motoru — özet: SAYI TAŞIYAN CÜMLE ağırlığı. AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/ozet-sayi.js
 *
 * ⛔ NEDEN VAR: ilgezdi-15 gerçek bir makaleyle ölçtü ve özet, sayıların
 * geçtiği paragrafı (843 mm yağış, 84 m³) atlıyordu. "Ne kadar su toplarım"
 * diye soran kullanıcı cevabı özette bulamıyordu.
 *
 * ÖLÇÜLDÜ 22.09.2026 — ağırlık taraması (aynı makale, 3 cümlelik özet):
 *   0     → sayılı cümle 0   · tanım cümlesi VAR · konu dışı yok
 *   0,20  → sayılı cümle 1   · tanım cümlesi VAR
 *   0,35  → sayılı cümle 2   · tanım cümlesi VAR   ← SEÇİLEN
 *   0,80  → sayılı cümle 2   · ⛔ sayıların ÖNEMSİZ olduğu metinde tanım
 *                               cümlesini dışarı attı (tarih metni sınaması)
 * Yani ölçüt tek başına "sayı geldi mi" değil: sayı gelirken KONU cümlesi
 * kaybolmamalı. 0,35 ikisini birden tutuyor.
 */
'use strict';

const assert = require('node:assert');
const motor = require('../src/main/ulgen-motor.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d ? '  ' + d : ''}`); }
};

// Sayının ÖNEMLİ olduğu metin (kullanıcı "ne kadar su toplarım" diye sorar).
const SAYISAL = [
  'Yağmur suyu hasadı, çatıya düşen yağışın depolanarak yeniden kullanılmasıdır.',
  'Sistem üç bölümden oluşur: toplama yüzeyi, ilk yıkama ayırıcısı ve depo.',
  'İlk yıkama ayırıcısı, çatıdaki tozu ve kuş pisliğini depoya girmeden uzaklaştırır.',
  'İstanbul için yıllık ortalama 843 mm yağış ile 100 metrekarelik bir çatıdan yılda yaklaşık 84 metreküp su toplanabilir.',
  'Kurulum maliyeti 45 bin TL civarındadır ve yatırım ortalama 6 yılda geri döner.',
  'Depo yeraltına ya da bodruma yerleştirilebilir; ışık almaması yosunlanmayı önler.',
  'Toplanan su bahçe sulama, tuvalet rezervuarı ve temizlik için kullanılır.',
  'Kedilerin gece görüşü insanlardan altı kat daha iyidir.',
  'Yağmur suyu hasadı kuraklık dönemlerinde şebeke suyuna olan bağımlılığı azaltır.',
  'Çatı malzemesi suyun kalitesini etkiler; kiremit ve metal çatılar uygundur.',
];

// Sayının ÖNEMSİZ olduğu metin: tarihler geçer ama asıl konu tanım/sebeptir.
const TARIHSEL = [
  'Vakıf sistemi, Osmanlı toplumunda hayır hizmetlerinin ana çatısıydı.',
  'Bir vakıf, kurucusunun mülkünü kalıcı olarak belirli bir hizmete bağlamasıyla doğardı.',
  'İlk büyük vakıflar 1453 sonrasında İstanbul\'da kuruldu.',
  'Vakıflar imaret, medrese, hamam ve çeşme gibi yapıları işletirdi.',
  '1826 yılında Evkaf Nezareti kuruldu ve yönetim merkezileşti.',
  'Vakfiye denen belge, hizmetin şartlarını ve gelir kaynağını yazardı.',
  'Gelir çoğunlukla dükkân kirası ve tarım arazisinden gelirdi.',
  'Sistem, devlet bütçesi dışında kalan geniş bir hizmet ağı yarattı.',
];

const ozet = (bloklar, baslik) => motor.ozetle(bloklar, { baslik, basliklar: [] }).cumleler;

console.log('\n\x1b[1mSayı taşıyan cümle ağırlığı\x1b[0m');
const s = ozet(SAYISAL, 'Yağmur suyu hasadı');
ol('sayısal metinde ÖLÇÜLEBİLİR bilgi özete giriyor',
   s.some((c) => /843|84 metreküp/.test(c)), s.join(' // ').slice(0, 90));
ol('konuyu açıklayan tanım cümlesi korunuyor',
   s.some((c) => /yeniden kullanılmasıdır/.test(c)));
// ⛔ Konu dışı paragraf özete girmemeli — sayı ağırlığı bunu bozmamalı.
ol('⛔ konu dışı cümle (kedi) yine dışarıda', !s.some((c) => /kedi/i.test(c)));

const t0 = ozet(TARIHSEL, 'Vakıf sistemi');
ol('sayılar ÖNEMSİZKEN konu cümlesi kaybolmuyor',
   t0.some((c) => /ana çatısıydı/.test(c)) && t0.some((c) => /mülkünü kalıcı/.test(c)),
   t0.map((c) => c.slice(0, 30)).join(' // '));

// ⛔ 0,8 ağırlık tarih metninde tanım cümlesini düşürüyordu: ayarın neden
//    0,35'te durduğunun kanıtı testte kalsın, ileride "artıralım" denmesin.
const t8 = motor.ozetle(TARIHSEL, { baslik: 'Vakıf sistemi', basliklar: [], sayiAgirligi: 0.8 }).cumleler;
ol('0,8 ağırlık ZARARLI (tanım cümlesini düşürüyor) — seçilmeme sebebi',
   !t8.some((c) => /mülkünü kalıcı/.test(c)), t8.map((c) => c.slice(0, 26)).join(' // '));

// Yazıyla geçen sayı SİNYAL DEĞİL: yalnız iki basamaklı sayı, yüzde ya da
// ondalık ağırlık alır. (Cümleler 40 karakter eşiğinin üstünde olmalı; motor
// daha kısa cümleleri özete hiç almıyor.)
{
  const k = motor.ozetle([
    'Sistem üç bölümden oluşur ve kurulumu bir günde tamamlanabilir.',
    'Depo 1200 litre su tutar ve yıl boyunca dolu kalabilir.',
    'Bakım basit olduğu için kullanıcılar sistemi kendileri temizleyebilir.',
    'Malzeme seçimi dayanıklılığı doğrudan etkiler ve ömrü uzatır.',
  ], { baslik: 'Depo', basliklar: [] }).cumleler;
  ol('iki basamaklı sayı taşıyan cümle öne çıkıyor', k.some((c) => /1200/.test(c)),
     k.map((c) => c.slice(0, 28)).join(' // '));
}

// ── Cümle sayısı sayfa uzunluğuna göre ölçekleniyor mu ────────────────
// ⛔ NEDEN VAR (ilgezdi-15, 22.09.2026): "Kısa sayfalarda özet pek
// kısaltmıyor." Sabit 3 cümlelik özet, 5 cümlelik bir haberin %61'iydi.
// ÖLÇÜLDÜ: haber 3c/0,61 → 2c/0,45 · vakıf ve su metinleri DEĞİŞMEDİ.
console.log('\n\x1b[1mCümle sayısı sayfa uzunluğuna göre ölçekleniyor\x1b[0m');
{
  const HABER = [
    'Merkez Bankası bugün politika faizini sabit bıraktığını açıkladı ve kararın gerekçesini paylaştı.',
    'Karar, piyasa beklentileriyle uyumlu biçimde geldi ve borsada sınırlı bir hareket yarattı.',
    'Enflasyonun yıl sonunda yüzde 28 seviyesine gerilemesi bekleniyor.',
    'Kurul üyeleri kararın oybirliğiyle alındığını belirtti ve sıkı duruşun süreceğini söyledi.',
    'Bir sonraki toplantı gelecek ay yapılacak ve piyasa o tarihi bekliyor.',
  ];
  const oran = (b, c) => c.join(' ').length / b.join(' ').length;
  const h = ozet(HABER, 'Faiz kararı');
  ol('kısa sayfada özet GERÇEKTEN kısaltıyor (oran < 0,50)',
     oran(HABER, h) < 0.5, `${h.length} cümle · oran ${oran(HABER, h).toFixed(2)}`);
  // ⛔ Taban 2'nin altına inmemeli: tek cümle özet değil, başlık olur.
  ol('en az 2 cümle kalıyor', h.length >= 2, String(h.length));
  // ⛔ Orta boy sayfa bu değişiklikten ETKİLENMEMELİ — vakıf metninde 2 cümleye
  //    inince sayı ağırlığı tanım cümlesini düşürüyordu (yukarıda sınanıyor).
  ol('orta boy sayfa (8 cümle) 3 cümlede kalıyor',
     ozet(TARIHSEL, 'Vakıf sistemi').length === 3, String(ozet(TARIHSEL, 'Vakıf sistemi').length));
  ol('uzun sayfa (10 cümle) 3 cümleden AZ vermiyor',
     ozet(SAYISAL, 'Yağmur suyu hasadı').length >= 3, String(ozet(SAYISAL, 'Yağmur suyu hasadı').length));
}

console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
process.exit(kalan ? 1 : 0);
