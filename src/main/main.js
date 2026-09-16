/**
 * İlgezdi Browser — Ana Electron Süreci (Faz 2+3+4)
 */

'use strict';

const { app, BrowserWindow, WebContentsView, Menu, clipboard, ipcMain, session, dialog, safeStorage, webContents } = require('electron');
const path = require('path');
const fs   = require('fs');

const { SecureLogManager } = require('./secure-log-manager');
const { VpnManager } = require('./vpn-manager');
const { attachBlocker, shouldBlockUrl, updateBlockerConfig, getBlockStats, isThirdParty, isWhitelisted } = require('./blocker-main');
const { setupGlance, closeGlance } = require('./glance-main');
const { setupArku } = require('./arku-manager');
const { setupBookmarkImport } = require('./bookmark-import');
const { setupPasswordManager, getForOrigin, classifyCapture, canSavePasswords, saveCapturedCredential } = require('./password-manager');
const { setupAutoUpdater } = require('./auto-updater');
const { setupDiagnostics, log: diag, logError } = require('./diagnostics');
const { setupThreatProtection } = require('./threat-protection');
const { createFaviconCache, hostKey: faviconHost } = require('./favicon-cache');
// Site simgesi önbelleği: app.whenReady içinde, şifreleme anahtarı hazır olunca kurulur.
let faviconCache = null;
const { setupDiscover } = require('./discover-feed');
const { setupCommunity } = require('./community');
// Keşfet kartları (TrendTech yazılımları): uygulamadaki liste + ilgezdi.com.tr'den günlük tazeleme.
setupDiscover(ipcMain, session);
// Keşfet yorumları ve Öneri sayfası (community.js). Paketlenmemiş geliştirme kopyasında
// sonda sahte sunucuya yönlendirebilir; kurulu uygulamada adres sabittir.
setupCommunity({ ipcMain, session, app, apiBase: !app.isPackaged ? process.env.ILGEZDI_API_BASE : undefined });
const {
  normalizeWebrtcPolicy, DEFAULT_WEBRTC_POLICY, UI_COMMANDS, commandForInput, buildContextMenuModel,
  nextZoomFactor, zoomKeyForUrl, createZoomStore, snapshotHistory, pushClosedTab, isWebUrl,
  TAB_ACTIONS, moveTabId, orderAfterPin, buildTabMenuModel, normalizeStartupMode, serializeSession, parseSession,
} = require('./browser-commands');
const {
  ACTIVATION_EVENTS, popupVerdict, validatePermissionChange, listDecisions, decisionsForOrigin, permissionLabel,
  shouldStripThirdPartyCookies, normalizeSecureDns, hostResolverOptions, DEFAULT_SECURE_DNS,
  certificateSummary, errorPageModel, errorPageScript, normalizeOrigin,
  fileExtension, isDangerousFile, downloadNeedsWarning, sourceHost, sanitizeLogIds, sanitizeDownloadHistory,
} = require('./site-safety');

let incognitoWindow = null;
let incognitoPendingUrl = null;   // "Bağlantıyı gizli pencerede aç": pencere yüklenince ilk sekme

const USER_DATA = app.getPath('userData');
const CFG_PATH  = path.join(USER_DATA, 'config.json');
const ZOOM_PATH = path.join(USER_DATA, 'zoom-levels.json');

// ─── Oturum ayrımı — TEMİZLEME İŞLEMLERİ İÇİN KRİTİK ─────────────────────────
// Sekmeler (gerçek gezinme) bu bölümü kullanır. Arayüz penceresi ise
// defaultSession'da kalır ve uygulama verisini (yer imleri, tema, engelleyici
// beyaz listesi) kendi localStorage'ında tutar.
//
// Bu yüzden "çerezleri/tüm verileri temizle" çağrıları SADECE aşağıdaki tarama
// oturumunu hedeflemek zorundadır. defaultSession'ı temizlemek iki yönlü hataya
// yol açar: gerçek çerezler hiç silinmez ve kullanıcının tüm yer imleri gider.
const BROWSING_PARTITION = 'persist:securebrowser';
function browsingSession() { return session.fromPartition(BROWSING_PARTITION); }

const DEFAULT_CONFIG = {
  offerToSavePasswords:  true,         // giriş yapınca şifreyi kasaya kaydetmeyi öner
  passwordNeverSave:     [],           // "bu sitede asla" denen site kökleri (yalnızca ana süreç yazar)
  homepage:              '',           // boş = İlgezdi başlangıç sayfası; URL = o sayfa açılır
  searchEngine:          'duckduckgo', // varsayılan; kullanıcı ayarlardan değiştirebilir
  startupMode:           'homepage',   // homepage | restore ("Kaldığım yerden devam et")
  vpnEnabled:            false,
  vpnAutoConnect:        false,
  vpnLastProfileId:      null,
  killSwitchEnabled:     true,
  blockTrackers:         true,
  blockAds:              true,
  blockLevel:            'medium',   // low | medium | high | full
  whitelist:             [],         // engellemenin kapatıldığı alan adları
  // Tanılama: undefined = henüz sorulmadı, true/false = kullanıcı kararı.
  // Varsayılan olarak KAPALI kabul edilir (açık rıza olmadan gönderim yok).
  diagnosticsConsent:    undefined,
  diagnosticsEndpoint:   'https://ilgezdi.vercel.app/api/diag',
  fingerprintProtection: true,
  // Güvenli DNS (DNS-over-HTTPS): automatic | cloudflare | quad9 | adguard | google | off.
  // Eskiden burada hiçbir yerde okunmayan bir DNS sunucusu alanı vardı; kaldırıldı.
  secureDns:             DEFAULT_SECURE_DNS,
  // HTTP başlıklarındaki üçüncü taraf çerezler (site bazında izin verilebilir).
  blockThirdPartyCookies: true,
  // Zararlı site koruması: açık tehdit listeleri cihaza indirilir, eşleşme yerelde
  // yapılır (threat-lists.js). Google Safe Browsing yok; adresler gönderilmez.
  threatProtection:      true,
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
  // WebRTC IP politikası (bkz. browser-commands.js): VPN açıkken gerçek IP'nin
  // WebRTC üzerinden sızmasını önler, görüntülü görüşmeleri bozmaz.
  webrtcPolicy:          DEFAULT_WEBRTC_POLICY,
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
  } catch (e) {
    console.error('Config yüklenemedi:', e);
    // Bozuk dosyayı sakla: bir sonraki saveConfig varsayılanlarla üzerine yazar
    // ve ayarlar geri dönüşsüz gider. Kopya elle kurtarma imkânı bırakır.
    try { fs.copyFileSync(CFG_PATH, CFG_PATH + '.bozuk-' + Date.now()); } catch {}
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  // Atomik yazma (denetim O-02): yarım yazılmış config.json, loadConfig'in
  // catch'ine düşüp TÜM ayarları — şifreli oturum, site izin kararları, ana sayfa,
  // engelleyici beyaz listesi — sessizce varsayılana döndürüyordu. Loglar, VPN
  // profilleri ve kasa zaten atomikti; config.json bu listeden kalmıştı.
  const tmp = CFG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CFG_PATH);
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

// NOT (denetim O-01): Burada eskiden iki ölü/hatalı parça vardı ve kaldırıldı.
//  1) BLOCKED_DOMAINS + isBlocked(): `host.includes(d)` ALT DİZE eşleşmesiyle
//     çalışıyordu (notdoubleclick.net.example.com gibi adresleri de engelliyordu)
//     ve blocker-main.js listelerinin eksik bir kopyasıydı.
//  2) sql.js "logs.db": tablolar oluşturuluyor ama projede tek bir INSERT yoktu.
//     get-logs hep [], get-blocked-stats hep 0 dönüyordu (Koruma Durumu paneli
//     "Bugün 0 istek engellendi" bunu gösteriyordu) ve 30 sn'de bir boş
//     veritabanı diske yazılıyordu. Ziyaret geçmişi secure-log-manager.js'te,
//     engelleme sayaçları blocker-main.js'te tutuluyor.

function logVisit(data) {
  if (!config.logEnabled || !secureLog) return;
  try {
    secureLog.addVisit(data);
    if (secureLog.logs.length % 10 === 0) secureLog.saveLogs();
  } catch (e) { console.error('[SecureLog] Hata:', e); }
}

// Site izin istekleri (kamera, mikrofon, konum...) — Electron varsayılanı
// İZİN VERMEKTİR; burada hassas izinler kullanıcı onayına bağlanır.
// keyboardLock: uzak masaüstü gibi sitelerin tam ekranda sistem tuşlarını (Alt+Tab,
// Windows tuşu) yakalaması; yalnızca tam ekran ve kullanıcı etkileşimiyle çalışır.
const QUIET_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock']);
// clipboard-read: panodan okuma (yapıştırma). Eskiden sorulmadan reddediliyordu;
// Arku uzak masaüstü bilgisayardaki panoyu alamıyordu (kullanıcı bildirdi).
const ASK_USER    = new Set(['media', 'display-capture', 'geolocation', 'notifications', 'midi', 'midiSysex', 'clipboard-read']);
// İzin adları site-safety.js'teki SITE_PERMISSIONS listesinden gelir (Site Bilgisi paneliyle aynı).

