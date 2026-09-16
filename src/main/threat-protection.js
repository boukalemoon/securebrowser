/**
 * İlgezdi — Zararlı site koruması: indirme, saklama, zamanlama ve engel durumu
 *
 * Saf mantık (ayrıştırma, eşleştirme, uyarı sayfası modeli) threat-lists.js'te.
 * Burada:
 *   • Listeler bellek içi ayrı bir oturumla indirilir: çerez, önbellek ya da tarama
 *     verisi paylaşılmaz, istekte yalnızca liste adresi bulunur. VPN açıksa trafik
 *     sistem tünelinden geçer (VPN oturum proxy'si değil, tünel olarak kurulur).
 *   • Derlenmiş dizinler userData/threat-lists altına yazılır; açılışta ağ
 *     beklenmeden diskten yüklenir. Bozuk ya da beklenenden küçük bir indirme
 *     mevcut listenin yerine geçmez (koruma sessizce boşalmasın).
 *   • Büyük listeler parça parça derlenir; ana süreç (tüm sekmelerin ağ
 *     istekleri) derleme boyunca kilitlenmez.
 *   • Ana çerçeve engellemesinde uyarı sayfası için engel kaydı tutulur. "Devam et"
 *     isteği tek kullanımlık rastgele belirteçle doğrulanır; izin yalnızca o oturum
 *     (normal ya da gizli) ve uygulama açık kaldığı sürece geçerlidir, diske yazılmaz.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const tl = require('./threat-lists');
const { T } = require('./i18n');

const DIR_NAME = 'threat-lists';
const META_FILE = 'meta.json';
const FETCH_PARTITION = 'ilgezdi-threat-lists';   // "persist:" öneki yok → bellek içi
const FETCH_TIMEOUT_MS = 90 * 1000;
const FIRST_CHECK_DELAY_MS = 20 * 1000;           // açılışı yavaşlatmasın
const CHECK_EVERY_MS = 30 * 60 * 1000;
const MANUAL_MIN_GAP_MS = 5 * 60 * 1000;          // "Şimdi güncelle" liste sunucusunu yormasın
const BLOCK_MEMORY_MS = 20 * 1000;
const PROCEED_TTL_MS = 30 * 60 * 1000;
const COMPILE_BATCH_LINES = 20000;

function sameToken(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hostOfUrl(url) {
  try { return tl.normalizeHost(new URL(String(url)).hostname); } catch { return ''; }
}

async function compileTextAsync(text) {
  const c = tl.createListCompiler();
  let start = 0;
  let n = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    c.add(text.slice(start, end));
    start = end + 1;
    if (++n % COMPILE_BATCH_LINES === 0) await new Promise((r) => setImmediate(r));
  }
  return c.finish();
}

/**
 * @param {object} o
 * @param {Electron.IpcMain} o.ipcMain
 * @param {typeof Electron.session} o.session
 * @param {string} o.userDataPath
 * @param {() => object} o.getConfig     config.threatProtection === false → kapalı
 * @param {string} [o.userAgent]
 * @param {{info?: Function, warn?: Function}} [o.log]
 * @param {Array} [o.sources]            testler için; varsayılan threat-lists SOURCES
 */
