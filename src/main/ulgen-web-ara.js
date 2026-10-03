'use strict';
/**
 * İlgezdi — Ülgen web araması (araştırma zincirinin "ara" kancası): saf mantık.
 *
 * ⛔ NEDEN BÖYLE (Burak, 24.09.2026): İlgezdi HALKA AÇIK bir uygulama. Araştırma,
 *    uygulamanın kurulu olduğu bilgisayarın KENDİ internet bağlantısından, dış
 *    kaynaklarda yapılır — diğer tarayıcı yapay zekâlarında olduğu gibi. Önceki
 *    sürüm aramayı `http://127.0.0.1:8888`'deki SearXNG'e gönderiyordu:
 *      · Kullanıcının bilgisayarında orada bir şey yok → her soru "bulamadım".
 *      · Olsaydı daha kötüsü: o portta ne dinliyorsa (kullanıcının kendi bir
 *        servisi ya da oraya konmuş zararlı bir süreç) cevaba İÇERİK ENJEKTE
 *        edebilirdi. İstek görev sayfasının yerel adres yasağını da atlayan
 *        çıplak bir `fetch` idi.
 *    Arama ne bizim sunucumuza ne geliştirici makinesine gider.
 *
 * NASIL: arama sonuç sayfası, sayfaları okumak için zaten kullanılan GÖREV
 * SAYFASI yolundan açılır (main.js `ulgenGorevSayfasi`): kalıcı olmayan temiz
 * oturum (çerez yok → arama motoru soruyu kullanıcının gezinmesine bağlayamaz),
 * reklam/izleyici engelleyici, parmak izi kalkanı, izin/indirme/açılır pencere
 * yok, her yönlendirmede aynı adres denetimi. Sayfadan yalnız sonuç bağlantıları
 * sayılır; ayıklama burada.
 *
 * KAYNAKLAR, SIRAYLA:
 *   1. DuckDuckGo JS'siz sonuç sayfası (html.duckduckgo.com). İlgezdi'nin
 *      varsayılan arama motoru zaten DuckDuckGo; JS'siz sayfa betik çalıştırmadan
 *      tam sonucu verir, yani sayfa yüklenince sonuçlar hazırdır.
 *   2. Vikipedi'nin kendi arama sayfası (tr.wikipedia.org) — YEDEK.
 *      ⛔ NEDEN YEDEK VAR (ölçüldü 24.09.2026): birkaç dakikada ~6 sorgudan sonra
 *         DuckDuckGo aynı IP'ye HTTP 202 + "Unfortunately, bots use DuckDuckGo
 *         too" doğrulama sayfası döndürdü, tarayıcı kimliği ne olursa olsun.
 *         Tek motora yaslanmak, aynı ağın arkasındaki kullanıcıları (şirket NAT'ı)
 *         ya da peş peşe soranı yine "her soruda bulamadım"a düşürür — SearXNG'in
 *         yaptığının aynısı. Vikipedi arama sayfasında bot doğrulaması yok ve
 *         zincirin sorduğu türden (kim, ne, hangileri) sorulara birebir uyuyor.
 * Diğer tarayıcı yapay zekâları da kullanıcının motor ayarından bağımsız, kendi
 * seçtikleri arama altyapısını kullanıyor (Edge Copilot → Bing, Brave Leo →
 * Brave Search).
 */

const gorevSayfa = require('./gorev-sayfa');

// Önceki arama `language=tr` ile yapılıyordu; araştırma zincirinin soru çözümü
// ve terim çıkarımı Türkçe. Bölge ve dil aynı kalır.
const DDG_KOKU = 'https://html.duckduckgo.com/html/';
const VIKI_KOKU = 'https://tr.wikipedia.org/';
const PARCACIK_SINIRI = 500;
const SORGU_SINIRI = 300;

const temizSorgu = (sorgu) =>
  String(sorgu == null ? '' : sorgu).replace(/\s+/g, ' ').trim().slice(0, SORGU_SINIRI);

const ddgAlanMi = (host) => host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com');