// İzin kararları site (origin) + izin türü bazında hatırlanır ve config'e
// yazılır. Böylece bir siteyi reddedince tekrar tekrar sorulmaz — Google gibi
// konumu periyodik isteyen siteler için kritik. Kararlar kilit simgesindeki Site
// Bilgisi panelinden ve Ayarlar › Gizlilik › Site İzinleri listesinden değiştirilir.
function permKey(origin, permission) { return `${origin}|${permission}`; }
function getPermDecision(origin, permission) {
  return config.permissionDecisions ? config.permissionDecisions[permKey(origin, permission)] : undefined;
}
function setPermDecision(origin, permission, granted) {
  if (!config.permissionDecisions) config.permissionDecisions = {};
  const key = permKey(origin, permission);
  if (granted === null) delete config.permissionDecisions[key];   // 'Sor': site yeniden sorar
  else config.permissionDecisions[key] = granted;
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
      detail:    `Bu site şu izni istiyor: ${permissionLabel(permission)}\n\nKararınız bu site için hatırlanır. Kilit simgesindeki Site Bilgisi panelinden değiştirebilirsiniz.`,
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

// ─── İndirmeler (denetim O-07) ────────────────────────────────────────────────
// Eskiden hiçbir will-download işleyicisi yoktu: "İndirme klasörü" ve "Konum
// sor" ayarları kaydediliyor ama HİÇ kullanılmıyordu; indirmeler Chromium'un
// varsayılan davranışına bırakılıyor, ilerleme/iptal/tamamlanma bildirimi yoktu.
// Ayarlar burada uygulanır ve durum arayüze 'download-updated' ile bildirilir.
const downloads = new Map(); // id → { id, filename, state, received, total, savePath, startedAt, incognito, item }
let downloadSeq = 0;

function safeFileName(name) {
  // Sunucunun önerdiği ad: Windows'ta geçersiz karakterler, yol ayırıcıları
  // (dizin dışına yazma denemesi) ve ayrılmış aygıt adları temizlenir.
  let n = String(name || 'indirme').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  n = n.replace(/^\.+/, '_');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = '_' + n;
  return n.slice(0, 180) || 'indirme';
}

function uniquePath(dir, filename) {
  const ext  = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  for (let i = 1; fs.existsSync(candidate) && i < 1000; i++) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

function publicDownload(entry) {
  const { item, ...payload } = entry;   // DownloadItem serileştirilemez
  let paused = false;
  try { paused = !!(item && item.isPaused()); } catch {}
  return { ...payload, paused };
}

// Gizli pencere indirmeleri ana pencereye gönderilmez (eskiden iki pencereye de
// gidiyordu; ana pencerenin indirilenler listesi gizli indirmeleri görebiliyordu).
function broadcastDownload(entry) {
  const payload = publicDownload(entry);
  if (!entry.incognito && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-updated', payload);
  if (incognitoWindow && !incognitoWindow.isDestroyed()) incognitoWindow.webContents.send('download-updated', payload);
}

// ─── İndirme geçmişi (kalıcı) ─────────────────────────────────────────────────
// Biten indirmeler ziyaret günlüğüyle aynı anahtarla şifreli saklanır; gizli
// pencere indirmeleri yazılmaz. Listeden kaldırmak dosyayı silmez.
const DOWNLOADS_ENC   = path.join(USER_DATA, 'downloads.enc');
const DOWNLOADS_PLAIN = path.join(USER_DATA, 'downloads.json');
let downloadsSaveTimer = null;

function saveDownloadHistoryNow() {
  if (downloadsSaveTimer) { clearTimeout(downloadsSaveTimer); downloadsSaveTimer = null; }
  const list = sanitizeDownloadHistory([...downloads.values()].filter((d) => !d.incognito));
  try {
    if (!list.length) {
      for (const f of [DOWNLOADS_ENC, DOWNLOADS_PLAIN]) { try { fs.unlinkSync(f); } catch {} }
      return;
    }
    writeProtectedJson(DOWNLOADS_ENC, DOWNLOADS_PLAIN, list);
  } catch (e) {
    logError('downloads', e);
  }
}

function scheduleDownloadHistorySave() {
  if (downloadsSaveTimer) return;
  downloadsSaveTimer = setTimeout(saveDownloadHistoryNow, 800);
  if (downloadsSaveTimer.unref) downloadsSaveTimer.unref();
}

function loadDownloadHistory() {
  try {
    for (const d of sanitizeDownloadHistory(readProtectedJson(DOWNLOADS_ENC, DOWNLOADS_PLAIN))) {
      const id = ++downloadSeq;
      downloads.set(id, { ...d, id, incognito: false, dangerous: isDangerousFile(d.filename), item: null });
    }
  } catch (e) {
    logError('downloads', e);
  }
}

app.on('will-quit', () => { if (downloadsSaveTimer) saveDownloadHistoryNow(); });

function setupDownloads(ses) {
  ses.on('will-download', (event, item) => {
    const filename = safeFileName(item.getFilename());
    const incognito = ses !== browsingSession() && ses !== session.defaultSession;
    const sourceUrl = item.getURL();

    // Güvensiz (HTTP) bağlantıdan gelen çalıştırılabilir dosya yolda değiştirilmiş
    // olabilir: kullanıcı açıkça onaylamadan indirilmez. Seyrek bir durum olduğu
    // için eşzamanlı iletişim kutusu kullanılır; indirme başlamadan karar verilir.
    if (downloadNeedsWarning({ filename, url: sourceUrl })) {
      const parent = BrowserWindow.getFocusedWindow() || mainWindow;
      const options = {
        type: 'warning', buttons: ['İndirmeyi iptal et', 'Yine de indir'], defaultId: 0, cancelId: 0,
        title: 'Güvenli olmayan indirme',
        message: filename + ' güvenli olmayan bir bağlantıdan (HTTP) indiriliyor',
        detail: 'Bu tür dosyalar bilgisayarınızda program çalıştırabilir ve indirilirken değiştirilmiş olabilir. Kaynağına güvenmiyorsanız indirmeyin.',
      };
      const choice = parent && !parent.isDestroyed() ? dialog.showMessageBoxSync(parent, options) : dialog.showMessageBoxSync(options);
      if (choice !== 1) {
        event.preventDefault();
        diag.info('download', 'Güvenli olmayan indirme iptal edildi', { ext: fileExtension(filename) });
        return;
      }
    }

    const id = ++downloadSeq;

    // "Konum sor" kapalıysa yolu biz belirleriz; açıksa Electron kendi
    // "Farklı kaydet" diyaloğunu gösterir.
    if (!config.askDownloadLocation) {
      const dir = (config.downloadFolder && fs.existsSync(config.downloadFolder))
        ? config.downloadFolder
        : app.getPath('downloads');
      try { item.setSavePath(uniquePath(dir, filename)); } catch {}
    }

    const entry = {
      id, filename, state: 'progressing',
      received: 0, total: item.getTotalBytes() || 0,
      savePath: '', startedAt: Date.now(), endedAt: 0, incognito, item,
      sourceHost: sourceHost(sourceUrl), dangerous: isDangerousFile(filename),
    };
    downloads.set(id, entry);
    diag.info('download', 'İndirme başladı', { total: entry.total, incognito });
    broadcastDownload(entry);

    let lastSent = 0;
    item.on('updated', (_e, state) => {
      entry.state    = state === 'interrupted' ? 'interrupted' : (item.isPaused() ? 'paused' : 'progressing');
      entry.received = item.getReceivedBytes();
      entry.total    = item.getTotalBytes() || entry.total;
      entry.savePath = item.getSavePath() || entry.savePath;
      const now = Date.now();
      if (now - lastSent > 500) { lastSent = now; broadcastDownload(entry); }
    });

    item.once('done', (_e, state) => {
      entry.state    = state;            // completed | cancelled | interrupted
      entry.received = item.getReceivedBytes();
      entry.savePath = item.getSavePath() || entry.savePath;
      entry.endedAt  = Date.now();
      entry.item     = null;
      broadcastDownload(entry);
      if (!incognito) scheduleDownloadHistorySave();
      if (state === 'completed') {
        diag.info('download', 'İndirme tamamlandı', { bytes: entry.received });
        if (config.notifications !== false) {
          try {
            const { Notification } = require('electron');
            if (Notification.isSupported()) new Notification({ title: 'İndirme tamamlandı', body: filename }).show();
          } catch {}
        }
      } else if (state === 'interrupted') {
        diag.warn('download', 'İndirme yarıda kaldı');
      }
      // Gizli pencere indirmeleri listede kalmaz — geçmiş bırakmamak için.
      if (incognito) setTimeout(() => downloads.delete(id), 60000).unref?.();
    });
  });
}

// configureSession her sekme için çağrılıyor. webRequest ve izin işleyicileri
// "değiştir" semantiğindedir, ama `ses.on(...)` olay dinleyicileri BİRİKİR —
// bunlar aynı oturuma yalnızca bir kez bağlanmalı.
const configuredSessions = new WeakSet();

function configureSession(ses) {
  setupPermissionHandler(ses);

  if (!configuredSessions.has(ses)) {
    configuredSessions.add(ses);
    setupDownloads(ses);
  }

  // Temiz, tutarlı UA — hem başlık hem navigator.userAgent buradan gelir.
  // fingerprintProtection'dan bağımsız her zaman uygulanır (Google girişi vb.).
  try { ses.setUserAgent(CLEAN_UA); } catch {}

  // Sertifika ayrıntısı Site Bilgisi paneli için hatırlanır. Karar DEĞİŞTİRİLMEZ:
  // -3, Chromium'un kendi doğrulama sonucunun kullanılması demektir. Kanca hata
  // fırlatsa bile geri çağırma mutlaka yapılır; yoksa bağlantı asılı kalırdı.
  ses.setCertificateVerifyProc((request, callback) => {
    try { rememberCertificate(ses, request); } catch {} finally { callback(-3); }
  });

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (stripsThirdPartyCookies(details)) {
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'cookie') delete headers[k];
    }
    if (config.fingerprintProtection) {
      delete headers['X-Forwarded-For'];
      delete headers['Via'];
      delete headers['X-WebRTC-IP'];
    }
    if (config.doNotTrack) headers['DNT'] = '1';
    callback({ requestHeaders: headers });
  });

  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    // Zararlı site koruması (yerel listeler): engelleyiciden ÖNCE ve ana çerçeve
    // dahil her istekte. Ana çerçevede sayfa yerine uyarı gösterilir (did-fail-load →
    // threats.takeBlock). Adres hiçbir sunucuya gönderilmez.
    const threat = threats ? threats.check(details.url, ses) : null;
    if (threat) {
      threats.noteBlocked(details, threat);
      return callback({ cancel: true });
    }
    // Engelleyici. Ayarlar'daki reklam ve izleyici anahtarlarının ikisi de
    // kapalıysa devre dışı. Sayfa URL'si isteği yapan sekmeden alınır — "full"
    // seviyesindeki üçüncü taraf engellemesi ve "bu siteye izin ver" (sayfanın
    // yüklediği tüm kaynaklar için) buna ihtiyaç duyar.
    if (config.blockTrackers !== false || config.blockAds !== false) {
      if (shouldBlockUrl(details.url, {
        resourceType: details.resourceType,
        referrer:     details.referrer,
        pageUrl:      pageUrlOf(details),
      })) return callback({ cancel: true });
    }
    // HTTPS-Only: ana çerçeve http isteklerini https'e yükselt
    if (config.httpsOnly && details.resourceType === 'mainFrame' && details.url.startsWith('http://')) {
      return callback({ redirectURL: 'https://' + details.url.slice('http://'.length) });
    }
    callback({});
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    if (!stripsThirdPartyCookies(details)) return callback({});
    const responseHeaders = { ...details.responseHeaders };
    for (const k of Object.keys(responseHeaders)) if (k.toLowerCase() === 'set-cookie') delete responseHeaders[k];
    callback({ responseHeaders });
  });
}

// Zararlı site koruması: app.whenReady içinde kurulur (öncesinde sekme isteği olmaz).
let threats = null;

// İsteği yapan sekmenin sayfa adresi (engelleyici ve çerez kararı için).
function pageUrlOf(details) {
  try {
    const wc = details.webContentsId != null ? webContents.fromId(details.webContentsId) : null;
    return wc && !wc.isDestroyed() ? wc.getURL() : '';
  } catch { return ''; }
}

// Üçüncü taraf çerez: yalnızca HTTP başlıkları (Cookie / Set-Cookie). Karar
// site-safety.js'te; site tanımı ve beyaz liste engelleyiciyle ortak.
function stripsThirdPartyCookies(details) {
  if (config.blockThirdPartyCookies === false) return false;
  const pageUrl = pageUrlOf(details);
  if (!pageUrl) return false;
  const pageOrigin = originOf(pageUrl);
  return shouldStripThirdPartyCookies({
    enabled:      true,
    resourceType: details.resourceType,
    thirdParty:   isThirdParty(details.url, pageUrl),
    siteAllowed:  pageOrigin ? getPermDecision(pageOrigin, 'third-party-cookies') : undefined,
    whitelisted:  isWhitelisted(details.url, pageUrl),
  });
}