function setupThreatProtection({ ipcMain, session, userDataPath, getConfig, userAgent, log, sources = tl.SOURCES }) {
  const dir = path.join(userDataPath, DIR_NAME);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const matcher = tl.createMatcher();
  let meta = { hashVersion: tl.HASH_VERSION, sources: {} };
  const lastBlock = new Map();   // webContentsId → { url, hit, at }
  const pending = new Map();     // webContentsId → { url, token, at }
  const bypass = new WeakMap();  // Session → Set<host>
  const stats = { pages: 0, resources: 0 };
  let updating = false;
  let firstTimer = null;
  let interval = null;

  const enabled = () => (getConfig() || {}).threatProtection !== false;
  const info = (msg, data) => { try { log?.info?.('threat', msg, data); } catch {} };
  const warn = (msg, data) => { try { log?.warn?.('threat', msg, data); } catch {} };

  // ── Disk ────────────────────────────────────────────────────────────────────
  function writeAtomic(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  function saveMeta() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      writeAtomic(path.join(dir, META_FILE), JSON.stringify(meta));
    } catch (e) { warn('Liste durumu kaydedilemedi', { error: String(e.message || e) }); }
  }

  function loadFromDisk() {
    let stored = null;
    try { stored = JSON.parse(fs.readFileSync(path.join(dir, META_FILE), 'utf8')); } catch {}
    // Özet algoritması değiştiyse eski dizinler geçersizdir: yeniden indirilir.
    meta = stored && stored.hashVersion === tl.HASH_VERSION && stored.sources && typeof stored.sources === 'object'
      ? { hashVersion: tl.HASH_VERSION, sources: stored.sources }
      : { hashVersion: tl.HASH_VERSION, sources: {} };
    for (const id of Object.keys(meta.sources)) {
      if (!sourceById.has(id)) { delete meta.sources[id]; continue; }   // artık kullanılmayan kaynak
      const m = meta.sources[id];
      if (!m || !m.count) continue;
      let index = null;
      try { index = tl.indexFromBytes(fs.readFileSync(path.join(dir, id + '.idx')), m.count); } catch {}
      if (index) matcher.set(id, index);
      else meta.sources[id] = { lastAttemptAt: 0, failures: 0 };        // dosya kayıp/bozuk → hemen yeniden indir
    }
    try {
      for (const f of fs.readdirSync(dir)) {
        const id = f.endsWith('.idx') ? f.slice(0, -4) : f.endsWith('.tmp') ? '' : null;
        if (id === '' || (id !== null && !sourceById.has(id))) fs.unlinkSync(path.join(dir, f));
      }
    } catch {}
  }

  // ── İndirme ─────────────────────────────────────────────────────────────────
  // Kaynağın adresleri sırayla denenir (birincil, sonra yansı). Hepsi başarısızsa
  // hata sayılır ve geri çekilme (nextUpdateAt) uygulanır.
  async function fetchSource(s) {
    const prev = meta.sources[s.id] || {};
    const now = Date.now();
    const ses = session.fromPartition(FETCH_PARTITION);
    try { if (userAgent) ses.setUserAgent(userAgent); } catch {}
    const urls = Array.isArray(s.urls) && s.urls.length ? s.urls : [s.url];
    let lastErr = null;
    for (const url of urls) {
      try {
        return await fetchFrom(s, url, prev, now, ses);
      } catch (e) {
        lastErr = e;
      }
    }
    const message = lastErr && lastErr.name === 'AbortError' ? T('threat.err.timeout') : String((lastErr && lastErr.message) || lastErr || T('threat.err.noAddress'));
    meta.sources[s.id] = { ...prev, lastAttemptAt: now, failures: (Number(prev.failures) || 0) + 1, lastError: message };
    throw lastErr || new Error(message);
  }

  // Yeni liste öncekinin yarısından küçükse (yarım kalmış indirme, biçim değişikliği,
  // hata sayfası) eski liste korunur; koruma sessizce zayıflamasın.
  const MIN_KEEP_RATIO = 0.5;

  async function fetchFrom(s, url, prev, now, ses) {
    // Koşullu istek yalnızca son başarılı indirmenin yapıldığı adrese (ETag adrese özgü).
    const conditional = matcher.has(s.id) && prev.fromUrl === url;
    const headers = {};
    if (conditional && prev.etag) headers['If-None-Match'] = prev.etag;
    if (conditional && prev.lastModified) headers['If-Modified-Since'] = prev.lastModified;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await ses.fetch(url, { headers, credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: ctrl.signal });
      if (res.status === 304 && conditional) {
        meta.sources[s.id] = { ...prev, fetchedAt: now, lastAttemptAt: now, failures: 0, lastError: '' };
        return 'unchanged';
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const declared = Number(res.headers.get('content-length')) || 0;
      if (declared > s.maxBytes) throw new Error(T('threat.err.tooLarge'));
      let buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > s.maxBytes) throw new Error(T('threat.err.tooLarge'));
      // Sıkıştırılmış liste (ör. İlgezdi sunucusundaki usom.txt.gz) gzip imzasından
      // tanınır. Sunucu Content-Encoding ile gönderirse fetch zaten açmıştır, imza olmaz.
      if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf, { maxOutputLength: s.maxBytes * 10 });
      const compiled = await compileTextAsync(buf.toString('utf8'));
      const floor = Math.max(Number(s.minEntries) || 1, matcher.has(s.id) && prev.count ? Math.floor(prev.count * MIN_KEEP_RATIO) : 0);
      if (compiled.index.length < floor) {
        throw new Error(T('threat.err.tooSmall', { count: compiled.index.length }));
      }
      fs.mkdirSync(dir, { recursive: true });
      writeAtomic(path.join(dir, s.id + '.idx'), Buffer.from(tl.indexToBytes(compiled.index)));
      matcher.set(s.id, compiled.index);
      meta.sources[s.id] = {
        count: compiled.index.length, hosts: compiled.hosts, urls: compiled.urls, truncated: compiled.truncated,
        fetchedAt: now, lastAttemptAt: now, failures: 0, lastError: '', fromUrl: url,
        etag: res.headers.get('etag') || '', lastModified: res.headers.get('last-modified') || '',
      };
      return 'updated';
    } finally {
      clearTimeout(timeout);
    }
  }

  // Durum değişince (güncelleme başladı, bir liste bitti, iş tamamlandı) arayüz haber
  // alır. Eskiden Ayarlar › Gizlilik kutusu yalnızca sekme açılırken bir kez
  // çiziliyordu; liste arka planda sonradan inince sayılar ekranda değişmiyordu.
  const statusListeners = new Set();
  function notifyStatus() {
    const st = status();
    for (const fn of statusListeners) { try { fn(st); } catch {} }
  }

  // Aynı anda tek güncelleme. Süren bir güncelleme varken gelen istek (ör. açılıştaki
  // otomatik güncelleme sürerken "Şimdi güncelle") onun bitmesini bekler; eskiden
  // hemen o anki yarım durumu döndürüyordu.
  let inFlight = null;
  function runUpdates({ force = false } = {}) {
    if (!enabled() || !sources.length) return Promise.resolve(status());
    if (inFlight) return inFlight;
    inFlight = (async () => {
      updating = true;
      notifyStatus();
      try {
        for (const s of sources) {
          if (!enabled()) break;
          const m = meta.sources[s.id];
          const now = Date.now();
          const due = force
            ? !m || !m.lastAttemptAt || now - m.lastAttemptAt >= MANUAL_MIN_GAP_MS
            : now >= tl.nextUpdateAt(s, m);
          if (!due) continue;
          try {
            const result = await fetchSource(s);
            info('Tehdit listesi güncellendi', { source: s.id, result, entries: meta.sources[s.id].count });
          } catch {
            warn('Tehdit listesi indirilemedi', { source: s.id, error: meta.sources[s.id].lastError, failures: meta.sources[s.id].failures });
          }
          saveMeta();
          notifyStatus();
        }
      } finally {
        updating = false;
        inFlight = null;
      }
      notifyStatus();
      return status();
    })();
    return inFlight;
  }

  // ── Engelleme ───────────────────────────────────────────────────────────────
  function isBypassed(ses, url) {
    const set = ses ? bypass.get(ses) : null;
    if (!set || !set.size) return false;
    return tl.hostCandidates(hostOfUrl(url)).some((h) => set.has(h));
  }

  /** İstek engellenmeli mi? Eşleşme yoksa null; varsa { sourceId, sourceName, kind }. */
  function check(url, ses) {
    if (!enabled()) return null;
    const hit = matcher.match(url);
    if (!hit || isBypassed(ses, url)) return null;
    return { ...hit, sourceName: (sourceById.get(hit.sourceId) || {}).name || hit.sourceId };
  }

  function noteBlocked(details, hit) {
    if (details.resourceType === 'mainFrame') {
      stats.pages++;
      if (details.webContentsId != null) lastBlock.set(details.webContentsId, { url: details.url, hit, at: Date.now() });
      // Adres günlüğe yazılmaz; yalnızca hangi listenin ve ne tür bir girdinin eşleştiği.
      info('Zararlı site engellendi', { source: hit.sourceId, kind: hit.kind });
    } else {
      stats.resources++;
    }
  }

  /** did-fail-load (ERR_BLOCKED_BY_CLIENT): bu sekmede az önce zararlı site engellendiyse uyarı sayfası modeli. */
  function takeBlock(wc) {
    const b = lastBlock.get(wc.id);
    lastBlock.delete(wc.id);
    if (!b || Date.now() - b.at > BLOCK_MEMORY_MS) return null;
    const token = crypto.randomBytes(18).toString('hex');
    pending.set(wc.id, { url: b.url, token, at: Date.now() });
    return tl.threatPageModel({ url: b.url, sourceName: b.hit.sourceName, kind: b.hit.kind, token });
  }

  /** Sekmenin konsol mesajı. Uyarı sayfasının "devam et" isteğiyse işler ve true döner. */
  function handleConsoleMessage(wc, message) {
    if (typeof message !== 'string' || !message.startsWith(tl.PROCEED_PREFIX)) return false;
    const p = pending.get(wc.id);
    if (!p || Date.now() - p.at > PROCEED_TTL_MS || !sameToken(p.token, message.slice(tl.PROCEED_PREFIX.length))) return true;
    pending.delete(wc.id);
    const host = hostOfUrl(p.url);
    if (!host) return true;
    let set = bypass.get(wc.session);
    if (!set) { set = new Set(); bypass.set(wc.session, set); }
    set.add(host);
    info('Uyarıya rağmen siteye devam edildi', {});
    wc.loadURL(p.url).catch(() => {});
    return true;
  }

  // Sekme kapanınca çağrılır. Yok edilmiş webContents'in .id'si okunamayabildiği için
  // kimlik numarası da kabul edilir.
  function forget(wcOrId) {
    const id = typeof wcOrId === 'number' ? wcOrId : wcOrId && wcOrId.id;
    lastBlock.delete(id);
    pending.delete(id);
  }

  // ── Durum ───────────────────────────────────────────────────────────────────
  function status() {
    return {
      enabled: enabled(),
      updating,
      entries: matcher.entryCount(),
      blockedPages: stats.pages,
      blockedResources: stats.resources,
      sources: tl.statusSummary(sources, meta.sources, Date.now()),
    };
  }

  function onConfigChanged() {
    if (enabled()) setTimeout(() => runUpdates().catch(() => {}), 1000).unref?.();
  }

  function start() {
    try { loadFromDisk(); } catch (e) { warn('Tehdit listeleri diskten yüklenemedi', { error: String(e.message || e) }); }
    firstTimer = setTimeout(() => runUpdates().catch(() => {}), FIRST_CHECK_DELAY_MS);
    firstTimer.unref?.();
    interval = setInterval(() => runUpdates().catch(() => {}), CHECK_EVERY_MS);
    interval.unref?.();
  }

  function stop() {
    clearTimeout(firstTimer);
    clearInterval(interval);
  }

  ipcMain.handle('threats-status', () => status());
  ipcMain.handle('threats-update-now', () => runUpdates({ force: true }));

  return {
    start, stop, check, noteBlocked, takeBlock, handleConsoleMessage, forget, status, runUpdates, onConfigChanged,
    onStatus: (fn) => { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    _matcher: matcher,
  };
}

module.exports = { setupThreatProtection, compileTextAsync, FETCH_PARTITION, MANUAL_MIN_GAP_MS };
