/**
 * İlgezdi Browser — Ana Electron Süreci (Faz 2+3+4)
 */

'use strict';

const { app, BrowserWindow, BrowserView, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

const { SecureLogManager } = require('./secure-log-manager');
const { VpnManager, testDnsLeak } = require('./vpn-manager');
const { setupBlocker, updateBlockerConfig, getBlockStats } = require('./blocker-main');
const { setupGlance } = require('./glance-main');

let incognitoWindow = null;
const incognitoTabs = new Map();
let activeIncognitoTabId = null;
let incognitoTabCounter = 0;

const USER_DATA = app.getPath('userData');
const DB_PATH   = path.join(USER_DATA, 'logs.db');
const CFG_PATH  = path.join(USER_DATA, 'config.json');

const DEFAULT_CONFIG = {
  homepage:              'https://start.duckduckgo.com',
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
  fontFamily:            "'DM Sans', sans-serif",
  accentColor:           '#c8803a',
};

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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];
let currentUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

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

function configureSession(ses) {
  if (config.fingerprintProtection) {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['User-Agent'] = currentUA;
      delete headers['X-Forwarded-For'];
      delete headers['Via'];
      delete headers['X-WebRTC-IP'];
      callback({ requestHeaders: headers });
    });
  }

  if (config.blockTrackers || config.blockAds) {
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      if (isBlocked(details.url)) {
        callback({ cancel: true });
      } else {
        callback({});
      }
    });
  }

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Strict-Transport-Security'] = ['max-age=31536000; includeSubDomains'];
    headers['X-Content-Type-Options'] = ['nosniff'];
    headers['X-Frame-Options']        = ['SAMEORIGIN'];
    callback({ responseHeaders: headers });
  });
}

let mainWindow = null;
let bookmarkPopupWin = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    frame: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  });

  mainWindow.on('minimize', () => {
    if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
      bookmarkPopupWin.close();
      bookmarkPopupWin = null;
    }
  });

  setupBlocker(session.defaultSession, mainWindow);
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

const tabs = new Map();
let activeTabId = null;
let tabCounter  = 0;

function createTab(url = config.homepage) {
  const tabId = ++tabCounter;
  const view  = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: 'persist:securebrowser',
    }
  });
 
  configureSession(view.webContents.session);
 
  view.webContents.on('page-title-updated', (e, title) => {
    const tab = tabs.get(tabId);
    if (tab) tab.title = title;
    sendTabsUpdate();
  });
 
  view.webContents.on('did-navigate', (e, navUrl) => {
    const tab = tabs.get(tabId);
    if (tab) tab.url = navUrl;
    sendTabsUpdate();
  });
 
  view.webContents.on('did-navigate-in-page', (e, navUrl) => {
    const tab = tabs.get(tabId);
    if (tab) tab.url = navUrl;
    sendTabsUpdate();
  });
 
  view.webContents.on('did-finish-load', () => {
    const tab = tabs.get(tabId);
    if (!tab) return;
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
 
  view.webContents.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });
 
  tabs.set(tabId, {
    view,
    url:          url,
    title:        'Yükleniyor...',
    startTime:    Date.now(),
    blockedCount: 0,
  });
 
  view.webContents.loadURL(url).catch(() => {});
 
  // ── Glance polling: 500ms'de bir Alt+tıklama var mı kontrol et ──
  const glancePoll = setInterval(async () => {
    const tab = tabs.get(tabId);
    if (!tab) { clearInterval(glancePoll); return; }
    if (tabId !== activeTabId) return; // Sadece aktif sekmeyi kontrol et
    try {
      const result = await view.webContents.executeJavaScript(
        '(function(){ var r=window.__glancePending; window.__glancePending=null; return r||null; })()'
      );
      if (result && result.url && mainWindow) {
        mainWindow.webContents.send('glance-request', result);
      }
    } catch {}
  }, 500);
 
  // Tab'a poll referansını sakla — closeTab'da durdurabilmek için
  tabs.get(tabId).__glancePoll = glancePoll;
 
  return tabId;
}

let panelIsOpen = false;
const PANEL_WIDTH    = 420;
const TOOLBAR_HEIGHT = 122;

function resizeActiveView() {
  const tab = tabs.get(activeTabId);
  if (!tab || !mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  tab.view.setBounds({
    x:      0,
    y:      TOOLBAR_HEIGHT,
    width:  panelIsOpen ? Math.max(bounds.width - PANEL_WIDTH, 100) : bounds.width,
    height: bounds.height - TOOLBAR_HEIGHT,
  });
}

function setActiveTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab || !mainWindow) return;

  const views = mainWindow.getBrowserViews();
  views.forEach(v => mainWindow.removeBrowserView(v));

  mainWindow.addBrowserView(tab.view);
  activeTabId = tabId;

  resizeActiveView();
  tab.view.setAutoResize({ width: false, height: false });
  mainWindow.on('resize', () => resizeActiveView());

  sendTabsUpdate();
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
 
  // Glance polling'i durdur
  if (tab.__glancePoll) clearInterval(tab.__glancePoll);
 
  if (mainWindow) mainWindow.removeBrowserView(tab.view);
  tab.view.webContents.destroy();
  tabs.delete(tabId);
 
  if (tabs.size === 0) {
    const newId = createTab();
    setActiveTab(newId);
  } else if (activeTabId === tabId) {
    const remaining = [...tabs.keys()];
    setActiveTab(remaining[remaining.length - 1]);
  }
  sendTabsUpdate();
}