// Oturum başına sertifika özeti (alan adı → özet). Gizli pencerenin oturumu ayrı
// tutulur ve pencereyle birlikte bellekten düşer. Boyut sınırlı.
const certCaches = new WeakMap();
const CERT_CACHE_MAX = 300;
function rememberCertificate(ses, request) {
  const host = String(request.hostname || '').toLowerCase();
  if (!host) return;
  let cache = certCaches.get(ses);
  if (!cache) { cache = new Map(); certCaches.set(ses, cache); }
  cache.delete(host);
  cache.set(host, certificateSummary(request.certificate, request.verificationResult, request.errorCode));
  while (cache.size > CERT_CACHE_MAX) cache.delete(cache.keys().next().value);
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
// closedTabs: Ctrl+Shift+T yığını — yalnızca bellekte, pencereyle birlikte gider.
// htmlFullscreen: etkin sekme video/HTML tam ekranında; windowFullscreen: F11 ile açıldı.
const mainState = { tabs: new Map(), activeTabId: null, tabCounter: 0, panelIsOpen: false, viewHidden: false, closedTabs: [], htmlFullscreen: false, windowFullscreen: false };
const incognitoState = { tabs: new Map(), activeTabId: null, tabCounter: 0, panelIsOpen: false, viewHidden: false, closedTabs: [], htmlFullscreen: false, windowFullscreen: false };

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
  bindBrowserInput(mainWindow.webContents, mainWindow, mainState, 'ui');
  // Sekmeler kapanmadan ÖNCE oturum eşzamanlı yazılır (şifreleme eşzamanlı; kapanış beklemez).
  mainWindow.on('close', () => saveSessionNow());
  mainWindow.on('resize', () => resizeActiveView(mainWindow, mainState));

  mainWindow.on('minimize', () => {
    if (bookmarkPopupWin && !bookmarkPopupWin.isDestroyed()) {
      bookmarkPopupWin.close();
      bookmarkPopupWin = null;
    }
  });

  attachBlocker(mainWindow);
  setupGlance(mainWindow, ipcMain, GLANCE_HOOKS);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', async () => {
    // Sekme görünümlerinin webContents'ini ve yoklama zamanlayıcılarını AÇIKÇA
    // kapat. Eskiden ana pencere kapanışında hiçbir sekme temizlenmiyordu;
    // WebContentsView'da pencereye bağlı otomatik temizliğe güvenmek yerine
    // yaşam döngüsünü kendimiz yönetiyoruz (gizli pencere zaten böyle yapıyordu).
    for (const [, tab] of mainState.tabs) {
      if (tab.__glancePoll) clearInterval(tab.__glancePoll);
      try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
    }
    mainState.tabs.clear();
    mainState.activeTabId = null;
    mainWindow = null;
    if (vpnManager?.activeProfile) {
      await vpnManager.disconnect().catch(() => {});
    }
  });
}

function createTab(win, state, url = config.homepage, opts = {}) {
  const tabId = ++state.tabCounter;
  const isIncognito = state === incognitoState;

  // WebContentsView: BrowserView Electron 30'dan beri kullanımdan kaldırılmış durumda.
  const view = new WebContentsView({
    webPreferences: {
      // Şifre kaydetme önerisi ve doldurma; yalıtılmış dünyada, sayfaya bir şey açmaz.
      preload: path.join(__dirname, '../preload/page-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: isIncognito
        ? 'incognito-' + (win ? win.id : Date.now())
        : BROWSING_PARTITION,
    }
  });

  configureSession(view.webContents.session);
  applyWebrtcPolicy(view.webContents);
  bindBrowserInput(view.webContents, win, state, 'page');

  // Açılır pencere kararı için son kullanıcı etkileşimi (sayfa taklit edemez).
  view.webContents.on('input-event', (e, ev) => {
    if (!ACTIVATION_EVENTS.has(ev.type)) return;
    const tab = state.tabs.get(tabId);
    if (tab) tab.lastActivation = Date.now();
  });

  // Yükleme hatasında boş beyaz sayfa yerine anlaşılır bir hata sayfası. Hata
  // belgesi sekmenin kendisinde kalır: adres, geçmiş ve Yenile doğru çalışır.
  view.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;   // -3: iptal ya da yönlendirme, hata değil
    // -20 (ERR_BLOCKED_BY_CLIENT): az önce zararlı site listesiyle engellendiyse hata
    // sayfası yerine "devam et" belirteçli uyarı sayfası.
    const threatModel = errorCode === -20 && threats ? threats.takeBlock(view.webContents) : null;
    const model = threatModel || errorPageModel({ code: errorCode, description: errorDescription, url: validatedURL, httpsOnly: !!config.httpsOnly });
    const tab = state.tabs.get(tabId);
    // Sekme başlığı hata belgesinin başlığıyla aynı (Chrome gibi: DNS hatasında alan adı).
    if (tab) { tab.title = model.title; sendTabsUpdate(win, state); }
    injectErrorPage(view.webContents, model);
    diag.info('navigation', 'Sayfa yüklenemedi', { code: errorCode, kind: model.kind });
  });

  // Uyarı sayfasındaki "Riski anlıyorum, devam et" (belirteç threat-protection.js'te doğrulanır).
  const viewWcId = view.webContents.id;
  view.webContents.on('console-message', (ev, ...legacy) => {
    const message = ev && typeof ev.message === 'string' ? ev.message : legacy[1];
    if (threats) threats.handleConsoleMessage(view.webContents, message);
  });
  view.webContents.once('destroyed', () => { if (threats) threats.forget(viewWcId); });

  // Ses göstergesi (sekmede hoparlör simgesi)
  view.webContents.on('audio-state-changed', (event) => {
    const tab = state.tabs.get(tabId);
    if (!tab) return;
    tab.audible = !!(event && event.audible);
    sendTabsUpdate(win, state);
  });

  // HTML5 tam ekran (video): Electron pencereyi kendiliğinden tam ekrana alıyor ama
  // sekme görünümü eski sınırlarında kalıyor, video pencerenin bir köşesinde
  // görünüyordu. Görünüm tüm pencereye yayılır; çıkınca düzen geri gelir.
  view.webContents.on('enter-html-full-screen', () => {
    if (!win || win.isDestroyed() || state.activeTabId !== tabId) return;
    state.htmlFullscreen = true;
    resizeActiveView(win, state);
    showFullscreenNotice(win);
  });
  view.webContents.on('leave-html-full-screen', () => {
    if (!win || win.isDestroyed()) return;
    state.htmlFullscreen = false;
    hideFullscreenNotice(win);
    // F11 ile açılmış pencere tam ekranı, videodan çıkınca korunur.
    if (state.windowFullscreen && !win.isFullScreen()) win.setFullScreen(true);
    resizeActiveView(win, state);
  });

  view.webContents.on('found-in-page', (e, result) => {
    if (state.activeTabId !== tabId || !win || win.isDestroyed()) return;
    win.webContents.send('find-result', {
      active: result.activeMatchOrdinal, matches: result.matches, final: result.finalUpdate,
    });
  });

  // Ctrl + fare tekerleği ya da dokunmatik yüzeyde kıstırma
  view.webContents.on('zoom-changed', (e, direction) => {
    changeZoom(win, state, view.webContents, direction === 'in' ? 1 : -1);
  });

  view.webContents.on('page-title-updated', (e, title) => {
    const tab = state.tabs.get(tabId);
    if (tab) tab.title = title;
    sendTabsUpdate(win, state);
  });

  // Yükleme göstergesi: sekmede dönen simge. Eskiden sekmede hiçbir işaret yoktu;
  // sayfanın yüklenip yüklenmediği anlaşılmıyordu (kullanıcı bildirdi).
  view.webContents.on('did-start-loading', () => {
    const tab = state.tabs.get(tabId);
    if (tab && !tab.loading) { tab.loading = true; sendTabsUpdate(win, state); }
  });
  view.webContents.on('did-stop-loading', () => {
    const tab = state.tabs.get(tabId);
    if (tab && tab.loading) { tab.loading = false; sendTabsUpdate(win, state); }
  });

  // Site simgesi: sayfanın kendi bildirdiği adresten, sekmenin oturumuyla ve çerezsiz
  // (favicon-cache.js). Dış favicon servisi yok.
  view.webContents.on('page-favicon-updated', (e, favicons) => {
    if (!faviconCache) return;
    const pageUrl = view.webContents.getURL();
    faviconCache.update(view.webContents.session, pageUrl, favicons, { incognito: isIncognito }).then((dataUrl) => {
      const tab = state.tabs.get(tabId);
      if (tab && dataUrl && tab.favicon !== dataUrl && faviconHost(tab.url) === faviconHost(pageUrl)) {
        tab.favicon = dataUrl;
        sendTabsUpdate(win, state);
      }
    }).catch(() => {});
  });

  view.webContents.on('did-navigate', (e, navUrl) => {
    const tab = state.tabs.get(tabId);
    if (tab) {
      // Başka siteye geçince eski simge kalmasın; önbellekte varsa hemen gösterilir.
      if (faviconHost(tab.url) !== faviconHost(navUrl)) tab.favicon = faviconCache ? faviconCache.get(navUrl, { incognito: isIncognito }) : '';
      tab.url = navUrl;
      tab.blockedPopups = [];
    }
    // Kaydedilmiş site yakınlaştırması. Gizli pencerede kalıcı değer kullanılmaz.
    if (!isIncognito) {
      const saved = zoomStore.get(zoomKeyForUrl(navUrl));
      if (Math.abs(view.webContents.getZoomFactor() - saved) > 0.001) view.webContents.setZoomFactor(saved);
    }
    if (state.activeTabId === tabId && win && !win.isDestroyed()) {
      win.webContents.send('find-reset');   // yeni belgede eski eşleşme sayısı anlamsız
      sendZoomState(win, state);
      sendPopupState(win, state);
    }
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

    // Başlık her yükleme bitişinde doğrulanır (geri yükleme ve önbellekten dönüşte
    // page-title-updated gelmeyebiliyor; sekme alan adıyla kalıyordu).
    const pageTitle = view.webContents.getTitle();
    if (pageTitle && isWebUrl(view.webContents.getURL()) && pageTitle !== tab.title) {
      tab.title = pageTitle;
      sendTabsUpdate(win, state);
    }

    // Gizli modda ve web dışı adreslerde (boş sekme, hata belgesi) ziyaret loglanmaz.
    // Eskiden boş sekme de "Yeni Sekme" diye günlüğe ve geçmişe yazılıyordu.
    if (!isIncognito && isWebUrl(tab.url)) {
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

    // Şifre doldurma artık sayfa yüklenince kendiliğinden YAPILMAZ: kullanıcı bir giriş
    // alanına tıklayınca kayıtlı hesaplar menüde listelenir (page-preload.js →
    // 'pw-field-focus'). Eskiden tek kayıtlı hesap, kullanıcı hiçbir şeye dokunmadan
    // sayfanın ana dünyasına yazılıyordu; görünmez ya da sahte bir form parolayı toplayabilirdi.

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

  view.webContents.setWindowOpenHandler(({ url: openUrl, disposition }) => {
    // Sayfalar yalnızca web adreslerini yeni sekmede açtırabilir. Eskiden
    // window.open('file:///C:/…') yerel dosyayı sekmede açıyordu (denetim D-18).
    const target = String(openUrl || '');
    if (!isWebUrl(target) && target !== 'about:blank') {
      diag.info('navigation', 'Pencere açma isteği reddedildi', { scheme: target.split(':')[0].slice(0, 16) });
      return { action: 'deny' };
    }
    // Açılır pencere engelleme: Electron'da Chromium'un engelleyicisi yok, her
    // window.open buraya ulaşır. Kullanıcı etkileşimi olmadan açılanlar engellenir.
    const tab = state.tabs.get(tabId);
    const pageOrigin = originOf(view.webContents.getURL());
    const siteDecision = pageOrigin ? getPermDecision(pageOrigin, 'popups') : undefined;
    const verdict = popupVerdict({ now: Date.now(), lastActivation: tab && tab.lastActivation, siteDecision });
    if (verdict === 'block') {
      if (tab) {
        tab.blockedPopups = [...(tab.blockedPopups || []), target].slice(-10);
        if (state.activeTabId === tabId) sendPopupState(win, state);
      }
      return { action: 'deny' };
    }
    // Etkileşim bir kez kullanılır: tek tıklama art arda pencere açtıramaz.
    if (tab && siteDecision !== true) tab.lastActivation = 0;
    const newId = createTab(win, state, target);
    // Ctrl ya da orta tıklama arka planda açar; target=_blank ve window.open yeni
    // sekmeye geçer. Eskiden hepsi arka planda açılıyor, tıklama boşa gitmiş görünüyordu.
    if (disposition !== 'background-tab') setActiveTab(win, state, newId);
    return { action: 'deny' };
  });

  // Başlangıç başlığı: boş sekme → "Yeni Sekme", aksi halde alan adı.
  const isBlank = !url || url === 'about:blank';
  let initialTitle = 'Yeni Sekme';
  if (!isBlank) { try { initialTitle = new URL(url).hostname || url; } catch { initialTitle = url; } }
  if (opts.title) initialTitle = String(opts.title).slice(0, 300);   // oturum geri yükleme
  else if (opts.restore && Array.isArray(opts.restore.entries)) {
    // Geçmişten geri yüklemede Chromium başlık olayı yayımlamıyor; başlık girdiden alınır.
    const entry = opts.restore.entries[opts.restore.index ?? opts.restore.entries.length - 1];
    if (entry && entry.title) initialTitle = String(entry.title).slice(0, 300);
  }

  state.tabs.set(tabId, {
    view,
    url:          url,
    title:        initialTitle,
    startTime:    Date.now(),
    blockedCount: 0,
    pinned:       !!opts.pinned,
    muted:        false,
    audible:      false,
  });

  if (opts.lazy) {
    // Oturum geri yüklemede arka plan sekmeleri ilk açılışlarında yüklenir.
    state.tabs.get(tabId).pendingLoad = { url, restore: opts.restore || null };
  } else {
    loadTabContent(view.webContents, url, opts.restore);
  }

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
  if (state.htmlFullscreen) {
    const full = win.getContentBounds();
    tab.view.setVisible(true);
    tab.view.setBounds({ x: 0, y: 0, width: full.width, height: full.height });
    positionFullscreenNotice(win);
    return;
  }
  // Renderer view'ı bilerek gizlediyse (ekran overlay açık) gizli tut —
  // panel-opened / pencere resize olayları gizliliği bozmasın.
  if (state.viewHidden) {
    tab.view.setVisible(false);
    return;
  }
  tab.view.setVisible(true);
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

  // Yalnızca bu penceredeki DİĞER sekmelerin görünümleri ağaçtan çıkarılır (yok
  // edilmez — sekmeye dönüldüğünde yeniden eklenir). Hedefli çıkarma, contentView'e
  // eklenmiş başka görünümlere dokunmaz. removeChildView, çocuk olmayan görünüm için
  // işlem yapmaz. (Not: BrowserWindow'un kendi arayüz webContents'i children içinde
  // LİSTELENMEZ — Electron 44 uçtan uca sondasıyla doğrulandı.)
  // Sekme değişince önceki sekmedeki bulma vurgusu temizlenir, bul çubuğu kapanır.
  const previous = state.tabs.get(state.activeTabId);
  if (previous && state.activeTabId !== tabId) {
    try { if (!previous.view.webContents.isDestroyed()) previous.view.webContents.stopFindInPage('clearSelection'); } catch {}
    win.webContents.send('find-reset');
    if (state.htmlFullscreen) {
      // Sekme değişince video tam ekranından çıkılır (Chrome gibi).
      state.htmlFullscreen = false;
      hideFullscreenNotice(win);
      try { previous.view.webContents.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {}); } catch {}
    }
  }

  const content = win.contentView;
  for (const [id, t] of state.tabs) {
    if (id !== tabId) content.removeChildView(t.view);
  }
  // Açık bir glance yeni sekmenin altında kalıp görünmez hâle gelmesin.
  closeGlance();
  content.addChildView(tab.view);   // zaten çocuksa en üste taşınır
  if (tab.pendingLoad) {
    const pending = tab.pendingLoad;
    tab.pendingLoad = null;
    loadTabContent(tab.view.webContents, pending.url, pending.restore);
  }
  state.activeTabId = tabId;

  resizeActiveView(win, state);

  sendTabsUpdate(win, state);
  sendZoomState(win, state);
  sendPopupState(win, state);
}

function closeTab(win, state, tabId) {
  const tab = state.tabs.get(tabId);
  if (!tab) return;

  if (tab.__glancePoll) clearInterval(tab.__glancePoll);

  if (state.activeTabId === tabId && state.htmlFullscreen) {
    state.htmlFullscreen = false;
    hideFullscreenNotice(win);
    if (win && !win.isDestroyed() && win.isFullScreen() && !state.windowFullscreen) win.setFullScreen(false);
  }

  // Ctrl+Shift+T için geri/ileri geçmişiyle birlikte hatırla (yalnızca bellekte).
  try {
    const wc = tab.view.webContents;
    if (!wc.isDestroyed() && isWebUrl(tab.url)) {
      const h = wc.navigationHistory;
      const hist = tab.pendingLoad && tab.pendingLoad.restore
        ? { entries: tab.pendingLoad.restore.entries, index: tab.pendingLoad.restore.index }
        : snapshotHistory(h.getAllEntries(), h.getActiveIndex());
      pushClosedTab(state.closedTabs, { url: tab.url, title: tab.title, ...hist });
    }
  } catch {}

  if (win && !win.isDestroyed()) win.contentView.removeChildView(tab.view);
  // webContents.destroy() belgelenmiş bir API değildi; close() sayfayı kapatıp
  // WebContents'i yok eder ('destroyed' olayı yayılır).
  try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
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
    pinned: !!tab.pinned, audible: !!tab.audible, muted: !!tab.muted,
    loading: !!tab.loading, favicon: tab.favicon || '',
  }));
  if (state === mainState) scheduleSessionSave();
  win.webContents.send('tabs-update', tabsData);
  win.webContents.send('active-url', state.tabs.get(state.activeTabId)?.url || '');
  if (vpnManager) {
    win.webContents.send('vpn-status', vpnManager.getStatus());
  }
}

