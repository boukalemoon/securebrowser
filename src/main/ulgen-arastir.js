'use strict';
/**
 * KLON ÜLGEN — ARAŞTIRMA ZİNCİRİ (Yol A: internet)
 *
 * ⛔ NEDEN VAR (Burak, 22.09.2026): "Adı üstünde internet browser içerisindeki
 *    bir yapay zeka soru sorulduğunda araştıramıyorsa o aptal ve gereksiz bir
 *    uygulamadan farkı yok." Ölçüldü: klon Ülgen "Göktürk hükümdarlarını
 *    sırala" sorusuna `bilinmiyor` dönüyordu — yanıt üreten parça HİÇ YOKTU.
 *
 * ⛔ YEREL LLM YOK. Kullanıcının makinesine GB'larca model indirilmez; Opera
 *    Aria da Edge Copilot da bunu yapmıyor. Bu zincir tarayıcının kendi
 *    parçalarıyla çalışır: arama → sayfayı aç → okuyucuyla metni çıkar →
 *    soruya cevap veren cümleleri seç → kaynağıyla yaz.
 *
 * ⛔ UYDURMA YOK: her madde açılmış bir sayfadan alınmış GERÇEK cümledir ve
 *    yanında adresi durur. Bulunamazsa "bulamadım" der.
 *
 * Sayfa açma İlgezdi'nin kendi korumalı yolundan geçer (temiz oturum, engelleyici,
 * parmak izi kalkanı) — bu dosya kendi penceresini AÇMAZ.
 */

const motor = require('./ulgen-motor.js');

// ── 1. Soruyu çöz ─────────────────────────────────────────────────────────
// Beklenen cevap tipi, hangi cümlelerin işe yaradığını belirler.
const TIP = [
  ['liste',       /(kimler|kimlerdir|nelerdir|hangileri|sırala|listele|say\b|örnekleri)/i],
  ['tanim',       /(nedir|ne demek|kimdir|ne anlama|tanımı)/i],
  ['sayi',        /(kaç|ne kadar|kaçtır|oranı|yüzde|fiyat|maliyet)/i],
  ['nasil',       /(nasıl|ne şekilde|yöntemi|adımları)/i],
  ['neden',       /(neden|niçin|niye|sebebi)/i],
];

// ⛔ Türkçe kavram eşlemesi: kullanıcı "hükümdar" der, sayfa "kağan" yazar.
//    Ölçüldü 22.09: bu eşleme olmadan "hükümdar" araması SIFIR sonuç veriyordu.
const ESANLAM = {
  'hükümdar': ['kağan', 'han', 'hakan', 'imparator', 'sultan', 'padişah', 'kral', 'şah'],
  'bilim insanı': ['bilgin', 'âlim', 'matematikçi', 'fizikçi', 'astronom', 'filozof'],
  'buluş': ['keşif', 'icat', 'teorem', 'kuram'],
  'başkent': ['başşehir', 'merkez'],
  'kurucu': ['kuran', 'kurdu', 'temelini atan'],
};

// ⛔ Soru kalıbı arama motoruna GİTMEZ. Ölçüldü 22.09: sorgu olarak
// "Göktürk tarihindeki önemli hükümdarları sıralamanı istiyorum" gidiyordu;
// arama motoru cümleyi arıyor, konuyu değil. Kalıbı atıp konuyu bırakıyoruz.
const SORU_KALIBI = /\b(sıralamanı istiyorum|sıralar mısın|listeler misin|söyler misin|anlatır mısın|kimlerdir|kimler|nelerdir|hangileridir|hangileri|sırala|listele|istiyorum|lütfen|bana|acaba|misin|mısın|musun|müsün)\b/gi;

function soruCoz(soru) {
  const m = String(soru || '').trim();
  const tip = (TIP.find(([, d]) => d.test(m)) || ['genel'])[0];
  const temiz = m.replace(SORU_KALIBI, ' ').replace(/[?!.]/g, ' ').replace(/\s+/g, ' ').trim();
  const sorgu = temiz.length >= 3 ? temiz : (motor.sorguOner(m) || m);
  // Sorudaki kavramların eşanlamlılarını topla; cümle seçiminde kullanılacak.
  const esanlam = [];
  for (const [k, v] of Object.entries(ESANLAM)) {
    if (new RegExp(k.replace(' ', '\\s*'), 'i').test(m)) esanlam.push(...v);
  }
  // Konu terimleri BİR KEZ çözülür: sayfa düzeyi denetim (hepsi) ile cümle
  // düzeyi denetim (en az biri) aynı listeyi kullanmalı, yoksa ayrışırlar.
  return { tip, sorgu, esanlam, soru: m, terimler: ayirtEdiciTerimler(m) };
}

// ── 2. Kaynak süzgeci ─────────────────────────────────────────────────────
// ⛔ NEDEN (Burak bildirdi): "insan anatomisi" arayınca Nobel Tıp Kitabevi,
//    İstanbul Tıp Kitabevi ve Hepsiburada geliyordu. Satış sayfası bilgi
//    kaynağı değildir; kullanıcı fiyat değil ANATOMİ sordu.
const SATIS_ALAN = /(hepsiburada|trendyol|n11|amazon|gittigidiyor|sahibinden|ciceksepeti|kitapyurdu|nobelkitabevi|nobeltip|istanbultip|pttavm|akakce|cimri|epey)\./i;
const SATIS_YOL = /(\/urun\/|\/product\/|\/p-|\/sepet|\/satin-al|srsltid=|\/fiyatlari|\/magaza\/)/i;
const BILGI_ALAN = /(wikipedia\.org|\.edu(\.[a-z]{2})?\/|\.gov(\.[a-z]{2})?\/|\.ac\.[a-z]{2}\/|tdk\.gov\.tr|britannica\.com|islamansiklopedisi|dergipark)/i;

