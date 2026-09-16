/**
 * İlgezdi — Zararlı site koruması: yerel tehdit listeleri (SAF modül)
 *
 * Google Safe Browsing KULLANILMAZ. Ziyaret edilen adresler hiçbir sunucuya
 * gönderilmez: açık tehdit listeleri (SOURCES) düzenli aralıklarla cihaza indirilir
 * ve karşılaştırma tamamen yerelde yapılır. Liste sunucusu yalnızca "listeyi
 * indiren bir istemci" görür, hangi siteleri gezdiğinizi değil.
 *
 * Bu modülde ağ, dosya ya da Electron erişimi yoktur (threat-protection.js yapar).
 *
 * Bellek: listeler yüz binlerce girdi içerebilir. Girdiler dize olarak tutulmaz;
 * her anahtar 53 bitlik bir özete (cyrb53) çevrilip sıralı bir Float64Array'de
 * saklanır (girdi başına 8 bayt) ve ikili aramayla bulunur. Bir milyon girdide
 * rastgele bir adresin yanlışlıkla eşleşme olasılığı yaklaşık 1e-10'dur.
 *
 * Eşleşme kuralları:
 *   • Alan adı girdisi (evil.com) o alan adını ve tüm alt alan adlarını kapsar.
 *   • Adres girdisi (evil.com/giris) yalnızca o yolu kapsar; girdide sorgu dizesi
 *     yoksa aynı yolun her sorgu dizesiyle eşleşir.
 *   • Paylaşımlı barındırma ve dosya paylaşım alan adları (SHARED_HOSTS) alan adı
 *     girdisi olarak KABUL EDİLMEZ: listede bir kullanıcının zararlı dosyası yüzünden
 *     "drive.google.com" geçse bile tüm Drive engellenmez. Aynı sitelerdeki belirli
 *     zararlı ADRESLER yine engellenir.
 */

'use strict';

const { T } = require('./i18n');

// ─── Özet ─────────────────────────────────────────────────────────────────────
// cyrb53 (bryc, kamu malı): hızlı, iyi dağılımlı 53 bitlik dize özeti. Değişirse
// diskteki derlenmiş dizinler geçersiz olur → HASH_VERSION artırılmalı.
const HASH_VERSION = 1;
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// ─── Adres normalleştirme ─────────────────────────────────────────────────────
// Paylaşımlı barındırma, dosya paylaşımı ve kısaltma servisleri: alan adı girdisi
// olarak yok sayılır (yukarıdaki açıklama). Alt alan adları (kullanici.github.io)
// ayrı sitelerdir, listelenmişlerse engellenirler.
const SHARED_HOSTS = Object.freeze(new Set([
  'google.com', 'drive.google.com', 'docs.google.com', 'sites.google.com', 'forms.gle', 'goo.gl',
  'googleapis.com', 'storage.googleapis.com', 'firebasestorage.googleapis.com', 'googleusercontent.com',
  'github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com', 'gist.github.com', 'github.io',
  'gitlab.com', 'bitbucket.org', 'sourceforge.net',
  'dropbox.com', 'dl.dropboxusercontent.com', 'onedrive.live.com', '1drv.ms', 'live.com', 'sharepoint.com',
  'microsoft.com', 'office.com', 'windows.net', 'blob.core.windows.net', 'azureedge.net', 'azurewebsites.net',
  'amazonaws.com', 's3.amazonaws.com', 'cloudfront.net', 'mediafire.com', 'mega.nz', 'wetransfer.com', 'we.tl',
  'discord.com', 'discordapp.com', 'cdn.discordapp.com', 'discord.gg', 't.me', 'telegram.org', 'telegra.ph',
  'pastebin.com', 'archive.org', 'bit.ly', 't.co', 'tinyurl.com', 'is.gd', 'cutt.ly', 'rebrand.ly',
  'blogspot.com', 'wordpress.com', 'weebly.com', 'wixsite.com', 'wix.com', 'squarespace.com', 'webflow.io',
  'godaddysites.com', '000webhostapp.com', 'herokuapp.com', 'vercel.app', 'netlify.app', 'pages.dev',
  'workers.dev', 'web.app', 'firebaseapp.com', 'glitch.me', 'repl.co', 'replit.app', 'ngrok.io',
  'ngrok-free.app', 'duckdns.org', 'no-ip.com', 'ddns.net', 'hopto.org', 'cloudflare.com', 'r2.dev',
  'yandex.ru', 'disk.yandex.ru', 'notion.site', 'canva.site', 'my.canva.site', 'jimdosite.com',
]));