// ─── Tarayıcı komutları: kısayollar, sağ tık menüsü, bul, yakınlaştırma ──────
// Karar mantığı browser-commands.js'te (saf, testli); burada yalnızca Electron'a bağlanır.

// Site başına yakınlaştırma config.json'da değil ayrı dosyada: ayarlar paneli
// kaydederken tüm yapılandırmayı geri yazıyor ve yeni değeri ezerdi.
const zoomStore = createZoomStore({
  read: () => (fs.existsSync(ZOOM_PATH) ? JSON.parse(fs.readFileSync(ZOOM_PATH, 'utf-8')) : {}),
  write: (obj) => {
    const tmp = ZOOM_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, ZOOM_PATH);
  },
});
app.on('will-quit', () => { if (zoomStore.pending()) zoomStore.flush(); });

function activeTabContents(state) {
  const tab = state.tabs.get(state.activeTabId);
  const wc = tab && tab.view.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
}

function applyWebrtcPolicy(wc) {
  try {
    if (wc && !wc.isDestroyed()) wc.setWebRTCIPHandlingPolicy(normalizeWebrtcPolicy(config.webrtcPolicy));
  } catch (e) {
    logError('webrtc', e);
  }
}

function applyWebrtcPolicyToAllTabs() {
  for (const st of [mainState, incognitoState]) {
    for (const [, tab] of st.tabs) applyWebrtcPolicy(tab.view.webContents);
  }
}

function sendZoomState(win, state) {
  if (!win || win.isDestroyed()) return;
  const wc = activeTabContents(state);
  win.webContents.send('zoom-changed', { factor: wc ? wc.getZoomFactor() : 1 });
}

function changeZoom(win, state, wc, direction) {
  if (!wc || wc.isDestroyed()) return;
  const factor = nextZoomFactor(wc.getZoomFactor(), direction);
  wc.setZoomFactor(factor);
  // Chromium yakınlaştırmayı alan adı başına uygular; aynı sitedeki diğer
  // sekmeler de değişir. Kalıcı değer yalnızca normal pencerede yazılır.
  if (state !== incognitoState) zoomStore.set(zoomKeyForUrl(wc.getURL()), factor);
  if (win && !win.isDestroyed() && activeTabContents(state) === wc) {
    win.webContents.send('zoom-changed', { factor });
  }
}

function reopenClosedTab(win, state) {
  const entry = state.closedTabs.pop();
  if (!entry || !win || win.isDestroyed()) return;
  const restore = entry.entries ? { entries: entry.entries, index: entry.index } : null;
  setActiveTab(win, state, createTab(win, state, entry.url, { restore }));
}

function openInIncognito(url) {
  if (incognitoWindow && !incognitoWindow.isDestroyed() && incognitoState.tabs.size) {
    setActiveTab(incognitoWindow, incognitoState, createTab(incognitoWindow, incognitoState, url));
    incognitoWindow.focus();
    return;
  }
  incognitoPendingUrl = url;
  createIncognitoWindow();
}

function runBrowserCommand(win, state, cmd) {
  if (!cmd || !win || win.isDestroyed()) return;

  if (UI_COMMANDS.has(cmd)) {
    // Odak sayfadaysa arayüze taşınmalı; yoksa adres çubuğu ve bul kutusu yazı almaz.
    if (cmd === 'focus-address' || cmd === 'find') win.webContents.focus();
    win.webContents.send('browser-command', cmd);
    return;
  }

  const wc = activeTabContents(state);
  const ids = [...state.tabs.keys()];
  const pos = ids.indexOf(state.activeTabId);

  switch (cmd) {
    case 'close-tab':
      if (state.activeTabId != null) closeTab(win, state, state.activeTabId);
      break;
    case 'reopen-closed-tab': reopenClosedTab(win, state); break;
    case 'next-tab': if (ids.length > 1) setActiveTab(win, state, ids[(pos + 1) % ids.length]); break;
    case 'prev-tab': if (ids.length > 1) setActiveTab(win, state, ids[(pos - 1 + ids.length) % ids.length]); break;
    case 'last-tab': if (ids.length) setActiveTab(win, state, ids[ids.length - 1]); break;
    case 'reload':      if (wc) wc.reload(); break;
    case 'hard-reload': if (wc) wc.reloadIgnoringCache(); break;
    case 'back':    if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'zoom-in':    changeZoom(win, state, wc, 1); break;
    case 'zoom-out':   changeZoom(win, state, wc, -1); break;
    case 'zoom-reset': changeZoom(win, state, wc, 0); break;
    case 'print':
      if (wc && isWebUrl(wc.getURL())) {
        wc.print({}, (ok, reason) => {
          if (!ok && reason && !/cancel/i.test(reason)) diag.warn('print', 'Yazdırma başarısız', { reason: String(reason).slice(0, 80) });
        });
      }
      break;
    case 'incognito': createIncognitoWindow(); break;
    case 'toggle-fullscreen':
      // F11: pencere tam ekranı. Video tam ekranından çıkınca korunur.
      state.windowFullscreen = !win.isFullScreen();
      win.setFullScreen(state.windowFullscreen);
      break;
    default: {
      const m = /^tab-([1-8])$/.exec(cmd);
      if (m && ids[Number(m[1]) - 1] != null) setActiveTab(win, state, ids[Number(m[1]) - 1]);
    }
  }
}

