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

  // ── Navigasyon ──────────────────────────────────────────────────────────────
  navigate:  (url) => ipcRenderer.invoke('navigate', url),
  goBack:    ()    => ipcRenderer.invoke('go-back'),
  goForward: ()    => ipcRenderer.invoke('go-forward'),
  reload:    ()    => ipcRenderer.invoke('reload'),

  // ── Ayarlar ─────────────────────────────────────────────────────────────────
  getConfig:  ()    => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),

  // ── Eski Log API (Faz 1-2 uyumu) ────────────────────────────────────────────
  getLogs:         (limit) => ipcRenderer.invoke('get-logs', limit),
  getBlockedStats: ()      => ipcRenderer.invoke('get-blocked-stats'),

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

  // ── Event Dinleyiciler ───────────────────────────────────────────────────────
  onTabsUpdate:       (cb) => ipcRenderer.on('tabs-update', (e, data) => cb(data)),
  onActiveUrl:        (cb) => ipcRenderer.on('active-url',  (e, url)  => cb(url)),
  onVpnStatus:        (cb) => ipcRenderer.on('vpn-status',  (e, data) => cb(data)),
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),

});