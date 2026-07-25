/**
 * İlgezdi Browser — Ana Electron Süreci (Faz 2+3+4)
 */

'use strict';

const { app, BrowserWindow, BrowserView, ipcMain, session, dialog, safeStorage } = require('electron');
const path = require('path');
const fs   = require('fs');

const { SecureLogManager } = require('./secure-log-manager');
const { VpnManager, testDnsLeak } = require('./vpn-manager');
const { attachBlocker, shouldBlockUrl, updateBlockerConfig, getBlockStats } = require('./blocker-main');
const { setupGlance } = require('./glance-main');
const { setupArku } = require('./arku-manager');
const { setupBookmarkImport } = require('./bookmark-import');

let incognitoWindow = null;

const USER_DATA = app.getPath('userData');
const DB_PATH   = path.join(USER_DATA, 'logs.db');
const CFG_PATH  = path.join(USER_DATA, 'config.json');

const DEFAULT_CONFIG = {
  homepage:              '',           // boş = İlgezdi başlangıç sayfası; URL = o sayfa açılır
  searchEngine:          'duckduckgo', // varsayılan; kullanıcı ayarlardan değiştirebilir
  vpnEnabled:            false,
  vpnAutoConnect:        false,
  vpnLastProfileId:      null,
  killSwitchEnabled:     true,
  blockTrackers:         true,
  blockAds:              true,
  fingerprintProtection: true,
  dnsServer:             '1.1.1.1',
  userAgentRotation:     true,
  logEnabled:            true,
  logSyncServer:         '',
  theme:                 'otuken',
  syncEnabled:           false,
  syncServerUrl:         '',
  syncApiKey:            '',
  language:              'tr',
  downloadFolder:        '',
  askDownloadLocation:   false,
  notifications:         true,
  vpnNotify:             true,
  httpsOnly:             false,
  doNotTrack:            false,
  newTabMode:            'blank',
  customNewTabUrl:       '',
  fontSize:              13,
  fontFamily:            "'Inter', sans-serif",
  accentColor:           '#d4a85a',
};

// Arama motorları — kullanıcı ayarlardan seçer. Anahtar → sorgu URL öneki.
const SEARCH_ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google:     'https://www.google.com/search?q=',
  bing:       'https://www.bing.com/search?q=',
  yandex:     'https://yandex.com/search/?text=',
  yahoo:      'https://search.yahoo.com/search?p=',
  brave:      'https://search.brave.com/search?q=',
  ecosia:     'https://www.ecosia.org/search?q=',
  startpage:  'https://www.startpage.com/sp/search?query=',
};

function searchUrl(query) {
  const base = SEARCH_ENGINES[config.searchEngine] || SEARCH_ENGINES.duckduckgo;
  return base + encodeURIComponent(query);
}

// Uygulama açılışında / "Ana Sayfa" düğmesinde açılacak URL.
// Boş homepage = İlgezdi başlangıç sayfası (about:blank → renderer overlay).
function homepageUrl() {
  const hp = (config.homepage || '').trim();
  if (!hp || hp === 'about:blank') return 'about:blank';
  if (!/^https?:\/\//i.test(hp)) return 'https://' + hp;
  return hp;
}

function loadConfig() {
  try {
    if (fs.existsSync(CFG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CFG_PATH, 'utf-8')) };
    }
  } catch (e) { console.error('Config yüklenemedi:', e); }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();
let vpnManager = null;
let secureLog  = null;

// Tutarlı, temiz Chrome User-Agent.
// Neden rotasyon YOK: her isteğe rastgele (hatta Firefox/Safari) UA basmak,
// motor (Chromium) ve TLS parmak iziyle uyuşmadığından Google gibi siteler
// tarafından "bu tarayıcı güvenli olmayabilir" diye engellenmeye yol açar.
// Ayrıca Electron varsayılan UA'sındaki "Electron/…" ve uygulama adı token'ları
// da aynı şekilde işaretlenir. Bu yüzden gerçek Chromium sürümüyle eşleşen tek
// bir temiz UA kullanıp session.setUserAgent ile navigator.userAgent'ı da
// aynı değere sabitliyoruz (başlık ↔ JS tutarlı).
function buildUserAgent() {
  const ver = process.versions.chrome || '120.0.0.0';
  const osToken =
    process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' :
    process.platform === 'linux'  ? 'X11; Linux x86_64' :
                                    'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`;
}
const CLEAN_UA = buildUserAgent();

