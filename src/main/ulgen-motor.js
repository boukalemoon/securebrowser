/**
 * İlgezdi — Ülgen motoru (yerel asistan çekirdeği).
 *
 * Bu dosya Ülgen'in İlgezdi içindeki klonudur. Burak'ın kararları (17.09.2026):
 *   · Ülgen yereldir, tarayıcının DIŞINDA çalışmaz; kullanıcı kendisi açar.
 *   · Tercihler önce yerelde tutulur; hesaba gönderim ayrı izinle olur.
 *
 * Bu yüzden motor:
 *   · AĞA HİÇ ÇIKMAZ. `require` ettiği tek şey Node'un kendisi; fetch, net, http yok.
 *   · DİL MODELİ KULLANMAZ. Özet, sayfanın kendi cümlelerinden seçilir (çıkarımsal
 *     özet) — yeni cümle uydurulamaz, her cümle sayfada birebir vardır.
 *   · Eylemi KENDİ YAPMAZ. Arama/sekme açma yalnız ÖNERİ olarak döner; kullanıcı
 *     tıklayınca ana süreç yapar.
 *
 * Saf işlevlerdir; Electron'a bağımlı değildir (test/run.js doğrudan sınar).
 */

'use strict';

// ── Türkçe küçük harf ──────────────────────────────────────────────────────────
// "İ".toLowerCase() → "i̇" (noktalı) verir ve eşleşmeyi bozar; "I" → "ı" olmalı.
function kucuk(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

// ── Niyet ──────────────────────────────────────────────────────────────────────
// Yalnız Türkçe ve İngilizce kalıplar. Diğer yedi dilde paneldeki düğmeler
// (çipler) kullanılır; düğmeler dilden bağımsız bir `tur` gönderir.
//
// ⛔ JavaScript'in `\b` sınırı YALNIZ ASCII harfi tanır: "özetle", "mı", "mü"
//    gibi Türkçe harfle başlayan/biten sözcükler hiç eşleşmiyordu (ölçüldü:
//    "bu sayfayı özetle" → tanınmadı). Sınır Unicode harf sınıfıyla kurulur.
const SINIR = (govde, bayrak = 'iu') =>
  new RegExp('(?<![\\p{L}\\p{N}_])(?:' + govde + ')(?![\\p{L}\\p{N}_])', bayrak);

const NIYET = [
  // Profil önce: "bana ne önerirsin" içinde arama/geçmiş sözcüğü yok ama
  // "geçmişime göre öner" geçmiş aramasına düşmemeli.
  ['profil',  SINIR("profilim|beni tanı|ilgi alanlarım|alışkanlıklarım|bana (ne )?öner(ir misin|irsin|i)?|öneri(ler)?(in)? (var mı|ver)|ne önerirsin|my profile|my interests|recommend( me)?|suggestions?")],
  ['ozet',   SINIR("özetle|özetler misin|özet(i|ini)?|kısaca anlat|ne anlatıyor|summari[sz]e|summary|tl;?dr")],
  ['sorgu',   SINIR("daha iyi (bir )?(arama )?sorgu(su)?( yaz| öner)?|(arama )?sorgu(su)? (yaz|öner)|better (search )?query")],
  ['sayfada', SINIR("bu sayfada|sayfada|in this page|on this page|on the page")],
  ['gecmis',  SINIR("geçmişte|geçmişimde|geçen (hafta|gün|ay)|daha önce (okuduğum|baktığım|girdiğim)|in my history|history")],
  ['web',     SINIR("web'?de ara|internette ara|ara:|search( the web| for)?|google'?la")],
];

function niyet(metin) {
  const m = String(metin || '').trim();
  for (const [tur, desen] of NIYET) {
    const e = m.match(desen);
    if (e) {
      const arg = (m.slice(0, e.index) + ' ' + m.slice(e.index + e[0].length))
        .replace(/^[\s:,.–-]+|[\s:,.?!–-]+$/g, '').replace(/\s+/g, ' ').trim();
      return { tur, arg };
    }
  }
  return { tur: m ? 'bilinmiyor' : 'yardim', arg: m };
}

// ── Sayfa metni: okuyucu düğümlerinden bloklar ────────────────────────────────
// Düğüm biçimi reader.js'teki gibidir: metin ya da [etiket, öznitelik, çocuklar].
const BLOK = new Set(['p', 'li', 'blockquote', 'pre', 'td', 'th', 'dd', 'dt', 'figcaption', 'caption', 'div', 'tr']);
const BASLIK = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// ── Tablo satırı ──────────────────────────────────────────────────────────────
// ⛔ NEDEN (ölçüldü 23.09.2026): "Türkiye'nin en yüksek barajları hangileri?"
//    sorusunda HER sayfada `varlik: 0` çıktı. Cevap sayfada duruyordu ama
//    zincire hiç ulaşmıyordu: barajlar Vikipedi'de TABLODA ve her td/th ayrı
//    blok olduğu için satır hücre hücre bölünüyordu — "Yusufeli Barajı",
//    "275", "Çoruh" tek başına birer kırıntı. Araştırma zinciri onları
//    (haklı olarak) `cok_kisa` diye eliyordu. Satır bir arada ise anlamlı:
//    "Yusufeli Barajı | 275 m | Çoruh | 2022".
const HUCRE_AYRAC = ' | ';

// ⚠️ SATIR İŞARETİ NEDEN `String` SARMALAYICISI: `bloklar` düz metin dizisi
//    olarak altı yerde tüketiliyor (cumleler, ozetle, sayfadaAra,
//    anahtarSozcukler, karakter sayımı ve main.js'teki blok kırpma —
//    sonuncusu `b.length` ile `b.slice()` çağırıyor). Düz nesne
//    ({ tip:'satir', metin }) koysaydık kırpma sessizce NaN'a düşer, metin
//    sınırı üretimde devre dışı kalırdı. Sarmalayıcı her tüketici için
//    KATRESİ KATRESİNE metindir (length, slice, join, regex, String()),
//    üstüne satır işaretini taşır. Tablo DIŞI bloklar düz dize kalır.
// ⚠️ İşaret `slice()` sonrası düşer (ilkel dizeye dönülür); kırpılmış satır
//    satır sayılmaz, cümle yolundan geçer — kaybı olan davranış bu kadardır.
function satirBlogu(metin) {
  const b = new String(metin);          // eslint-disable-line no-new-wrappers
  b.tip = 'satir';
  return b;
}

function satirMi(blok) {
  return !!(blok && blok.tip === 'satir');
}

function duzMetin(nodes) {
  const bloklar = [];
  const basliklar = [];
  let tampon = '';
  let satir = null;                     // `tr` içindeyken hücreler buraya birikir
  const bosalt = (hedef) => {
    const t = tampon.replace(/\s+/g, ' ').trim();
    if (t) hedef.push(t);
    tampon = '';
  };
  (function yuru(liste) {
    for (const n of Array.isArray(liste) ? liste : []) {
      if (typeof n === 'string') { tampon += n; continue; }
      if (!Array.isArray(n) || n.length !== 3) continue;
      const [etiket, , cocuk] = n;
      if (etiket === 'img') continue;
      if (etiket === 'br') { tampon += ' '; continue; }
      if (etiket === 'tr') {
        // İç içe tablo: dıştaki satırı bölmeyiz, hücreler aynı satıra akar.
        if (satir) { yuru(cocuk); continue; }
        bosalt(bloklar);
        satir = [];
        yuru(cocuk);
        bosalt(satir);                  // kapanmamış son hücrenin artığı
        const t = satir.join(HUCRE_AYRAC);
        satir = null;
        if (t) bloklar.push(satirBlogu(t));
        continue;
      }
      // Satır içindeyken td/th kendi bloğunu AÇMAZ, hücre olarak satıra yazar.
      if (BASLIK.has(etiket)) { bosalt(satir || bloklar); yuru(cocuk); bosalt(basliklar); continue; }
      if (BLOK.has(etiket)) { const hedef = satir || bloklar; bosalt(hedef); yuru(cocuk); bosalt(hedef); continue; }
      yuru(cocuk);
    }
  })(nodes);
  bosalt(bloklar);
  return { bloklar, basliklar, karakter: bloklar.reduce((a, b) => a + b.length, 0) };
}

// ── Cümleler ───────────────────────────────────────────────────────────────────
// Kısaltmalar ("Dr.", "vb.", "U.S.") cümleyi bölmesin diye bölme yalnız nokta +
// boşluk + BÜYÜK harf/rakam/tırnak önünde yapılır.
const BOL = /(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜÂÎÛ0-9"“«(])/u;
const KISALTMA = /(?<![\p{L}\p{N}_])(dr|prof|doç|yrd|av|st|no|vb|vs|bkz|örn|mr|mrs|ms|jr|sr|inc|ltd|co|vol|fig|u\.s|a\.ş)\.$/iu;

function cumleler(bloklar) {
  const cikti = [];
  (bloklar || []).forEach((blok, bi) => {
    // Satır işareti cümleye de geçer: özet onu dışarıda bırakabilsin diye.
    const satir = satirMi(blok);
    const parca = String(blok).split(BOL);
    let bekleyen = '';
    for (const p of parca) {
      const c = (bekleyen ? bekleyen + ' ' : '') + p.trim();
      if (KISALTMA.test(c)) { bekleyen = c; continue; }
      bekleyen = '';
      if (c) cikti.push({ metin: c, blok: bi, satir });
    }
    if (bekleyen) cikti.push({ metin: bekleyen, blok: bi, satir });
  });
  return cikti;
}

// ── Sözcükler ──────────────────────────────────────────────────────────────────
const DURAK = new Set((
  'bir bu şu o ve ile de da ki mi mı mu mü için gibi daha çok en her ne ya ama fakat ancak veya ' +
  'olan olarak olduğu oldu olur olması ise diye kadar sonra önce göre ayrıca bile hem hep hiç ' +
  'bunu bunun buna şunu onun ona onlar bizim sizin benim ben sen biz siz var yok değil ' +
  'the a an and or but of to in on at for with from by as is are was were be been being this that ' +
  'these those it its he she they we you i not no yes do does did has have had will would can could ' +
  'about into than then there their which who whom what when where why how also more most such said'
).split(/\s+/));

function sozcukler(metin) {
  return kucuk(metin)
    .replace(/[’'][a-zçğıöşü]+/g, '')          // Türkçe ek: "İstanbul'da" → "istanbul"
    .split(/[^a-zçğıöşüâîû0-9]+/)
    .filter((w) => w.length >= 3 && !DURAK.has(w) && !/^\d+$/.test(w));
}

// ── Çıkarımsal özet ────────────────────────────────────────────────────────────
// Puan = cümledeki sözcüklerin belgedeki sıklık toplamı / √(sözcük sayısı)
//        × konum çarpanı (ilk paragraflar haberin özüdür) × başlık çarpanı.
// ⚠️ Bu bir DİL MODELİ ÖZETİ DEĞİLDİR: cümleler olduğu gibi seçilir. Yanlış
//    cümle seçilebilir ama sayfada olmayan bir iddia ASLA üretilmez.
// Sayı taşıyan cümleye verilen ek ağırlık (ölçümle seçildi; aşağıdaki
// yorumda tablo var). En az iki basamaklı sayı ya da yüzde aranır: "üç
// bölümden oluşur" gibi yazıyla geçen sayılar ve tek haneli sıra numaraları
// sinyal sayılmaz.
const SAYILI = /(\d{2,}|%\s*\d|\d+([.,]\d+)+)/;
const SAYI_AGIRLIGI = 0.35;

function ozetle(bloklar, secenek = {}) {
  // ⚠️ ÖZET CÜMLEDEN KURULUR: tablo satırı cümle değildir. Satırlar araştırma
  //    zincirinin madde yolundan geçer; sayfa özetine "Yusufeli | 275 | 2022"
  //    girerse özet okunmaz olur (hücreler ayrıyken 40 karakter eşiği bunu
  //    zaten yapıyordu, satır birleşince eşik korumayı bırakırdı).
  const tum = cumleler(bloklar).filter((c) => !c.satir && c.metin.length >= 40 && c.metin.length <= 450);
  if (!tum.length) return { cumleler: [], toplam: 0 };
  const siklik = new Map();
  for (const c of tum) for (const w of sozcukler(c.metin)) siklik.set(w, (siklik.get(w) || 0) + 1);
  const baslikSoz = new Set(sozcukler((secenek.baslik || '') + ' ' + (secenek.basliklar || []).join(' ')));
  const blokSayisi = Math.max(1, (bloklar || []).length);

  const puanli = tum.map((c, i) => {
    const s = sozcukler(c.metin);
    if (!s.length) return { ...c, i, puan: 0, s };
    let p = 0;
    for (const w of s) p += (siklik.get(w) || 0) * (baslikSoz.has(w) ? 1.6 : 1);
    p /= Math.sqrt(s.length);
    const konum = 1 + 0.6 * (1 - c.blok / blokSayisi);
    // SAYI AĞIRLIĞI: "843 mm yağış", "84 m³" gibi cümleler sıklık puanında
    // geride kalıyordu; oysa kullanıcının aradığı bilgi çoğu kez orada.
    const sayi = SAYILI.test(c.metin) ? 1 + (secenek.sayiAgirligi ?? SAYI_AGIRLIGI) : 1;
    return { ...c, i, puan: p * konum * sayi, s };
  });

  // CÜMLE SAYISI SAYFAYA GÖRE ÖLÇEKLENİR. Sabit 3 cümle, 5 cümlelik bir
  // haberde özet sayılmıyordu (ilgezdi-15: "kısa sayfalarda özet pek
  // kısaltmıyor"). ÖLÇÜLDÜ 22.09.2026, aynı metinler önce/sonra:
  //   haber   5 cümle → 3c/0,61  →  2c/0,45   ← düzelen
  //   vakıf   8 cümle → 3c/0,39  →  3c/0,39   (değişmedi)
  //   su     10 cümle → 3c/0,35  →  3c/0,35   (değişmedi)
  // Yani kural yalnız kısa sayfaya dokunuyor; tanım ve sayı cümleleri duruyor.
  // ⚠️ TABAN 8+ cümlede 3: 2'ye indirince sayı ağırlığıyla birleşip tanım
  // cümlesini düşürdü (vakıf metni, ölçüldü). Kısa sayfada 2 yeterli.
  const taban = tum.length >= 8 ? 3 : 2;
  const azami = secenek.azami || Math.max(taban, Math.min(5, Math.round(tum.length * 0.3)));
  const secilen = [];
  for (const c of [...puanli].sort((a, b) => b.puan - a.puan)) {
    if (secilen.length >= azami) break;
    // Aynı şeyi söyleyen iki cümle alınmaz (sözcük örtüşmesi > %60).
    const kume = new Set(c.s);
    const benzer = secilen.some((x) => {
      const ort = x.s.filter((w) => kume.has(w)).length;
      return ort / Math.max(1, Math.min(kume.size, x.s.length)) > 0.6;
    });
    if (!benzer) secilen.push(c);
  }

  // ⛔ GİRİŞ CÜMLESİ GARANTİ. Burak bildirdi 22.09.2026: "Anatomi" sayfasının
  // özeti tanımı atlayıp Leonardo da Vinci'yi ve 1863'te ders veren bir
  // profesörü getiriyordu. Kök sebep ağırlık ayarı DEĞİL: puan = sıklık
  // toplamı / √uzunluk olduğu için UZUN cümle kısa tanımı her zaman yeniyor;
  // tanım cümlesi aday listesinde olduğu hâlde hiç seçilmiyordu. Ağırlık
  // taraması (0 / 0,3 / 0,6 / 1,0 / 1,6) denendi ve ÜÇ SAYFADA DA ÇÖZMEDİ.
  // Çözüm: belgenin ilk uygun cümlesi puanına bakılmaksızın özete girer ve
  // başa yazılır — ansiklopedi, haber ve makalede tanım oradadır.
  // ÖLÇÜLDÜ (tr.wikipedia düz metin):
  //   Anatomi    → "...organizmaların ve parçalarının yapısının incelenmesi
  //                 ile ilgili biyoloji dalıdır." (önce: yoktu)
  //   Yapay zekâ → "...öğrenme, akıl, problem çözme, algılama ve karar verme
  //                 gibi..." (önce: yoktu)
  // ⚠️ `puanli[0]`, `tum[0]` DEĞİL: `i` alanı puanlama sırasında atanıyor.
  // tum[0] kullanınca `i` undefined kalıyor, cümle hem sona düşüyor hem
  // zaten seçilmişse İKİNCİ KEZ ekleniyordu (ölçüldü, Çanakkale sınaması).
  const giris = puanli[0];                    // belge sırasındaki ilk uygun cümle
  if (giris && !secilen.some((c) => c.i === giris.i)) {
    // En zayıf seçimi bırakıp yerine girişi alıyoruz (liste puan sırasında).
    if (secilen.length >= azami) secilen.pop();
    secilen.push(giris);
  }

  secilen.sort((a, b) => a.i - b.i);
  return { cumleler: secilen.map((c) => c.metin), toplam: tum.length };
}

// ── Sayfada arama ──────────────────────────────────────────────────────────────
function sayfadaAra(bloklar, sorgu, azami = 8) {
  const aranan = sozcukler(sorgu);
  const duz = kucuk(sorgu).trim();
  if (!duz) return [];
  return cumleler(bloklar)
    .map((c) => {
      const k = kucuk(c.metin);
      const tam = duz.length >= 3 && k.includes(duz) ? 3 : 0;
      const kismi = aranan.filter((w) => k.includes(w)).length;
      return { metin: c.metin, puan: tam + kismi };
    })
    .filter((c) => c.puan > 0)
    .sort((a, b) => b.puan - a.puan)
    .slice(0, azami)
    .map((c) => c.metin.slice(0, 450));
}

// ── Daha iyi arama sorgusu ─────────────────────────────────────────────────────
// Soru kalıplarını ve dolgu sözcüklerini atar, tırnaklı ifadeyi korur.
const DOLGU = new RegExp(SINIR("acaba|lütfen|bana|bir|hakkında|ile ilgili|nedir|nasıl|neden|niçin|nerede|ne zaman|kim|hangi|mi|mı|mu|mü|misin|mısın|musun|müsün|geçiyor|var mı|what|how|why|where|when|who|which|is|are|the|a|an|please|about|can you|tell me").source, 'giu');

function sorguOner(metin) {
  const m = String(metin || '').trim();
  if (!m) return '';
  const tirnak = [...m.matchAll(/"([^"]{2,80})"/g)].map((x) => `"${x[1]}"`);
  const govde = m.replace(/"[^"]*"/g, ' ')
    .replace(/[’'][a-zçğıöşü]+/gi, '')
    .replace(DOLGU, ' ')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const gorulen = new Set();
  const temiz = govde.split(' ').filter((w) => {
    const k = kucuk(w);
    if (!w || gorulen.has(k)) return false;
    gorulen.add(k); return true;
  });
  return [...tirnak, ...temiz].join(' ').slice(0, 200).trim() || m.slice(0, 200);
}

// ── İlgi etiketleri (yalnız ulgenInterests izniyle, yalnız cihazda) ────────────
// Özetlenen sayfanın en ayırt edici sözcükleri. Sayfa adresi ya da metni SAKLANMAZ;
// yalnız sözcük ve sayacı saklanır.
function anahtarSozcukler(bloklar, n = 5) {
  const s = new Map();
  for (const b of bloklar || []) for (const w of sozcukler(b)) s.set(w, (s.get(w) || 0) + 1);
  return [...s.entries()].filter(([w, c]) => c >= 2 && w.length >= 4)
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

// ⛔ ÖLÇÜLDÜ (04.10.2026, yayın öncesi denetim): düz nesnede `d['constructor'] || 0` PROTOTİPTEKİ işlevi
//    döndürüyordu; "constructor" sık geçen bir sayfadan sonra sayaç `"function Object() { [native code] }11"`
//    oluyor, her özette uzuyor ve sıralama NaN'a düşüyordu. Sayaç prototipsiz nesnede tutulur; diskte
//    önceden bozulmuş (sayı olmayan) değerler okunurken atılır.
function ilgiEkle(eski, sozcuk, azami = 60) {
  const d = Object.create(null);
  if (eski && typeof eski === 'object') {
    for (const [k, v] of Object.entries(eski)) if (Number.isFinite(v) && v > 0) d[k] = v;
  }
  for (const w of sozcuk || []) {
    if (typeof w !== 'string' || !w || w.length > 40) continue;
    d[w] = (d[w] || 0) + 1;
  }
  // Sınırsız büyümesin: en seyrekler atılır.
  return Object.fromEntries(Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, azami));
}

// ── Geçmiş sonuçları: yalnız gösterilecek alanlar ──────────────────────────────
function gecmisSonuclari(items, azami = 8) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && typeof x.url === 'string' && /^https?:\/\//i.test(x.url))
    .slice(0, azami)
    .map((x) => ({ baslik: String(x.title || x.domain || x.url).slice(0, 200),
                   url: x.url.slice(0, 2000), alan: String(x.domain || '').slice(0, 120),
                   zaman: Number(x.timestamp) || 0 }));
}

// ══════════════════════════════════════════════════════════════════════════════
// SINIFLANDIRMA · PROFİL · ÖNERİ (Burak, 03.10.2026: "kullanıcı verilerini
// anlayabilecek, sınıflandırabilecek ve öneriler sunabilecek basit bir asistan")
//
// ⛔ Yine AĞ YOK, DİL MODELİ YOK. Sınıflandırma site adı + sayfa başlığındaki
//    sözcüklerle, KURALLA yapılır; sonuç her zaman açıklanabilir ("trendyol →
//    alışveriş"). Profil DİSKE YAZILMAZ: her istekte şifreli ziyaret
//    günlüğünden yeniden hesaplanır, panel kapanınca yok olur. Böylece izin
//    kapatılınca silinecek bir şey de kalmaz.
// ⛔ Öneri EYLEM DEĞİLDİR: motor yalnız {tur:'ac'|'ara'} döner, kullanıcı
//    tıklamadıkça hiçbir sekme açılmaz (ulgen-eylem yolu).
// ══════════════════════════════════════════════════════════════════════════════

// alan: sitenin adres ETİKETLERİ (aa.com.tr → aa · com · tr) ya da noktalı
//       tam son ek ('docs.google.com'). soz: başlık sözcüğü — '*' ile biten
//       ÖNEKTİR ('borsa*' → borsada), diğerleri TAM sözcük. Kısa kök bilerek
//       tam eşleşir: "kar" önek olsaydı "karşı"yı da yakalardı.
const KATEGORI = [
  { id: 'arama', alan: ['google', 'bing', 'duckduckgo', 'yandex', 'yahoo', 'ecosia', 'startpage', 'search.brave.com'], soz: [] },
  { id: 'haber', alan: ['hurriyet', 'sozcu', 'milliyet', 'ntv', 'cnnturk', 'haberturk', 'sabah', 'bbc', 'cnn', 'reuters', 'aa', 'trthaber', 't24', 'ensonhaber', 'nytimes', 'theguardian', 'dw', 'euronews', 'apnews', 'halktv', 'birgun', 'cumhuriyet', 'karar', 'yenisafak', 'gazeteduvar', 'bianet', 'sondakika', 'haberler', 'news.google.com', 'aljazeera', 'independent', 'washingtonpost'],
    soz: ['haber*', 'gündem*', 'sondakika', 'son dakika', 'news', 'breaking', 'manşet*', 'gazete*', 'açıklama', 'seçim*', 'meclis*', 'bakan', 'bakanı', 'cumhurbaşkan*', 'election', 'minister'] },
  { id: 'teknoloji', alan: ['github', 'gitlab', 'stackoverflow', 'stackexchange', 'webtekno', 'shiftdelete', 'donanimhaber', 'technopat', 'theverge', 'techcrunch', 'arstechnica', 'wired', 'engadget', 'npmjs', 'pypi', 'developer.mozilla.org', 'medium', 'dev.to', 'chip'],
    soz: ['yazılım*', 'yapay zeka', 'yapay zekâ', 'telefon*', 'bilgisayar*', 'programla*', 'kodlama', 'software', 'android', 'iphone', 'linux', 'windows', 'javascript', 'python', 'işlemci*', 'ekran kartı', 'uygulama', 'güncelleme', 'siber', 'tech', 'technology', 'developer', 'api', 'chatgpt', 'openai', 'nvidia'] },
  { id: 'bilim', alan: ['nature.com', 'sciencedirect', 'arxiv', 'nasa.gov', 'evrimagaci', 'sciencedaily', 'scientificamerican', 'pubmed', 'researchgate', 'tubitak.gov.tr', 'dergipark'],
    soz: ['bilim*', 'araştırma*', 'uzay*', 'fizik*', 'kimya*', 'biyoloji*', 'gezegen*', 'evren*', 'deney*', 'science', 'research', 'physics', 'astronomy', 'makale', 'genetik*', 'kuantum*'] },
  { id: 'finans', alan: ['bloomberght', 'bloomberg', 'investing', 'tradingview', 'binance', 'btcturk', 'paribu', 'borsaistanbul', 'bigpara', 'paraanaliz', 'foreks', 'coinmarketcap', 'coingecko', 'tcmb.gov.tr', 'kap.org.tr', 'ft', 'wsj', 'marketwatch', 'finance.yahoo.com', 'doviz', 'altin'],
    soz: ['borsa*', 'dolar*', 'euro', 'altın*', 'kripto*', 'bitcoin*', 'faiz*', 'enflasyon*', 'hisse*', 'yatırım*', 'ekonomi*', 'piyasa*', 'döviz*', 'kredi*', 'mevduat*', 'temettü*', 'finance', 'stock', 'stocks', 'crypto', 'inflation', 'bist'] },
  { id: 'spor', alan: ['fanatik', 'ntvspor', 'sporx', 'aspor', 'fotomac', 'beinsports', 'transfermarkt', 'espn', 'mackolik', 'sahadan', 'tff', 'uefa', 'fifa', 'nba', 'goal', 'skysports'],
    soz: ['maç', 'maçı', 'maçta', 'maçın', 'futbol*', 'basketbol*', 'voleybol*', 'gol', 'golü', 'lig', 'ligi', 'süper lig', 'transfer*', 'teknik direktör', 'galatasaray*', 'fenerbahçe*', 'beşiktaş*', 'trabzonspor*', 'şampiyon*', 'football', 'soccer', 'match', 'formula'] },
  { id: 'saglik', alan: ['mhrs', 'enabiz', 'saglik.gov.tr', 'webmd', 'mayoclinic', 'medicalpark', 'acibadem', 'memorial', 'healthline', 'who.int'],
    soz: ['sağlık*', 'hastalık*', 'tedavi*', 'doktor*', 'ilaç*', 'diyet*', 'beslenme*', 'belirti*', 'kanser*', 'grip', 'aşı', 'aşısı', 'vitamin*', 'tansiyon*', 'diyabet*', 'health', 'disease', 'symptoms', 'medical', 'egzersiz*'] },
  { id: 'egitim', alan: ['udemy', 'coursera', 'khanacademy', 'eba.gov.tr', 'osym.gov.tr', 'yok.gov.tr', 'edx', 'duolingo', 'meb.gov.tr', 'yokatlas.yok.gov.tr', 'w3schools'],
    soz: ['ders', 'dersi', 'dersleri', 'sınav*', 'kurs*', 'öğrenci*', 'üniversite*', 'eğitim*', 'yks', 'kpss', 'lgs', 'ödev*', 'konu anlatımı', 'course', 'tutorial', 'learn', 'lesson'] },
  { id: 'alisveris', alan: ['trendyol', 'hepsiburada', 'n11', 'amazon', 'ciceksepeti', 'sahibinden', 'aliexpress', 'etsy', 'akakce', 'cimri', 'ebay', 'temu', 'shein', 'migros', 'a101', 'teknosa', 'mediamarkt', 'vatanbilgisayar', 'letgo', 'dolap', 'boyner', 'lcwaikiki', 'defacto'],
    soz: ['indirim*', 'fiyat*', 'sepet*', 'kargo*', 'satın al', 'sipariş*', 'kampanya*', 'kupon*', 'ürün*', 'shop', 'price', 'deal', 'deals', 'sale', 'buy'] },
  { id: 'seyahat', alan: ['booking', 'airbnb', 'enuygun', 'obilet', 'skyscanner', 'tripadvisor', 'turkishairlines', 'thy', 'flypgs', 'pegasus', 'ajet', 'trivago', 'expedia', 'etstur', 'jollytur', 'tatilbudur', 'maps.google.com', 'tcdd'],
    soz: ['otel*', 'uçak*', 'uçuş*', 'tatil*', 'bilet*', 'rezervasyon*', 'gezi*', 'gezilecek', 'vize*', 'pasaport*', 'travel', 'hotel', 'hotels', 'flight', 'flights', 'trip'] },
  { id: 'yemek', alan: ['nefisyemektarifleri', 'yemek', 'yemeksepeti', 'getir', 'trendyolyemek', 'allrecipes', 'lezzet', 'refika'],
    soz: ['tarif*', 'yemek*', 'mutfak*', 'restoran*', 'tatlı', 'tatlısı', 'çorba*', 'kek', 'pasta', 'recipe', 'recipes', 'cooking', 'restaurant'] },
  { id: 'eglence', alan: ['netflix', 'spotify', 'twitch', 'imdb', 'beyazperde', 'steampowered', 'disneyplus', 'exxen', 'blutv', 'primevideo', 'mubi', 'letterboxd', 'epicgames', 'tabii', 'gain', 'puhutv', 'dizibox', 'sinemalar'],
    soz: ['film*', 'dizi', 'dizisi', 'diziler*', 'müzik*', 'oyun*', 'izle', 'şarkı*', 'fragman*', 'sezon*', 'bölüm', 'albüm*', 'konser*', 'movie', 'series', 'music', 'game', 'trailer', 'season', 'episode'] },
  { id: 'sosyal', alan: ['twitter', 'x', 'instagram', 'facebook', 'reddit', 'linkedin', 'eksisozluk', 'tiktok', 'threads', 'pinterest', 'discord', 'telegram', 'web.whatsapp.com', 'bsky', 'mastodon', 'quora'], soz: [] },
  { id: 'kultur', alan: ['goodreads', 'kitapyurdu', 'dr', 'idefix', 'wikipedia', 'britannica', 'pera', 'iksv', 'biletix'],
    soz: ['kitap*', 'tarih*', 'sanat*', 'edebiyat*', 'müze*', 'felsefe*', 'roman*', 'şiir*', 'sergi*', 'tiyatro*', 'osmanlı*', 'book', 'books', 'history', 'art', 'museum', 'novel'] },
  { id: 'is', alan: ['kariyer', 'secretcv', 'yenibiris', 'indeed', 'glassdoor', 'isbul', 'eleman'],
    soz: ['iş ilanı', 'ilanları', 'kariyer*', 'maaş*', 'mülakat*', 'özgeçmiş*', 'cv', 'job', 'jobs', 'career', 'salary', 'hiring', 'interview'] },
  { id: 'kamu', alan: ['turkiye.gov.tr', 'gib.gov.tr', 'sgk.gov.tr', 'ivd.gib.gov.tr', 'e-devlet', 'gov.tr', 'nvi.gov.tr', 'resmigazete.gov.tr', 'uyap.gov.tr', 'gov'],
    soz: ['e-devlet', 'vergi*', 'resmi gazete', 'başvuru*', 'randevu*', 'tapu*', 'sgk', 'nüfus', 'ehliyet*'] },
  { id: 'araclar', alan: ['mail.google.com', 'gmail', 'outlook', 'office', 'docs.google.com', 'drive.google.com', 'calendar.google.com', 'notion', 'trello', 'dropbox', 'onedrive', 'icloud', 'translate.google.com', 'canva', 'figma', 'zoom', 'meet.google.com', 'teams', 'chatgpt', 'claude', 'gemini.google.com', 'yandex.mail'],
    soz: ['e-posta', 'gelen kutusu', 'inbox', 'çeviri', 'translate'] },
];
const KATEGORI_ID = KATEGORI.map((k) => k.id).concat('diger');
const KAT_ESIK = 2;          // tek başlık sözcüğü (1) yetmez; site adı (3) ya da iki sözcük gerekir

function hostAdi(u) {
  try { return new URL(u).hostname.replace(/^www\d?\./, '').toLowerCase(); } catch { return ''; }
}

// Alan eşleşmesi: noktalı girdi ('docs.google.com') TAM SON EK olarak, noktasız
// girdi adresin etiketlerinden biri olarak. 'ntv' → ntv.com.tr evet, ntvspor.net hayır.
// Uzun son ek kısa olanı yener: yok.gov.tr (eğitim, 3 parça → 7) > gov.tr (kamu, 2 parça → 6).
function alanPuani(host, girdiler) {
  if (!host) return 0;
  const etiket = host.split('.');
  let p = 0;
  for (const g of girdiler) {
    if (g.includes('.')) { if (host === g || host.endsWith('.' + g)) p = Math.max(p, 4 + g.split('.').length); }
    else if (etiket.includes(g)) p = Math.max(p, 3);
  }
  return p;
}

function sozPuani(metin, sozler) {
  if (!sozler.length) return 0;
  const k = ' ' + kucuk(metin).replace(/[’']/g, ' ').replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/\s+/g, ' ') + ' ';
  const parca = k.trim().split(' ');
  let p = 0;
  for (const s of sozler) {
    if (s.includes(' ')) { if (k.includes(' ' + s + ' ')) p += 1; continue; }
    const onek = s.endsWith('*');
    const kok = onek ? s.slice(0, -1) : s;
    if (parca.some((w) => (onek ? w.startsWith(kok) : w === kok))) p += 1;
  }
  return p;
}

/**
 * Bir ziyaretin kategorisi. Dönen: { id, puan, neden: 'alan'|'baslik'|null }.
 * Eşitlikte 'diger' döner — emin olmadığında tahmin etmez.
 */
function kategoriBul(baslik, url) {
  const host = hostAdi(url);
  let enIyi = null, ikinci = 0;
  for (const kat of KATEGORI) {
    const a = alanPuani(host, kat.alan);
    const s = sozPuani(baslik || '', kat.soz);
    const puan = a + s;
    if (!enIyi || puan > enIyi.puan) { ikinci = enIyi ? enIyi.puan : 0; enIyi = { id: kat.id, puan, neden: a ? 'alan' : 'baslik' }; }
    else if (puan > ikinci) ikinci = puan;
  }
  if (!enIyi || enIyi.puan < KAT_ESIK || enIyi.puan === ikinci) return { id: 'diger', puan: enIyi ? enIyi.puan : 0, neden: null };
  return enIyi;
}

// Günün dört dilimi: 0 gece (00–06) · 1 sabah (06–12) · 2 öğleden sonra (12–18) · 3 akşam (18–24)
const dilimOf = (ts) => Math.floor(new Date(ts).getHours() / 6);
const GUN_MS = 24 * 60 * 60 * 1000;

function webZiyaretleri(ziyaretler, simdi, gun) {
  const bas = simdi - gun * GUN_MS;
  return (Array.isArray(ziyaretler) ? ziyaretler : []).filter((z) => z && typeof z.url === 'string'
    && /^https?:\/\//i.test(z.url) && Number(z.timestamp) >= bas && Number(z.timestamp) <= simdi + 60000
    && hostAdi(z.url) && !/^(localhost|127\.|\[?::1|10\.|192\.168\.)/.test(hostAdi(z.url)));
}

// Site başına özet: adet, son ziyaret, kökeni (öneride açılacak adres), dilim sayıları, kategori.
function siteOzeti(liste) {
  const m = new Map();
  for (const z of liste) {
    const host = hostAdi(z.url);
    const ts = Number(z.timestamp);
    let s = m.get(host);
    if (!s) { s = { alan: host, adet: 0, son: 0, koken: '', dilim: [0, 0, 0, 0], kat: new Map() }; m.set(host, s); }
    s.adet++;
    if (ts > s.son) { s.son = ts; try { s.koken = new URL(z.url).origin + '/'; } catch { /* yukarıda süzüldü */ } }
    s.dilim[dilimOf(ts)]++;
    const k = kategoriBul(z.title, z.url).id;
    s.kat.set(k, (s.kat.get(k) || 0) + 1);
  }
  for (const s of m.values()) s.kategori = [...s.kat.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return m;
}

/**
 * Gezinme profili (son `gun` gün). Saklanmaz; çağıran gösterip bırakır.
 * Dönen: { gun, toplam, aktifGun, siniflanan, kategoriler[{id,adet,oran,siteler}],
 *          siteler[{alan,adet,son,kategori}], dilimler[4], baskinDilim }
 */
function profilCikar(ziyaretler, secenek = {}) {
  const simdi = secenek.simdi || Date.now();
  const gun = secenek.gun || 30;
  const liste = webZiyaretleri(ziyaretler, simdi, gun);
  const kat = new Map();
  const dilimler = [0, 0, 0, 0];
  const gunler = new Set();
  let siniflanan = 0;
  for (const z of liste) {
    const k = kategoriBul(z.title, z.url).id;
    if (k !== 'diger') siniflanan++;
    const host = hostAdi(z.url);
    const e = kat.get(k) || { id: k, adet: 0, site: new Map() };
    e.adet++; e.site.set(host, (e.site.get(host) || 0) + 1);
    kat.set(k, e);
    dilimler[dilimOf(Number(z.timestamp))]++;
    gunler.add(new Date(Number(z.timestamp)).toDateString());
  }
  const toplam = liste.length;
  const kategoriler = [...kat.values()].sort((a, b) => b.adet - a.adet).map((e) => ({
    id: e.id, adet: e.adet, oran: toplam ? Math.round((e.adet / toplam) * 1000) / 1000 : 0,
    siteler: [...e.site.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a),
  }));
  const siteler = [...siteOzeti(liste).values()].sort((a, b) => b.adet - a.adet || b.son - a.son).slice(0, 8)
    .map((s) => ({ alan: s.alan, adet: s.adet, son: s.son, kategori: s.kategori }));
  // Baskın dilim yalnız yeterli veri ve belirgin üstünlük varsa söylenir (en az 10 ziyaret, payı ≥ %40).
  const enCok = Math.max(...dilimler);
  const baskinDilim = toplam >= 10 && enCok / toplam >= 0.4 ? dilimler.indexOf(enCok) : -1;
  return { gun, toplam, aktifGun: gunler.size, siniflanan, kategoriler, siteler, dilimler, baskinDilim };
}

/**
 * Öneriler — kural tabanlı, her birinin NEDENİ sayıyla birlikte döner:
 *   ozledin : son `gun` günde ≥4 kez açılmış ama ≥7 gündür açılmamış site
 *   bu_saat : şu anki gün diliminde sık (≥3, ziyaretlerinin ≥ yarısı) açılan, son 12 saatte açılmamış site
 *   ilgi    : özetlettiği sayfalardan biriken ilgi etiketi (≥2) — aramayı açar
 * Arama motorları önerilmez ("google'ı özlediniz" anlamsız). En çok 5 öneri.
 */
function oneriUret(ziyaretler, ilgi, secenek = {}) {
  const simdi = secenek.simdi || Date.now();
  const gun = secenek.gun || 30;
  const siteler = [...siteOzeti(webZiyaretleri(ziyaretler, simdi, gun)).values()].filter((s) => s.kategori !== 'arama' && s.koken);
  const out = [];
  const kullanilan = new Set();
  const ozledin = siteler.filter((s) => s.adet >= 4 && simdi - s.son >= 7 * GUN_MS)
    .sort((a, b) => b.adet - a.adet).slice(0, 2);
  for (const s of ozledin) {
    out.push({ tur: 'ac', url: s.koken, alan: s.alan, neden: 'ozledin', adet: s.adet, gun: Math.floor((simdi - s.son) / GUN_MS), kategori: s.kategori });
    kullanilan.add(s.alan);
  }
  const d = dilimOf(simdi);
  const buSaat = siteler.filter((s) => !kullanilan.has(s.alan) && s.dilim[d] >= 3 && s.dilim[d] / s.adet >= 0.5 && simdi - s.son >= 12 * 60 * 60 * 1000)
    .sort((a, b) => b.dilim[d] - a.dilim[d])[0];
  if (buSaat) out.push({ tur: 'ac', url: buSaat.koken, alan: buSaat.alan, neden: 'bu_saat', adet: buSaat.dilim[d], kategori: buSaat.kategori });
  const etiket = Object.entries(ilgi && typeof ilgi === 'object' ? ilgi : {})
    .filter(([w, n]) => typeof w === 'string' && w.length >= 3 && w.length <= 40 && Number(n) >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 2);
  for (const [w, n] of etiket) out.push({ tur: 'ara', sorgu: w, neden: 'ilgi', adet: Number(n), kategori: kategoriBul(w, '').id });
  return out.slice(0, 5);
}

module.exports = {
  kucuk, niyet, duzMetin, cumleler, sozcukler, ozetle, sayfadaAra, sorguOner,
  anahtarSozcukler, ilgiEkle, gecmisSonuclari, satirBlogu, satirMi, HUCRE_AYRAC,
  kategoriBul, profilCikar, oneriUret, KATEGORI_ID,
};