// Kısayollar ve sağ tık menüsü. surface: 'page' (sekme ve önizleme içeriği) ya da
// 'ui' (İlgezdi arayüzü). Aynı komut tablosu ikisine de uygulanır; editörlerin
// kullandığı birleşimler sayfada yakalanmaz (bkz. browser-commands.js).
function bindBrowserInput(wc, win, state, surface) {
  wc.on('before-input-event', (event, input) => {
    // Esc: sayfa yüklenirken durdurur (Chrome gibi; yenile düğmesinin ipucu bunu vaat
    // ediyordu ama çalışmıyordu). Tuş sayfaya yine iletilir: Esc ile pencere/menü kapatan
    // siteler bozulmaz. Yüklenmiyorsa hiçbir şey yapılmaz.
    if (surface === 'page' && input.type === 'keyDown' && input.key === 'Escape'
        && !input.control && !input.alt && !input.shift && !input.meta && !input.isAutoRepeat && wc.isLoading()) {
      wc.stop();
    }
    const cmd = commandForInput(input, { platform: process.platform, surface });
    if (!cmd) return;
    event.preventDefault();
    try { runBrowserCommand(win, state, cmd); } catch (e) { logError('shortcut', e, { cmd }); }
  });

  wc.on('context-menu', (event, params) => {
    if (!win || win.isDestroyed()) return;
    const history = surface === 'page' ? wc.navigationHistory : null;
    const model = buildContextMenuModel(params, {
      surface,
      platform: process.platform,
      incognito: state === incognitoState,
      canGoBack: !!(history && history.canGoBack()),
      canGoForward: !!(history && history.canGoForward()),
    });
    if (!model.length) return;
    const template = model.map((item) => (item.type ? { type: 'separator' } : {
      label: item.label,
      enabled: item.enabled,
      click: () => {
        try { runContextAction(win, state, wc, item, params); } catch (e) { logError('context-menu', e, { id: item.id }); }
      },
    }));
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

function runContextAction(win, state, wc, item, params) {
  if (wc.isDestroyed()) return;
  const arg = item.arg;
  switch (item.id) {
    case 'open-link-tab':
    case 'open-tab':
      if (isWebUrl(arg)) createTab(win, state, arg);        // Chrome gibi arka planda açılır
      break;
    case 'open-link-incognito':
      if (isWebUrl(arg)) openInIncognito(arg);
      break;
    case 'glance-link':
      if (isWebUrl(arg)) win.webContents.send('glance-request', { url: arg, x: params.x, y: params.y });
      break;
    case 'save-link':
    case 'save-media':
      // İndirme will-download işleyicisinden geçer: güvenli dosya adı, konum sorma.
      if (isWebUrl(arg) || String(arg).toLowerCase().startsWith('data:image/')) wc.downloadURL(arg);
      break;
    case 'copy-text':  clipboard.writeText(String(arg || '').slice(0, 8192)); break;
    case 'copy-image': wc.copyImageAt(arg.x, arg.y); break;
    case 'search-selection':
      setActiveTab(win, state, createTab(win, state, searchUrl(String(arg || '').trim().slice(0, 1000))));
      break;
    case 'view-source':
      if (String(arg).startsWith('view-source:') && isWebUrl(String(arg).slice('view-source:'.length))) {
        setActiveTab(win, state, createTab(win, state, arg));
      }
      break;
    case 'replace-misspelling': wc.replaceMisspelling(String(arg)); break;
    case 'add-to-dictionary':   wc.session.addWordToSpellCheckerDictionary(String(arg)); break;
    case 'undo':        wc.undo(); break;
    case 'redo':        wc.redo(); break;
    case 'cut':         wc.cut(); break;
    case 'copy':        wc.copy(); break;
    case 'paste':       wc.paste(); break;
    case 'paste-plain': wc.pasteAndMatchStyle(); break;
    case 'select-all':  wc.selectAll(); break;
    case 'back':    if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload':  wc.reload(); break;
    case 'print':   runBrowserCommand(win, state, 'print'); break;
  }
}

// Önizleme (glance) görünümü tetikleyen pencerenin oturumunda açılır. Eskiden
// bölüm sabit 'persist:securebrowser' idi; gizli pencerede önizlenen sitenin
// çerezleri ve önbelleği kalıcı profile yazılıyordu.
const isIncognitoWin = (win) =>
  !!(win && incognitoWindow && !incognitoWindow.isDestroyed() && win.id === incognitoWindow.id);

const GLANCE_HOOKS = {
  partitionFor: (win) => (isIncognitoWin(win) ? 'incognito-' + win.id : BROWSING_PARTITION),
  onViewCreated: (view, win) => {
    const state = isIncognitoWin(win) ? incognitoState : mainState;
    configureSession(view.webContents.session);
    applyWebrtcPolicy(view.webContents);
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        closeGlance();
      }
    });
    bindBrowserInput(view.webContents, win, state, 'page');
  },
};

// ─── Site bilgisi, izinler, açılır pencereler, güvenli DNS ────────────────────
function sendPopupState(win, state) {
  if (!win || win.isDestroyed()) return;
  const tab = state.tabs.get(state.activeTabId);
  win.webContents.send('popup-state', { count: tab && tab.blockedPopups ? tab.blockedPopups.length : 0 });
}

// Hata belgesi did-fail-load anında henüz yerleşmemiş olabilir; betik belge
// hata belgesi değilse dokunmaz, birkaç kez kısa aralıkla yeniden denenir.
function injectErrorPage(wc, model, attempt = 0) {
  if (wc.isDestroyed()) return;
  const retry = () => {
    if (attempt < 4 && !wc.isDestroyed()) setTimeout(() => injectErrorPage(wc, model, attempt + 1), 120);
  };
  wc.executeJavaScript(errorPageScript(model)).then((done) => { if (!done) retry(); }).catch(retry);
}

function applySecureDns() {
  try {
    app.configureHostResolver(hostResolverOptions(config.secureDns));
  } catch (e) {
    logError('secure-dns', e, { mode: normalizeSecureDns(config.secureDns) });
  }
}

ipcMain.handle('site-info', (event) => {
  const { state } = getContextFromEvent(event);
  const tab = state.tabs.get(state.activeTabId);
  const wc = activeTabContents(state);
  const url = wc ? wc.getURL() : '';
  const origin = normalizeOrigin(originOf(url));
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  const cache = wc ? certCaches.get(wc.session) : null;
  return {
    url:          isWebUrl(url) ? url : '',
    origin,
    host,
    scheme:       url.startsWith('https://') ? 'https' : url.startsWith('http://') ? 'http' : 'other',
    certificate:  url.startsWith('https://') && cache ? (cache.get(host) || null) : null,
    permissions:  origin ? decisionsForOrigin(config.permissionDecisions, origin) : [],
    blockedPopups: tab && tab.blockedPopups ? tab.blockedPopups.slice() : [],
    zoom:         wc ? wc.getZoomFactor() : 1,
    incognito:    state === incognitoState,
    thirdPartyCookiesBlocked: config.blockThirdPartyCookies !== false,
  };
});

ipcMain.handle('site-permission-set', (event, input) => {
  const v = validatePermissionChange(input);
  if (!v.ok) return v;
  setPermDecision(v.origin, v.permission, v.value);
  diag.info('permissions', 'Site izni değiştirildi', { permission: v.permission, decision: input.decision });
  return { ok: true };
});

ipcMain.handle('site-permissions-list', () => listDecisions(config.permissionDecisions));

ipcMain.handle('site-permissions-reset', async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const r = await dialog.showMessageBox(parent, {
    type: 'warning', buttons: ['Vazgeç', 'Sıfırla'], defaultId: 0, cancelId: 0,
    title: 'Site izinlerini sıfırla',
    message: 'Tüm site izin kararları silinecek',
    detail: 'Konum, kamera, bildirim, açılır pencere ve üçüncü taraf çerez kararlarının hepsi silinir. Siteler izin istediğinde yeniden sorulursunuz.',
  }).catch(() => ({ response: 0 }));
  if (r.response !== 1) return { ok: false, canceled: true };
  config.permissionDecisions = {};
  saveConfig(config);
  return { ok: true };
});

ipcMain.handle('site-data-clear', async (event, input) => {
  const { state } = getContextFromEvent(event);
  const origin = normalizeOrigin(input && input.origin);
  const wc = activeTabContents(state);
  if (!origin || !wc) return { ok: false, error: 'Geçersiz site' };
  const host = new URL(origin).hostname;
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const r = await dialog.showMessageBox(parent, {
    type: 'warning', buttons: ['Vazgeç', 'Sil'], defaultId: 0, cancelId: 0,
    title: 'Site verilerini sil',
    message: host + ' için çerezler ve site verileri silinsin mi?',
    detail: 'Bu sitedeki oturumunuz kapanabilir. Yer imleri, şifreler ve ziyaret günlüğü etkilenmez.',
  }).catch(() => ({ response: 0 }));
  if (r.response !== 1) return { ok: false, canceled: true };
  const ses = wc.session;   // gizli penceredeyse gizli oturum
  try {
    await ses.clearStorageData({ origin });
    // Çerezler alan adına bağlıdır; aynı siteye (kayıtlı alan adı) ait tüm çerezler silinir.
    const cookies = await ses.cookies.get({});
    const removals = cookies
      .filter((c) => c.domain && !isThirdParty('https://' + String(c.domain).replace(/^\./, '') + '/', origin))
      .map((c) => ses.cookies.remove((c.secure ? 'https://' : 'http://') + String(c.domain).replace(/^\./, '') + (c.path || '/'), c.name).catch(() => {}));
    await Promise.all(removals);
    return { ok: true, removedCookies: removals.length };
  } catch (e) {
    logError('site-data', e);
    return { ok: false, error: 'Silinemedi' };
  }
});

ipcMain.handle('popup-open-blocked', (event, index) => {
  const { win, state } = getContextFromEvent(event);
  const tab = state.tabs.get(state.activeTabId);
  const i = Number(index);
  const list = tab && tab.blockedPopups;
  if (!list || !Number.isInteger(i) || i < 0 || i >= list.length) return { ok: false };
  const [target] = list.splice(i, 1);
  if (!isWebUrl(target)) { sendPopupState(win, state); return { ok: false }; }
  setActiveTab(win, state, createTab(win, state, target));
  return { ok: true };
});

// ─── Sekme içeriği yükleme ────────────────────────────────────────────────────
function loadTabContent(wc, url, restore) {
  if (wc.isDestroyed()) return;
  if (restore && restore.entries) {
    // Geri/ileri geçmişiyle birlikte geri yükleme (kapatılan sekme, oturum).
    wc.navigationHistory.restore(restore).catch((err) => {
      diag.warn('tabs', 'Sekme geçmişi geri yüklenemedi, yalnızca adres açılıyor', { error: String((err && err.message) || err).slice(0, 120) });
      if (!wc.isDestroyed()) wc.loadURL(url).catch(() => {});
    });
  } else {
    wc.loadURL(url).catch(() => {});
  }
}

