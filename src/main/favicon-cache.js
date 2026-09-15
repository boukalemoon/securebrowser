/**
 * İlgezdi — Site simgeleri (favicon): sekme şeridi ve yer imleri
 *
 * Google'ın ya da başka bir şirketin favicon servisi KULLANILMAZ (alan adını üçüncü
 * tarafa bildirir).
 * Simge, sayfanın kendi bildirdiği adresten (Electron 'page-favicon-updated')
 * sekmenin kendi oturumuyla ve çerezsiz indirilir. Yalnızca gerçek resim dosyaları
 * (imzasından doğrulanır), en fazla 64 KB; arayüze data: URL olarak verilir — arayüz
 * hiçbir siteye doğrudan istek atmaz.
 *
 * Önbellek: alan adı → data URL. Önbellek ziyaret edilen siteleri ele verdiği için
 * normal pencerede ziyaret günlüğüyle aynı anahtarla ŞİFRELİ yazılır (bkz. main.js
 * readProtectedJson / writeProtectedJson); gizli pencere simgeleri yalnızca bellekte
 * tutulur ve diske gitmez.
 */

'use strict';

const MAX_BYTES = 64 * 1024;
const MAX_ENTRIES = 1500;
const FETCH_TIMEOUT_MS = 8000;
const SAVE_DELAY_MS = 5000;

function hostKey(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Dosya imzasından resim türü. Sunucunun Content-Type'ına güvenilmez (HTML hata
// sayfası "image/png" diye gelebiliyor).
function sniffImageType(buf) {
  if (!buf || buf.length < 4) return '';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02) && buf[3] === 0x00) return 'image/x-icon';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const head = buf.toString('utf8', 0, Math.min(buf.length, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return '';
}

function toDataUrl(buf) {
  const type = sniffImageType(buf);
  if (!type || buf.length > MAX_BYTES) return '';
  return `data:${type};base64,${buf.toString('base64')}`;
}

// Yalnızca data: resim adresleri kabul edilir (içe aktarma ve önbellekten okuma).
function isImageDataUrl(s) {
  return typeof s === 'string' && s.length <= MAX_BYTES * 1.4 + 64 && /^data:image\/(png|x-icon|gif|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s);
}

// Sayfanın bildirdiği simgeler arasından: http(s) olanlar, .ico/.png önce.
function pickIconUrls(favicons) {
  return (Array.isArray(favicons) ? favicons : [])
    .filter((u) => /^https?:\/\//i.test(String(u)))
    .sort((a, b) => (/\.(png|ico)(\?|$)/i.test(b) ? 1 : 0) - (/\.(png|ico)(\?|$)/i.test(a) ? 1 : 0))
    .slice(0, 3);
}

/**
 * @param {object} o
 * @param {() => object|null} o.read   şifreli önbelleği okur ({ host: dataUrl })
 * @param {(obj: object) => void} o.write şifreli önbelleğe yazar
 */
function createFaviconCache({ read, write } = {}) {
  const persistent = new Map();   // normal pencere: diske yazılır
  const volatile = new Map();     // gizli pencere: yalnızca bellek
  const inFlight = new Map();
  let saveTimer = null;

  try {
    const stored = read ? read() : null;
    if (stored && typeof stored === 'object') {
      for (const [host, dataUrl] of Object.entries(stored)) {
        if (hostKey('https://' + host) === host && isImageDataUrl(dataUrl)) persistent.set(host, dataUrl);
      }
    }
  } catch {}

  function trim(map) {
    while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
  }

  function scheduleSave() {
    if (!write || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { write(Object.fromEntries(persistent)); } catch {}
    }, SAVE_DELAY_MS);
    saveTimer.unref?.();
  }

  function get(url, { incognito = false } = {}) {
    const host = hostKey(url);
    if (!host) return '';
    return (incognito && volatile.get(host)) || persistent.get(host) || '';
  }

  function set(url, dataUrl, { incognito = false } = {}) {
    const host = hostKey(url);
    if (!host || !isImageDataUrl(dataUrl)) return false;
    const map = incognito ? volatile : persistent;
    map.delete(host);
    map.set(host, dataUrl);
    trim(map);
    if (!incognito) scheduleSave();
    return true;
  }

  /** Sayfanın simgesini indirir (aynı alan adı için eşzamanlı tek istek). */
  async function update(ses, pageUrl, favicons, { incognito = false } = {}) {
    const host = hostKey(pageUrl);
    if (!host || !ses) return '';
    const key = (incognito ? 'i:' : 'p:') + host;
    if (inFlight.has(key)) return inFlight.get(key);
    const job = (async () => {
      for (const iconUrl of pickIconUrls(favicons)) {
        try {
          const res = await ses.fetch(iconUrl, {
            credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!res.ok) continue;
          const declared = Number(res.headers.get('content-length')) || 0;
          if (declared > MAX_BYTES) continue;
          const dataUrl = toDataUrl(Buffer.from(await res.arrayBuffer()));
          if (dataUrl) { set(pageUrl, dataUrl, { incognito }); return dataUrl; }
        } catch {}
      }
      return get(pageUrl, { incognito });
    })();
    inFlight.set(key, job);
    try { return await job; } finally { inFlight.delete(key); }
  }

  /** Yer imleri için: birden çok adresin önbellekteki simgeleri (ağ isteği yok). */
  function lookup(urls) {
    const out = {};
    for (const url of Array.isArray(urls) ? urls.slice(0, 2000) : []) {
      const d = get(url);
      if (d) out[hostKey(url)] = d;
    }
    return out;
  }

  function clear() {
    persistent.clear();
    volatile.clear();
    try { write && write({}); } catch {}
  }

  return { get, set, update, lookup, clear, size: () => persistent.size };
}

module.exports = { createFaviconCache, hostKey, sniffImageType, toDataUrl, isImageDataUrl, pickIconUrls, MAX_BYTES };