function kaynakPuani(url, baslik) {
  const u = String(url || '');
  let p = 1;
  if (SATIS_ALAN.test(u) || SATIS_YOL.test(u)) return 0;      // ⛔ elenir
  if (/[?&](utm_|gclid|fbclid)/.test(u)) p -= 0.2;
  if (BILGI_ALAN.test(u)) p += 1.5;                            // ansiklopedi/üniversite/resmî
  if (/\.pdf($|\?)/i.test(u)) p += 0.3;
  if (/\b(fiyat|satın al|indirim|kampanya|sepete)\b/i.test(String(baslik || ''))) p -= 1;
  return p;
}

function kaynaklariSuz(sonuclar, azami = 4) {
  return (sonuclar || [])
    .map((s) => ({ ...s, puan: kaynakPuani(s.url, s.baslik) }))
    .filter((s) => s.puan > 0)
    .sort((a, b) => b.puan - a.puan)
    .slice(0, azami);
}

// ── 2b. Metin kalite süzgeci ──────────────────────────────────────────────
// ⛔ NEDEN (ölçüldü 22.09): ilk çalıştırmada cevaba `%PDF-1.4 %���� 3746 0 obj`
//    ham baytı, wiki şablonu (`|url=`, `[[...]]`, `{{...}}`), gezinti listesi
//    ("• Sibir Hanlığı (1464-1598) • Kazak Hanlığı...") ve Çince tablo satırı
//    girdi. Kullanıcıya çöp göstermektense HİÇBİR ŞEY göstermek dürüsttür.
const COP = [
  [/%PDF-|\bobj\b.*\bendobj\b|\bxref\b|stream\s*$/i, 'ikili_dosya'],
  [/\{\{|\}\}|\[\[|\]\]|\|url=|\|yayıncı=|\|erişimtarihi=|ref name=/i, 'wiki_sablonu'],
  [/^\s*[•·▪]\s|(\s[•·▪]\s.*){3,}/, 'gezinti_listesi'],
  [/^(Unvan|Kaynakça|Dış bağlantılar|Ayrıca bakınız|İçindekiler|Öncüller)\b/i, 'tablo_basligi'],
  // ⛔ Vikipedi DİPNOT satırı (ölçüldü 23.09, baraj sorusu): "^A 300m ve 280m
  //    yükseklikteki tasarımlar…" cevaba girdi. Baştaki ^ / ^A / ^ a b geri
  //    bağlantı işaretidir; o satır kaynakçanın parçasıdır, cevap cümlesi değil.
  [/^\s*\^/, 'dipnot_satiri'],
];

function metinKalitesi(metin) {
  const s = String(metin || '');
  if (s.length < 45) return { ok: false, sebep: 'cok_kisa' };
  for (const [desen, sebep] of COP) if (desen.test(s)) return { ok: false, sebep };
  // Latin/Türkçe dışı karakter oranı: Çince tablo satırı ve bozuk bayt buradan elenir.
  const yabanci = (s.match(/[^\x20-\x7EçğıöşüÇĞİÖŞÜâîûÂÎÛ‐-‧]/g) || []).length;
  if (yabanci / s.length > 0.08) return { ok: false, sebep: 'yabanci_karakter' };
  // Harf oranı düşükse tablo/sayı dökümüdür, cümle değildir.
  const harf = (s.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/g) || []).length;
  if (harf / s.length < 0.55) return { ok: false, sebep: 'harf_orani_dusuk' };
  // Gerçek cümle en az bir fiil/yüklem sonu taşır ya da noktayla biter.
  if (!/[.!?]\s*$/.test(s.trim()) && s.length > 220) return { ok: false, sebep: 'cumle_degil' };
  return { ok: true, sebep: '' };
}