const BLOCKED_DOMAINS = [
  'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
  'adnxs.com', 'advertising.com', 'amazon-adsystem.com',
  'connect.facebook.net', 'analytics.google.com', 'google-analytics.com',
  'googletagmanager.com', 'hotjar.com', 'mixpanel.com', 'segment.io',
  'amplitude.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com',
  'newrelic.com', 'nr-data.net', 'scorecardresearch.com', 'quantserve.com',
  'taboola.com', 'outbrain.com',
];

function isBlocked(url) {
  try {
    const host = new URL(url).hostname;
    return BLOCKED_DOMAINS.some(d => host.includes(d));
  } catch { return false; }
}

let db = null;

function saveDBtoDisk() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) { console.error('[DB] Diske yazılamadı:', e); }
}

function initDB() {
  try {
    const initSqlJs = require('sql.js');
    initSqlJs().then(SqlJs => {
      if (fs.existsSync(DB_PATH)) {
        db = new SqlJs.Database(fs.readFileSync(DB_PATH));
      } else {
        db = new SqlJs.Database();
      }
      db.run(`
        CREATE TABLE IF NOT EXISTS visits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          url TEXT, domain TEXT, title TEXT,
          vpn_active INTEGER DEFAULT 0,
          vpn_profile TEXT,
          duration_ms INTEGER DEFAULT 0,
          blocked_reqs INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS blocked_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          url TEXT, domain TEXT
        );
      `);
      setInterval(saveDBtoDisk, 30000);
      console.log('[DB] Veritabanı başlatıldı');
    });
  } catch (e) {
    console.warn('[DB] sql.js yüklenemedi:', e.message);
  }
}

function logVisit(data) {
  if (!config.logEnabled || !secureLog) return;
  try {
    secureLog.addVisit(data);
    if (secureLog.logs.length % 10 === 0) secureLog.saveLogs();
  } catch (e) { console.error('[SecureLog] Hata:', e); }
}

// Site izin istekleri (kamera, mikrofon, konum...) — Electron varsayılanı
// İZİN VERMEKTİR; burada hassas izinler kullanıcı onayına bağlanır.
const QUIET_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
const ASK_USER    = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex']);
const PERMISSION_TR = {
  media: 'Kamera / Mikrofon', geolocation: 'Konum',
  notifications: 'Bildirim', midi: 'MIDI cihazları', midiSysex: 'MIDI cihazları',
};

// İzin kararları site (origin) + izin türü bazında hatırlanır ve config'e
// yazılır. Böylece bir siteyi reddedince tekrar tekrar sorulmaz — Google gibi
// konumu periyodik isteyen siteler için kritik. Kararları sıfırlamak için
// "Tüm verileri temizle" (clear-all) kullanılır.
function permKey(origin, permission) { return `${origin}|${permission}`; }
function getPermDecision(origin, permission) {
  return config.permissionDecisions ? config.permissionDecisions[permKey(origin, permission)] : undefined;
}
function setPermDecision(origin, permission, granted) {
  if (!config.permissionDecisions) config.permissionDecisions = {};
  config.permissionDecisions[permKey(origin, permission)] = granted;
  saveConfig(config);
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

function setupPermissionHandler(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (QUIET_ALLOW.has(permission)) return callback(true);
    if (!ASK_USER.has(permission))   return callback(false);

    const origin = originOf(details.requestingUrl || webContents.getURL()) || 'Bilinmeyen site';

    // Bu site için daha önce karar verilmişse tekrar SORMA — sessizce uygula.
    const prior = getPermDecision(origin, permission);
    if (prior === true)  return callback(true);
    if (prior === false) return callback(false);

    const parent = BrowserWindow.getFocusedWindow() || mainWindow;
    dialog.showMessageBox(parent, {
      type:      'question',
      buttons:   ['Reddet', 'İzin Ver'],
      defaultId: 0,
      cancelId:  0,
      title:     'İzin İsteği',
      message:   `${origin}`,
      detail:    `Bu site şu izni istiyor: ${PERMISSION_TR[permission] || permission}\n\nKararınız bu site için hatırlanır.`,
    }).then(r => {
      const granted = r.response === 1;
      setPermDecision(origin, permission, granted);
      callback(granted);
    }).catch(() => callback(false));
  });

  // Senkron izin sorguları (navigator.permissions.query, ön-kontroller).
  // Yalnızca daha önce açıkça İZİN VERİLMİŞ site+izin true döner; aksi halde
  // false → site isteği tetikler, o da yukarıdaki karara/prompt'a düşer.
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (QUIET_ALLOW.has(permission)) return true;
    return getPermDecision(requestingOrigin, permission) === true;
  });
}

