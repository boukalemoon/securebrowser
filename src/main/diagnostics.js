/**
 * İlgezdi — Tanılama ve Hata Bildirim Altyapısı (ana süreç)
 *
 * AMAÇ
 *   Kullanıcıda oluşan bir hataya anlık müdahale edebilmek. Bunun için üç şey
 *   gerekir ve üçü burada:
 *     1) Yapılandırılmış, kalıcı ve döngüsel bir olay günlüğü (JSON Lines)
 *     2) Çökme / işlenmemiş hata yakalayıcıları (ana süreç + render süreçleri)
 *     3) Kullanıcı onaylı, KİMLİKSİZLEŞTİRİLMİŞ rapor gönderimi
 *
 * TASARIM KARARI — bu dosyanın en önemli kısmı
 *   İlgezdi gizlilik odaklı bir tarayıcı. Bu yüzden tanılama günlüğü
 *   ZİYARET GEÇMİŞİ DEĞİLDİR ve olmamalıdır. İki akış kesin olarak ayrıdır:
 *
 *     secure-log-manager.js → kullanıcının ziyaret geçmişi. Cihazda şifreli
 *                             kalır; yalnızca kullanıcı açıkça isterse senkronlanır.
 *     diagnostics.js (bu)   → uygulamanın kendi sağlığı. URL, sayfa başlığı,
 *                             form içeriği, çerez, parola ASLA girmez.
 *
 *   Bir URL günlüğe yazılmak zorundaysa (ör. "şu sayfada render çöktü") tam
 *   adres değil, kurulum başına rastgele bir tuzla HMAC'lenmiş bir etiket
 *   yazılır: `https://#a1b2c3d4`. Böylece aynı kurulumdan gelen raporlarda
 *   "hep aynı site" korelasyonu kurulabilir, ama site kimliği geri elde
 *   edilemez ve iki farklı kullanıcının aynı sitesi aynı etiketi almaz.
 *
 * GÖNDERİM İZNİ
 *   Otomatik gönderim VARSAYILAN OLARAK KAPALIDIR (KVKK/GDPR: açık rıza).
 *   İlk hata oluştuğunda kullanıcıya bir kez sorulur, kararı hatırlanır.
 *   Kullanıcı "Sorun Bildir" ekranında gönderilecek raporun TAMAMINI görebilir.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { app, dialog, BrowserWindow } = require('electron');
const { T } = require('./i18n');

// ─── Sabitler ─────────────────────────────────────────────────────────────────
const LEVELS      = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const RING_SIZE   = 500;                 // bellekte tutulan son olay sayısı
const FILE_MAX    = 2 * 1024 * 1024;     // günlük dosya üst sınırı (2 MB)
const KEEP_DAYS   = 7;                   // kaç günlük dosya saklanır
const HEARTBEAT_MS = 6 * 60 * 60 * 1000; // 6 saat

let LOG_DIR    = null;
let ring       = [];                     // son olaylar (bellek)
let stream     = null;                   // açık dosya akışı
let streamDay  = null;
let streamSize = 0;
let salt       = null;                   // kuruluma özgü HMAC tuzu
let installId  = null;                   // kuruluma özgü kimliksiz kimlik
let deps       = null;                   // { getConfig, saveConfig, getMainWindow }
let counters   = { error: 0, warn: 0, fatal: 0, crash: 0 };
let sessionStart = Date.now();
let askingConsent = false;

// ═══════════════════════════════════════════════════════════════════════════════
// Gizlilik: kimliksizleştirme
// ═══════════════════════════════════════════════════════════════════════════════

function hmacTag(value) {
  if (!salt) return '#anon';
  return '#' + crypto.createHmac('sha256', salt).update(String(value)).digest('hex').slice(0, 8);
}

/** Tam URL yerine şema + karma etiket. Site kimliği geri elde edilemez. */
function redactUrl(url) {
  const s = String(url);
  try {
    const u = new URL(s);
    // Uygulamanın kendi yerel sayfaları teşhis için açıkça yazılabilir.
    if (u.protocol === 'file:')  return 'file://<yerel>' + (u.pathname.endsWith('.html') ? path.basename(u.pathname) : '');
    if (u.protocol === 'about:') return s;
    return u.protocol + '//' + hmacTag(u.hostname) + (u.pathname && u.pathname !== '/' ? '/<yol>' : '');
  } catch {
    return '<url>';
  }
}