// ── DuckDuckGo ────────────────────────────────────────────────────────────
// Sonuç bağlantısı asıl hedefe çevrilir:
//   //duckduckgo.com/l/?uddg=<asıl adres>&rut=…  → asıl adres
//   https://duckduckgo.com/y.js?ad_domain=…      → null (reklam)
//   duckduckgo.com'un kendi sayfaları             → null (gezinti)
//   başka bir alan adına doğrudan bağlantı        → olduğu gibi
function ddgHedef(href) {
  let u;
  try { u = new URL(String(href || ''), 'https://duckduckgo.com/'); } catch { return null; }
  if (!ddgAlanMi(u.hostname.toLowerCase())) return u.toString();
  if (u.pathname !== '/l/' && u.pathname !== '/l') return null;
  const asil = u.searchParams.get('uddg');
  if (!asil) return null;
  // Yönlendirme kutusu İÇ İÇE olamaz: DuckDuckGo'ya geri dönen hedef ya bir
  // döngü ya da reklam — ikisi de sonuç değildir.
  try { if (ddgAlanMi(new URL(asil).hostname.toLowerCase())) return null; } catch { return null; }
  return asil;
}

// ── Vikipedi ──────────────────────────────────────────────────────────────
// Yalnız tr.wikipedia.org'daki MADDE sayfaları. Arama `ns0=1` ile zaten madde
// ad alanına sınırlı; yine de özel sayfa (Özel:/Special:) ve tartışma elenir.
function vikiHedef(href) {
  let u;
  try { u = new URL(String(href || ''), VIKI_KOKU); } catch { return null; }
  if (u.hostname.toLowerCase() !== 'tr.wikipedia.org') return null;
  if (!u.pathname.startsWith('/wiki/')) return null;
  let ad = '';
  try { ad = decodeURIComponent(u.pathname.slice(6)); } catch { return null; }
  if (!ad || /^(Özel|Special|Tartışma|Talk|Vikipedi|Wikipedia|Dosya|File|Kategori|Category):/i.test(ad)) return null;
  u.hash = '';
  u.search = '';
  return u.toString();
}

/**
 * Sonuç sayfasında YALITILMIŞ DÜNYADA çalışan betikler (main.js GOREV_WORLD_ID).
 * Bilerek aptal: yalnız sonuç bağlantılarını sayar, hiçbir karar vermez.
 * Karar `sonuclariAyikla`'da — orası Node'da sınanabiliyor, bu betikler değil.
 * Dönen değer ana sürece yapılandırılmış kopya olarak geçer (düz nesne).
 * `engel`: arama motoru bot doğrulama sayfası gösterdi (sonuç yok, SEBEBİ belli).
 */
const DDG_BETIGI = `(() => {
  const sonuclar = [];
  for (const a of document.querySelectorAll('a.result__a')) {
    const kutu = a.closest('.result');
    const ozet = kutu ? kutu.querySelector('.result__snippet') : null;
    sonuclar.push({
      href: a.getAttribute('href') || '',
      baslik: (a.textContent || '').trim(),
      parcacik: ozet ? (ozet.textContent || '').trim() : '',
      reklam: !!(kutu && kutu.classList.contains('result--ad')),
    });
    if (sonuclar.length >= 40) break;
  }
  const engel = !!document.querySelector('#challenge-form, .anomaly-modal__modal');
  return { sonuclar, engel };
})()`;

const VIKI_BETIGI = `(() => {
  const sonuclar = [];
  for (const li of document.querySelectorAll('li.mw-search-result')) {
    const a = li.querySelector('.mw-search-result-heading a');
    if (!a) continue;
    const ozet = li.querySelector('.searchresult');
    sonuclar.push({
      href: a.getAttribute('href') || '',
      baslik: (a.getAttribute('title') || a.textContent || '').trim(),
      parcacik: ozet ? (ozet.textContent || '').trim() : '',
      reklam: false,
    });
    if (sonuclar.length >= 40) break;
  }
  return { sonuclar, engel: false };
})()`;

/**
 * Kaynak tablosu. ⛔ Görev sayfasına BETİK DEĞİL, yalnız buradaki bir ANAHTAR
 * geçer (main.js `opts.baglantilar`); betik buradan seçilir. Böylece görev
 * sayfasını çağıran hiçbir yol yalıtılmış dünyada kendi kodunu çalıştıramaz.
 */