function configureSession(ses) {
  setupPermissionHandler(ses);

  // Temiz, tutarlı UA — hem başlık hem navigator.userAgent buradan gelir.
  // fingerprintProtection'dan bağımsız her zaman uygulanır (Google girişi vb.).
  try { ses.setUserAgent(CLEAN_UA); } catch {}

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (config.fingerprintProtection) {
      delete headers['X-Forwarded-For'];
      delete headers['Via'];
      delete headers['X-WebRTC-IP'];
    }
    if (config.doNotTrack) headers['DNT'] = '1';
    callback({ requestHeaders: headers });
  });

  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    // Faz 6 engelleyici (seviye/whitelist ayarlı) + temel liste
    if (shouldBlockUrl(details.url)) return callback({ cancel: true });
    if ((config.blockTrackers || config.blockAds) && isBlocked(details.url)) {
      return callback({ cancel: true });
    }
    // HTTPS-Only: ana çerçeve http isteklerini https'e yükselt
    if (config.httpsOnly && details.resourceType === 'mainFrame' && details.url.startsWith('http://')) {
      return callback({ redirectURL: 'https://' + details.url.slice('http://'.length) });
    }
    callback({});
  });
}

let mainWindow = null;
let bookmarkPopupWin = null;

// Chrome (arayüz) pencereleri yalnızca yerel index.html yükler — preload API'sinin
// harici bir sayfaya açılmaması için navigasyon ve pencere açma tamamen kapalıdır.
function hardenChromeWindow(win) {
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// ─── Per-pencere sekme durumu ────────────────────────────────────────────────
// Her pencere (ana + incognito) kendi state nesnesine sahip
// viewHidden: renderer ekran overlay'i (yeni sekme, auth) gösterirken true olur.
// resize/panel olayları bu bayrağa saygı duymalı — yoksa gizli boş view
// yanlışlıkla geri gösterilip overlay'in üstünü örtüyor (boş ekran hatası).
const mainState = { tabs: new Map(), activeTabId: null, tabCounter: 0, panelIsOpen: false, viewHidden: false };
const incognitoState = { tabs: new Map(), activeTabId: null, tabCounter: 0, panelIsOpen: false, viewHidden: false };

const PANEL_WIDTH      = 420;
const SIDEBAR_WIDTH    = 56;
const TOOLBAR_HEIGHT   = 128; // 40 titlebar + 52 toolbar + 36 bookmarks bar
const STATUSBAR_HEIGHT = 24;

function getContextFromEvent(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (incognitoWindow && !incognitoWindow.isDestroyed() && win && win.id === incognitoWindow.id) {
    return { win: incognitoWindow, state: incognitoState };
  }
  return { win: mainWindow, state: mainState };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    frame: false,
    backgroundColor: '#0a0e1a',
    icon: path.join(__dirname, '../renderer/assets/app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  });

  hardenChromeWindow(mainWindow);
  mainWindow.on('resize', () => resizeActiveView(mainWindow, mainState));

  mainWindow.on('minimize', () => {
    if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
      bookmarkPopupWin.close();
      bookmarkPopupWin = null;
    }
  });

  attachBlocker(mainWindow);
  setupGlance(mainWindow, ipcMain);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', async () => {
    if (vpnManager?.activeProfile) {
      await vpnManager.disconnect().catch(() => {});
    }
    mainWindow = null;
  });
}