// ─── Oturum: "Kaldığım yerden devam et" ───────────────────────────────────────
// Yalnızca ana pencere kaydedilir, gizli pencere asla. Dosya ziyaret günlüğüyle
// aynı AES-256-GCM anahtarıyla şifrelenir (şifreleme yoksa günlük gibi düz JSON).
// Gezinme girdilerinden yalnızca adres ve başlık yazılır; form içerikleri yazılmaz.
const SESSION_ENC   = path.join(USER_DATA, 'session.enc');
const SESSION_PLAIN = path.join(USER_DATA, 'session.json');
let sessionTimer = null;

function sessionSnapshot() {
  const ids = [...mainState.tabs.keys()];
  const tabs = ids.map((id) => {
    const t = mainState.tabs.get(id);
    if (t.pendingLoad) {
      const r = t.pendingLoad.restore;
      return { url: t.pendingLoad.url, title: t.title, pinned: !!t.pinned, entries: r ? r.entries : null, index: r ? r.index : undefined };
    }
    let entries = null;
    let index;
    try {
      const h = t.view.webContents.navigationHistory;
      entries = h.getAllEntries();
      index = h.getActiveIndex();
    } catch {}
    return { url: t.url, title: t.title, pinned: !!t.pinned, entries, index };
  });
  return serializeSession(tabs, ids.indexOf(mainState.activeTabId));
}

// Ziyaret günlüğüyle aynı anahtar: şifreleme varsa .enc, yoksa (günlük gibi) düz JSON.
// Oturum ve indirme geçmişi bunu kullanır.
function writeProtectedJson(encPath, plainPath, data) {
  const write = (file, buf) => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  if (secureLog && secureLog.canEncrypt) {
    write(encPath, secureLog._encrypt(data));
    try { fs.unlinkSync(plainPath); } catch {}
  } else {
    write(plainPath, JSON.stringify(data));
    try { fs.unlinkSync(encPath); } catch {}
  }
}

function readProtectedJson(encPath, plainPath) {
  if (secureLog && secureLog.canEncrypt && fs.existsSync(encPath)) return secureLog._decrypt(fs.readFileSync(encPath));
  if (fs.existsSync(plainPath)) return JSON.parse(fs.readFileSync(plainPath, 'utf-8'));
  return null;
}

function saveSessionNow() {
  if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null; }
  if (normalizeStartupMode(config.startupMode) !== 'restore') return;
  if (!mainWindow || mainWindow.isDestroyed()) return;   // sekmeler kapandıktan sonra boş oturum yazılmasın
  try { writeProtectedJson(SESSION_ENC, SESSION_PLAIN, sessionSnapshot()); } catch (e) { logError('session', e); }
}

function scheduleSessionSave() {
  if (sessionTimer || normalizeStartupMode(config.startupMode) !== 'restore') return;
  sessionTimer = setTimeout(saveSessionNow, 1500);
  if (sessionTimer.unref) sessionTimer.unref();
}

function readSessionFile() {
  try {
    return parseSession(readProtectedJson(SESSION_ENC, SESSION_PLAIN));
  } catch (e) {
    logError('session', e);
    return null;
  }
}

function deleteSessionFiles() {
  if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null; }
  for (const f of [SESSION_ENC, SESSION_PLAIN]) { try { fs.unlinkSync(f); } catch {} }
}

function restoreSession(saved) {
  if (!saved || !saved.tabs.length || !mainWindow || mainWindow.isDestroyed()) return false;
  const ids = saved.tabs.map((t, i) => createTab(mainWindow, mainState, t.url, {
    lazy: i !== saved.activeIndex,
    restore: t.entries ? { entries: t.entries, index: t.index } : null,
    pinned: t.pinned,
    title: t.title,
  }));
  setActiveTab(mainWindow, mainState, ids[saved.activeIndex] != null ? ids[saved.activeIndex] : ids[0]);
  diag.info('session', 'Oturum geri yüklendi', { tabs: ids.length, pinned: saved.tabs.filter((t) => t.pinned).length });
  return true;
}

// ─── Sekme işlemleri: sabitle, sessize al, taşı, çoğalt, sağ tık menüsü ───────
function reorderTabs(state, ids) {
  const next = new Map();
  for (const id of ids) if (state.tabs.has(id)) next.set(id, state.tabs.get(id));
  state.tabs = next;
}

function runTabAction(win, state, tabId, action, arg) {
  const tab = state.tabs.get(tabId);
  if (!tab || !win || win.isDestroyed()) return { ok: false };
  const ids = [...state.tabs.keys()];
  const pinnedSet = new Set(ids.filter((id) => state.tabs.get(id).pinned));
  const index = ids.indexOf(tabId);
  const wc = tab.view.webContents;
  const placeAfterSource = (newId) => {
    const all = [...state.tabs.keys()];
    const pins = new Set(all.filter((id) => state.tabs.get(id).pinned));
    reorderTabs(state, moveTabId(all, pins, newId, index + 1));
  };

  switch (action) {
    case 'pin':
    case 'unpin':
      tab.pinned = action === 'pin';
      if (tab.pinned) pinnedSet.add(tabId); else pinnedSet.delete(tabId);
      reorderTabs(state, orderAfterPin(ids, pinnedSet, tabId));
      break;
    case 'mute':
    case 'unmute':
    case 'toggle-mute': {
      const muted = action === 'toggle-mute' ? !wc.isAudioMuted() : action === 'mute';
      wc.setAudioMuted(muted);
      tab.muted = muted;
      break;
    }
    case 'move':
      reorderTabs(state, moveTabId(ids, pinnedSet, tabId, Number(arg)));
      break;
    case 'reload':
      if (tab.pendingLoad) setActiveTab(win, state, tabId); else wc.reload();
      break;
    case 'duplicate': {
      const hist = tab.pendingLoad && tab.pendingLoad.restore
        ? tab.pendingLoad.restore
        : snapshotHistory(wc.navigationHistory.getAllEntries(), wc.navigationHistory.getActiveIndex());
      const newId = createTab(win, state, tab.url, { restore: hist && hist.entries ? hist : null });
      placeAfterSource(newId);
      setActiveTab(win, state, newId);
      break;
    }
    case 'new-tab-right': {
      const url = config.newTabMode === 'custom' && isWebUrl(config.customNewTabUrl) ? config.customNewTabUrl : 'about:blank';
      const newId = createTab(win, state, url);
      placeAfterSource(newId);
      setActiveTab(win, state, newId);
      break;
    }
    case 'close':
      closeTab(win, state, tabId);
      break;
    case 'close-others':
      // Chrome gibi sabitlenmiş sekmeler kapatılmaz.
      for (const id of ids) if (id !== tabId && !pinnedSet.has(id)) closeTab(win, state, id);
      if (state.tabs.has(tabId)) setActiveTab(win, state, tabId);
      break;
    case 'close-right':
      for (const id of ids.slice(index + 1)) if (!pinnedSet.has(id)) closeTab(win, state, id);
      break;
    case 'reopen-closed':
      reopenClosedTab(win, state);
      break;
    default:
      return { ok: false };
  }
  sendTabsUpdate(win, state);
  return { ok: true };
}

ipcMain.handle('tab-action', (event, payload) => {
  const { win, state } = getContextFromEvent(event);
  const action = String((payload && payload.action) || '');
  if (!TAB_ACTIONS.has(action)) return { ok: false };
  try {
    return runTabAction(win, state, Number(payload.tabId), action, payload.toIndex);
  } catch (e) {
    logError('tab-action', e, { action });
    return { ok: false };
  }
});

ipcMain.handle('tab-context-menu', (event, payload) => {
  const { win, state } = getContextFromEvent(event);
  const tabId = Number(payload && payload.tabId);
  const tab = state.tabs.get(tabId);
  if (!tab || !win || win.isDestroyed()) return { ok: false };
  const ids = [...state.tabs.keys()];
  const model = buildTabMenuModel({
    index: ids.indexOf(tabId), count: ids.length, pinned: !!tab.pinned, muted: !!tab.muted,
    canReopen: state.closedTabs.length > 0, platform: process.platform,
  });
  Menu.buildFromTemplate(model.map((item) => (item.type ? { type: 'separator' } : {
    label: item.label,
    enabled: item.enabled,
    click: () => {
      try { runTabAction(win, state, tabId, item.id); } catch (e) { logError('tab-menu', e, { id: item.id }); }
    },
  }))).popup({ window: win });
  return { ok: true };
});

// ─── Tam ekran uyarısı ────────────────────────────────────────────────────────
// "Çıkmak için Esc" ayrı bir görünümde: sayfa bu katmanı gizleyemez ya da taklit
// edemez (tam ekran sahteciliğine karşı). Betik çalıştırmaz.
const FULLSCREEN_NOTICE_HTML = '<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:transparent;font:14px/1.2 Segoe UI,system-ui,sans-serif"><div style="background:rgba(14,20,34,.92);color:#f3ead6;padding:11px 18px;border-radius:8px;border:1px solid rgba(212,168,90,.55)">Tam ekrandan çıkmak için <b>Esc</b> tuşuna basın</div></body>';

function positionFullscreenNotice(win) {
  const v = win && win.__fsNotice;
  if (!v) return;
  const b = win.getContentBounds();
  v.setBounds({ x: Math.max(0, Math.round(b.width / 2 - 200)), y: 28, width: 400, height: 52 });
}

function showFullscreenNotice(win) {
  hideFullscreenNotice(win);
  const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  try { v.setBackgroundColor('#00000000'); } catch {}
  v.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(FULLSCREEN_NOTICE_HTML)).catch(() => {});
  win.contentView.addChildView(v);
  win.__fsNotice = v;
  positionFullscreenNotice(win);
  win.__fsNoticeTimer = setTimeout(() => hideFullscreenNotice(win), 4000);
}

function hideFullscreenNotice(win) {
  if (!win) return;
  if (win.__fsNoticeTimer) { clearTimeout(win.__fsNoticeTimer); win.__fsNoticeTimer = null; }
  const v = win.__fsNotice;
  if (!v) return;
  win.__fsNotice = null;
  try { if (!win.isDestroyed()) win.contentView.removeChildView(v); } catch {}
  try { if (!v.webContents.isDestroyed()) v.webContents.close(); } catch {}
}

ipcMain.handle('find-in-page', (event, payload) => {
  const { state } = getContextFromEvent(event);
  const wc = activeTabContents(state);
  const url = wc ? wc.getURL() : '';
  if (!wc || !url || url === 'about:blank') return { ok: false };
  const text = typeof payload?.text === 'string' ? payload.text.slice(0, 500) : '';
  if (!text) {
    wc.stopFindInPage('clearSelection');
    return { ok: true, requestId: 0 };
  }
  // findNext: true yeni arama oturumu başlatır, false sonraki/önceki eşleşmeye geçer.
  const requestId = wc.findInPage(text, { forward: payload.forward !== false, findNext: !!payload.newSession });
  return { ok: true, requestId };
});

ipcMain.handle('stop-find-in-page', (event, payload) => {
  const { state } = getContextFromEvent(event);
  const wc = activeTabContents(state);
  if (!wc) return { ok: false };
  wc.stopFindInPage('keepSelection');
  if (payload?.focusPage) wc.focus();
  return { ok: true };
});

ipcMain.handle('zoom-reset', (event) => {
  const { win, state } = getContextFromEvent(event);
  changeZoom(win, state, activeTabContents(state), 0);
});

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
  const h = t?.view.webContents.navigationHistory;
  if (h?.canGoBack()) h.goBack();
});

ipcMain.handle('go-forward', (event) => {
  const { state } = getContextFromEvent(event);
  const t = state.tabs.get(state.activeTabId);
  const h = t?.view.webContents.navigationHistory;
  if (h?.canGoForward()) h.goForward();
});

