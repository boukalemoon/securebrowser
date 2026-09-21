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
  ['ozet',    SINIR("özetle|özetler misin|özet(i|ini)?|kısaca anlat|ne anlatıyor|summari[sz]e|summary|tl;?dr")],
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

function duzMetin(nodes) {
  const bloklar = [];
  const basliklar = [];
  let tampon = '';
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
      if (BASLIK.has(etiket)) { bosalt(bloklar); yuru(cocuk); bosalt(basliklar); continue; }
      if (BLOK.has(etiket)) { bosalt(bloklar); yuru(cocuk); bosalt(bloklar); continue; }
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
    const parca = String(blok).split(BOL);
    let bekleyen = '';
    for (const p of parca) {
      const c = (bekleyen ? bekleyen + ' ' : '') + p.trim();
      if (KISALTMA.test(c)) { bekleyen = c; continue; }
      bekleyen = '';
      if (c) cikti.push({ metin: c, blok: bi });
    }
    if (bekleyen) cikti.push({ metin: bekleyen, blok: bi });
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
  const tum = cumleler(bloklar).filter((c) => c.metin.length >= 40 && c.metin.length <= 450);
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

  const azami = secenek.azami || (tum.length > 40 ? 5 : tum.length > 12 ? 4 : 3);
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

function ilgiEkle(eski, sozcuk, azami = 60) {
  const d = { ...(eski && typeof eski === 'object' ? eski : {}) };
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

module.exports = {
  kucuk, niyet, duzMetin, cumleler, sozcukler, ozetle, sayfadaAra, sorguOner,
  anahtarSozcukler, ilgiEkle, gecmisSonuclari,
};