// Adın kendisi bir kayıt uzantısı olan iki parçalı sonekler: aday alan adı
// üretilirken bunların üstüne çıkılmaz (com.tr bir site değildir).
const MULTI_PART_SUFFIXES = Object.freeze(new Set([
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr', 'k12.tr', 'bel.tr', 'gen.tr', 'av.tr', 'biz.tr', 'info.tr',
  'web.tr', 'tv.tr', 'tsk.tr', 'pol.tr', 'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'co.jp', 'co.kr', 'com.br', 'com.cn', 'co.in', 'co.nz', 'co.za', 'com.mx', 'com.ar', 'com.ru', 'com.ua',
]));

const MAX_HOST_CANDIDATES = 6;

function isIpv4(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
function isIp(host) {
  return isIpv4(host) || host.includes(':');
}

// Listelerde yer tutucu olarak geçen yerel/ayrılmış adresler asla girdi değildir
// ("127.0.0.1 localhost", "0.0.0.0 0.0.0.0" gibi hosts dosyası satırları).
function isLocalOrReserved(host) {
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'local' || host === 'broadcasthost'
      || host.startsWith('ip6-') || host.endsWith('.local') || !host.includes('.') && !host.includes(':')) return true;
  if (isIpv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || a >= 224;
  }
  if (host.includes(':')) return host === '::' || host === '::1' || /^f[cd]/i.test(host) || /^fe80:/i.test(host);
  return false;
}

// Küçük harf, sondaki nokta ve baştaki "www." atılır; IPv6 köşeli parantezsiz.
function normalizeHost(hostname) {
  let h = String(hostname || '').toLowerCase().trim();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  while (h.endsWith('.')) h = h.slice(0, -1);
  if (h.startsWith('www.')) h = h.slice(4);
  return h;
}

function hostCandidates(host) {
  if (!host) return [];
  if (isIp(host)) return [host];
  const parts = host.split('.');
  const out = [];
  for (let i = 0; i <= parts.length - 2 && out.length < MAX_HOST_CANDIDATES; i++) {
    const cand = parts.slice(i).join('.');
    if (i > 0 && MULTI_PART_SUFFIXES.has(cand)) break;
    out.push(cand);
  }
  return out;
}

// Adres anahtarı: şema yok sayılır (http ve https aynı), varsayılan dışı port
// korunur, parça (#…) atılır, yolun sonundaki tek "/" atılır. Kök yol ve sorgu
// dizesi yoksa null → bu bir alan adı girdisidir.
function urlKeys(u) {
  const host = normalizeHost(u.hostname);
  const hostPort = u.port ? host + ':' + u.port : host;
  let p = u.pathname || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p === '/' && !u.search) return null;
  const base = hostPort + p;
  return u.search ? { exact: base + u.search, path: base } : { exact: base, path: base };
}