ipcMain.handle('reload', (event) => {
  const { state } = getContextFromEvent(event);
  state.tabs.get(state.activeTabId)?.view.webContents.reload();
});

// Config
// Ana sürecin yazdığı alanlar arayüze gönderilmez ve arayüzden yazılamaz. Ayarlar
// paneli kaydederken tüm yapılandırmayı geri gönderiyor; panel açıkken verilen
// bir site izni ya da yenilenen oturum eski değerle eziliyordu.
const MAIN_OWNED_KEYS = ['permissionDecisions', 'authSessionEnc', 'passwordNeverSave'];
function publicConfig() {
  const c = { ...config };
  for (const k of MAIN_OWNED_KEYS) delete c[k];
  return c;
}

ipcMain.handle('get-config',  ()          => publicConfig());
ipcMain.handle('save-config', (e, newCfg) => {
  const incoming = newCfg && typeof newCfg === 'object' ? { ...newCfg } : {};
  for (const k of MAIN_OWNED_KEYS) delete incoming[k];
  // Arayüzden gelen değerler doğrulanır: geçersiz politika Chromium'a verilmez.
  if ('webrtcPolicy' in incoming) incoming.webrtcPolicy = normalizeWebrtcPolicy(incoming.webrtcPolicy);
  if ('secureDns' in incoming) incoming.secureDns = normalizeSecureDns(incoming.secureDns);
  if ('blockThirdPartyCookies' in incoming) incoming.blockThirdPartyCookies = incoming.blockThirdPartyCookies !== false;
  if ('startupMode' in incoming) incoming.startupMode = normalizeStartupMode(incoming.startupMode);
  if ('threatProtection' in incoming) incoming.threatProtection = incoming.threatProtection !== false;
  const previous = { webrtcPolicy: config.webrtcPolicy, secureDns: config.secureDns, startupMode: config.startupMode, threatProtection: config.threatProtection !== false };
  config = { ...config, ...incoming };
  saveConfig(config);
  if (config.webrtcPolicy !== previous.webrtcPolicy) applyWebrtcPolicyToAllTabs();
  if (config.secureDns !== previous.secureDns) applySecureDns();
  // Koruma yeniden açıldıysa, zamanı gelmiş listeler hemen indirilir.
  if ((config.threatProtection !== false) !== previous.threatProtection && threats) threats.onConfigChanged();
  if (config.startupMode !== previous.startupMode) {
    if (normalizeStartupMode(config.startupMode) === 'restore') scheduleSessionSave();
    else deleteSessionFiles();   // kapatılınca açık sekmelerin kaydı diskte tutulmaz
  }
  return publicConfig();
});