function createTab(win, state, url = config.homepage) {
  const tabId = ++state.tabCounter;
  const isIncognito = state === incognitoState;

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: isIncognito
        ? 'incognito-' + (win ? win.id : Date.now())
        : 'persist:securebrowser',
    }
  });

  configureSession(view.webContents.session);

  view.webContents.on('page-title-updated', (e, title) => {
    const tab = state.tabs.get(tabId);
    if (tab) tab.title = title;
    sendTabsUpdate(win, state);
  });

  view.webContents.on('did-navigate', (e, navUrl) => {
    const tab = state.tabs.get(tabId);
    if (tab) tab.url = navUrl;
    sendTabsUpdate(win, state);
  });

  view.webContents.on('did-navigate-in-page', (e, navUrl) => {
    const tab = state.tabs.get(tabId);
    if (tab) tab.url = navUrl;
    sendTabsUpdate(win, state);
  });

  view.webContents.on('did-finish-load', () => {
    const tab = state.tabs.get(tabId);
    if (!tab) return;

    // Gizli modda ziyaret loglanmaz
    if (!isIncognito) {
      try {
        const domain    = new URL(tab.url).hostname;
        const vpnStatus = vpnManager?.getStatus();
        logVisit({
          url:         tab.url,
          domain,
          title:       tab.title,
          vpnActive:   vpnStatus?.status === 'connected',
          vpnProfile:  vpnStatus?.activeProfile?.name || '',
          duration:    Date.now() - tab.startTime,
          blockedReqs: tab.blockedCount,
        });
        tab.startTime    = Date.now();
        tab.blockedCount = 0;
      } catch {}
    }

    // ── Glance: Alt+tıklama yakalama script'i inject et ──
    view.webContents.executeJavaScript(`
      (function() {
        if (window.__ilgezdiGlanceInjected) return;
        window.__ilgezdiGlanceInjected = true;
        window.__glancePending = null;
        document.addEventListener('click', function(e) {
          if (!e.altKey) return;
          var el = e.target;
          var link = null;
          while (el && el !== document.body) {
            if (el.tagName === 'A' && el.href && el.href.indexOf('javascript') !== 0) {
              link = el; break;
            }
            el = el.parentElement;
          }
          if (!link) return;
          e.preventDefault();
          e.stopPropagation();
          window.__glancePending = { url: link.href, x: e.clientX, y: e.clientY };
        }, true);
      })();
    `).catch(() => {});
  });

  view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    createTab(win, state, openUrl);
    return { action: 'deny' };
  });

  // Başlangıç başlığı: boş sekme → "Yeni Sekme", aksi halde alan adı.
  const isBlank = !url || url === 'about:blank';
  let initialTitle = 'Yeni Sekme';
  if (!isBlank) { try { initialTitle = new URL(url).hostname || url; } catch { initialTitle = url; } }

  state.tabs.set(tabId, {
    view,
    url:          url,
    title:        initialTitle,
    startTime:    Date.now(),
    blockedCount: 0,
  });

  view.webContents.loadURL(url).catch(() => {});

  // ── Glance polling ──
  const glancePoll = setInterval(async () => {
    const tab = state.tabs.get(tabId);
    if (!tab) { clearInterval(glancePoll); return; }
    if (tabId !== state.activeTabId) return;
    try {
      const result = await view.webContents.executeJavaScript(
        '(function(){ var r=window.__glancePending; window.__glancePending=null; return r||null; })()'
      );
      // Sayfa JS'i güvenilmezdir — yalnızca http(s) URL'leri kabul et
      if (result && typeof result.url === 'string' && /^https?:\/\//i.test(result.url)
          && win && !win.isDestroyed()) {
        win.webContents.send('glance-request', result);
      }
    } catch {}
  }, 500);

  state.tabs.get(tabId).__glancePoll = glancePoll;

  return tabId;
}