const HOME = os.homedir();
const USERNAME = path.basename(HOME);

/**
 * Serbest metinden kişisel veri ayıklar. Yakalayıcılar her yerden metin
 * alabildiği için (yığın izleri, üçüncü taraf hata mesajları) bu, son savunma
 * hattıdır — sıralama önemli: URL'ler yollardan ÖNCE işlenir.
 */
function scrub(text) {
  if (text == null) return '';
  let s = String(text);

  // 1) URL'ler → karma etiket
  s = s.replace(/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"<>()\]]+/g, (m) => redactUrl(m));

  // 2) Kullanıcı adı içeren yollar
  if (USERNAME && USERNAME.length > 1) {
    s = s.split(USERNAME).join('<kullanıcı>');
  }
  s = s.replace(/([A-Za-z]:\\Users\\)[^\\/:*?"<>|\r\n]+/gi, '$1<kullanıcı>');
  s = s.replace(/(\/(?:home|Users)\/)[^/\s:]+/g, '$1<kullanıcı>');

  // 3) E-posta
  s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '<eposta>');

  // 4) Belirteç / anahtar benzeri uzun bloklar (JWT, base64, hex)
  s = s.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '<jwt>');
  s = s.replace(/\b[A-Fa-f0-9]{32,}\b/g, '<hex>');
  s = s.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '<base64>');

  // 5) IP adresleri (kullanıcının kendi IP'si sızmasın)
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, (m) => (m === '127.0.0.1' ? m : '<ip>'));

  return s.length > 4000 ? s.slice(0, 4000) + '…<kısaltıldı>' : s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dosya günlüğü (JSON Lines) + döndürme
// ═══════════════════════════════════════════════════════════════════════════════

function today() { return new Date().toISOString().slice(0, 10); }
function logPathFor(day) { return path.join(LOG_DIR, `ilgezdi-${day}.log`); }

function openStream() {
  const day = today();
  if (stream && streamDay === day && streamSize < FILE_MAX) return stream;
  try { stream?.end(); } catch {}
  stream = null;

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const p = logPathFor(day);
    let size = 0;
    try { size = fs.statSync(p).size; } catch {}
    // Dosya sınırı aştıysa arşivle (tek yedek yeter; amaç sonsuz büyümeyi önlemek)
    if (size >= FILE_MAX) {
      try { fs.renameSync(p, p + '.1'); size = 0; } catch {}
    }
    stream     = fs.createWriteStream(p, { flags: 'a' });
    stream.on('error', () => { stream = null; });
    streamDay  = day;
    streamSize = size;
  } catch {
    stream = null;
  }
  return stream;
}

function pruneOldFiles() {
  try {
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      if (!f.startsWith('ilgezdi-')) continue;
      const p = path.join(LOG_DIR, f);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      } catch {}
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Günlük yazma
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {'debug'|'info'|'warn'|'error'|'fatal'} level
 * @param {string} cat  kısa kategori: 'vpn', 'blocker', 'ipc', 'renderer'...
 * @param {string} msg
 * @param {object} [data] küçük, kişisel veri İÇERMEYEN ek alanlar
 */
function log(level, cat, msg, data) {
  const entry = {
    ts:    new Date().toISOString(),
    level: LEVELS[level] ? level : 'info',
    cat:   String(cat || 'app').slice(0, 24),
    msg:   scrub(msg),
  };
  if (data && typeof data === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'url') { clean.url = redactUrl(v); continue; }
      if (v == null || typeof v === 'boolean' || typeof v === 'number') { clean[k] = v; continue; }
      clean[k] = scrub(v).slice(0, 400);
    }
    entry.data = clean;
  }

  if (entry.level === 'error' || entry.level === 'fatal' || entry.level === 'warn') {
    counters[entry.level] = (counters[entry.level] || 0) + 1;
  }

  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();

  const s = openStream();
  if (s) {
    const line = JSON.stringify(entry) + '\n';
    streamSize += Buffer.byteLength(line);
    try { s.write(line); } catch {}
  }

  // Geliştirmede terminale de bas — çökmeleri sessizce kaybetmeyelim.
  if (!app.isPackaged) {
    const tag = `[${entry.level.toUpperCase()}/${entry.cat}]`;
    if (entry.level === 'error' || entry.level === 'fatal') console.error(tag, entry.msg);
    else if (entry.level === 'warn') console.warn(tag, entry.msg);
  }
  return entry;
}

