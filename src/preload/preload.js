/**
 * İlgezdi — Preload Script (Faz 4)
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Arayüz dili: ana süreçteki paket (dil kodu + Türkçeyle tamamlanmış sözlük) sayfa betikleri
// çalışmadan önce eşzamanlı alınır; i18n.js bunu window.T / window.TH yapar.
contextBridge.exposeInMainWorld('ilgezdiLocale', ipcRenderer.sendSync('i18n-bundle'));

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
  newTab:    (url, opts) => ipcRenderer.invoke('new-tab', url, opts && opts.background === true ? { background: true } : undefined),
  switchTab: (id)  => ipcRenderer.invoke('switch-tab', id),
  closeTab:  (id)  => ipcRenderer.invoke('close-tab', id),

  openIncognito: () => ipcRenderer.invoke('open-incognito'),
  isIncognito:   () => ipcRenderer.invoke('is-incognito'),

  // ── Navigasyon ──────────────────────────────────────────────────────────────
  navigate:  (url) => ipcRenderer.invoke('navigate', url),
  goBack:    ()    => ipcRenderer.invoke('go-back'),
  goForward: ()    => ipcRenderer.invoke('go-forward'),
  reload:    ()    => ipcRenderer.invoke('reload'),
  stop:      ()    => ipcRenderer.invoke('stop-loading'),

  // ── Site simgeleri (yer imleri için önbellekten; ağ isteği yok) ────────────────
  favicons: {
    lookup: (urls) => ipcRenderer.invoke('favicons-lookup', urls),
  },

  // ── Keşfet (TrendTech yazılımları) ────────────────────────────────────────────
  discover: {
    list: () => ipcRenderer.invoke('discover-list'),
  },
  // Keşfet yorumları ve Öneri sayfası: yalnızca İlgezdi sunucusu (main/community.js)
  community: {
    reviews:      (token) => ipcRenderer.invoke('community-reviews', token || ''),
    sendReview:   (payload) => ipcRenderer.invoke('community-review-send', payload),
    sendFeedback: (payload) => ipcRenderer.invoke('community-feedback-send', payload),
    myFeedback:   (token) => ipcRenderer.invoke('community-feedback-mine', token || ''),
  },

  // ── Ayarlar ─────────────────────────────────────────────────────────────────
  getConfig:  ()    => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  runtimeInfo:   () => ipcRenderer.invoke('app-runtime-info'),
  relaunch:      () => ipcRenderer.invoke('app-relaunch'),

  // ── İndirmeler ──────────────────────────────────────────────────────────────
  // (Eski getLogs / getBlockedStats kaldırıldı: hiç yazılmayan ölü bir sql.js
  //  tablosundan okuyor, hep boş/0 dönüyordu — denetim O-01.)
  downloads: {
    list:         ()   => ipcRenderer.invoke('downloads-list'),
    showInFolder: (id) => ipcRenderer.invoke('downloads-show', id),
    cancel:       (id) => ipcRenderer.invoke('downloads-cancel', id),
    open:         (id) => ipcRenderer.invoke('downloads-open', id),
    pause:        (id) => ipcRenderer.invoke('downloads-pause', id),
    remove:       (id) => ipcRenderer.invoke('downloads-remove', id),
    clear:        ()   => ipcRenderer.invoke('downloads-clear'),
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
  // Adres çubuğu önerileri: liste ayrı bir pencerede gösterilir (suggest-popup.js).
  suggest: {
    show: (payload) => ipcRenderer.invoke('suggest-show', payload),
    hide: ()        => ipcRenderer.invoke('suggest-hide'),
    onPicked: (cb)  => ipcRenderer.on('suggest-picked', (_e, url) => cb(url)),
  },
  logs: {
    getStats:  ()            => ipcRenderer.invoke('logs-get-stats'),
    search:    (query)       => ipcRenderer.invoke('logs-search', query),
    exportCSV: (query)       => ipcRenderer.invoke('logs-export-csv', query),
    clearLogs: ()            => ipcRenderer.invoke('logs-clear'),
    clearRange: (range)      => ipcRenderer.invoke('logs-clear-range', range),
    deleteEntries: (ids)     => ipcRenderer.invoke('logs-delete', ids),
    httpReport: ()           => ipcRenderer.invoke('logs-http-report'),
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
  // İçerik alanının sol kenarı (dikey sekmeler açılıp kapanınca sayfa görünümü kayar)
  setLayout:   (layout) => ipcRenderer.send('ui-layout', layout),

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

  // ── Varsayılan tarayıcı (Ayarlar › Genel) ────────────────────────────────────
  defaultBrowser: {
    status: () => ipcRenderer.invoke('default-browser-status'),
    set:    () => ipcRenderer.invoke('default-browser-set'),
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
    // Mevcut yer imlerinin simgeleri: tarayıcıların yerel simge önbelleğinden
    importFavicons: (urls) => ipcRenderer.invoke('bm-import-favicons', urls),
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
    // Kaydetme önerisi: öneride parola yoktur (site, kullanıcı adı, tür); karar kimlikle verilir.
    onSaveOffer:         (cb) => ipcRenderer.on('pw-save-offer', (_, d) => cb(d)),
    saveDecision:        (offerId, action) => ipcRenderer.invoke('pw-save-decision', { offerId, action }),
    neverList:           ()   => ipcRenderer.invoke('pw-never-list'),
    generate:            ()   => ipcRenderer.invoke('pw-generate'),
    audit:               ()   => ipcRenderer.invoke('pw-audit'),
    pwnedCheck:          ()   => ipcRenderer.invoke('pw-pwned-check'),
    // Oluşturulan şifre form gönderilince kaydedildi (bildirimde parola yok).
    onGeneratedSaved:    (cb) => ipcRenderer.on('pw-generated-saved', (_, d) => cb(d)),
    neverRemove:         (o)  => ipcRenderer.invoke('pw-never-remove', o),
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

  // ── Veri ve Gizlilik: izinler ve onay kayıtları ──────────────────────────────
  // set: tek bir izni açar/kapatır; ana süreç doğrular ve kayda yazar (consent-log.js).
  dataCenter: {
    state:     ()               => ipcRenderer.invoke('data-center-state'),
    set:       (id, value, src) => ipcRenderer.invoke('data-center-set', id, value, src),
    logList:   (opts)           => ipcRenderer.invoke('consent-log-list', opts || {}),
    logVerify: ()               => ipcRenderer.invoke('consent-log-verify'),
    logExport: ()               => ipcRenderer.invoke('consent-log-export'),
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

  // ── Zararlı site koruması (yerel tehdit listeleri) ────────────────────────────
  threats: {
    status:    () => ipcRenderer.invoke('threats-status'),
    updateNow: () => ipcRenderer.invoke('threats-update-now'),
    onStatus:  (cb) => ipcRenderer.on('threats-status-changed', (_, d) => cb(d)),
  },

  // ── Sekme işlemleri (sabitle, sessize al, taşı, sağ tık menüsü) ───────────────
  tabs: {
    action:      (id, action, toIndex) => ipcRenderer.invoke('tab-action', { tabId: id, action, toIndex }),
    contextMenu: (id)                  => ipcRenderer.invoke('tab-context-menu', { tabId: id }),
    addToGroup:  (id, groupId)         => ipcRenderer.invoke('tab-action', { tabId: id, action: 'group-add', groupId }),
  },

  // ── Profiller (her profil ayrı veri klasörü ve ayrı pencere) ──────────────────
  profiles: {
    list:   ()          => ipcRenderer.invoke('profiles-list'),
    create: (opts)      => ipcRenderer.invoke('profiles-create', opts),
    update: (id, patch) => ipcRenderer.invoke('profiles-update', id, patch),
    open:   (id)        => ipcRenderer.invoke('profiles-open', id),
    remove: (id)        => ipcRenderer.invoke('profiles-remove', id),
  },

  // ── Not defteri ──────────────────────────────────────────────────────────────
  notes: {
    state:      ()          => ipcRenderer.invoke('notes-state'),
    list:       (query)     => ipcRenderer.invoke('notes-list', query),
    get:        (id)        => ipcRenderer.invoke('notes-get', id),
    create:     (input)     => ipcRenderer.invoke('notes-create', input),
    update:     (id, patch) => ipcRenderer.invoke('notes-update', id, patch),
    attachPage: (id)        => ipcRenderer.invoke('notes-attach-page', id),
    remove:     (id)        => ipcRenderer.invoke('notes-remove', id),
    restore:    (id)        => ipcRenderer.invoke('notes-restore', id),
    addClip:    (id)        => ipcRenderer.invoke('notes-clip-add', id),
    openUrl:    (url)       => ipcRenderer.invoke('notes-open-url', url),
    exportMd:   (id)        => ipcRenderer.invoke('notes-export', id),
    onClip:     (cb)        => ipcRenderer.on('notes-clip', () => cb()),
  },

  // ── Kenar çubuğunda web paneli ───────────────────────────────────────────────
  webPanels: {
    list:      ()       => ipcRenderer.invoke('webpanel-list'),
    add:       (url)    => ipcRenderer.invoke('webpanel-add', url),
    remove:    (id)     => ipcRenderer.invoke('webpanel-remove', id),
    open:      (id)     => ipcRenderer.invoke('webpanel-open', id),
    hide:      ()       => ipcRenderer.invoke('webpanel-hide'),
    action:    (a)      => ipcRenderer.invoke('webpanel-action', a),
    onState:   (cb)     => ipcRenderer.on('webpanel-state', (_, d) => cb(d)),
    onFavicon: (cb)     => ipcRenderer.on('webpanel-favicon', (_, d) => cb(d)),
  },

  // ── Ekranı bölme ─────────────────────────────────────────────────────────────
  split: {
    toggle:  ()        => ipcRenderer.invoke('split-start'),
    choose:  (choice)  => ipcRenderer.invoke('split-choose', choice),
    exit:    ()        => ipcRenderer.invoke('split-exit'),
    swap:    ()        => ipcRenderer.invoke('split-swap'),
    ratio:   (r)       => ipcRenderer.send('split-ratio', r),
    onState: (cb)      => ipcRenderer.on('split-state', (_, d) => cb(d)),
  },

  // ── Sekme grupları: başlık tıklaması, menü, ad değiştirme ─────────────────────
  tabGroups: {
    action:   (groupId, action, value) => ipcRenderer.invoke('tab-group-action', { groupId, action, value }),
    menu:     (groupId)                => ipcRenderer.invoke('tab-group-menu', { groupId }),
    onRename: (cb)                     => ipcRenderer.on('tab-group-rename', (_, d) => cb(d)),
  },

  // Ana süreçteki kısayollardan arayüze iletilen komutlar (bkz. browser-commands.js)
  onBrowserCommand:   (cb) => ipcRenderer.on('browser-command', (_, cmd) => cb(cmd)),
  // Durum çubuğu bildirimi (ekran görüntüsü kaydedildi vb.)
  onStatusNote:       (cb) => ipcRenderer.on('status-note', (_, d) => cb(d)),
  revealScreenshot:   (file) => ipcRenderer.invoke('screenshot-reveal', file),
  // Okuma modu: etkin sekmedeki makale (doğrulanmış ağaç, resimler data: adresi)
  reader: { extract: () => ipcRenderer.invoke('reader-extract') },
  // Ülgen (yerel asistan): dar ve yazılı kapı. Genel ağ erişimi verilmez; motor
  // ana süreçte çalışır, ağa çıkmaz. Eylemler yalnız kullanıcı tıklayınca gider.
  ulgen: {
    durum:   ()        => ipcRenderer.invoke('ulgen-durum'),
    sor:     (istek)   => ipcRenderer.invoke('ulgen-sor', istek),
    eylem:   (eylem)   => ipcRenderer.invoke('ulgen-eylem', eylem),
    veri:    ()        => ipcRenderer.invoke('ulgen-veri'),
    veriSil: ()        => ipcRenderer.invoke('ulgen-veri-sil'),
    ceviriSil: ()      => ipcRenderer.invoke('ulgen-ceviri-sil'),
    // Dil paketi indirme ilerlemesi. Abonelikten çıkış için işlev döner;
    // panel indirme bitince bırakır, dinleyici birikmez.
    onCeviriDurum: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('ulgen-ceviri-durum', h);
      return () => ipcRenderer.off('ulgen-ceviri-durum', h);
    },
  },

  // ── Event Dinleyiciler ───────────────────────────────────────────────────────
  onTabsUpdate:       (cb) => ipcRenderer.on('tabs-update', (e, data) => cb(data)),
  onActiveUrl:        (cb) => ipcRenderer.on('active-url',  (e, url)  => cb(url)),
  onVpnStatus:        (cb) => ipcRenderer.on('vpn-status',  (e, data) => cb(data)),
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),

});