function resizeActiveView(win, state) {
  const tab = state.tabs.get(state.activeTabId);
  if (!tab || !win || win.isDestroyed()) return;
  // Renderer view'ı bilerek gizlediyse (ekran overlay açık) gizli tut —
  // panel-opened / pencere resize olayları gizliliği bozmasın.
  if (state.viewHidden) {
    tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  const bounds = win.getContentBounds();
  const usableWidth = bounds.width - SIDEBAR_WIDTH;
  tab.view.setBounds({
    x:      SIDEBAR_WIDTH,
    y:      TOOLBAR_HEIGHT,
    width:  state.panelIsOpen ? Math.max(usableWidth - PANEL_WIDTH, 100) : usableWidth,
    height: bounds.height - TOOLBAR_HEIGHT - STATUSBAR_HEIGHT,
  });
}

function setActiveTab(win, state, tabId) {
  const tab = state.tabs.get(tabId);
  if (!tab || !win || win.isDestroyed()) return;

  const views = win.getBrowserViews();
  views.forEach(v => win.removeBrowserView(v));

  win.addBrowserView(tab.view);
  state.activeTabId = tabId;

  resizeActiveView(win, state);
  tab.view.setAutoResize({ width: false, height: false });

  sendTabsUpdate(win, state);
}

function closeTab(win, state, tabId) {
  const tab = state.tabs.get(tabId);
  if (!tab) return;

  if (tab.__glancePoll) clearInterval(tab.__glancePoll);

  if (win && !win.isDestroyed()) win.removeBrowserView(tab.view);
  tab.view.webContents.destroy();
  state.tabs.delete(tabId);

  if (state.tabs.size === 0) {
    // Son sekme kapandı → boş sekme (İlgezdi yeni sekme sayfası) aç
    const newId = createTab(win, state, 'about:blank');
    setActiveTab(win, state, newId);
  } else if (state.activeTabId === tabId) {
    const remaining = [...state.tabs.keys()];
    setActiveTab(win, state, remaining[remaining.length - 1]);
  }
  sendTabsUpdate(win, state);
}

function sendTabsUpdate(win, state) {
  if (!win || win.isDestroyed()) return;
  const tabsData = [...state.tabs.entries()].map(([id, tab]) => ({
    id, url: tab.url, title: tab.title, isActive: id === state.activeTabId,
  }));
  win.webContents.send('tabs-update', tabsData);
  win.webContents.send('active-url', state.tabs.get(state.activeTabId)?.url || '');
  if (vpnManager) {
    win.webContents.send('vpn-status', vpnManager.getStatus());
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Sekme — her handler hangi pencereden geldiğini tespit eder
ipcMain.handle('new-tab', (event, url) => {
  const { win, state } = getContextFromEvent(event);
  const id = createTab(win, state, url);
  setActiveTab(win, state, id);
  return id;
});

ipcMain.handle('switch-tab', (event, tabId) => {
  const { win, state } = getContextFromEvent(event);
  setActiveTab(win, state, tabId);
});

ipcMain.handle('close-tab', (event, tabId) => {
  const { win, state } = getContextFromEvent(event);
  closeTab(win, state, tabId);
});

ipcMain.handle('navigate', (event, url) => {
  const { state } = getContextFromEvent(event);
  const tab = state.tabs.get(state.activeTabId);
  if (!tab) return;
  let finalUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    finalUrl = url.includes('.') && !url.includes(' ')
      ? 'https://' + url
      : searchUrl(url);
  }
  tab.view.webContents.loadURL(finalUrl);
  tab.url = finalUrl;
});

ipcMain.handle('go-back', (event) => {
  const { state } = getContextFromEvent(event);
  const t = state.tabs.get(state.activeTabId);
  if (t?.view.webContents.canGoBack()) t.view.webContents.goBack();
});

ipcMain.handle('go-forward', (event) => {
  const { state } = getContextFromEvent(event);
  const t = state.tabs.get(state.activeTabId);
  if (t?.view.webContents.canGoForward()) t.view.webContents.goForward();
});

ipcMain.handle('reload', (event) => {
  const { state } = getContextFromEvent(event);
  state.tabs.get(state.activeTabId)?.view.webContents.reload();
});

// Config
ipcMain.handle('get-config',  ()          => config);
ipcMain.handle('save-config', (e, newCfg) => {
  config = { ...config, ...newCfg };
  saveConfig(config);
  return config;
});

// DB logları (eski, uyumluluk için)
ipcMain.handle('get-logs', (e, limit = 100) => {
  if (!db) return [];
  try {
    const rows = db.exec('SELECT * FROM visits ORDER BY timestamp DESC LIMIT ' + parseInt(limit));
    if (!rows.length) return [];
    const cols = rows[0].columns;
    return rows[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
  } catch { return []; }
});

ipcMain.handle('get-blocked-stats', () => {
  if (!db) return { total: 0, today: 0 };
  try {
    const totalRes = db.exec('SELECT COUNT(*) as c FROM blocked_requests');
    const todayRes = db.exec('SELECT COUNT(*) as c FROM blocked_requests WHERE timestamp > ' + (Date.now() - 86400000));
    return {
      total: totalRes[0]?.values[0][0] || 0,
      today: todayRes[0]?.values[0][0] || 0,
    };
  } catch { return { total: 0, today: 0 }; }
});

// VPN
ipcMain.handle('vpn-get-profiles',   ()           => vpnManager?.getProfiles() || []);
ipcMain.handle('vpn-add-profile',    (e, profile) => vpnManager?.addProfile(profile));
ipcMain.handle('vpn-remove-profile', (e, id)      => { vpnManager?.removeProfile(id); });
ipcMain.handle('vpn-connect',        async (e, profileId) => {
  try {
    return await vpnManager?.connect(profileId);
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('vpn-disconnect', async () => {
  try {
    await vpnManager?.disconnect();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('vpn-get-status',    ()     => vpnManager?.getStatus() || { status: 'disconnected' });
ipcMain.handle('vpn-ping-all',      async () => vpnManager?.pingAllProfiles() || {});
ipcMain.handle('vpn-test-dns-leak', async () => testDnsLeak());

// Faz 3 — Şifreli Loglar
ipcMain.handle('logs-get-stats',  ()            => secureLog?.getStats() || {});
ipcMain.handle('logs-search',     (e, query)    => secureLog?.search(query) || { items: [], total: 0, pages: 1, page: 1 });
ipcMain.handle('logs-export-csv', (e, query)    => secureLog?.exportCSV(query) || '');
ipcMain.handle('logs-clear',      ()            => { secureLog?.clearLogs(); return true; });
ipcMain.handle('logs-sync',       async (e, { serverUrl, apiKey }) => {
  return await secureLog?.syncToServer(serverUrl, apiKey) || { synced: 0, success: false };
});

// Faz 4 — Ayarlar & Özelleştirme
ipcMain.handle('pick-download-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'İndirme klasörü seç',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    config.downloadFolder = result.filePaths[0];
    saveConfig(config);
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('clear-cache', async () => {
  try {
    await session.defaultSession.clearCache();
    for (const [, tab] of mainState.tabs) {
      await tab.view.webContents.session.clearCache().catch(() => {});
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clear-cookies', async () => {
  try {
    await session.defaultSession.clearStorageData({ storages: ['cookies'] });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clear-all', async () => {
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage', 'shadercache', 'indexdb', 'websql'],
    });
    secureLog?.clearLogs();
    // Site izin kararlarını da sıfırla — siteler yeniden sorabilir
    if (config.permissionDecisions) {
      config.permissionDecisions = {};
      saveConfig(config);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('show-notification', (e, { title, body }) => {
  if (!config.vpnNotify) return;
  const { Notification } = require('electron');
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '../renderer/assets/ilgezdi-logo.png') }).show();
  }
});

ipcMain.handle('blocker-get-stats', () => getBlockStats());

ipcMain.handle('blocker-update-config', (event, blockerCfg) => {
  updateBlockerConfig(blockerCfg);
  return { ok: true };
});

// Panel & Pencere
ipcMain.handle('bookmark-popup-open', (e, { x, y, data }) => {
  if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
    bookmarkPopupWin.close();
    bookmarkPopupWin = null;
    return { ok: false };
  }

  // İsteği yapan pencereyi (ana ya da incognito) baz al — sabit mainWindow değil.
  const ownerWin = BrowserWindow.fromWebContents(e.sender) || mainWindow;
  const winBounds = ownerWin.getBounds();

  let px = Math.round(winBounds.x + x) - 280 + 20;
  let py = Math.round(winBounds.y + y) + 30;

  const { screen } = require('electron');
  const display = screen.getDisplayNearestPoint({ x: px, y: py });
  if (px + 300 > display.workArea.x + display.workArea.width) {
    px = display.workArea.x + display.workArea.width - 310;
  }

  bookmarkPopupWin = new BrowserWindow({
    x: px, y: py,
    width: 300, height: 230,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/popup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });

  hardenChromeWindow(bookmarkPopupWin);

  bookmarkPopupWin.__owner = ownerWin;
  bookmarkPopupWin.loadFile(path.join(__dirname, '../renderer/bookmark-popup.html'));

  bookmarkPopupWin.once('ready-to-show', () => {
    bookmarkPopupWin.show();
  });

  bookmarkPopupWin.webContents.on('did-finish-load', () => {
    if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
      setTimeout(() => {
        bookmarkPopupWin.webContents.send('bookmark-popup-data', data);
      }, 100);
    }
  });

  bookmarkPopupWin.on('closed', () => {
    if (ownerWin && !ownerWin.isDestroyed()) {
      ownerWin.webContents.send('bookmark-popup-closed');
    }
    bookmarkPopupWin = null;
  });

  return { ok: true };
});

ipcMain.handle('bookmark-popup-close', () => {
  if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
    bookmarkPopupWin.close();
    bookmarkPopupWin = null;
  }
  return { ok: true };
});

ipcMain.handle('bookmark-popup-save', (e, result) => {
  const owner = bookmarkPopupWin?.__owner;
  if (owner && !owner.isDestroyed()) {
    owner.webContents.send('bookmark-popup-result', { action: 'save', ...result });
  }
  if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
    bookmarkPopupWin.close();
    bookmarkPopupWin = null;
  }
  return { ok: true };
});

ipcMain.handle('bookmark-popup-delete', () => {
  const owner = bookmarkPopupWin?.__owner;
  if (owner && !owner.isDestroyed()) {
    owner.webContents.send('bookmark-popup-result', { action: 'delete' });
  }
  if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
    bookmarkPopupWin.close();
    bookmarkPopupWin = null;
  }
  return { ok: true };
});

ipcMain.handle('hide-active-tab', (event) => {
  const { state } = getContextFromEvent(event);
  state.viewHidden = true;
  const tab = state.tabs.get(state.activeTabId);
  if (tab) tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
});

ipcMain.handle('show-active-tab', (event) => {
  const { win, state } = getContextFromEvent(event);
  state.viewHidden = false;
  resizeActiveView(win, state);
});

ipcMain.on('panel-opened', (event, isOpen) => {
  const { win, state } = getContextFromEvent(event);
  state.panelIsOpen = isOpen;
  resizeActiveView(win, state);
});

// Pencere kontrollerini doğru pencereye yönlendir
ipcMain.on('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ─── Uygulama Yaşam Döngüsü ───────────────────────────────────────────────────
app.whenReady().then(() => {
  // Windows: görev çubuğu / bildirimlerde doğru uygulama kimliği + ikon eşleşmesi
  if (process.platform === 'win32') app.setAppUserModelId('com.ilgezdi.browser');
  initDB();
  vpnManager = new VpnManager(USER_DATA);
  secureLog  = new SecureLogManager(USER_DATA);

  vpnManager.onStatusChange(() => {
    mainWindow?.webContents.send('vpn-status', vpnManager.getStatus());
    if (incognitoWindow && !incognitoWindow.isDestroyed()) {
      incognitoWindow.webContents.send('vpn-status', vpnManager.getStatus());
    }
  });

  configureSession(session.defaultSession);
  createWindow();

  // Arku Uzak Masaüstü eklentisi: arka plan sürüm denetimi + kullanıcı onaylı güncelleme
  setupBookmarkImport(ipcMain, () => mainWindow);

  setupArku(ipcMain, {
    userDataPath: USER_DATA,
    getMainWindow: () => mainWindow,
    forEachTabView: (cb) => {
      for (const [, tab] of mainState.tabs) cb(tab.view);
      for (const [, tab] of incognitoState.tabs) cb(tab.view);
    },
  });

  if (config.vpnAutoConnect && config.vpnLastProfileId) {
    setTimeout(() => {
      vpnManager.connect(config.vpnLastProfileId).catch(e => {
        console.warn('[VPN] Otomatik bağlantı başarısız:', e.message);
      });
    }, 2000);
  }

  setTimeout(() => {
    if (mainState.tabs.size === 0) {
      // Kullanıcının belirlediği anasayfayı aç (boşsa İlgezdi başlangıç sayfası)
      const id = createTab(mainWindow, mainState, homepageUrl());
      setActiveTab(mainWindow, mainState, id);
    }
  }, 800);
});

app.on('window-all-closed', async () => {
  if (vpnManager?.activeProfile) {
    await vpnManager.disconnect().catch(() => {});
  }
  secureLog?.saveLogs();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function createIncognitoWindow() {
  if (incognitoWindow && !incognitoWindow.isDestroyed()) {
    incognitoWindow.focus();
    return;
  }

  // Önceki incognito state'i temizle
  incognitoState.tabs.clear();
  incognitoState.activeTabId = null;
  incognitoState.tabCounter = 0;
  incognitoState.panelIsOpen = false;
  incognitoState.viewHidden = false;

  incognitoWindow = new BrowserWindow({
    width: 1200, height: 800,
    frame: false,
    backgroundColor: '#0a0e1a',
    title: 'İlgezdi — Gizli Pencere',
    icon: path.join(__dirname, '../renderer/assets/app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  hardenChromeWindow(incognitoWindow);
  incognitoWindow.on('resize', () => resizeActiveView(incognitoWindow, incognitoState));

  incognitoWindow.once('ready-to-show', () => incognitoWindow.show());
  incognitoWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Renderer yüklenince ilk sekmeyi oluştur
  incognitoWindow.webContents.on('did-finish-load', () => {
    if (incognitoWindow && !incognitoWindow.isDestroyed() && incognitoState.tabs.size === 0) {
      const id = createTab(incognitoWindow, incognitoState, 'about:blank');
      setActiveTab(incognitoWindow, incognitoState, id);
    }
  });

  incognitoWindow.on('closed', () => {
    // Tüm incognito sekmelerini ve polling'leri temizle
    for (const [, tab] of incognitoState.tabs) {
      if (tab.__glancePoll) clearInterval(tab.__glancePoll);
      try { tab.view.webContents.destroy(); } catch {}
    }
    incognitoState.tabs.clear();
    incognitoState.activeTabId = null;
    incognitoWindow = null;
  });
}

ipcMain.handle('open-incognito', () => {
  createIncognitoWindow();
});

// ─── Auth (Üyelik Sistemi) ────────────────────────────────────────────────────
// Oturum (refresh token dahil) diske DÜZ METİN yazılmaz: safeStorage
// (Windows DPAPI / macOS Keychain / Linux Secret Service) ile şifrelenir.
// Şifreleme kullanılamıyorsa (nadir, ör. keyring'siz Linux) oturum kalıcı
// saklanmaz — kullanıcı yeniden giriş yapar; token sızdırmaktan iyidir.

function readAuthSession() {
  // Yeni format: şifreli blob
  if (config.authSessionEnc) {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return JSON.parse(safeStorage.decryptString(Buffer.from(config.authSessionEnc, 'base64')));
    } catch { return null; }
  }
  // Eski format (düz metin) → şifreli formata taşı
  if (config.authSession) {
    const legacy = config.authSession;
    writeAuthSession(legacy);
    return legacy;
  }
  return null;
}

function writeAuthSession(sessionData) {
  delete config.authSession; // düz metin kopya asla kalmasın
  if (sessionData && safeStorage.isEncryptionAvailable()) {
    config.authSessionEnc = safeStorage.encryptString(JSON.stringify(sessionData)).toString('base64');
  } else {
    delete config.authSessionEnc;
  }
  saveConfig(config);
}

ipcMain.handle('auth-get-session', () => readAuthSession());

ipcMain.handle('auth-save-session', (e, sessionData) => {
  writeAuthSession(sessionData);
  return true;
});

ipcMain.handle('auth-clear-session', () => {
  delete config.authSession;
  delete config.authSessionEnc;
  saveConfig(config);
  return true;
});

// QR kodu yerelde üretilir (üçüncü taraf QR servisi kullanılmaz — token sızmasın)
ipcMain.handle('qr-generate', async (e, text) => {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(String(text), {
    width: 180, margin: 2,
    color: { dark: '#d4a85aff', light: '#0e1a2eff' },
  });
});

ipcMain.handle('is-incognito', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return !!(incognitoWindow && !incognitoWindow.isDestroyed() && win && win.id === incognitoWindow.id);
});

console.log('[İlgezdi] Başlatıldı. UserData:', USER_DATA);