function sendTabsUpdate() {
  if (!mainWindow) return;
  const tabsData = [...tabs.entries()].map(([id, tab]) => ({
    id, url: tab.url, title: tab.title, isActive: id === activeTabId,
  }));
  mainWindow.webContents.send('tabs-update', tabsData);
  mainWindow.webContents.send('active-url', tabs.get(activeTabId)?.url || '');
  if (vpnManager) {
    mainWindow.webContents.send('vpn-status', vpnManager.getStatus());
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Sekme
ipcMain.handle('new-tab',    (e, url)   => { const id = createTab(url); setActiveTab(id); return id; });
ipcMain.handle('switch-tab', (e, tabId) => setActiveTab(tabId));
ipcMain.handle('close-tab',  (e, tabId) => closeTab(tabId));

ipcMain.handle('navigate', (e, url) => {
  const tab = tabs.get(activeTabId);
  if (!tab) return;
  let finalUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    finalUrl = url.includes('.') && !url.includes(' ')
      ? 'https://' + url
      : 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
  }
  tab.view.webContents.loadURL(finalUrl);
  tab.url = finalUrl;
});

ipcMain.handle('go-back',    () => { const t = tabs.get(activeTabId); if (t?.view.webContents.canGoBack())    t.view.webContents.goBack(); });
ipcMain.handle('go-forward', () => { const t = tabs.get(activeTabId); if (t?.view.webContents.canGoForward()) t.view.webContents.goForward(); });
ipcMain.handle('reload',     () => tabs.get(activeTabId)?.view.webContents.reload());

// Config
ipcMain.handle('get-config',  ()          => config);
ipcMain.handle('save-config', (e, newCfg) => {
  config = { ...config, ...newCfg };
  saveConfig(config);
  if (config.userAgentRotation) {
    currentUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }
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
    for (const [, tab] of tabs) {
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
  // Zaten açıksa kapat
  if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
    bookmarkPopupWin.close();
    bookmarkPopupWin = null;
    return { ok: false }; // toggle
  }
 
  const winBounds = mainWindow.getBounds();
 
  // Popup konumu: yıldız butonunun altında, sağ tarafa hizalı
  let px = Math.round(winBounds.x + x) - 280 + 20;
  let py = Math.round(winBounds.y + y) + 30;
 
  // Ekrandan taşmasın
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
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
    }
  });
 
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
    bookmarkPopupWin = null;
    mainWindow.webContents.send('bookmark-popup-closed');
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
  mainWindow.webContents.send('bookmark-popup-result', { action: 'save', ...result });
  if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
    bookmarkPopupWin.close();
    bookmarkPopupWin = null;
  }
  return { ok: true };
});
 
ipcMain.handle('bookmark-popup-delete', (e) => {
  mainWindow.webContents.send('bookmark-popup-result', { action: 'delete' });
  if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
    bookmarkPopupWin.close();
    bookmarkPopupWin = null;
  }
  return { ok: true };
});

ipcMain.on('panel-opened', (e, isOpen) => {
  panelIsOpen = isOpen;
  resizeActiveView();
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window-close',    () => mainWindow?.close());

// ─── Uygulama Yaşam Döngüsü ───────────────────────────────────────────────────
app.whenReady().then(() => {
  initDB();
  vpnManager = new VpnManager(USER_DATA);
  secureLog  = new SecureLogManager(USER_DATA);

  vpnManager.onStatusChange(() => {
    mainWindow?.webContents.send('vpn-status', vpnManager.getStatus());
  });

  configureSession(session.defaultSession);
  createWindow();

  if (config.vpnAutoConnect && config.vpnLastProfileId) {
    setTimeout(() => {
      vpnManager.connect(config.vpnLastProfileId).catch(e => {
        console.warn('[VPN] Otomatik bağlantı başarısız:', e.message);
      });
    }, 2000);
  }

  setTimeout(() => {
    if (tabs.size === 0) {
      const id = createTab();
      setActiveTab(id);
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

  incognitoWindow = new BrowserWindow({
    width: 1200, height: 800,
    frame: false,
    backgroundColor: '#0a0e1a',
    title: 'İlgezdi — Gizli Pencere',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      session: session.fromPartition('incognito-' + Date.now()), // her açılışta temiz session
    },
    show: false,
  });

  incognitoWindow.once('ready-to-show', () => incognitoWindow.show());
  incognitoWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  incognitoWindow.on('closed', () => {
    incognitoWindow = null;
  });
}

ipcMain.handle('open-incognito', () => {
  createIncognitoWindow();
});

console.log('[İlgezdi] Başlatıldı. UserData:', USER_DATA);