const api = {
  debug: (cat, msg, data) => log('debug', cat, msg, data),
  info:  (cat, msg, data) => log('info',  cat, msg, data),
  warn:  (cat, msg, data) => log('warn',  cat, msg, data),
  error: (cat, msg, data) => log('error', cat, msg, data),
  fatal: (cat, msg, data) => log('fatal', cat, msg, data),
};

/** Hata nesnesini güvenli biçimde günlüğe çevirir. */
function logError(cat, err, extra) {
  const e = err instanceof Error ? err : new Error(String(err));
  return api.error(cat, e.message, {
    name:  e.name,
    stack: scrub(e.stack || '').split('\n').slice(0, 12).join('\n'),
    ...(extra || {}),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rapor oluşturma
// ═══════════════════════════════════════════════════════════════════════════════

function envelope() {
  return {
    schema:     1,
    app:        'ilgezdi',
    version:    app.getVersion(),
    installId,                                  // kimliksiz, sıfırlanabilir
    platform:   process.platform,
    arch:       process.arch,
    osRelease:  os.release(),
    electron:   process.versions.electron,
    chrome:     process.versions.chrome,
    node:       process.versions.node,
    locale:     app.getLocale?.() || '',
    packaged:   app.isPackaged,
    uptimeSec:  Math.round((Date.now() - sessionStart) / 1000),
    totalMemMb: Math.round(os.totalmem() / 1048576),
    freeMemMb:  Math.round(os.freemem() / 1048576),
    counters:   { ...counters },
  };
}

/** Etkin özellikler — kullanıcı verisi değil, yapılandırma şekli. */
function featureFlags() {
  const c = (deps?.getConfig?.() || {});
  return {
    vpnEnabled:     !!c.vpnEnabled,
    blockLevel:     c.blockLevel || 'medium',
    whitelistCount: Array.isArray(c.whitelist) ? c.whitelist.length : 0,
    httpsOnly:      !!c.httpsOnly,
    threatProtection: c.threatProtection !== false,
    doNotTrack:     !!c.doNotTrack,
    logEnabled:     c.logEnabled !== false,
    theme:          c.theme || 'otuken',
    searchEngine:   c.searchEngine || 'duckduckgo',
    hasHomepage:    !!(c.homepage || '').trim(),
    webrtcPolicy:   c.webrtcPolicy || 'default_public_interface_only',
    secureDns:      c.secureDns || 'automatic',
    blockThirdPartyCookies: c.blockThirdPartyCookies !== false,
    startupMode:    c.startupMode || 'homepage',
  };
}

/**
 * Gönderilecek/kaydedilecek rapor. `breadcrumbs` son olaylardır — hepsi
 * yazılırken zaten scrub'dan geçti.
 */
function buildReport(reason = 'manual', note = '') {
  return {
    reason,
    reportedAt:  new Date().toISOString(),
    env:         envelope(),
    features:    featureFlags(),
    userNote:    scrub(note).slice(0, 1000),
    breadcrumbs: ring.slice(-120),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Gönderim (kullanıcı onaylı)
// ═══════════════════════════════════════════════════════════════════════════════

function consentState() {
  const c = deps?.getConfig?.() || {};
  return c.diagnosticsConsent;           // true | false | undefined (henüz sorulmadı)
}

function setConsent(value, source = 'settings') {
  const c = deps?.getConfig?.() || {};
  const from = c.diagnosticsConsent === true ? true : c.diagnosticsConsent === false ? false : null;
  c.diagnosticsConsent = value;
  if (from !== value) deps?.onConsentChange?.(from, value, source);
  deps?.saveConfig?.(c);
  api.info('diag', 'Tanılama gönderim izni güncellendi', { consent: value });
}

/** İlk hatada bir kez sorar, kararı hatırlar. */
async function ensureConsent() {
  const cur = consentState();
  if (cur === true || cur === false) return cur;
  if (askingConsent) return false;
  askingConsent = true;
  try {
    const win = deps?.getMainWindow?.();
    const r = await dialog.showMessageBox(win && !win.isDestroyed() ? win : null, {
      type:      'question',
      buttons:   [T('diagConsent.dontSend'), T('diagConsent.autoSend')],
      defaultId: 1,
      cancelId:  0,
      title:     T('diagConsent.title'),
      message:   T('diagConsent.message'),
      detail:    T('diagConsent.detail'),
      checkboxLabel: T('diagConsent.remember'),
      checkboxChecked: true,
    });
    const allow = r.response === 1;
    if (r.checkboxChecked !== false) setConsent(allow, 'diag-dialog');
    return allow;
  } catch {
    return false;
  } finally {
    askingConsent = false;
  }
}

async function sendReport(report, { endpoint } = {}) {
  const url = endpoint || (deps?.getConfig?.().diagnosticsEndpoint) || '';
  if (!url) return { ok: false, reason: 'no_endpoint' };
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: 'insecure_endpoint' };
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ilgezdi-Version': app.getVersion() },
      body:    JSON.stringify(report),
      signal:  AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    // Gönderim hatasını günlüğe yaz ama tekrar gönderme denemesi yapma
    // (sonsuz döngü: gönderim hatası → yeni hata → gönderim…).
    api.warn('diag', 'Rapor gönderilemedi', { reason: String(e.message || e) });
    return { ok: false, reason: String(e.message || e) };
  }
}

/** Hata oluştuğunda: izin varsa gönder, yoksa bir kez sor. */
async function reportAuto(reason) {
  try {
    const allowed = await ensureConsent();
    if (!allowed) return { ok: false, reason: 'no_consent' };
    return await sendReport(buildReport(reason));
  } catch { return { ok: false, reason: 'failed' }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Çökme / hata yakalayıcıları
// ═══════════════════════════════════════════════════════════════════════════════

// Uygulama kapanırken render/GPU süreçleri normal olarak sonlanır. Bunları
// çökme sayıp rapor etmek iki hataya yol açar: sahte çökme istatistiği ve —
// daha kötüsü — kullanıcı uygulamayı kapatırken önüne çıkan onay diyaloğu.
let isQuitting = false;

// Gerçek çökme sayılmayan sonlanma nedenleri.
const BENIGN_EXITS = new Set(['clean-exit', 'killed']);

function installCrashHandlers() {
  app.on('before-quit', () => { isQuitting = true; });
  app.on('will-quit',   () => { isQuitting = true; });

  // İşletim sistemi kapanışı, "Görevi sonlandır" ya da bir servis yöneticisi
  // süreci sinyalle durdurduğunda Electron'un normal kapanış dizisi ÇALIŞMAZ:
  // before-quit hiç tetiklenmez ve alt süreçler 'crashed' olarak görünür.
  // Sinyali yakalayıp kapanış bayrağını kurmak, bu durumun sahte çökme
  // raporuna dönüşmesini önler.
  //
  // DİKKAT: Node'da bir sinyale dinleyici eklemek VARSAYILAN ÇIKIŞ DAVRANIŞINI
  // KALDIRIR. Yalnızca bayrağı kurup dönseydik uygulama Ctrl+C'de ve işletim
  // sistemi kapanışında kapanmazdı. Bu yüzden bayraktan sonra zarif kapanışı
  // (app.quit → before-quit → VPN bağlantısını kes, logları kaydet) biz
  // başlatıyoruz; takılırsa kısa bir süre sonra zorla çıkıyoruz.
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    try {
      process.on(sig, () => {
        if (isQuitting) return;              // ikinci sinyal: zaten kapanıyoruz
        isQuitting = true;
        log('info', 'app', 'Kapanış sinyali alındı', { signal: sig });
        try { app.quit(); } catch {}
        setTimeout(() => process.exit(0), 3000).unref();
      });
    } catch {}
  }

  process.on('uncaughtException', (err) => {
    counters.crash++;
    logError('main', err, { fatal: true });
    if (!isQuitting) reportAuto('uncaughtException');
    // Süreci öldürmüyoruz: tarayıcı penceresi açıkken kullanıcıyı sekmelerinden
    // etmek, hatayı yutmaktan daha kötü. Ölümcül durumda Electron kendi çöker.
  });

  process.on('unhandledRejection', (reason) => {
    logError('main', reason instanceof Error ? reason : new Error(String(reason)), { unhandledRejection: true });
  });

  app.on('render-process-gone', (_e, contents, details) => {
    const reason = details?.reason || 'unknown';
    const benign = isQuitting || BENIGN_EXITS.has(reason);
    if (!benign) counters.crash++;
    log(benign ? 'info' : 'fatal', 'renderer', 'Render süreci sonlandı', {
      reason,
      exitCode: details?.exitCode,
      quitting: isQuitting,
      url: (() => { try { return contents.getURL(); } catch { return ''; } })(),
    });
    if (!benign) reportAuto('render-process-gone');
  });

  app.on('child-process-gone', (_e, details) => {
    const reason = details?.reason || 'unknown';
    const benign = isQuitting || BENIGN_EXITS.has(reason);
    if (!benign) counters.crash++;
    log(benign ? 'info' : 'error', 'child', 'Alt süreç sonlandı', {
      type: details?.type, reason, exitCode: details?.exitCode,
      name: details?.name, quitting: isQuitting,
    });
  });

  app.on('web-contents-created', (_e, contents) => {
    contents.on('unresponsive', () => api.warn('renderer', 'Sayfa yanıt vermiyor', {
      url: (() => { try { return contents.getURL(); } catch { return ''; } })(),
    }));
    contents.on('preload-error', (_ev, preloadPath, error) => {
      logError('preload', error, { preload: path.basename(String(preloadPath)) });
    });
    contents.on('did-fail-load', (_ev, code, desc, failedUrl, isMainFrame) => {
      // İptal edilen gezinmeler (-3) gürültüdür, hata değil.
      if (code === -3 || !isMainFrame) return;
      api.warn('navigation', 'Sayfa yüklenemedi', { code, desc, url: failedUrl });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Kurulum
// ═══════════════════════════════════════════════════════════════════════════════

function loadOrCreateIdentity(userDataPath) {
  const p = path.join(userDataPath, 'diagnostics-id.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.salt && j.installId) return { salt: Buffer.from(j.salt, 'base64'), installId: j.installId };
  } catch {}
  const fresh = { salt: crypto.randomBytes(32), installId: crypto.randomUUID() };
  try {
    fs.writeFileSync(p, JSON.stringify({ salt: fresh.salt.toString('base64'), installId: fresh.installId }, null, 2), { mode: 0o600 });
  } catch {}
  return fresh;
}

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {object} options
 * @param {string} options.userDataPath
 * @param {() => object} options.getConfig
 * @param {(cfg:object) => void} options.saveConfig
 * @param {() => Electron.BrowserWindow|null} options.getMainWindow
 */
function setupDiagnostics(ipcMain, options) {
  deps    = options;
  LOG_DIR = path.join(options.userDataPath, 'diagnostics');

  const ident = loadOrCreateIdentity(options.userDataPath);
  salt      = ident.salt;
  installId = ident.installId;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  pruneOldFiles();
  installCrashHandlers();

  api.info('app', 'Oturum başladı', {
    version: app.getVersion(), platform: process.platform,
    electron: process.versions.electron, chrome: process.versions.chrome,
  });

  // ── IPC ────────────────────────────────────────────────────────────────────
  // Arayüzden gelen hatalar (window.onerror / unhandledrejection)
  ipcMain.on('diag-renderer-error', (event, payload) => {
    const p = payload || {};
    api.error('renderer', p.message || 'Arayüz hatası', {
      stack:  p.stack,
      source: p.source,
      line:   p.line,
      column: p.column,
    });
    reportAuto('renderer-error');
  });

  ipcMain.on('diag-log', (event, payload) => {
    const p = payload || {};
    log(p.level || 'info', p.cat || 'renderer', p.msg || '', p.data);
  });

  ipcMain.handle('diag-get-recent', (e, limit = 200) => {
    const n = Math.max(1, Math.min(Number(limit) || 200, RING_SIZE));
    return ring.slice(-n);
  });

  ipcMain.handle('diag-get-summary', () => ({
    env:      envelope(),
    features: featureFlags(),
    consent:  consentState() ?? null,
    endpoint: (deps?.getConfig?.().diagnosticsEndpoint) || '',
    logDir:   LOG_DIR,
  }));

  // Gönderilecek raporun TAMAMINI kullanıcıya göster — şeffaflık şart.
  ipcMain.handle('diag-preview-report', (e, note) => buildReport('manual', note));

  ipcMain.handle('diag-send-report', async (e, note) => {
    const allowed = consentState() === true ? true : await ensureConsent();
    if (!allowed) return { ok: false, reason: 'no_consent' };
    return sendReport(buildReport('manual', note));
  });

  ipcMain.handle('diag-export-report', async (e, note) => {
    const win = deps?.getMainWindow?.();
    const r = await dialog.showSaveDialog(win && !win.isDestroyed() ? win : null, {
      title: T('diagExport.title'),
      defaultPath: `ilgezdi-tanilama-${today()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(r.filePath, JSON.stringify(buildReport('export', note), null, 2), 'utf8');
      return { ok: true, path: r.filePath };
    } catch (err) {
      return { ok: false, reason: String(err.message || err) };
    }
  });

  ipcMain.handle('diag-set-consent', (e, value) => { setConsent(!!value); return { ok: true }; });

  ipcMain.handle('diag-open-log-folder', async () => {
    const { shell } = require('electron');
    await shell.openPath(LOG_DIR);
    return { ok: true };
  });

  // Kimliği sıfırla: installId + tuz yenilenir → eski raporlarla bağ kopar.
  ipcMain.handle('diag-reset-identity', () => {
    try { fs.unlinkSync(path.join(options.userDataPath, 'diagnostics-id.json')); } catch {}
    const fresh = loadOrCreateIdentity(options.userDataPath);
    salt = fresh.salt; installId = fresh.installId;
    api.info('diag', 'Tanılama kimliği sıfırlandı');
    return { ok: true, installId };
  });

  // ── Nabız (heartbeat) ──────────────────────────────────────────────────────
  // Sayaç sadece: kaç hata/uyarı/çökme oldu. URL ya da kullanıcı verisi YOK.
  // Yalnızca izin verilmişse ve bir uç nokta tanımlıysa gönderilir.
  setInterval(() => {
    if (consentState() !== true) return;
    if (counters.error === 0 && counters.fatal === 0 && counters.crash === 0) return;
    sendReport({ reason: 'heartbeat', reportedAt: new Date().toISOString(), env: envelope(), features: featureFlags(), breadcrumbs: [] });
  }, HEARTBEAT_MS);

  return api;
}

module.exports = {
  setupDiagnostics,
  log: api,
  logError,
  // Test edilebilirlik: gizlilik sınırını oluşturdukları için dışa açık.
  _internals: { scrub, redactUrl, hmacTag, buildReport, LEVELS },
  _setSaltForTest: (s) => { salt = Buffer.from(s); },
};