const KAYNAKLAR = Object.freeze({
  ddg: Object.freeze({
    adres: (q) => DDG_KOKU + '?q=' + encodeURIComponent(q) + '&kl=tr-tr',
    betik: DDG_BETIGI,
    hedef: ddgHedef,
  }),
  viki: Object.freeze({
    adres: (q) => VIKI_KOKU + 'w/index.php?search=' + encodeURIComponent(q) + '&fulltext=1&ns0=1&limit=10',
    betik: VIKI_BETIGI,
    hedef: vikiHedef,
  }),
});
const KAYNAK_SIRASI = Object.freeze(['ddg', 'viki']);

// ⚠️ `KAYNAKLAR[ad]` DOĞRUDAN KULLANILMAZ: `KAYNAKLAR['__proto__']` boş değil,
//    Object.prototype döner ve sonraki çağrı çöker. Yalnız tablonun kendi anahtarları.
function kaynakBul(ad) {
  return typeof ad === 'string' && Object.prototype.hasOwnProperty.call(KAYNAKLAR, ad) ? KAYNAKLAR[ad] : null;
}

/** Kaynağın arama sayfası adresi. Boş sorgu ya da bilinmeyen kaynak → null. */
function aramaAdresi(sorgu, kaynak = 'ddg') {
  const k = kaynakBul(kaynak);
  const q = temizSorgu(sorgu);
  return k && q ? k.adres(q) : null;
}

/** Kaynağın sayım betiği. Bilinmeyen kaynak → null (görev sayfası hiçbir şey çalıştırmaz). */
function betik(kaynak) {
  const k = kaynakBul(kaynak);
  return k ? k.betik : null;
}

// Aynı sayfanın iki yazımı tek sonuç sayılsın: parça (#…) ve sondaki / atılır.
function tekilAnahtar(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return (u.origin + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch { return String(url); }
}

/**
 * Sayfadan sayılan ham bağlantıları araştırma zincirinin beklediği biçime
 * çevirir: [{ baslik, url, parcacik }].
 *
 * ⛔ HER SONUÇ GÖREV SAYFASI ADRES KURALINDAN GEÇER (gorevSayfa.gecerliGorevAdresi):
 *    yalnız http/https, kimlik gömülü adres yok, yerel/ev ağı adresi yok.
 *    Arama sonucu da bir dış girdidir; zincir bu adresleri birazdan AÇACAK.
 *    Kural tek yerde — sonuç sayfası ile okunan sayfa aynı kapıdan geçer.
 * ⚠️ Reklam hiçbir zaman sonuç sayılmaz: hem `result--ad` kutusu hem
 *    DuckDuckGo'nun kendi reklam yönlendirmesi (y.js) elenir.
 */
function sonuclariAyikla(ham, azami = 12, kaynak = 'ddg') {
  const k = kaynakBul(kaynak);
  if (!k) return [];
  const liste = Array.isArray(ham) ? ham : [];
  const cikti = [];
  const gorulen = new Set();
  for (const s of liste) {
    if (!s || typeof s !== 'object' || s.reklam) continue;
    const hedef = k.hedef(s.href);
    if (!hedef) continue;
    const adres = gorevSayfa.gecerliGorevAdresi(hedef);
    if (!adres.ok) continue;
    const anahtar = tekilAnahtar(adres.url);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    cikti.push({
      baslik: gorevSayfa.basligiKirp(typeof s.baslik === 'string' ? s.baslik : ''),
      url: adres.url,
      parcacik: String(typeof s.parcacik === 'string' ? s.parcacik : '')
        .replace(/\s+/g, ' ').trim().slice(0, PARCACIK_SINIRI),
    });
    if (cikti.length >= azami) break;
  }
  return cikti;
}

module.exports = {
  aramaAdresi, betik, sonuclariAyikla, ddgHedef, vikiHedef,
  KAYNAK_SIRASI, DDG_KOKU, VIKI_KOKU,
};