// ── 3. Cümle seçimi ───────────────────────────────────────────────────────
// Sayfadan, SORUYA cevap veren cümleleri seçer. Genel özet değil: sorunun
// sözcükleri (ve eşanlamlıları) geçen cümleler öne çıkar.
function cevapCumleleri(bloklar, coz, azami = 3) {
  const anahtar = motor.sozcukler(coz.sorgu).concat(coz.esanlam.map((e) => e.toLowerCase()));
  if (!anahtar.length) return [];
  const bulgu = new Map();
  for (const kelime of anahtar) {
    for (const c of motor.sayfadaAra(bloklar, kelime, 6)) {
      const v = bulgu.get(c) || { metin: c, isabet: 0 };
      v.isabet++;
      bulgu.set(c, v);
    }
  }
  // ⛔ Kalite süzgeci seçimden ÖNCE: çöp cümle hiç aday olmasın.
  let liste = [...bulgu.values()].filter((x) => metinKalitesi(x.metin).ok)
    .sort((a, b) => b.isabet - a.isabet);
  // ⛔ CÜMLE DÜZEYİ ALAKA (ölçüldü 23.09): sayfa konuyu geçse bile İÇİNDEKİ
  //    her cümle o konuyu anlatmıyor. "Türkiye'nin en yüksek barajları"
  //    sorusunda dünya barajlarıyla ilgili cümle ve Vikipedi dipnotu cevaba
  //    girdi: ikisi de sorunun HİÇBİR konu terimini taşımıyordu. Bir cümle
  //    ancak terimlerden en az birini KENDİ İÇİNDE taşıyorsa cevaba girer.
  //    ⚠️ Sayfa düzeyinde kural "hepsi" (konuGecti), cümle düzeyinde "en az
  //    biri": tek cümleden sorunun tamamını istemek doğru cümleleri de eler.
  //    ⚠️ Sıra önemli: kalite süzgecinden SONRA. Çöp cümle zaten adaylıktan
  //    düşmüş olur, alaka denetimi yalnız gerçek cümleleri tartar.
  const terimler = coz.terimler || ayirtEdiciTerimler(coz.soru || '');
  liste = liste.filter((x) => cumleAlakali(x.metin, terimler));
  // Liste sorusunda özel ad taşıyan cümle daha değerli.
  if (coz.tip === 'liste') {
    liste = liste.sort((a, b) => (ozelAdSayisi(b.metin) - ozelAdSayisi(a.metin)) || (b.isabet - a.isabet));
  }
  // Tanım sorusunda giriş cümlesi zaten özette garanti (ulgen-motor).
  return liste.slice(0, azami).map((x) => x.metin);
}

// Cümlenin KENDİSİ konuya değiyor mu? Terim yoksa denetlenecek bir şey yok.
function cumleAlakali(cumle, terimler) {
  if (!terimler || !terimler.length) return true;
  const d = duzle(cumle);
  return terimler.some((t) => d.includes(t));
}

const OZEL_AD = /(?<![.!?]\s)\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}\b/g;
function ozelAdSayisi(metin) {
  return (String(metin).match(OZEL_AD) || []).length;
}

// ── 3b. Varlık çıkarımı (LİSTE soruları) ──────────────────────────────────
// ⛔ NEDEN (ölçüldü 22.09): "Göktürk hükümdarlarını sırala" sorusuna cümle
//    seçimi kağanlık hakkında GENEL cümleler döndürdü; Bumin, İstemi, Bilge
//    Kağan adları sayfadaki TABLODAydı ve kalite süzgeci tabloyu (haklı
//    olarak) eliyordu. Liste sorusunun cevabı cümle değil ADLARDIR.
//
// ⚠️ Kalıplar String.raw ile kuruluyor: bu ortamda kabuktan geçen `\\s`
//    bir düzey ters eğik çizgi kaybediyor ve kalıp sessizce hiçbir şey
//    bulmuyor (ölçüldü, iki tur boyunca sıfır sonuç verdi).
const AD_PARCA = String.raw`[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}`;
const AD_ELE = /^(Bu|Ancak|Sonra|Daha|Onun|Bir|İki|İkinci|Birinci|Doğu|Batı|Orta|Kuzey|Güney|Türk|Çin|Ayrıca|Bunlar|Böylece|Günümüz|Modern|Yine|Buna|Örneğin|Fakat|Nitekim|Tang|Antik|Yeni|Bugün|Her|Aynı|İlk|Söz|Bazı|Çok|Tüm|Yaklaşık|Roma|Yunan|Hint|Arap|Avrupa|Mısır|Babil|Prenses|Kaynak|Tarih|Devlet|Kağanlık)$/;

// Kişi ipucu: yaşam tarihi, meslek adı ya da kişiye özgü fiil.
const KISI_IPUCU = /(\(\s*\d{3,4}\s*[-–—]\s*\d{3,4}\s*\)|\b(matematikçi|bilgin|âlim|filozof|fizikçi|astronom|bilim ?insanı|hekim|mühendis)\b|\b(doğ(du|muş|umlu)|öl(dü|müş)|yaşa(dı|mış)|kanıtla(dı|mış)|keşfetti|geliştirdi|buldu|icat etti|ortaya koydu|adlı)\b)/i;
// Kurum/yer/yayın adları kişi değildir.
const KURUM = /\b(University|Üniversite|Institute|Enstitü|Press|Journal|Dergi|Society|Akademi|Academy|Museum|Müze|Okulu|School|College|Yayın|Kitab[ıi]|Sayı|Topics|Notes|Compendious|Hesab[ıi]|Sanat[ıi]na?)\b/i;

