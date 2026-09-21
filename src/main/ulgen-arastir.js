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
  return { tip, sorgu, esanlam, soru: m };
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
  // Liste sorusunda özel ad taşıyan cümle daha değerli.
  if (coz.tip === 'liste') {
    liste = liste.sort((a, b) => (ozelAdSayisi(b.metin) - ozelAdSayisi(a.metin)) || (b.isabet - a.isabet));
  }
  // Tanım sorusunda giriş cümlesi zaten özette garanti (ulgen-motor).
  return liste.slice(0, azami).map((x) => x.metin);
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
  return kume.sort((a, b) => b.kaynaklar.length - a.kaynaklar.length).slice(0, coz.tip === 'liste' ? 8 : 5);
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

  const parcalar = [];
  for (const s of secili) {
    const t0 = Date.now();
    let sayfa;
    try { sayfa = await kanca.sayfaAc(s.url); } catch (e) { sayfa = { ok: false, sebep: String(e && e.message) }; }
    if (!sayfa || !sayfa.ok) { iz.adimlar.push({ adim: 'sayfa', url: s.url, ok: false, sebep: sayfa && sayfa.sebep, ms: Date.now() - t0 }); continue; }
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
      .slice(0, 10);
    if (adlar.length) {
      return { ok: true, tip: 'liste', soru, adlar,
               maddeler: birlestir(parcalar, coz).slice(0, 3),   // bağlam cümleleri
               kaynakSayisi: parcalar.length, iz };
    }
  }
  const maddeler = birlestir(parcalar, coz);
  return { ok: true, tip: coz.tip, soru, maddeler, kaynakSayisi: parcalar.length, iz };
}

module.exports = { arastir, soruCoz, kaynakPuani, kaynaklariSuz, cevapCumleleri,
                   birlestir, metinKalitesi, varlikCikar, ESANLAM };