// VPN
ipcMain.handle('vpn-get-profiles',   ()           => vpnManager?.getProfiles() || []);
// Doğrulama hatası kullanıcıya gösterilecek bir mesaj — ham Electron IPC
// istisnası olarak sızdırmak yerine düzgün bir sonuç nesnesi döndürülür.
ipcMain.handle('vpn-add-profile',    (e, profile) => {
  try {
    const p = vpnManager?.addProfile(profile);
    return { ok: true, profile: p };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('vpn-remove-profile', (e, id) => {
  try {
    vpnManager?.removeProfile(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
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
ipcMain.handle('vpn-test-dns-leak', async () =>
  vpnManager ? vpnManager.testDnsLeak() : { tested: false, error: 'VPN modülü hazır değil' });

// Faz 3 — Şifreli Loglar
ipcMain.handle('logs-get-stats',  ()            => secureLog?.getStats() || {});
ipcMain.handle('logs-search',     (e, query)    => secureLog?.search(query) || { items: [], total: 0, pages: 1, page: 1 });
ipcMain.handle('logs-export-csv', (e, query)    => secureLog?.exportCSV(query) || '');
ipcMain.handle('logs-clear',      ()            => { secureLog?.clearLogs(); return true; });
ipcMain.handle('logs-delete',     (e, ids)      => ({ ok: true, removed: secureLog ? secureLog.deleteEntries(sanitizeLogIds(ids)) : 0 }));
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

// Temizleme çağrıları tarama oturumunu hedefler — bkz. BROWSING_PARTITION notu.
ipcMain.handle('clear-cache', async () => {
  try {
    await browsingSession().clearCache();
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
    await browsingSession().clearStorageData({ storages: ['cookies'] });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clear-all', async (event) => {
  // Geri alınamaz işlem → açık onay al ve NEYİN silinmediğini de söyle.
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  let confirmed = false;
  try {
    const r = await dialog.showMessageBox(parent, {
      type:      'warning',
      buttons:   ['Vazgeç', 'Tümünü Temizle'],
      defaultId: 0,
      cancelId:  0,
      title:     'Tüm Tarama Verilerini Temizle',
      message:   'Tarama verilerinin tümü silinecek',
      detail:
        'Silinecek: çerezler, site verileri, önbellek, ziyaret günlüğü, indirme geçmişi (dosyalar değil), site izin kararları ve kayıtlı oturum.\n\n' +
        'Silinmeyecek: yer imleri, kayıtlı şifreler, ayarlar ve VPN profilleri.\n\n' +
        'Bu işlem geri alınamaz.',
    });
    confirmed = r.response === 1;
  } catch { confirmed = false; }
  if (!confirmed) return { success: false, canceled: true };

  try {
    const ses = browsingSession();
    await ses.clearCache();
    // storages verilmezse tüm depo türleri temizlenir (çerez, localStorage,
    // IndexedDB, service worker, cache storage…) — tür listesini elle saymaktan
    // güvenli, Electron sürümleri arasında da uyumlu.
    await ses.clearStorageData();
    secureLog?.clearLogs();
    faviconCache?.clear();   // simge önbelleği de ziyaret edilen siteleri ele verir
    deleteSessionFiles();
    for (const [id, d] of downloads) if (!d.item) downloads.delete(id);
    saveDownloadHistoryNow();
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
  // Genel bildirim anahtarı da dikkate alınır — eskiden yalnızca vpnNotify'a
  // bakılıyor, Ayarlar'daki "Bildirimler" anahtarı hiçbir etki yapmıyordu.
  if (config.notifications === false || config.vpnNotify === false) return;
  const { Notification } = require('electron');
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '../renderer/assets/ilgezdi-logo.png') }).show();
  }
});

// İndirmeler
ipcMain.handle('downloads-list', (event) => {
  const { state } = getContextFromEvent(event);
  const incognitoView = state === incognitoState;
  return [...downloads.values()]
    .filter((d) => incognitoView || !d.incognito)
    .map((d) => ({ ...publicDownload(d), exists: d.state === 'completed' && d.savePath ? fs.existsSync(d.savePath) : undefined }));
});

ipcMain.handle('downloads-open', async (event, id) => {
  const d = downloads.get(Number(id));
  if (!d || d.state !== 'completed' || !d.savePath || !fs.existsSync(d.savePath)) return { ok: false, error: 'Dosya bulunamadı' };
  if (isDangerousFile(d.filename)) {
    const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const r = await dialog.showMessageBox(parent, {
      type: 'warning', buttons: ['Vazgeç', 'Aç'], defaultId: 0, cancelId: 0,
      title: 'Dosyayı aç',
      message: d.filename + ' açılsın mı?',
      detail: 'Bu dosya bilgisayarınızda program çalıştırır. Yalnızca güvendiğiniz kaynaklardan indirdiğiniz dosyaları açın.',
    }).catch(() => ({ response: 0 }));
    if (r.response !== 1) return { ok: false, canceled: true };
  }
  const error = await require('electron').shell.openPath(d.savePath);
  return error ? { ok: false, error } : { ok: true };
});

ipcMain.handle('downloads-pause', (e, id) => {
  const d = downloads.get(Number(id));
  if (!d || !d.item) return { ok: false };
  try {
    if (d.item.isPaused()) d.item.resume(); else d.item.pause();
  } catch { return { ok: false }; }
  broadcastDownload(d);
  return { ok: true, paused: d.item.isPaused() };
});

ipcMain.handle('downloads-remove', (e, id) => {
  const d = downloads.get(Number(id));
  if (!d || d.item) return { ok: false };   // süren indirme önce iptal edilmeli
  downloads.delete(Number(id));
  if (!d.incognito) scheduleDownloadHistorySave();
  return { ok: true };
});

ipcMain.handle('downloads-clear', (event) => {
  const { state } = getContextFromEvent(event);
  const incognitoView = state === incognitoState;
  let removed = 0;
  for (const [id, d] of downloads) {
    if (d.item || (!incognitoView && d.incognito)) continue;
    downloads.delete(id);
    removed++;
  }
  scheduleDownloadHistorySave();
  return { ok: true, removed };
});
ipcMain.handle('downloads-show', (e, id) => {
  const d = downloads.get(id);
  if (d && d.savePath && fs.existsSync(d.savePath)) {
    require('electron').shell.showItemInFolder(d.savePath);
    return { ok: true };
  }
  return { ok: false };
});
ipcMain.handle('downloads-cancel', (e, id) => {
  const d = downloads.get(id);
  try { if (d && d.item) { d.item.cancel(); return { ok: true }; } } catch {}
  return { ok: false };
});

ipcMain.handle('blocker-get-stats', () => getBlockStats());

ipcMain.handle('blocker-update-config', (event, blockerCfg) => {
  updateBlockerConfig(blockerCfg);
  return { ok: true };
});

// ─── Şifre kaydetme önerisi ve doldurma (preload/page-preload.js) ─────────────
// Sekme ön yüklemesi giriş gönderimini ve giriş alanına tıklamayı bildirir. Site adresi
// her zaman gönderen sekmenin kendisinden okunur; sayfanın beyanına güvenilmez.
const PW_OFFER_DELAY_MS = 2500;          // girişten sonra sayfa değişsin; tek sayfalık uygulamada da gelsin
const PW_OFFER_TTL_MS   = 2 * 60 * 1000;
const pwOffers = new Map();              // offerId → { url, origin, username, password, action, existingId, state }

function tabFromContents(wc) {
  for (const [state, win] of [[mainState, mainWindow], [incognitoState, incognitoWindow]]) {
    if (!state || !state.tabs) continue;
    for (const [tabId, tab] of state.tabs) {
      if (tab.view && tab.view.webContents === wc) return { tab, tabId, state, win, incognito: state === incognitoState };
    }
  }
  return null;
}

function webOrigin(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : '';
  } catch { return ''; }
}

ipcMain.on('pw-capture', (event, data) => {
  const ctx = tabFromContents(event.sender);
  if (!ctx || ctx.incognito || config.offerToSavePasswords === false) return;
  const pageUrl = event.sender.getURL();
  const origin = webOrigin(pageUrl);
  if (!origin || (Array.isArray(config.passwordNeverSave) && config.passwordNeverSave.includes(origin))) return;
  const username = data && typeof data.username === 'string' ? data.username.trim().slice(0, 200) : '';
  const password = data && typeof data.password === 'string' ? data.password.slice(0, 500) : '';
  if (!password || !canSavePasswords()) return;
  const kind = classifyCapture(pageUrl, username, password);
  if (kind.action === 'same') return;

  const offer = {
    id: require('crypto').randomUUID(), url: pageUrl, origin, username, password,
    action: kind.action, existingId: kind.id || null, state: ctx.state,
  };
  clearTimeout(ctx.tab.pwOfferTimer);
  // Öneri hemen değil kısa süre sonra: aynı girişte parola düzeltilip yeniden gönderilirse
  // yalnızca son hâli önerilir.
  ctx.tab.pwOfferTimer = setTimeout(() => {
    ctx.tab.pwOfferTimer = null;
    const win = ctx.state === incognitoState ? incognitoWindow : mainWindow;
    if (!win || win.isDestroyed()) return;
    pwOffers.set(offer.id, offer);
    setTimeout(() => pwOffers.delete(offer.id), PW_OFFER_TTL_MS);
    // Arayüze parola GİTMEZ: yalnızca site, kullanıcı adı ve öneri türü.
    win.webContents.send('pw-save-offer', { offerId: offer.id, host: new URL(origin).host, username, action: offer.action, insecure: origin.startsWith('http:') });
  }, PW_OFFER_DELAY_MS);
});

ipcMain.handle('pw-save-decision', (event, { offerId, action } = {}) => {
  const offer = pwOffers.get(offerId);
  if (!offer) return { ok: false, error: 'Öneri zaman aşımına uğradı; bir sonraki girişte yeniden sorulur.' };
  // Yalnızca öneriyi alan pencere karar verebilir.
  if (getContextFromEvent(event).state !== offer.state) return { ok: false };
  pwOffers.delete(offerId);
  if (action === 'save') return saveCapturedCredential(offer);
  if (action === 'never') {
    const list = Array.isArray(config.passwordNeverSave) ? config.passwordNeverSave : [];
    if (!list.includes(offer.origin)) config.passwordNeverSave = [...list, offer.origin].slice(-500);
    saveConfig(config);
  }
  return { ok: true };
});

ipcMain.handle('pw-never-list', () => (Array.isArray(config.passwordNeverSave) ? config.passwordNeverSave.slice() : []));
ipcMain.handle('pw-never-remove', (_e, origin) => {
  const list = Array.isArray(config.passwordNeverSave) ? config.passwordNeverSave : [];
  config.passwordNeverSave = list.filter((o) => o !== origin);
  saveConfig(config);
  return { ok: true };
});

// Kullanıcı gerçekten bir giriş alanına tıkladı (ön yükleme userActivation ile denetler):
// bu sitenin kayıtlı hesapları alanın altında yerel menüde listelenir; seçilen doldurulur.
ipcMain.on('pw-field-focus', (event, rect) => {
  const ctx = tabFromContents(event.sender);
  if (!ctx || !ctx.win || ctx.win.isDestroyed() || ctx.state.activeTabId !== ctx.tabId) return;
  const wc = event.sender;
  const pageUrl = wc.getURL();
  const origin = webOrigin(pageUrl);
  const creds = origin ? getForOrigin(pageUrl) : [];
  if (!creds.length) return;
  const b = ctx.tab.view.getBounds();
  const n = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
  const x = b.x + Math.min(Math.max(n(rect && rect.x), 0), Math.max(b.width - 40, 0));
  const y = b.y + Math.min(Math.max(n(rect && rect.y), 0), Math.max(b.height - 40, 0));
  const fill = (id) => {
    // Menü açıkken sayfa başka siteye geçtiyse doldurulmaz; hesap o anki adrese göre yeniden alınır.
    if (wc.isDestroyed() || webOrigin(wc.getURL()) !== origin) return;
    const c = getForOrigin(wc.getURL()).find((x2) => x2.id === id);
    if (c) wc.send('pw-fill', { username: c.username || '', password: c.password });
  };
  const template = [
    { label: `${new URL(origin).host} için kayıtlı hesaplar`, enabled: false },
    { type: 'separator' },
    ...creds.slice(0, 10).map((c) => ({ label: c.username || '(kullanıcı adı yok)', click: () => fill(c.id) })),
    { type: 'separator' },
    { label: 'Şifreleri yönet…', click: () => { if (!ctx.win.isDestroyed()) ctx.win.webContents.send('browser-command', 'passwords'); } },
  ];
  Menu.buildFromTemplate(template).popup({ window: ctx.win, x, y });
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
  // Yalnızca popup penceresinin kendisi (denetim D-17)
  if (!bookmarkPopupWin || bookmarkPopupWin.isDestroyed() || e.sender !== bookmarkPopupWin.webContents) return { ok: false };
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

ipcMain.handle('bookmark-popup-delete', (e) => {
  if (!bookmarkPopupWin || bookmarkPopupWin.isDestroyed() || e.sender !== bookmarkPopupWin.webContents) return { ok: false };
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
  if (tab) tab.view.setVisible(false);
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

  // Tanılama İLK kurulur: bundan sonraki her kurulum adımında oluşan hata
  // yakalanıp günlüğe yazılabilsin. (Çökme yakalayıcıları da burada takılıyor.)
  setupDiagnostics(ipcMain, {
    userDataPath:  USER_DATA,
    getConfig:     () => config,
    saveConfig:    (cfg) => { config = cfg; saveConfig(config); },
    getMainWindow: () => mainWindow,
  });

  // Güvenli DNS ilk istekten önce ayarlanır.
  applySecureDns();

  // Zararlı site koruması: diskteki derlenmiş listeler hemen yüklenir; güncelleme
  // açılıştan sonra arka planda yapılır (threat-protection.js).
  threats = setupThreatProtection({
    ipcMain, session, userDataPath: USER_DATA, getConfig: () => config, userAgent: CLEAN_UA, log: diag,
  });
  // Liste durumu değişince açık pencerelerin Ayarlar › Gizlilik kutusu yerinde yenilenir.
  threats.onStatus((st) => {
    for (const w of [mainWindow, incognitoWindow]) {
      if (w && !w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send('threats-status-changed', st);
    }
  });
  threats.start();

  // Eski ölü sql.js veritabanının diskte kalan dosyası (hiç veri içermedi).
  try { fs.unlinkSync(path.join(USER_DATA, 'logs.db')); } catch {}
  vpnManager = new VpnManager(USER_DATA);
  // Önceki oturumdan açık kalmış tüneli bul — yoksa arayüz "bağlı değil" derken
  // trafik tünelden geçmeye devam eder ve kullanıcı kapatamaz.
  vpnManager.reconcile().catch(() => {});
  secureLog  = new SecureLogManager(USER_DATA);
  loadDownloadHistory();   // günlük anahtarı hazır olduktan sonra

  // Site simgeleri (favicon-cache.js): ziyaret günlüğüyle aynı anahtarla şifreli
  // önbellek — ziyaret edilen alan adlarını ele verdiği için düz yazılmaz.
  const FAVICONS_ENC = path.join(USER_DATA, 'favicons.enc');
  const FAVICONS_PLAIN = path.join(USER_DATA, 'favicons.json');
  faviconCache = createFaviconCache({
    read: () => { try { return readProtectedJson(FAVICONS_ENC, FAVICONS_PLAIN); } catch { return null; } },
    write: (obj) => { try { writeProtectedJson(FAVICONS_ENC, FAVICONS_PLAIN, obj); } catch (e) { logError('favicons', e); } },
  });
  // Yer imleri simgeleri önbellekten verilir; ağ isteği yapılmaz.
  ipcMain.handle('favicons-lookup', (_e, urls) => (faviconCache ? faviconCache.lookup(Array.isArray(urls) ? urls.map(String) : []) : {}));
  // Yenile düğmesi yükleme sırasında "Durdur" olur.
  ipcMain.handle('stop-loading', (event) => {
    const { state } = getContextFromEvent(event);
    state.tabs.get(state.activeTabId)?.view.webContents.stop();
  });
  // Geçmiş sayfası ve yeni sekme: son 7 günün şifresiz (HTTP) ziyaret özeti.
  ipcMain.handle('logs-http-report', () => (secureLog ? secureLog.httpReport({ days: 7 }) : null));

  vpnManager.onStatusChange(() => {
    // Tünel beklenmedik şekilde düştüyse kullanıcı arayüze bakmıyor olabilir —
    // sistem bildirimiyle haber ver. (Tanılamaya vpn-manager içinde yazılıyor.)
    if (vpnManager.status === 'dropped' && config.notifications !== false && config.vpnNotify !== false) {
      try {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          new Notification({
            title: 'VPN bağlantısı koptu',
            body:  'Tünel beklenmedik şekilde kapandı. Trafiğiniz şu anda VPN ile korunmuyor.',
            icon:  path.join(__dirname, '../renderer/assets/ilgezdi-logo.png'),
          }).show();
        }
      } catch {}
    }
    mainWindow?.webContents.send('vpn-status', vpnManager.getStatus());
    if (incognitoWindow && !incognitoWindow.isDestroyed()) {
      incognitoWindow.webContents.send('vpn-status', vpnManager.getStatus());
    }
  });

  // Kaydedilmiş engelleyici ayarını İLK SEKMEDEN ÖNCE uygula. Ayar yalnızca
  // renderer açılışında bildirilirse, ilk sayfa yüklenene kadar engelleyici
  // kodda gömülü 'medium' + boş beyaz listeyle çalışır.
  updateBlockerConfig({
    level:     config.blockLevel || 'medium',
    whitelist: Array.isArray(config.whitelist) ? config.whitelist : [],
    enabled:   config.blockAds !== false || config.blockTrackers !== false,
  });

  configureSession(session.defaultSession);
  createWindow();

  // Arku Uzak Masaüstü eklentisi: arka plan sürüm denetimi + kullanıcı onaylı güncelleme
  setupBookmarkImport(ipcMain, () => mainWindow);
  setupPasswordManager(ipcMain, { userDataPath: USER_DATA, getMainWindow: () => mainWindow });

  // Otomatik güncelleme: arka planda denetim + kullanıcı onaylı indirme/kurulum
  setupAutoUpdater(() => mainWindow);

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
    if (mainState.tabs.size !== 0) return;
    // "Kaldığım yerden devam et": kayıtlı oturum varsa sekmeler geri gelir.
    const saved = normalizeStartupMode(config.startupMode) === 'restore' ? readSessionFile() : null;
    if (saved && restoreSession(saved)) return;
    // Kullanıcının belirlediği anasayfayı aç (boşsa İlgezdi başlangıç sayfası)
    const id = createTab(mainWindow, mainState, homepageUrl());
    setActiveTab(mainWindow, mainState, id);
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
  incognitoState.closedTabs = [];
  incognitoState.htmlFullscreen = false;
  incognitoState.windowFullscreen = false;

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
  bindBrowserInput(incognitoWindow.webContents, incognitoWindow, incognitoState, 'ui');
  incognitoWindow.on('resize', () => resizeActiveView(incognitoWindow, incognitoState));

  incognitoWindow.once('ready-to-show', () => incognitoWindow.show());
  incognitoWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Renderer yüklenince ilk sekmeyi oluştur
  incognitoWindow.webContents.on('did-finish-load', () => {
    if (incognitoWindow && !incognitoWindow.isDestroyed() && incognitoState.tabs.size === 0) {
      // Sağ tık → "Bağlantıyı gizli pencerede aç" ile açıldıysa ilk sekme o adres.
      const first = incognitoPendingUrl || 'about:blank';
      incognitoPendingUrl = null;
      const id = createTab(incognitoWindow, incognitoState, first);
      setActiveTab(incognitoWindow, incognitoState, id);
    }
  });

  incognitoWindow.on('closed', () => {
    // Tüm incognito sekmelerini ve polling'leri temizle
    for (const [, tab] of incognitoState.tabs) {
      if (tab.__glancePoll) clearInterval(tab.__glancePoll);
      try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
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