function varlikCikar(bloklar, coz, azami = 8) {
  const metin = (bloklar || []).join('\n');
  const bulgu = new Map();
  const unvanlar = coz.esanlam.filter((e) => /^(kağan|han|hakan|imparator|sultan|padişah|kral|şah)$/i.test(e));

  const ekle = (ad, unvan, kanit) => {
    if (!ad || ad.split(/\s+/).some((w) => AD_ELE.test(w))) return;
    const k = bulgu.get(ad) || { ad, unvan: unvan || '', sayi: 0, kanit: '', yil: null };
    k.sayi++;
    if (!k.kanit && kanit) k.kanit = kanit.slice(0, 160);
    // ⛔ YIL: gelişigüzel sayı ALINMAZ. Ölçüldü 22.09: "Bumin Kağan (307)"
    //    çıkıyordu — metindeki alakasız bir sayı yakalanmıştı. Yalnız
    //    hükümdarlık/yaşam aralığı kalıbı (552-576) kabul edilir; yoksa yıl
    //    YAZILMAZ. Yanlış tarih, tarih yokluğundan daha zararlıdır.
    if (!k.yil) {
      const y = (kanit || '').match(/\b(\d{3,4})\s*[-–—]\s*\d{3,4}\b/);
      if (y && +y[1] >= 100 && +y[1] <= 2100) k.yil = +y[1];
    }
    if (!k.unvan && unvan) k.unvan = unvan;
    bulgu.set(ad, k);
  };

  if (unvanlar.length) {
    // "Bumin Kağan", "İlteriş Kağan" — unvandan ÖNCEKİ tek özel ad.
    const bas = unvanlar.map((u) => u[0].toUpperCase() + u.slice(1)).join('|');
    const re = new RegExp(`(${AD_PARCA})\\s+(${bas})\\b`, 'g');
    let e;
    while ((e = re.exec(metin)) !== null) {
      const satir = metin.slice(Math.max(0, e.index - 60), e.index + 140).replace(/\s+/g, ' ');
      ekle(e[1], e[2], satir);
    }
  } else {
    // Unvansız (bilim insanı vb.): iki sözcüklü özel ad.
    // ⛔ KİŞİ İŞARETİ ŞART (ölçüldü 22.09): tek başına "iki büyük harfli
    //    sözcük" kuralı "Princeton University", "New York", "Özel Sayı",
    //    "Historical Topics" gibi kurum/yer/kitap adlarını kişi sandı.
    //    Ad, çevresinde bir KİŞİ ipucu taşımalı.
    const re = new RegExp(`(${AD_PARCA}\\s${AD_PARCA})`, 'g');
    let e;
    while ((e = re.exec(metin)) !== null) {
      const satir = metin.slice(Math.max(0, e.index - 60), e.index + 180).replace(/\s+/g, ' ');
      if (!KISI_IPUCU.test(satir)) continue;
      if (KURUM.test(e[1])) continue;
      ekle(e[1], '', satir);
    }
  }
  // ⛔ Tek kez geçen ad GÜRÜLTÜ: unvanlıda "Moğolistan Ulusal Müzesi Kağan",
  //    unvansızda "Tutor Biography", "Song Hanedanlığının" böyle giriyordu
  //    (ikisi de ölçüldü). Unvansız çıkarımda kural GEVŞETİLMEZ: unvan
  //    işareti yokken tek geçiş hiçbir şey kanıtlamaz.
  let liste = [...bulgu.values()];
  const saglam = liste.filter((k) => k.sayi >= 2);
  if (!unvanlar.length) liste = saglam;
  else if (saglam.length >= 4) liste = saglam;
  else liste = liste.filter((k) => k.sayi >= 2 || k.yil);
  return liste.sort((a, b) => (b.sayi - a.sayi) || ((a.yil ?? 9999) - (b.yil ?? 9999))).slice(0, azami);
}

// ── 3c. Güven düzeyi ──────────────────────────────────────────────────────
// ⛔ NEDEN (ilgezdi-15 uyarısı + ölçümü, 22.09.2026): HTML'de cümlenin sayfada
//    aynen geçtiği doğrulanabiliyor. PDF'te satır kırılması ve sütun düzeni
//    yüzünden çıkarılan metin bozulabiliyor. Zincirin "uydurmasız, kaynaklı"
//    sözünü korumak için kaynağın CİNSİ kullanıcıya görünmeli — aynı kefeye
//    koyarsak bozuk bir PDF satırı ansiklopedi cümlesi gibi görünür.
//
// yuksek : en az iki BAĞIMSIZ kaynak aynı şeyi söylüyor
// orta   : tek kaynak, ama metni doğrulanabilir (HTML)
// dusuk  : metin çıkarımı kırılgan (PDF vb.) — kullanıcıya böyle sunulur
// ⛔ BAĞIMSIZLIK `hostname` İLE ÖLÇÜLMEZ. ilgezdi-15 dört kör nokta ölçtü
//    (22.09.2026) ve dördü de sahte "yüksek" üretiyordu:
//      tr.wikipedia.org + en.wikipedia.org   → aynı kaynağın iki DİLİ
//      tr.wikipedia.org + tr.m.wikipedia.org → aynı sayfanın MOBİL sürümü
//      ornek.com        + www.ornek.com      → kelimenin tam anlamıyla aynı site
//      []  (hiç kaynak)                      → `liste.length` 0 falsy olduğu
//                                              için PDF dalı atlanıp "orta"
//                                              düşüyordu: kaynaksız iddiaya
//                                              orta güven.
//    Göktürk sorusunda iki kaynak da tr.wikipedia.org olduğu için tesadüfen
//    yakalanmıştı; biri en.wikipedia.org gelse sahte "yüksek" çıkacaktı.
//
// ⚠️ Çözüm depoda ZATEN VARDI: `blocker-main.registrableDomain()` — üçüncü
//    taraf çerez engellemede üretimde kullanılıyor, Public Suffix List'in
//    yaygın kısmını (com.tr, gov.tr, edu.tr, co.uk…) biliyor. Ölçtüm:
//    tr.wikipedia.org → wikipedia.org · acikders.ankara.edu.tr → ankara.edu.tr
//
// ⚠️ BİLİNEN SINIR: içerik YANSILARINI ayırt etmez (wikipedia.org ile
//    wikiwand.com farklı alan adı ama aynı içerik). Bunun için yansı listesi
//    gerekir; şimdilik kayıtlı bir sınır olarak duruyor.
const { registrableDomain } = require('./blocker-main');