// ─── Liste satırı ayrıştırma ──────────────────────────────────────────────────
// Desteklenen biçimler (satır başına bir girdi): tam adres, şemasız adres
// (evil.com/giris), çıplak alan adı ya da IP, hosts dosyası ("0.0.0.0 evil.com"),
// Adblock alan adı kuralı ("||evil.com^"), "*.evil.com". Yorum satırları (#, !, ;)
// ve bunlara uymayan satırlar (CSV başlığı vb.) atlanır.
function parseListLine(line) {
  let s = String(line == null ? '' : line).trim();
  if (!s || /^(#|!|;|\/\/)/.test(s)) return null;
  // "[Adblock Plus 2.0]" gibi bölüm başlıkları atlanır; "[2001:db8::1]" IPv6 adresidir.
  if (s.startsWith('[') && !/^\[[0-9a-f:.]+\]/i.test(s)) return null;
  const hashAt = s.search(/\s#/);
  if (hashAt > 0) s = s.slice(0, hashAt).trim();
  const hostsLine = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1?|::)\s+(\S+)$/.exec(s);
  if (hostsLine) s = hostsLine[1];
  const adblock = /^\|\|([^/^$|]+)\^?$/.exec(s);
  if (adblock) s = adblock[1];
  if (/\s/.test(s) || s.length > 2048) return null;
  if (s.startsWith('*.')) s = s.slice(2);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = normalizeHost(u.hostname);
  if (isLocalOrReserved(host)) return null;
  const keys = urlKeys(u);
  if (!keys) {
    if (SHARED_HOSTS.has(host)) return null;
    return { type: 'host', key: 'h|' + host };
  }
  return { type: 'url', key: 'u|' + keys.exact };
}

// ─── Dizin ────────────────────────────────────────────────────────────────────
function sortUnique(arr) {
  arr.sort();
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    if (w === 0 || arr[i] !== arr[w - 1]) arr[w++] = arr[i];
  }
  return arr.slice(0, w);
}

function buildIndex(keys) {
  const arr = new Float64Array(keys.length);
  for (let i = 0; i < keys.length; i++) arr[i] = cyrb53(keys[i]);
  return sortUnique(arr);
}

function indexHas(index, hash) {
  let lo = 0;
  let hi = index.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = index[mid];
    if (v === hash) return true;
    if (v < hash) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

const MAX_ENTRIES_PER_SOURCE = 2000000;   // 16 MB üst sınır

/**
 * Satır satır derleyici. Büyük listeler ana süreci kilitlemesin diye çağıran taraf
 * satırları parça parça verip arada olay döngüsüne dönebilir (threat-protection.js).
 * finish() → { index, hosts, urls, skipped, truncated }
 */
function createListCompiler(maxEntries = MAX_ENTRIES_PER_SOURCE) {
  const hashes = [];
  let hosts = 0;
  let urls = 0;
  let skipped = 0;
  let truncated = false;
  return {
    add(line) {
      if (truncated) return;
      const e = parseListLine(line);
      if (!e) { if (String(line == null ? '' : line).trim()) skipped++; return; }
      if (hashes.length >= maxEntries) { truncated = true; return; }
      hashes.push(cyrb53(e.key));
      if (e.type === 'host') hosts++; else urls++;
    },
    finish() {
      return { index: sortUnique(Float64Array.from(hashes)), hosts, urls, skipped, truncated };
    },
  };
}

/** Ham liste metnini tek seferde derler (küçük listeler ve testler için). */
function compileList(text, maxEntries = MAX_ENTRIES_PER_SOURCE) {
  const c = createListCompiler(maxEntries);
  for (const line of String(text || '').split(/\r?\n/)) c.add(line);
  return c.finish();
}

// Diskte saklama: Float64Array baytları. Okurken hizalı yeni bir ArrayBuffer'a
// kopyalanır (fs'in havuzlanmış Buffer'ı 8'in katı olmayan ofsette olabilir).
function indexToBytes(index) {
  return new Uint8Array(index.buffer, index.byteOffset, index.byteLength);
}
function indexFromBytes(bytes, expectedCount) {
  if (!bytes || bytes.byteLength % 8 !== 0) return null;
  const count = bytes.byteLength / 8;
  if (expectedCount != null && count !== expectedCount) return null;
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const index = new Float64Array(ab);
  for (let i = 1; i < index.length; i++) if (!(index[i - 1] < index[i])) return null;   // sıralı ve tekrarsız olmalı
  return index;
}

// ─── Eşleştirici ──────────────────────────────────────────────────────────────
/** İstek adresi için aranacak anahtarlar (en özelden en genele). */
function lookupKeys(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = normalizeHost(u.hostname);
  if (isLocalOrReserved(host)) return null;
  const out = [];
  const k = urlKeys(u);
  if (k) {
    out.push('u|' + k.exact);
    if (k.path !== k.exact) out.push('u|' + k.path);
  }
  for (const h of hostCandidates(host)) out.push('h|' + h);
  return out;
}

function createMatcher() {
  const sources = new Map();   // id → Float64Array
  return {
    set(id, index) { if (index && index.length) sources.set(id, index); else sources.delete(id); },
    remove(id) { sources.delete(id); },
    clear() { sources.clear(); },
    has(id) { return sources.has(id); },
    entryCount() { let n = 0; for (const ix of sources.values()) n += ix.length; return n; },
    /** Eşleşme yoksa null; varsa { sourceId, kind: 'url' | 'host' } */
    match(url) {
      if (!sources.size) return null;
      const keys = lookupKeys(url);
      if (!keys || !keys.length) return null;
      const hashes = keys.map((key) => cyrb53(key));
      for (let i = 0; i < keys.length; i++) {
        for (const [id, index] of sources) {
          if (indexHas(index, hashes[i])) return { sourceId: id, kind: keys[i][0] === 'u' ? 'url' : 'host' };
        }
      }
      return null;
    },
  };
}

// ─── Güncelleme zamanlaması ───────────────────────────────────────────────────
const DEFAULT_INTERVAL_HOURS = 12;
const STALE_AFTER_MS = 7 * 24 * 3600 * 1000;

/**
 * Kaynağın bir sonraki indirme zamanı (ms). Hiç indirilmediyse 0 (hemen).
 * Başarısız denemelerde 15 dk'dan başlayıp katlanan, kaynağın aralığını aşmayan
 * bekleme uygulanır — liste sunucusu hata verirken sürekli istek atılmaz.
 */
function nextUpdateAt(source, meta) {
  const interval = Math.max(1, Number(source && source.intervalHours) || DEFAULT_INTERVAL_HOURS) * 3600 * 1000;
  if (!meta || (!meta.fetchedAt && !meta.lastAttemptAt)) return 0;
  const failures = Math.min(Number(meta.failures) || 0, 10);
  if (failures > 0) {
    const backoff = Math.min(interval, 15 * 60 * 1000 * 2 ** (failures - 1));
    return (Number(meta.lastAttemptAt) || 0) + backoff;
  }
  return (Number(meta.fetchedAt) || 0) + interval;
}

function isStale(meta, now) {
  return !meta || !meta.fetchedAt || now - meta.fetchedAt > STALE_AFTER_MS;
}

/** Ayarlar paneli için kaynak durumu (adres ya da liste içeriği yok). */
function statusSummary(sources, metas, now) {
  return sources.map((s) => {
    const m = (metas && metas[s.id]) || {};
    return {
      id: s.id,
      name: s.name,
      covers: s.covers,
      homepage: s.homepage,
      license: s.license || '',
      entries: Number(m.count) || 0,
      updatedAt: Number(m.fetchedAt) || 0,
      stale: isStale(m, now),
      lastError: m.failures ? String(m.lastError || 'bilinmeyen hata').slice(0, 120) : '',
    };
  });
}

// ─── Uyarı sayfası ────────────────────────────────────────────────────────────
// Uyarı sayfasındaki "devam et" düğmesi ana sürece bu önekli bir konsol mesajıyla
// ulaşır. Belirteç her engelleme için rastgele üretilir ve yalnızca enjekte edilen
// betikte bulunur; engellenen site hiç yüklenmediği için onu okuyamaz.
const PROCEED_PREFIX = 'ilgezdi-threat-proceed:';

function threatPageModel({ url, sourceName, kind, token }) {
  let host = '';
  try { host = new URL(String(url)).hostname; } catch {}
  const safeUrl = /^https?:\/\//i.test(String(url || '')) ? String(url) : '';
  return {
    kind: 'threat',
    code: 0,
    codeName: 'ILGEZDI_ZARARLI_SITE',
    host,
    url: safeUrl,
    canRetry: false,
    title: T('threatPage.title'),
    heading: T('threatPage.heading'),
    message: T('threatPage.message', { host: host || T('threatPage.thisSite') }),
    reason: T(kind === 'url' ? 'threatPage.reasonUrl' : 'threatPage.reasonDomain', { source: String(sourceName || T('threatPage.sourceFallback')) }),
    tips: [
      T('threatPage.tipLocal'),
      T('threatPage.tipNoCredentials'),
      T('threatPage.tipProceed'),
    ],
    proceedMessage: token ? PROCEED_PREFIX + token : '',
  };
}

// ─── Kaynaklar ────────────────────────────────────────────────────────────────
// Seçim ölçütleri (2026-09 araştırması): anahtar ya da kimlik bilgisi göndermeden
// indirilebilmeli, istemcide kullanım koşullarla yasaklanmamış olmalı, sorgulama
// sıklığı kuralına uyulmalı. Bu nedenle listede OLMAYANLAR:
//   • Google Safe Browsing: adres ya da adres öneki Google'a gider.
//   • OpenPhish: koşullar koruma/ürün amaçlı kullanımı ve dağıtımı yasaklıyor.
//   • PhishTank: yeni kayıt kapalı; anahtarsız 3 günde 75 indirme sınırı.
//   • abuse.ch URLhaus / ThreatFox: kişisel Auth-Key ve kâr amacı gütmeyen kullanım
//     şartı, türev kullanım için yazılı izin. İzin alınırsa eklenebilir.
//   • Spamhaus DBL: her sorguda alan adı Spamhaus'a gider.
// Karar (2026-09-15): son kullanıcıyı anahtar/izin/kayıt işleriyle uğraştıracak
// kaynaklar eklenmeyecek.
//
// USOM (T.C. Siber Güvenlik Başkanlığı): .txt listesi 1 Haziran 2026'da kapandı, yerini
// sayfalı bir JSON API aldı (~490 bin kayıt, 50 sayfa). Liste İlgezdi sunucusunda
// günlük derlenir (scripts/build-threat-lists.js) ve tek dosya olarak dağıtılır;
// uygulama USOM'a doğrudan istek atmaz.
const SOURCES = Object.freeze([
  Object.freeze({
    id: 'hagezi-tif-medium',
    name: 'HaGeZi Tehdit İstihbaratı (orta)',
    covers: 'Kimlik avı, zararlı yazılım, dolandırıcılık, kripto madenciliği',
    homepage: 'https://github.com/hagezi/dns-blocklists',
    license: 'GPL-3.0',
    // Birincil kaynak ve yansısı; sırayla denenir.
    urls: Object.freeze([
      'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/tif.medium-onlydomains.txt',
      'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@main/wildcard/tif.medium-onlydomains.txt',
    ]),
    intervalHours: 12,            // dosya başlığı "Expires: 8 hours"; depo günde bir güncelleniyor
    maxBytes: 64 * 1024 * 1024,   // 2026-09: 13,4 MB, yaklaşık 778 bin alan adı
    minEntries: 50000,
  }),
  Object.freeze({
    id: 'ilgezdi-usom',
    name: 'USOM Zararlı Bağlantılar',
    covers: 'Türkiye\'yi hedefleyen oltalama (banka, e-Devlet, kargo taklidi) ve zararlı yazılım adresleri',
    homepage: 'https://www.usom.gov.tr',
    license: 'Kamu listesi (T.C. Siber Güvenlik Başkanlığı)',
    // İlgezdi sunucusu; yansı aynı dağıtımın Vercel adresi.
    urls: Object.freeze([
      'https://www.ilgezdi.com.tr/lists/usom.txt.gz',
      'https://ilgezdi.vercel.app/lists/usom.txt.gz',
    ]),
    intervalHours: 12,            // sunucu listeyi günde bir derler; değişmediyse 304
    maxBytes: 32 * 1024 * 1024,   // sıkıştırılmış; 2026-09: 3,1 MB, yaklaşık 492 bin kayıt
    minEntries: 100000,
  }),
]);

module.exports = {
  HASH_VERSION,
  SOURCES,
  SHARED_HOSTS,
  PROCEED_PREFIX,
  MAX_ENTRIES_PER_SOURCE,
  STALE_AFTER_MS,
  cyrb53,
  normalizeHost,
  hostCandidates,
  isLocalOrReserved,
  parseListLine,
  buildIndex,
  createListCompiler,
  indexHas,
  compileList,
  indexToBytes,
  indexFromBytes,
  lookupKeys,
  createMatcher,
  nextUpdateAt,
  isStale,
  statusSummary,
  threatPageModel,
};
