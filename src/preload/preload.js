/**
 * İlgezdi — Preload Script (Faz 4)
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('secureBrowser', {

  blocker: {
    getStats:      () => ipcRenderer.invoke('blocker-get-stats'),
    updateConfig:  (cfg) => ipcRenderer.invoke('blocker-update-config', cfg),
    onStats:       (cb) => ipcRenderer.on('block-stats', (_, data) => cb(data)),
  },

  glance: {
    open:         (data) => ipcRenderer.invoke('glance-open', data),
    close:        ()     => ipcRenderer.invoke('glance-close'),
    openTab:      ()     => ipcRenderer.invoke('glance-open-tab'),
    onLoaded:     (cb)   => ipcRenderer.on('glance-loaded',  (_, d) => cb(d)),
    onClosed:     (cb)   => ipcRenderer.on('glance-closed',  ()     => cb()),
    onNewTab:     (cb)   => ipcRenderer.on('glance-new-tab', (_, d) => cb(d)),
    onError:      (cb)   => ipcRenderer.on('glance-error',   ()     => cb()),
    onOpenRequest:(cb)   => ipcRenderer.on('glance-request', (_, d) => cb(d)),
  },

  // ── Sekme Yönetimi ──────────────────────────────────────────────────────────
  newTab:    (url) => ipcRenderer.invoke('new-tab', url),
  switchTab: (id)  => ipcRenderer.invoke('switch-tab', id),
  closeTab:  (id)  => ipcRenderer.invoke('close-tab', id),

  openIncognito: () => ipcRenderer.invoke('open-incognito'),
  isIncognito:   () => ipcRenderer.invoke('is-incognito'),

  // ── Navigasyon ──────────────────────────────────────────────────────────────
  navigate:  (url) => ipcRenderer.invoke('navigate', url),
  goBack:    ()    => ipcRenderer.invoke('go-back'),
  goForward: ()    => ipcRenderer.invoke('go-forward'),
  reload:    ()    => ipcRenderer.invoke('reload'),

  // ── Ayarlar ─────────────────────────────────────────────────────────────────
  getConfig:  ()    => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),

  // ── İndirmeler ──────────────────────────────────────────────────────────────
  // (Eski getLogs / getBlockedStats kaldırıldı: hiç yazılmayan ölü bir sql.js
  //  tablosundan okuyor, hep boş/0 dönüyordu — denetim O-01.)
  downloads: {
    list:         ()   => ipcRenderer.invoke('downloads-list'),
    showInFolder: (id) => ipcRenderer.invoke('downloads-show', id),
    cancel:       (id) => ipcRenderer.invoke('downloads-cancel', id),
    onUpdated:    (cb) => ipcRenderer.on('download-updated', (_, d) => cb(d)),
  },

  // ── VPN (Faz 2) ──────────────────────────────────────────────────────────────
  vpn: {
    getProfiles:  ()        => ipcRenderer.invoke('vpn-get-profiles'),
    addProfile:   (profile) => ipcRenderer.invoke('vpn-add-profile', profile),
    removeProfile:(id)      => ipcRenderer.invoke('vpn-remove-profile', id),
    connect:      (id)      => ipcRenderer.invoke('vpn-connect', id),
    disconnect:   ()        => ipcRenderer.invoke('vpn-disconnect'),
    getStatus:    ()        => ipcRenderer.invoke('vpn-get-status'),
    pingAll:      ()        => ipcRenderer.invoke('vpn-ping-all'),
    testDnsLeak:  ()        => ipcRenderer.invoke('vpn-test-dns-leak'),
  },

  // ── Şifreli Loglar (Faz 3) ───────────────────────────────────────────────────
  logs: {
    getStats:  ()            => ipcRenderer.invoke('logs-get-stats'),
    search:    (query)       => ipcRenderer.invoke('logs-search', query),
    exportCSV: (query)       => ipcRenderer.invoke('logs-export-csv', query),
    clearLogs: ()            => ipcRenderer.invoke('logs-clear'),
    sync:      (url, apiKey) => ipcRenderer.invoke('logs-sync', { serverUrl: url, apiKey }),
  },

  // ── Sekme Görünürlüğü (Faz 5) ───────────────────────────────────────────────
  hideActiveTab: () => ipcRenderer.invoke('hide-active-tab'),
  showActiveTab: () => ipcRenderer.invoke('show-active-tab'),

  // ── Özelleştirme & Ayarlar (Faz 4) ──────────────────────────────────────────
  pickDownloadFolder: ()             => ipcRenderer.invoke('pick-download-folder'),
  clearCache:         ()             => ipcRenderer.invoke('clear-cache'),
  clearCookies:       ()             => ipcRenderer.invoke('clear-cookies'),
  clearAll:           ()             => ipcRenderer.invoke('clear-all'),
  showNotification:   (title, body)  => ipcRenderer.invoke('show-notification', { title, body }),

  // ── Pencere Kontrolleri ──────────────────────────────────────────────────────
  minimize:    ()       => ipcRenderer.send('window-minimize'),
  maximize:    ()       => ipcRenderer.send('window-maximize'),
  close:       ()       => ipcRenderer.send('window-close'),
  panelOpened: (isOpen) => ipcRenderer.send('panel-opened', isOpen),

   // ── Bookmark Popup ──────────────────────────────────────────────────────────
  bookmarkPopupOpen:   (data) => ipcRenderer.invoke('bookmark-popup-open', data),
  bookmarkPopupClose:  ()     => ipcRenderer.invoke('bookmark-popup-close'),
  bookmarkPopupSave:   (r)    => ipcRenderer.invoke('bookmark-popup-save', r),
  bookmarkPopupDelete: ()     => ipcRenderer.invoke('bookmark-popup-delete'),
  onBookmarkPopupData:   (cb) => ipcRenderer.on('bookmark-popup-data',   (_, d) => cb(d)),
  onBookmarkPopupResult: (cb) => ipcRenderer.on('bookmark-popup-result', (_, d) => cb(d)),
  onBookmarkPopupClosed: (cb) => ipcRenderer.on('bookmark-popup-closed', ()     => cb()),

  // ── Arku Uzak Masaüstü eklentisi ─────────────────────────────────────────────
  arku: {
    getInfo:           ()   => ipcRenderer.invoke('arku-get-info'),
    getUrl:            ()   => ipcRenderer.invoke('arku-open-url'),
    checkUpdate:       ()   => ipcRenderer.invoke('arku-check-update'),
    applyUpdate:       ()   => ipcRenderer.invoke('arku-apply-update'),
    onUpdateAvailable: (cb) => ipcRenderer.on('arku-update-available', (_, info) => cb(info)),
  },

  // ── QR üretimi (yerel, çevrimdışı) ──────────────────────────────────────────
  qrGenerate: (text) => ipcRenderer.invoke('qr-generate', text),

  // ── Otomatik güncelleme ──────────────────────────────────────────────────────
  updater: {
    check:          ()  => ipcRenderer.invoke('updater-check'),
    download:       ()  => ipcRenderer.invoke('updater-download'),
    install:        ()  => ipcRenderer.invoke('updater-install'),
    currentVersion: ()  => ipcRenderer.invoke('updater-current-version'),
    onStatus:       (cb) => ipcRenderer.on('updater-status', (_, d) => cb(d)),
  },

  // ── Yer imi içe aktarma ──────────────────────────────────────────────────────
  bookmarks: {
    detect:        ()   => ipcRenderer.invoke('bm-import-detect'),
    importBrowser: (id) => ipcRenderer.invoke('bm-import-browser', id),
    importFile:    ()   => ipcRenderer.invoke('bm-import-file'),
  },

  // ── Şifre yöneticisi ─────────────────────────────────────────────────────────
  passwords: {
    list:                ()   => ipcRenderer.invoke('pw-list'),
    reveal:              (id) => ipcRenderer.invoke('pw-reveal', id),
    add:                 (e)  => ipcRenderer.invoke('pw-add', e),
    update:              (e)  => ipcRenderer.invoke('pw-update', e),
    delete:              (id) => ipcRenderer.invoke('pw-delete', id),
    count:               ()   => ipcRenderer.invoke('pw-count'),
    encryptionAvailable: ()   => ipcRenderer.invoke('pw-encryption-available'),
    importDetect:        ()   => ipcRenderer.invoke('pw-import-detect'),
    importBrowser:       (id) => ipcRenderer.invoke('pw-import-browser', id),
    importCsv:           ()   => ipcRenderer.invoke('pw-import-csv'),
    forOrigin:           (o)  => ipcRenderer.invoke('pw-for-origin', o),
  },

  // ── Auth (Üyelik Sistemi) ────────────────────────────────────────────────────
  auth: {
    saveSession:  (s) => ipcRenderer.invoke('auth-save-session', s),
    getSession:   ()  => ipcRenderer.invoke('auth-get-session'),
    clearSession: ()  => ipcRenderer.invoke('auth-clear-session'),
  },

  // ── Tanılama / hata bildirimi ────────────────────────────────────────────────
  // Ziyaret geçmişi DEĞİL, uygulamanın kendi sağlığı. Gönderilen her şey
  // kimliksizleştirilir ve kullanıcı onayına bağlıdır (bkz. diagnostics.js).
  diag: {
    reportError:     (info)  => ipcRenderer.send('diag-renderer-error', info),
    log:             (entry) => ipcRenderer.send('diag-log', entry),
    getRecent:       (n)     => ipcRenderer.invoke('diag-get-recent', n),
    getSummary:      ()      => ipcRenderer.invoke('diag-get-summary'),
    previewReport:   (note)  => ipcRenderer.invoke('diag-preview-report', note),
    sendReport:      (note)  => ipcRenderer.invoke('diag-send-report', note),
    exportReport:    (note)  => ipcRenderer.invoke('diag-export-report', note),
    setConsent:      (v)     => ipcRenderer.invoke('diag-set-consent', v),
    openLogFolder:   ()      => ipcRenderer.invoke('diag-open-log-folder'),
    resetIdentity:   ()      => ipcRenderer.invoke('diag-reset-identity'),
  },

  // ── Sayfada bul (Ctrl+F) ─────────────────────────────────────────────────────
  // newSession: yazılan metin değişti (yeni arama); false: sonraki/önceki eşleşme.
  find: {
    start:    (text, opts) => ipcRenderer.invoke('find-in-page', { text, forward: opts?.forward !== false, newSession: !!opts?.newSession }),
    stop:     (opts)       => ipcRenderer.invoke('stop-find-in-page', { focusPage: !!opts?.focusPage }),
    onResult: (cb)         => ipcRenderer.on('find-result', (_, d) => cb(d)),
    onReset:  (cb)         => ipcRenderer.on('find-reset',  ()     => cb()),
  },

  // ── Yakınlaştırma (etkin sekme) ──────────────────────────────────────────────
  zoom: {
    reset:     ()   => ipcRenderer.invoke('zoom-reset'),
    onChanged: (cb) => ipcRenderer.on('zoom-changed', (_, d) => cb(d)),
  },

  // ── Site bilgisi ve izinler (kilit simgesi) ──────────────────────────────────
  site: {
    info:             ()        => ipcRenderer.invoke('site-info'),
    setPermission:    (o, p, d) => ipcRenderer.invoke('site-permission-set', { origin: o, permission: p, decision: d }),
    listPermissions:  ()        => ipcRenderer.invoke('site-permissions-list'),
    resetPermissions: ()        => ipcRenderer.invoke('site-permissions-reset'),
    clearData:        (o)       => ipcRenderer.invoke('site-data-clear', { origin: o }),
    openBlockedPopup: (i)       => ipcRenderer.invoke('popup-open-blocked', i),
    onPopupState:     (cb)      => ipcRenderer.on('popup-state', (_, d) => cb(d)),
  },

  // ── Sekme işlemleri (sabitle, sessize al, taşı, sağ tık menüsü) ───────────────
  tabs: {
    action:      (id, action, toIndex) => ipcRenderer.invoke('tab-action', { tabId: id, action, toIndex }),
    contextMenu: (id)                  => ipcRenderer.invoke('tab-context-menu', { tabId: id }),
  },

  // Ana süreçteki kısayollardan arayüze iletilen komutlar (bkz. browser-commands.js)
  onBrowserCommand:   (cb) => ipcRenderer.on('browser-command', (_, cmd) => cb(cmd)),

  // ── Event Dinleyiciler ───────────────────────────────────────────────────────
  onTabsUpdate:       (cb) => ipcRenderer.on('tabs-update', (e, data) => cb(data)),
  onActiveUrl:        (cb) => ipcRenderer.on('active-url',  (e, url)  => cb(url)),
  onVpnStatus:        (cb) => ipcRenderer.on('vpn-status',  (e, data) => cb(data)),
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),

});