function guvenDuzeyi(kaynaklar) {
  const liste = kaynaklar || [];
  if (!liste.length) return 'dusuk';                       // kaynaksız iddia
  if (liste.every((k) => /\.pdf($|\?)/i.test(k.url || ''))) return 'dusuk';
  const bagimsiz = new Set(liste.map((k) => {
    try { return registrableDomain(new URL(k.url).hostname); } catch { return String(k.url || ''); }
  }));
  return bagimsiz.size >= 2 ? 'yuksek' : 'orta';
}

// ── 3d. KONU DOĞRULAMA ────────────────────────────────────────────────────
// ⛔⛔ EN ÖNEMLİ DENETİM (düşmanca ölçüm, 22.09.2026 — kendi sınamam yakaladı):
//    Zincir cümle UYDURMUYOR ama ALAKASIZ kaynağı cevapmış gibi sunuyordu.
//    Ölçülen üç vaka:
//      "Zıpzıp Kağanlığının hükümdarları kimlerdir?" → 7 GÖKTÜRK kağanı saydı
//         (öyle bir devlet yok; arama Göktürk sayfalarını getirdi)
//      "2026'da Mars'a inen ilk Türk astronot"       → Alper Gezeravcı'yı verdi
//         (Gezeravcı 2024'te İSS'e gitti, Mars'a DEĞİL — yanlış öncül kabul edildi)
//      "Nobel FİZİK Ödülü kazanan Türk bilim insanları" → "Osmanlı İmparatorluğu"
//    Pratikte uydurmadan farkı yok: kullanıcı kaynaklı bir cevap görüyor.
//
// KURAL: cevabın DAYANAĞI, sorunun ayırt edici terimini taşımalı. Taşımıyorsa
// o madde düşer; hiçbiri taşımıyorsa zincir "bulamadım" der.
// ⚠️ Genel sözcükler (tarih, önemli, bilim…) ayırt edici SAYILMAZ; yoksa her
//    sayfa her soruyu "doğrular".
const GENEL_SOZCUK = new Set([
  'tarih', 'tarihi', 'tarihinde', 'tarihindeki', 'onemli', 'önemli', 'bilim', 'bilimi',
  'biliminde', 'insan', 'insani', 'insanlari', 'insanları', 'buyuk', 'büyük', 'ilk', 'son',
  'yil', 'yıl', 'yilinda', 'yılında', 'adi', 'adı', 'kim', 'kisi', 'kişi', 'devlet', 'ulke', 'ülke',
  'donem', 'dönem', 'yapan', 'olan', 'kazanan', 'inen', 'hakkinda', 'hakkında', 'nedir',
  // ⛔ SIRALAMA SIFATI konu değildir (ölçüldü 23.09): "Türkiye'nin en YÜKSEK
  //    barajları" sorusunun konusu barajdır; "yüksek" hem barajda hem dağda
  //    hem binada geçer, hiçbir sayfayı diğerinden ayırmaz.
  'yuksek', 'yüksek', 'kucuk', 'küçük', 'genis', 'geniş', 'hizli', 'hızlı', 'uzun',
  'kisa', 'kısa', 'eski', 'derin', 'zengin', 'pahali', 'pahalı', 'ucuz', 'agir', 'ağır',
]);

// Soru sözcükleri özel ad değildir; cümle başında büyük harfle yazılsalar bile.
const SORU_SOZCUGU = /^(kim|kimler|kimlerdir|kimdir|hangi|hangileri|hangileridir|ne|neler|nedir|nelerdir|nasıl|neden|niçin|kaç|kaçtır|nerede|nerededir|ne zaman|bana|lütfen|acaba)$/i;

/**
 * Sorunun KONUSUNU belirleyen terimler. Cevabın geldiği sayfa bunların
 * HEPSİNİ taşımalı — biri bile yoksa sayfa o soruyu cevaplamıyordur.
 *
 * ⛔ Ölçüldü 22.09: "Bor madeninin kullanım alanları" sorusunda "Bor" listeye
 *    HİÇ girmiyordu (cümle başı büyük harf alınmıyordu, üstelik 3 harfli
 *    olduğu için içerik sözcüğü de sayılmıyordu) → doğru cevap reddedildi.
 * ⛔ Ölçüldü 22.09: "2026'da Mars'a inen ilk Türk astronot" sorusunda
 *    terimlerden HERHANGİ BİRİ yetiyordu; "türk" her sayfada geçtiği için
 *    Gezeravcı sayfası "doğrulanmış" sayılıyordu. Artık "mars" da şart.
 * ⛔ Ölçüldü 23.09: "Türkiye'nin en yüksek barajları hangileri?" sorusunda
 *    terim YALNIZCA ["türkiy"] çıktı — özel ad bulununca içerik sözcükleri
 *    topluca dışlanıyordu (`ozel.length ? [] : icerik`). Sonuç: Türkiye geçen
 *    her sayfa konuyu "doğruladı", dünya barajlarıyla ilgili cümle ve
 *    Vikipedi dipnotu cevaba girdi. Artık özel adların TAMAMI + en ayırt
 *    edici EN ÇOK İKİ içerik sözcüğü birlikte kullanılıyor.
 */
function ayirtEdiciTerimler(soru) {
  const m = String(soru || '');
  // Büyük harfli sözcükler — cümle başındaki DAHİL ("Bor", "Zıpzıp", "Nobel").
  const ozel = (m.match(/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]{1,}/g) || [])
    .filter((w) => !SORU_SOZCUGU.test(w));
  const sayi = (m.match(/\b\d{3,4}\b/g) || []);
  const ozelKok = new Set([...ozel, ...sayi].map((x) => kok(duzle(x))));
  const hepsi = [...ozel, ...sayi, ...icerikTerimleri(m, ozelKok)];
  return [...new Set(hepsi.map((x) => kok(duzle(x))))]
    .filter((x) => x.length >= 3 && !GENEL_SOZCUK.has(x));
}

// ⛔ FİİL ÇEKİMİ konu değildir. Ölçüldü 23.09: "Matematik biliminde ÇAĞ
//    ATLATACAK buluşlar yapan bilim insanları" sorusunda tek aday
//    "atlatacak" kalıyordu; sayfadan bir söz sanatını şart koşmak, çalışan
//    ölçümü kırardı. Yalnız tartışmasız fiil ekleri elenir — "orman",
//    "zaman" gibi adları yemesin diye -an/-en KURALA ALINMADI.
const FIIL_EKI = /(acak|ecek|mak|mek|mış|miş|muş|müş|makta|mekte|yordu)$/;

// ⛔ EŞANLAMLISI BİLİNEN sözcük konu denetimine KONMAZ: ESANLAM tablosunun
//    varlık sebebi sayfanın başka sözcük kullanabilmesidir ("hükümdar" →
//    "kağan"). Böyle bir sözcüğü "sayfa bunu taşımalı" diye dayatırsak
//    doğru sayfayı eleriz — Göktürk ölçümü tam buradan geçiyor.
function esanlamliMi(w) {
  const d = duzle(w);
  return Object.keys(ESANLAM).some((k) => d.includes(duzle(k)));
}

/**
 * Sorunun içerik sözcüklerinden en ayırt edici olanlar (en çok iki tane).
 * ⚠️ "En ayırt edici" ölçüsü UZUNLUK: Türkçede uzun sözcük daha özgüldür
 *    ("barajları" > "yüksek"). Elimizde sıklık sayımı yok; uzunluk, bedava
 *    ve ölçülen vakaların hepsinde doğru sözcüğü seçen vekil.
 * ⚠️ İKİ İLE SINIRLI: her terim sayfadan geçmek ZORUNDA (konuGecti "hepsi"
 *    kuralı). Sınırsız terim, doğru sayfayı da eleyen bir denetim olurdu.
 */
const ICERIK_AZAMI = 2;
function icerikTerimleri(m, ozelKok) {
  // Soru kalıbı ("hangileri", "sırala", "istiyorum") konu değildir: atılır.
  const adaylar = motor.sozcukler(String(m).replace(SORU_KALIBI, ' '))
    .filter((w) => w.length >= 5 && !GENEL_SOZCUK.has(w) && !SORU_SOZCUGU.test(w))
    .filter((w) => !/^\d/.test(w))          // "2026da" → yıl zaten `sayi` yolundan
    .filter((w) => !FIIL_EKI.test(w) && !esanlamliMi(w))
    .sort((a, b) => b.length - a.length);
  // Özel adın kökünü tekrarlayan sözcük slot harcamaz ("Türkiye" + "türkiye").
  const gorulen = new Set(ozelKok);
  const secili = [];
  for (const w of adaylar) {
    const k = kok(duzle(w));
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    secili.push(w);
    if (secili.length >= ICERIK_AZAMI) break;
  }
  return secili;
}

// Türkçe ek kırpması: tam kök çıkarmıyoruz, ÖNEKİ arıyoruz. "Marsa"→"mars",
// "Kağanlığının"→"kağan", "Enstitüsünü"→"ensti". En çok 6 harf; daha uzun
// önek eklerle bozulur, daha kısa önek yanlış eşleşir (kar→karşı tuzağı).
function kok(s) {
  const t = cogulsuz(duzle(s));
  return t.length <= 6 ? t : t.slice(0, 6);
}

// ⛔ ÇOĞUL EKİ KIRPILIR (ölçüldü 23.09): "barajları" altı harfe kesilince
//    kök "barajl" oluyor ve sayfadaki "Barajı" / "baraj" ile EŞLEŞMİYOR —
//    yani doğru sayfa konu dışı sayılıyor. Ek kırpılınca kök "baraj".
// ⚠️ Kırpma yalnız geriye EN AZ 4 harf kalıyorsa yapılır: "dolar" → "do",
//    "sular" → "su" olurdu; bunlar çoğul değil, kök de değil. Fazla kırpmak
//    eşleşmeyi gevşetir (kök önek olarak aranıyor), az kırpmak DOĞRU sayfayı
//    eler; bu yüzden sınır kırpmama yönüne konmuştur.
function cogulsuz(t) {
  const m = t.match(/^(.+?)(l[ae]r)(?:[ıiuü][a-zçğıöşü]*)?$/);
  return m && m[1].length >= 4 ? m[1] : t;
}

/**
 * Sayfa gerçekten bu soruyu mu konu ediyor? Terimlerin HEPSİ geçmeli.
 * ⛔ "herhangi biri" kuralı yanıltıcıydı: alakasız sayfa tek genel sözcükle
 *    kendini doğrulatıyordu (ilgezdi-15 ölçümü: "Kayseri Kuantum Enstitüsü"
 *    sorusuna Mete Atatüre sayfası `yuksek` güvenle cevap oldu).
 */
function konuGecti(dayanak, terimler) {
  return eksikTerimler(dayanak, terimler).length === 0;
}

/**
 * Dayanakta BULUNAMAYAN terimler. Denetimin kendisi buradan geçer, böylece
 * "geçti mi" ile "neden geçmedi" aynı kuralı kullanır, ayrışamaz.
 * ⚠️ Kesme işareti düzlenir: sayfa "Mars'a" yazarken soru "Marsa" diyor;
 *    düzlemezsek doğru sayfa bile konu dışı sayılır (Türkçe ek tuzağı).
 */
function eksikTerimler(dayanak, terimler) {
  if (!terimler || !terimler.length) return [];   // denetleyecek terim yok
  const d = duzle(dayanak);
  return terimler.filter((t) => !d.includes(t));
}

function duzle(s) {
  return String(s || '').toLocaleLowerCase('tr').replace(/['’‘`´]/g, '');
}

// ── 4/5. Birleştir ve yaz ─────────────────────────────────────────────────
// Aynı bilgiyi iki kaynak söylüyorsa bir kez yazılır ama İKİ kaynak gösterilir.
function birlestir(parcalar, coz) {
  const kume = [];
  for (const p of parcalar) {
    for (const c of p.cumleler) {
      const benzer = kume.find((k) => ortakOran(k.metin, c) > 0.6);
      if (benzer) { if (!benzer.kaynaklar.some((k) => k.url === p.url)) benzer.kaynaklar.push({ url: p.url, baslik: p.baslik }); }
      else kume.push({ metin: c, kaynaklar: [{ url: p.url, baslik: p.baslik }] });
    }
  }
  // İki kaynağın doğruladığı bilgi öne alınır — tek kaynaklı iddiadan güçlüdür.
  return kume.sort((a, b) => b.kaynaklar.length - a.kaynaklar.length)
    .slice(0, coz.tip === 'liste' ? 8 : 5)
    .map((k) => ({ ...k, guven: guvenDuzeyi(k.kaynaklar) }));
}

function ortakOran(a, b) {
  const A = new Set(motor.sozcukler(a));
  const B = motor.sozcukler(b);
  if (!A.size || !B.length) return 0;
  return B.filter((w) => A.has(w)).length / Math.min(A.size, B.length);
}

/**
 * Zinciri çalıştırır.
 * @param {string} soru
 * @param {object} kanca  { ara(sorgu) → [{baslik,url,parcacik}],
 *                          sayfaAc(url) → {ok, bloklar, basliklar, baslik} }
 */
async function arastir(soru, kanca, secenek = {}) {
  const coz = soruCoz(soru);
  const iz = { adimlar: [], baslangic: Date.now() };
  iz.adimlar.push({ adim: 'soru_coz', tip: coz.tip, sorgu: coz.sorgu, esanlam: coz.esanlam.length });

  let ham = await kanca.ara(coz.sorgu);
  iz.adimlar.push({ adim: 'arama', sorgu: coz.sorgu, bulunan: (ham || []).length });

  let secili = kaynaklariSuz(ham, secenek.azamiKaynak || 4);
  iz.adimlar.push({ adim: 'suzgec', kalan: secili.length, elenen: (ham || []).length - secili.length });

  // ⛔ İKİNCİ DENEME (ölçüldü 22.09): "Matematik biliminde çağ atlatacak
  //    buluşlar yapan bilim insanları" sorgusu arama motoruna olduğu gibi
  //    gidince devlet PDF'leri döndü ve zincir "metin_yok" dedi. Uzun sorgu
  //    konuyu değil cümleyi arıyor. Okunabilir kaynak çıkmazsa sorguyu
  //    ÇEKİRDEK sözcüklere indirip bir kez daha deniyoruz.
  const okunabilir = secili.filter((s) => !/\.pdf($|\?)/i.test(s.url));
  if (okunabilir.length < 2) {
    const cekirdek = motor.sozcukler(coz.sorgu).slice(0, 3).join(' ');
    if (cekirdek && cekirdek !== coz.sorgu) {
      const ham2 = await kanca.ara(cekirdek);
      const secili2 = kaynaklariSuz(ham2, secenek.azamiKaynak || 4);
      iz.adimlar.push({ adim: 'arama_2', sorgu: cekirdek, bulunan: (ham2 || []).length, kalan: secili2.length });
      // İki turu birleştir, adres tekrarını at; PDF olmayan öne alınır.
      const gorulen = new Set(secili.map((s) => s.url));
      secili = secili.concat(secili2.filter((s) => !gorulen.has(s.url)))
        .sort((a, b) => (/\.pdf($|\?)/i.test(a.url) ? 1 : 0) - (/\.pdf($|\?)/i.test(b.url) ? 1 : 0))
        .slice(0, (secenek.azamiKaynak || 4) + 2);
    }
  }
  if (!secili.length) return { ok: false, sebep: 'kaynak_yok', iz };

  // ⛔ KONU DOĞRULAMA sayfa düzeyinde: sayfa sorunun bütün ayırt edici
  //    terimlerini taşımıyorsa o soruyu konu etmiyordur, hiç kullanılmaz.
  const terimler = coz.terimler;
  iz.adimlar.push({ adim: 'konu_terimleri', terimler });

  const parcalar = [];
  for (const s of secili) {
    const t0 = Date.now();
    let sayfa;
    try { sayfa = await kanca.sayfaAc(s.url); } catch (e) { sayfa = { ok: false, sebep: String(e && e.message) }; }
    if (!sayfa || !sayfa.ok) { iz.adimlar.push({ adim: 'sayfa', url: s.url, ok: false, sebep: sayfa && sayfa.sebep, ms: Date.now() - t0 }); continue; }
    // Sayfa soruyu konu etmiyorsa hiç işlenmez — alakasız kaynak cevaba giremez.
    const sayfaMetni = (sayfa.bloklar || []).join(' ');
    const eksik = eksikTerimler(sayfaMetni, terimler);
    if (eksik.length) {
      iz.adimlar.push({ adim: 'sayfa', url: s.url, ok: false, sebep: 'konu_disi', ms: Date.now() - t0 });
      // ⛔ "konu_disi" tek başına denetimin haklı mı yoksa fazla mı sıkı
      //    olduğunu söylemiyor. HANGİ terimin bulunamadığı yazılır; adres
      //    yazılmaz — bir önceki satır zaten sayfanın kaydı.
      iz.adimlar.push({ adim: 'konu_disi', eksik });
      continue;
    }
    const cumleler = cevapCumleleri(sayfa.bloklar, coz, coz.tip === 'liste' ? 4 : 3);
    // LİSTE sorusunda adlar tabloda olabilir; cümle seçimi onları göremez.
    const varliklar = coz.tip === 'liste' ? varlikCikar(sayfa.bloklar, coz) : [];
    iz.adimlar.push({ adim: 'sayfa', url: s.url, ok: true, cumle: cumleler.length,
                      varlik: varliklar.length, kirpildi: !!sayfa.kirpildi, ms: Date.now() - t0 });
    if (cumleler.length || varliklar.length) {
      parcalar.push({ url: s.url, baslik: sayfa.baslik || s.baslik, cumleler, varliklar });
    }
  }
  if (!parcalar.length) return { ok: false, sebep: 'metin_yok', iz };

  iz.toplamMs = Date.now() - iz.baslangic;

  if (coz.tip === 'liste') {
    // Adları kaynaklar arasında birleştir: iki kaynakta geçen ad daha güvenilir.
    const tekil = new Map();
    for (const p of parcalar) {
      for (const v of (p.varliklar || [])) {
        const k = tekil.get(v.ad);
        if (!k) tekil.set(v.ad, { ...v, kaynaklar: [{ url: p.url, baslik: p.baslik }] });
        else {
          k.sayi += v.sayi;
          if (!k.yil && v.yil) k.yil = v.yil;
          if (!k.kanit && v.kanit) k.kanit = v.kanit;
          if (!k.kaynaklar.some((x) => x.url === p.url)) k.kaynaklar.push({ url: p.url, baslik: p.baslik });
        }
      }
    }
    const adlar = [...tekil.values()]
      .sort((a, b) => (b.kaynaklar.length - a.kaynaklar.length) || ((a.yil ?? 9999) - (b.yil ?? 9999)))
      .slice(0, 10)
      .map((k) => ({ ...k, guven: guvenDuzeyi(k.kaynaklar) }));
    // ⛔ Ad bulunamadıysa VAZGEÇİLMEZ, cümle yoluna düşülür. Ölçüldü 22.09:
    //    "Bor madeninin kullanım alanları" bir LİSTE sorusudur ama KİŞİ
    //    listesi değildir; varlık çıkarımı 0 ad bulunca zincir haksız yere
    //    "bulamadım" diyordu. (Bu gerilemeyi konu doğrulamayı eklerken ben
    //    soktum, düşmanca ölçüm yakaladı.)
    if (adlar.length) {
      return { ok: true, tip: 'liste', soru, adlar,
               maddeler: birlestir(parcalar, coz).slice(0, 3),   // bağlam cümleleri
               kaynakSayisi: parcalar.length, iz };
    }
  }
  const maddeler = birlestir(parcalar, coz);
  if (!maddeler.length) {
    iz.adimlar.push({ adim: 'konu_dogrulanmadi', tip: coz.tip });
    return { ok: false, sebep: 'konu_dogrulanmadi', iz };
  }
  return { ok: true, tip: coz.tip, soru, maddeler, kaynakSayisi: parcalar.length, iz };
}

module.exports = { arastir, soruCoz, kaynakPuani, kaynaklariSuz, cevapCumleleri,
                   birlestir, metinKalitesi, varlikCikar, guvenDuzeyi,
                   ayirtEdiciTerimler, konuGecti, eksikTerimler, cumleAlakali, ESANLAM };
