/**
 * İlgezdi Browser — Ana Electron Süreci (Faz 2+3+4)
 */

'use strict';

const { app, BrowserWindow, WebContentsView, Menu, clipboard, ipcMain, session, dialog, webContents, shell, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const { execFile } = require('child_process');
// İşletim sistemi anahtar kasası eşzamansız (Electron 46'da eşzamanlı safeStorage siliniyor).
const osCrypto = require('./os-crypto');

const { SecureLogManager } = require('./secure-log-manager');
const { VpnManager } = require('./vpn-manager');
const { attachBlocker, shouldBlockUrl, updateBlockerConfig, getBlockStats, isThirdParty, isWhitelisted, registrableDomain } = require('./blocker-main');
const { setupGlance, closeGlance } = require('./glance-main');
const { setupArku } = require('./arku-manager');
const { setupBookmarkImport } = require('./bookmark-import');
const { setupPasswordManager, getForOrigin, classifyCapture, canSavePasswords, saveCapturedCredential } = require('./password-manager');
const { generatePassword } = require('./password-generator');
const reader = require('./reader');
const { PWNED_RANGE_URL } = require('./pwned-check');
const { setupAutoUpdater } = require('./auto-updater');
const { setupDiagnostics, log: diag, logError } = require('./diagnostics');
const { setupThreatProtection } = require('./threat-protection');
const { createFaviconCache, hostKey: faviconHost } = require('./favicon-cache');
// Site simgesi önbelleği: app.whenReady içinde, şifreleme anahtarı hazır olunca kurulur.
let faviconCache = null;
const { setupDiscover } = require('./discover-feed');
const { setupCommunity } = require('./community');
const { shieldScript, createSeeder } = require('./fingerprint-shield');
const { setupSuggestPopup } = require('./suggest-popup');
const { createConsentLog } = require('./consent-log');
const tabGroups = require('./tab-groups');
const webPanels = require('./web-panels');
// Veri ve Gizlilik: izin kataloğu arayüzle ortak (renderer/data-catalog.js).
const dataCatalog = require('../renderer/data-catalog.js');
// Keşfet kartları (TrendTech yazılımları): uygulamadaki liste + ilgezdi.com.tr'den günlük tazeleme.
// Veri ve Gizlilik › "Keşfet listesini güncelle" kapalıysa yalnızca uygulamadaki liste gösterilir.
setupDiscover(ipcMain, session, { enabled: () => config.discoverFeed !== false });
// Keşfet yorumları ve Öneri sayfası (community.js). Paketlenmemiş geliştirme kopyasında
// sonda sahte sunucuya yönlendirebilir; kurulu uygulamada adres sabittir.
setupCommunity({ ipcMain, session, app, apiBase: !app.isPackaged ? process.env.ILGEZDI_API_BASE : undefined });
const {
  normalizeWebrtcPolicy, DEFAULT_WEBRTC_POLICY, UI_COMMANDS, commandForInput, buildContextMenuModel,
  nextZoomFactor, zoomKeyForUrl, createZoomStore, snapshotHistory, pushClosedTab, isWebUrl,
  normalizePageZoom, normalizeMinFontSize, urlsFromArgv,
  TAB_ACTIONS, moveTabId, orderAfterPin, buildTabMenuModel, normalizeStartupMode, serializeSession, parseSession,
  resetConfig, normalizeTabSleepMinutes, shouldSleepTab, DEFAULT_TAB_SLEEP_MINUTES,
} = require('./browser-commands');
const {
  ACTIVATION_EVENTS, popupVerdict, validatePermissionChange, listDecisions, decisionsForOrigin, permissionLabel,
  shouldStripThirdPartyCookies, normalizeSecureDns, hostResolverOptions, DEFAULT_SECURE_DNS,
  certificateSummary, errorPageModel, errorPageScript, normalizeOrigin,
  fileExtension, isDangerousFile, downloadNeedsWarning, sourceHost, sanitizeLogIds, sanitizeDownloadHistory,
  rewriteNavigation, autoplayPolicyFor, exitCleanupPlan, historyRangeStart,
} = require('./site-safety');

let incognitoWindow = null;
let incognitoPendingUrl = null;   // "Bağlantıyı gizli pencerede aç": pencere yüklenince ilk sekme

const USER_DATA = app.getPath('userData');
const CFG_PATH  = path.join(USER_DATA, 'config.json');
// Onay kayıtlarının ilk satırı: yeni kurulumda "ilk açılış", güncellenen kurulumda "güncelleme".
const CONFIG_EXISTED_AT_START = fs.existsSync(CFG_PATH);
const consentLog = createConsentLog({ userDataPath: USER_DATA, appVersion: app.getVersion() });
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
  defaultPageZoom:       1,            // Erişilebilirlik: kaydı olmayan sitelerin yakınlaştırması
  minimumFontSize:       0,            // Erişilebilirlik: sayfalarda en küçük yazı (0 = kapalı)
  reduceMotion:          false,        // Erişilebilirlik: arayüz animasyonları kapalı
  highContrast:          false,        // Erişilebilirlik: arayüzde yüksek karşıtlık
  offerToSavePasswords:  true,         // giriş yapınca şifreyi kasaya kaydetmeyi öner
  // Veri ve Gizlilik sayfasındaki izinler (renderer/data-catalog.js). Değişiklikler onay
  // kayıtlarına yazılır (consent-log.js). Ülgen izinleri consents içinde, hepsi kapalı başlar.
  omniboxHistory:        true,         // adres çubuğunda geçmişten ve yer imlerinden öneri
  autoUpdateCheck:       true,         // açılışta ve 6 saatte bir GitHub'da yeni sürüm denetimi
  discoverFeed:          true,         // Keşfet listesini ilgezdi.com.tr'den tazele
  syncSettings:          true,         // QRtım senkronu: ayarlar
  syncBookmarks:         true,         // QRtım senkronu: yer imleri
  consents:              {},           // yalnızca ana süreç yazar (data-center-set)
  webPanels:             [],           // kenar çubuğundaki web panelleri (yalnızca ana süreç yazar)
  verticalTabs:          false,        // sekmeler üstte (false) ya da kenar çubuğunun yanında (true)
  verticalTabsCollapsed: false,        // dikey sekmelerde yalnızca simgeler
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
  language:              'auto',       // 'auto' = sistem dili (bkz. i18n.js); yeniden başlatınca değişir
  downloadFolder:        '',
  askDownloadLocation:   false,
  notifications:         true,
  vpnNotify:             true,
  httpsOnly:             false,
  doNotTrack:            false,
  // Global Privacy Control: sitelere "verimi satma/paylaşma" isteği (Sec-GPC başlığı ve
  // navigator.globalPrivacyControl). DNT'den farklı olarak bazı yasalarda bağlayıcı.
  globalPrivacyControl:  true,
  // Parmak izi koruması (fingerprint-shield.js): tuval/ses/WebGL okumalarına site başına gürültü.
  fingerprintShield:     true,
  cleanLinks:            true,         // bağlantılardaki tıklama kimliklerini ve yönlendiricileri atla
  blockAutoplay:         true,         // sesli otomatik oynatma kullanıcı etkileşimine kadar bekler
  clearSiteDataOnExit:   false,        // kapatınca çerezler, site verileri ve önbellek
  clearHistoryOnExit:    false,        // kapatınca ziyaret günlüğü, indirme geçmişi ve site simgeleri
  hardwareAcceleration:  true,         // yeniden başlatınca geçerli (bkz. hardwareAccelerationAtStart)
  tabSleepMinutes:       DEFAULT_TAB_SLEEP_MINUTES,   // kullanılmayan sekmeyi uyut (dakika, 0 = kapalı)
  warnOnCloseTabs:       false,        // birden çok sekme açıkken pencereyi kapatmadan önce sor
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

// Kurulum sihirbazında seçilen dil (build/installer.nsh → HKCU\Software\Ilgezdi\InstallerLanguage).
// Ayar dosyasında henüz dil yoksa bir kez okunur ve ayara yazılır; sonra kullanıcının seçimi
// geçerlidir. Değer yoksa (sessiz güncelleme, eski kurulum) "Sistem dili" olarak kaydedilir.
function savedConfigHasLanguage() {
  try { return Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(CFG_PATH, 'utf-8')), 'language'); } catch { return false; }
}
function readInstallerLanguageLcid() {
  try {
    const out = require('child_process').execFileSync('reg', ['query', 'HKCU\\Software\\Ilgezdi', '/v', 'InstallerLanguage'],
      { encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /InstallerLanguage\s+REG_\w+\s+(\d+)/.exec(out);
    return m ? m[1] : null;
  } catch { return null; }
}
function applyInstallerLanguageOnce() {
  if (process.platform !== 'win32' || !app.isPackaged || savedConfigHasLanguage()) return;
  const code = require('../renderer/i18n.js').languageFromLcid(readInstallerLanguageLcid());
  config.language = code || 'auto';
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });   // ilk açılışta profil klasörü henüz yok
    saveConfig(config);
  } catch (e) { console.error('Kurulum dili kaydedilemedi:', e.message); }
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

// Donanım hızlandırma (Ayarlar › Genel › Sistem) uygulama hazır olmadan kapatılmalıdır;
// değişiklik yeniden başlatınca geçerli olur. Bu oturumun durumu arayüze bildirilir.
const hardwareAccelerationAtStart = config.hardwareAcceleration !== false;
if (!hardwareAccelerationAtStart) app.disableHardwareAcceleration();

// Arayüz dili açılışta bir kez seçilir; arayüz pencereleri paketi ön yüklemede eşzamanlı alır.
const i18n = require('./i18n');
const { T } = i18n;
applyInstallerLanguageOnce();
const languageAtStart = String(config.language || 'auto');
i18n.init(languageAtStart, (() => { try { return app.getPreferredSystemLanguages(); } catch { return []; } })());
ipcMain.on('i18n-bundle', (event) => { event.returnValue = i18n.bundle(); });
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
// session.setUserAgent yalnızca oturumun varsayılanıdır; her webContents açılışta
// app.userAgentFallback'i alır ve o değer hem istek başlığında hem navigator.userAgent'ta
// kullanılır. Bu satır eksikken sekmeler "Electron/…" içeren UA gönderiyordu (2026-09-16
// ölçüm): İlgezdi kullanıcılarını diğer Chrome kullanıcılarından ayıran bir iz.
app.userAgentFallback = CLEAN_UA;

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
    // Kamera, mikrofon ya da ekran paylaşımı verilen sekme uyutulmaz (görüşme kesilmesin).
    const grant = () => {
      if (permission === 'media' || permission === 'display-capture') {
        const ctx = tabFromContents(webContents);
        if (ctx) ctx.tab.usedMedia = true;
      }
      callback(true);
    };

    // Bu site için daha önce karar verilmişse tekrar SORMA — sessizce uygula.
    const prior = getPermDecision(origin, permission);
    if (prior === true)  return grant();
    if (prior === false) return callback(false);

    const parent = BrowserWindow.getFocusedWindow() || mainWindow;
    dialog.showMessageBox(parent, {
      type:      'question',
      buttons:   [T('common.deny'), T('common.allow')],
      defaultId: 0,
      cancelId:  0,
      title:     T('dialog.permission.title'),
      message:   `${origin}`,
      detail:    T('dialog.permission.detail', { permission: permissionLabel(permission) }),
    }).then(r => {
      const granted = r.response === 1;
      setPermDecision(origin, permission, granted);
      if (granted) grant(); else callback(false);
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
        type: 'warning', buttons: [T('dialog.insecureDownload.cancel'), T('dialog.insecureDownload.proceed')], defaultId: 0, cancelId: 0,
        title: T('dialog.insecureDownload.title'),
        message: T('dialog.insecureDownload.message', { file: filename }),
        detail: T('dialog.insecureDownload.detail'),
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
            if (Notification.isSupported()) new Notification({ title: T('notify.downloadDone'), body: filename }).show();
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
    if (config.globalPrivacyControl !== false) headers['Sec-GPC'] = '1';
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
      const blockType = shouldBlockUrl(details.url, {
        resourceType: details.resourceType,
        referrer:     details.referrer,
        pageUrl:      pageUrlOf(details),
      });
      if (blockType) {
        countPageBlock(details.webContentsId, blockType);
        return callback({ cancel: true });
      }
    }
    // Ana çerçeve: tıklama kimlikleri ve araya giren yönlendiriciler atlanır (bkz.
    // site-safety.js), HTTPS-Only açıksa http https'e yükseltilir.
    const next = rewriteNavigation({
      url: details.url, method: details.method, resourceType: details.resourceType, referrer: details.referrer,
      httpsOnly: config.httpsOnly, cleanLinks: config.cleanLinks !== false, thirdParty: isThirdParty,
    });
    if (next) return callback({ redirectURL: next });
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

// Site Bilgisi › Reklam ve izleyici koruması: sekmedeki sayfada engellenen istekler (türe
// göre). Yeni sayfaya geçince sıfırlanır (createTabView → did-navigate).
function countPageBlock(webContentsId, type) {
  if (webContentsId == null) return;
  let wc = null;
  try { wc = webContents.fromId(webContentsId); } catch {}
  const ctx = wc ? tabFromContents(wc) : null;
  if (!ctx) return;
  const counts = ctx.tab.pageBlocked || (ctx.tab.pageBlocked = { ads: 0, trackers: 0, cookies: 0, thirdParty: 0 });
  if (type in counts) counts[type]++;
}

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
// groups: sekme grupları (id → { id, title, color, collapsed }); sekmede groupId.
// split: ekranı bölme { left, right, ratio, choosing } (sekme kimlikleri; seçim sürerken right null).
const mainState = { tabs: new Map(), activeTabId: null, tabCounter: 0, panelIsOpen: false, viewHidden: false, closedTabs: [], htmlFullscreen: false, windowFullscreen: false, groups: new Map(), groupCounter: 0, split: null };
const incognitoState = { tabs: new Map(), activeTabId: null, tabCounter: 0, panelIsOpen: false, viewHidden: false, closedTabs: [], htmlFullscreen: false, windowFullscreen: false, groups: new Map(), groupCounter: 0, split: null };

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
  // "Birden çok sekme açıkken sor" açıksa önce onay alınır; güncelleme kurulumu gibi uygulama
  // kapanışlarında sorulmaz.
  let closeConfirmed = false;
  mainWindow.on('close', (event) => {
    const count = mainState.tabs.size;
    if (!closeConfirmed && !appQuitting && config.warnOnCloseTabs === true && count > 1) {
      event.preventDefault();
      const restore = normalizeStartupMode(config.startupMode) === 'restore';
      const r = dialog.showMessageBoxSync(mainWindow, {
        type: 'question', buttons: [T('common.cancel'), T('dialog.closeTabs.closeAll')], defaultId: 1, cancelId: 0,
        title: T('dialog.closeTabs.title'), message: T('dialog.closeTabs.message', { count }),
        detail: restore ? T('dialog.closeTabs.restore') : T('dialog.closeTabs.noRestore'),
        checkboxLabel: T('dialog.dontAskAgain'),
      });
      if (r.response !== 1) return;
      if (r.checkboxChecked) { config.warnOnCloseTabs = false; saveConfig(config); }
      closeConfirmed = true;
      setImmediate(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });
      return;
    }
    saveSessionNow();
  });
  mainWindow.on('resize', () => {
    resizeActiveView(mainWindow, mainState);
    const wp = webPanelOpenId && webPanelViews.get(webPanelOpenId);
    if (wp) wp.setBounds(webPanelRect(mainWindow));
  });

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
    for (const [, v] of webPanelViews) { try { if (!v.webContents.isDestroyed()) v.webContents.close(); } catch {} }
    webPanelViews.clear();
    webPanelOpenId = null;
    mainWindow = null;
    if (vpnManager?.activeProfile) {
      await vpnManager.disconnect().catch(() => {});
    }
  });
}

// Sekmenin görünümü ve olayları. Sekme uyutulunca (bkz. sleepTab) aynı sekme için yeni,
// boş bir görünüm kurulur ve eskisi kapatılır: eski görünümden geç gelen olaylar sekmeyi
// değiştirmesin diye işleyiciler görünümün hâlâ sekmenin görünümü olduğunu denetler (own).
function createTabView(win, state, tabId) {
  const isIncognito = state === incognitoState;
  const own = () => { const t = state.tabs.get(tabId); return t && t.view === view ? t : null; };

  // WebContentsView: BrowserView Electron 30'dan beri kullanımdan kaldırılmış durumda.
  const view = new WebContentsView({
    webPreferences: {
      // Şifre kaydetme önerisi ve doldurma; yalıtılmış dünyada, sayfaya bir şey açmaz.
      preload: path.join(__dirname, '../preload/page-preload.js'),
      // En küçük yazı boyutu (Ayarlar › Erişilebilirlik); yalnızca sekme açılırken verilebilir.
      minimumFontSize: normalizeMinFontSize(config.minimumFontSize),
      // Otomatik oynatma ve GPC de yalnızca sekme açılırken verilebilir (ön yükleme argv'den okur).
      autoplayPolicy: autoplayPolicyFor(config),
      additionalArguments: config.globalPrivacyControl !== false ? ['--ilgezdi-gpc'] : [],
      // Ön yükleme alt çerçevelerde de çalışır: parmak izi koruması ve GPC her çerçevede
      // sayfa betiklerinden önce kurulur. Şifre yardımcıları yalnızca ana çerçevede
      // (page-preload.js process.isMainFrame; ana süreç de alt çerçeveden geleni reddeder).
      nodeIntegrationInSubFrames: true,
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
    // Sayfaya yazı yazıldıysa sekme uyutulmaz (yazılan kaybolmasın); yeni sayfada sıfırlanır.
    if (ev.type === 'char') { const t = own(); if (t) t.edited = true; }
    if (!ACTIVATION_EVENTS.has(ev.type)) return;
    const tab = own();
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
    const tab = own();
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
    const tab = own();
    if (!tab) return;
    tab.audible = !!(event && event.audible);
    sendTabsUpdate(win, state);
  });

  // HTML5 tam ekran (video): Electron pencereyi kendiliğinden tam ekrana alıyor ama
  // sekme görünümü eski sınırlarında kalıyor, video pencerenin bir köşesinde
  // görünüyordu. Görünüm tüm pencereye yayılır; çıkınca düzen geri gelir.
  view.webContents.on('enter-html-full-screen', () => {
    if (!own() || !win || win.isDestroyed() || state.activeTabId !== tabId) return;
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
    if (!own() || state.activeTabId !== tabId || !win || win.isDestroyed()) return;
    win.webContents.send('find-result', {
      active: result.activeMatchOrdinal, matches: result.matches, final: result.finalUpdate,
    });
  });

  // Ctrl + fare tekerleği ya da dokunmatik yüzeyde kıstırma
  view.webContents.on('zoom-changed', (e, direction) => {
    if (!own()) return;
    changeZoom(win, state, view.webContents, direction === 'in' ? 1 : -1);
  });

  view.webContents.on('page-title-updated', (e, title) => {
    const tab = own();
    if (tab) tab.title = title;
    sendTabsUpdate(win, state);
  });

  // Ekranı bölme: tıklanan bölme etkin sekme olur (adres çubuğu, bul, yakınlaştırma ona gider).
  view.webContents.on('focus', () => {
    if (own() && inSplit(state, tabId) && state.activeTabId !== tabId && win && !win.isDestroyed()) setActiveTab(win, state, tabId);
  });

  // Yükleme göstergesi: sekmede dönen simge. Eskiden sekmede hiçbir işaret yoktu;
  // sayfanın yüklenip yüklenmediği anlaşılmıyordu (kullanıcı bildirdi).
  view.webContents.on('did-start-loading', () => {
    const tab = own();
    if (tab && !tab.loading) { tab.loading = true; sendTabsUpdate(win, state); }
  });
  view.webContents.on('did-stop-loading', () => {
    const tab = own();
    if (tab && tab.loading) { tab.loading = false; sendTabsUpdate(win, state); }
  });

  // Site simgesi: sayfanın kendi bildirdiği adresten, sekmenin oturumuyla ve çerezsiz
  // (favicon-cache.js). Dış favicon servisi yok.
  view.webContents.on('page-favicon-updated', (e, favicons) => {
    if (!faviconCache) return;
    const pageUrl = view.webContents.getURL();
    faviconCache.update(view.webContents.session, pageUrl, favicons, { incognito: isIncognito }).then((dataUrl) => {
      const tab = own();
      if (tab && dataUrl && tab.favicon !== dataUrl && faviconHost(tab.url) === faviconHost(pageUrl)) {
        tab.favicon = dataUrl;
        sendTabsUpdate(win, state);
      }
    }).catch(() => {});
  });

  view.webContents.on('did-navigate', (e, navUrl) => {
    const tab = own();
    if (!tab) return;
    tab.edited = false;
    tab.usedMedia = false;
    tab.pageBlocked = { ads: 0, trackers: 0, cookies: 0, thirdParty: 0 };
    {
      // Başka siteye geçince eski simge kalmasın; önbellekte varsa hemen gösterilir.
      if (faviconHost(tab.url) !== faviconHost(navUrl)) tab.favicon = faviconCache ? faviconCache.get(navUrl, { incognito: isIncognito }) : '';
      tab.url = navUrl;
      tab.blockedPopups = [];
    }
    // Kaydedilmiş site yakınlaştırması; yoksa varsayılan sayfa yakınlaştırması (Ayarlar ›
    // Erişilebilirlik). Gizli pencerede kalıcı site değeri kullanılmaz: sekmenin ilk
    // sayfasında varsayılan uygulanır, sonra kullanıcının yakınlaştırması korunur.
    if (!isIncognito) {
      const saved = zoomStore.get(zoomKeyForUrl(navUrl));
      if (Math.abs(view.webContents.getZoomFactor() - saved) > 0.001) view.webContents.setZoomFactor(saved);
    } else if (tab && !tab.zoomInitialized) {
      tab.zoomInitialized = true;
      view.webContents.setZoomFactor(normalizePageZoom(config.defaultPageZoom));
    }
    if (state.activeTabId === tabId && win && !win.isDestroyed()) {
      win.webContents.send('find-reset');   // yeni belgede eski eşleşme sayısı anlamsız
      sendZoomState(win, state);
      sendPopupState(win, state);
    }
    sendTabsUpdate(win, state);
  });

  view.webContents.on('did-navigate-in-page', (e, navUrl) => {
    const tab = own();
    if (tab) tab.url = navUrl;
    sendTabsUpdate(win, state);
  });

  view.webContents.on('did-finish-load', () => {
    const tab = own();
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
    const tab = own();
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

  return view;
}

function createTab(win, state, url = config.homepage, opts = {}) {
  const tabId = ++state.tabCounter;
  const isIncognito = state === incognitoState;

  const view = createTabView(win, state, tabId);

  // Başlangıç başlığı: boş sekme → "Yeni Sekme", aksi halde alan adı.
  const isBlank = !url || url === 'about:blank';
  let initialTitle = T('tab.new');
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
    lastActiveAt: Date.now(),   // sekme uyutma: son etkin olduğu an
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
    if (tabId !== state.activeTabId || tab.pendingLoad || tab.view.webContents.isDestroyed()) return;
    try {
      const result = await tab.view.webContents.executeJavaScript(
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
    const partner = splitPartner(state);
    if (partner) partner.view.setVisible(false);
    sendSplitState(win, state);
    return;
  }
  if (splitActive(state)) { layoutSplit(win, state); return; }
  tab.view.setVisible(true);
  tab.view.setBounds(contentRect(win, state));
  sendSplitState(win, state);
}

// ─── Ekranı bölme ─────────────────────────────────────────────────────────────
// İki sekme yan yana; etkin sekme odaktaki bölmedir (adres çubuğu, bul, yakınlaştırma
// ona gider). Çiftin dışındaki bir sekmeye geçilince bölme askıya alınır, çiftten bir
// sekmeye dönülünce yeniden görünür. Sekmelerden biri kapanınca bölme biter.
const SPLIT_GAP = 6;       // bölmeler arası çizgi (arayüz çizer, sürüklenir)
const SPLIT_TOP = 3;       // bölmenin üstünde odak şeridi
function normalizeSplitRatio(r) { const n = Number(r); return Number.isFinite(n) ? Math.min(0.8, Math.max(0.2, n)) : 0.5; }
function splitValid(state) {
  const sp = state.split;
  return !!sp && state.tabs.has(sp.left) && (sp.choosing ? sp.right == null : state.tabs.has(sp.right));
}
function inSplit(state, id) {
  return splitValid(state) && (state.split.left === id || state.split.right === id);
}
function splitActive(state) { return !state.htmlFullscreen && inSplit(state, state.activeTabId); }
function splitPartner(state) {
  if (!splitActive(state) || state.split.choosing) return null;
  const other = state.split.left === state.activeTabId ? state.split.right : state.split.left;
  return state.tabs.get(other) || null;
}
function splitRects(win, state) {
  const r = contentRect(win, state);
  const avail = Math.max(r.width - SPLIT_GAP, 200);
  const lw = Math.round(avail * normalizeSplitRatio(state.split.ratio));
  return {
    area: r,
    left: { x: r.x, y: r.y + SPLIT_TOP, width: lw, height: r.height - SPLIT_TOP },
    right: { x: r.x + lw + SPLIT_GAP, y: r.y + SPLIT_TOP, width: avail - lw, height: r.height - SPLIT_TOP },
    divider: { x: r.x + lw, y: r.y, width: SPLIT_GAP, height: r.height },
  };
}
function layoutSplit(win, state) {
  const sp = state.split;
  const rects = splitRects(win, state);
  for (const side of ['left', 'right']) {
    const t = sp[side] != null ? state.tabs.get(sp[side]) : null;
    if (!t) continue;
    t.view.setVisible(true);
    t.view.setBounds(rects[side]);
  }
  sendSplitState(win, state, rects);
}
function sendSplitState(win, state, rects) {
  if (!win || win.isDestroyed()) return;
  const visible = splitActive(state) && !state.viewHidden;
  const payload = visible ? {
    active: true,
    choosing: !!state.split.choosing,
    leftId: state.split.left,
    rightId: state.split.right,
    focus: state.split.left === state.activeTabId ? 'left' : 'right',
    ratio: normalizeSplitRatio(state.split.ratio),
    rects: rects || splitRects(win, state),
  } : { active: false };
  const key = JSON.stringify(payload);
  if (state.__splitSent === key) return;
  state.__splitSent = key;
  win.webContents.send('split-state', payload);
}

// Adres çubuğuyla aynı çözümleme: adres gibi görünüyorsa https, değilse arama.
function inputToUrl(text) {
  const url = String(text || '').trim();
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.includes('.') && !url.includes(' ') ? 'https://' + url : searchUrl(url);
}

function startSplit(win, state, withTabId) {
  const leftId = state.activeTabId;
  const left = state.tabs.get(leftId);
  if (!left || !isWebUrl(left.url) || state.htmlFullscreen) return { ok: false, error: 'web-only' };
  if (withTabId != null) {
    const right = state.tabs.get(withTabId);
    if (!right || withTabId === leftId || !isWebUrl(right.url)) return { ok: false, error: 'web-only' };
    state.split = { left: leftId, right: withTabId, ratio: 0.5, choosing: false };
  } else {
    state.split = { left: leftId, right: null, ratio: 0.5, choosing: true };
  }
  setActiveTab(win, state, leftId);
  return { ok: true };
}

function endSplit(win, state) {
  if (!state.split) return;
  state.split = null;
  const active = state.tabs.get(state.activeTabId);
  if (active) setActiveTab(win, state, state.activeTabId);
  else sendSplitState(win, state);
}

// Sayfa görünümünün yeri: kenar çubuğunun (dikey sekmeler açıksa onların da) sağı, araç
// çubuğunun altı; yan panel açıksa sağdan daralır. Sol kenarı arayüz ölçüp bildirir
// (ui-layout), bilinmiyorsa kenar çubuğu genişliği.
function contentRect(win, state) {
  const bounds = win.getContentBounds();
  const left = Number.isFinite(state.leftInset) ? state.leftInset : SIDEBAR_WIDTH;
  const usableWidth = bounds.width - left;
  return {
    x:      left,
    y:      TOOLBAR_HEIGHT,
    width:  state.panelIsOpen ? Math.max(usableWidth - PANEL_WIDTH, 100) : Math.max(usableWidth, 100),
    height: bounds.height - TOOLBAR_HEIGHT - STATUSBAR_HEIGHT,
  };
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
  if (previous && state.activeTabId !== tabId) previous.lastActiveAt = Date.now();
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
  // Bölme: etkin sekme çiftteyse ortağı da görünür kalır.
  const pairIds = inSplit(state, tabId) ? [state.split.left, state.split.right].filter((id) => id != null && id !== tabId) : [];
  for (const [id, t] of state.tabs) {
    if (id !== tabId && !pairIds.includes(id)) content.removeChildView(t.view);
  }
  // Açık bir glance yeni sekmenin altında kalıp görünmez hâle gelmesin.
  closeGlance();
  for (const id of pairIds) {
    const p = state.tabs.get(id);
    content.addChildView(p.view);
    if (p.pendingLoad) {
      const pending = p.pendingLoad;
      p.pendingLoad = null;
      p.sleeping = false;
      loadTabContent(p.view.webContents, pending.url, pending.restore);
    }
  }
  content.addChildView(tab.view);   // zaten çocuksa en üste taşınır
  const group = tab.groupId && state.groups.get(tab.groupId);
  if (group && group.collapsed) group.collapsed = false;
  if (tab.pendingLoad) {
    const pending = tab.pendingLoad;
    tab.pendingLoad = null;
    tab.sleeping = false;
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
  pruneGroups(state);
  if (state.split && (state.split.left === tabId || state.split.right === tabId)) state.split = null;

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

// ─── Sekme uyutma (Ayarlar › Genel › Sistem) ─────────────────────────────────
// Uzun süredir açılmayan sekmenin görünümü boş bir görünümle değiştirilir: sayfanın
// süreci ve belleği bırakılır, geri/ileri geçmişi saklanır. Sekmeye dönülünce oturum
// geri yüklemedeki tembel sekme gibi yeniden yüklenir. Kararlar browser-commands.js'te.
const TAB_SLEEP_CHECK_MS = 30 * 1000;

function sleepTab(win, state, tabId) {
  const tab = state.tabs.get(tabId);
  if (!tab || tab.pendingLoad || !win || win.isDestroyed() || state.activeTabId === tabId) return false;
  const oldView = tab.view;
  const wc = oldView.webContents;
  if (wc.isDestroyed()) return false;
  const h = wc.navigationHistory;
  const restore = snapshotHistory(h.getAllEntries(), h.getActiveIndex());
  tab.view = createTabView(win, state, tabId);
  if (tab.muted) tab.view.webContents.setAudioMuted(true);
  tab.pendingLoad = { url: tab.url, restore: restore.entries ? restore : null };
  tab.sleeping = true;
  tab.loading = false;
  tab.audible = false;
  try { win.contentView.removeChildView(oldView); } catch {}
  try { wc.close(); } catch {}
  sendTabsUpdate(win, state);
  return true;
}

function sleepInactiveTabs() {
  const minutes = normalizeTabSleepMinutes(config.tabSleepMinutes);
  if (!minutes) return;
  const now = Date.now();
  for (const [state, win] of [[mainState, mainWindow], [incognitoState, incognitoWindow]]) {
    if (!win || win.isDestroyed()) continue;
    for (const [tabId, tab] of [...state.tabs]) {
      let devtools = false;
      try { devtools = tab.view.webContents.isDevToolsOpened(); } catch {}
      if (shouldSleepTab({ ...tab, devtools }, { now, minutes, active: state.activeTabId === tabId || inSplit(state, tabId) }) && sleepTab(win, state, tabId)) {
        diag.info('tabs', 'Kullanılmayan sekme uyutuldu', { minutes });
      }
    }
  }
}
setInterval(sleepInactiveTabs, TAB_SLEEP_CHECK_MS).unref?.();

function sendTabsUpdate(win, state) {
  if (!win || win.isDestroyed()) return;
  const tabsData = [...state.tabs.entries()].map(([id, tab]) => {
    const g = tab.groupId && state.groups.get(tab.groupId);
    return {
      id, url: tab.url, title: tab.title, isActive: id === state.activeTabId,
      pinned: !!tab.pinned, audible: !!tab.audible, muted: !!tab.muted,
      loading: !!tab.loading, favicon: tab.favicon || '', sleeping: !!tab.sleeping,
      group: g ? { id: g.id, title: g.title, color: g.color, hex: tabGroups.GROUP_COLORS[g.color], collapsed: !!g.collapsed } : null,
      split: inSplit(state, id) ? (state.split.left === id ? 'left' : 'right') : null,
    };
  });
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
  defaultFactor: () => normalizePageZoom(config.defaultPageZoom),
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
  const defaultFactor = normalizePageZoom(config.defaultPageZoom);
  win.webContents.send('zoom-changed', { factor: wc ? wc.getZoomFactor() : defaultFactor, defaultFactor });
}

function changeZoom(win, state, wc, direction) {
  if (!wc || wc.isDestroyed()) return;
  // Sıfırla (Ctrl+0) varsayılan sayfa yakınlaştırmasına döner (Chrome gibi), %100'e değil.
  const defaultFactor = normalizePageZoom(config.defaultPageZoom);
  const factor = direction ? nextZoomFactor(wc.getZoomFactor(), direction) : defaultFactor;
  wc.setZoomFactor(factor);
  // Chromium yakınlaştırmayı alan adı başına uygular; aynı sitedeki diğer
  // sekmeler de değişir. Kalıcı değer yalnızca normal pencerede yazılır.
  if (state !== incognitoState) zoomStore.set(zoomKeyForUrl(wc.getURL()), factor);
  if (win && !win.isDestroyed() && activeTabContents(state) === wc) {
    win.webContents.send('zoom-changed', { factor, defaultFactor });
  }
}

// Varsayılan sayfa yakınlaştırması değişince: kendi kaydı olmayan açık sekmeler yeni orana
// geçer (gizli penceredekiler de); site başına kaydedilmiş yakınlaştırma korunur.
function applyDefaultZoomToOpenTabs() {
  const def = normalizePageZoom(config.defaultPageZoom);
  for (const [st, w] of [[mainState, mainWindow], [incognitoState, incognitoWindow]]) {
    for (const [, tab] of st.tabs) {
      const wc = tab.view.webContents;
      if (wc.isDestroyed()) continue;
      if (st === incognitoState || !zoomStore.has(zoomKeyForUrl(wc.getURL()))) wc.setZoomFactor(def);
    }
    if (w && !w.isDestroyed()) sendZoomState(w, st);
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
    case 'devtools':   toggleDevTools(wc); break;
    case 'screenshot': takeScreenshot(win, wc); break;
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

// Sayfanın geliştirici araçları ayrı pencerede açılır: sekme görünümü arayüzün üstünde
// çizildiği için yerleşik yerleşim sayfayı daraltıp arayüzle çakışırdı. Arayüzün kendi
// araçları yalnızca --dev ile açılır; İlgezdi sayfaları (yeni sekme, hata) incelenmez.
const canInspect = (wc) => !!wc && !wc.isDestroyed() && (isWebUrl(wc.getURL()) || wc.getURL().startsWith('view-source:'));

function toggleDevTools(wc) {
  if (!canInspect(wc)) return;
  if (wc.isDevToolsOpened()) wc.closeDevTools();
  else wc.openDevTools({ mode: 'detach' });
}

function inspectElementAt(wc, point) {
  if (!canInspect(wc)) return;
  if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'detach' });
  wc.inspectElement(Math.round(Number(point && point.x)) || 0, Math.round(Number(point && point.y)) || 0);
}

// Ekran görüntüsü: sayfanın görünen alanı PNG olarak indirme klasörüne yazılır ve panoya
// kopyalanır. "Klasörde göster" yalnızca İlgezdi'nin yazdığı dosyalar için çalışır.
const screenshotPaths = new Set();

function screenshotFileName(pageUrl, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  return safeFileName(T('screenshot.fileName', { host: sourceHost(pageUrl) || T('screenshot.page'), stamp }) + '.png');
}

async function takeScreenshot(win, wc) {
  if (!wc || wc.isDestroyed() || !isWebUrl(wc.getURL())) return;
  const note = (payload) => { if (win && !win.isDestroyed()) win.webContents.send('status-note', payload); };
  try {
    const image = await wc.capturePage();
    if (image.isEmpty()) throw new Error('boş görüntü');
    const dir = (config.downloadFolder && fs.existsSync(config.downloadFolder)) ? config.downloadFolder : app.getPath('downloads');
    const file = uniquePath(dir, screenshotFileName(wc.getURL()));
    await fs.promises.writeFile(file, image.toPNG());
    clipboard.writeImage(image);
    screenshotPaths.add(file);
    if (screenshotPaths.size > 20) screenshotPaths.delete(screenshotPaths.values().next().value);
    diag.info('screenshot', 'Ekran görüntüsü kaydedildi', { width: image.getSize().width, height: image.getSize().height });
    note({ text: T('screenshot.saved', { file: path.basename(file) }), reveal: file });
  } catch (e) {
    logError('screenshot', e);
    note({ text: T('screenshot.failed'), error: true });
  }
}

// ─── Okuma modu (F9, adres çubuğundaki kitap düğmesi) ─────────────────────────
// Makale sayfanın yalıtılmış dünyasında çıkarılır, ağaç burada yeniden doğrulanır, resimler
// sekmenin oturumuyla çerezsiz indirilip gömülür (bkz. reader.js).
const READER_WORLD_ID = 1017;
let readerScript = null;

ipcMain.handle('reader-extract', async (event) => {
  const { state } = getContextFromEvent(event);
  const wc = activeTabContents(state);
  if (!wc || !isWebUrl(wc.getURL())) return { ok: false, reason: 'not-web' };
  const url = wc.getURL();
  let raw = null;
  try {
    if (!readerScript) readerScript = reader.buildExtractScript(fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8'));
    raw = await wc.executeJavaScriptInIsolatedWorld(READER_WORLD_ID, [{ code: readerScript }]);
  } catch (e) {
    logError('reader', e);
  }
  if (wc.isDestroyed() || wc.getURL() !== url) return { ok: false, reason: 'navigated' };
  if (!raw || raw.error || !Array.isArray(raw.nodes)) return { ok: false, reason: 'no-article' };
  const nodes = reader.validateReaderNodes(raw.nodes);
  if (reader.readerTextLength(nodes) < 200) return { ok: false, reason: 'no-article' };
  const images = await reader.fetchReaderImages(reader.collectImageUrls(nodes, 30),
    (u) => wc.session.fetch(u, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(8000) }));
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  diag.info('reader', 'Okuma modu açıldı', { images: images.size });
  return {
    ok: true, url, title: str(raw.title, 300), byline: str(raw.byline, 200), siteName: str(raw.siteName, 120),
    lang: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(raw.lang) ? raw.lang : '', dir: raw.dir === 'rtl' ? 'rtl' : 'ltr',
    minutes: reader.readingMinutes(nodes), nodes: reader.embedImages(nodes, images),
  };
});

ipcMain.handle('screenshot-reveal', (_e, file) => {
  if (typeof file !== 'string' || !screenshotPaths.has(file) || !fs.existsSync(file)) return false;
  require('electron').shell.showItemInFolder(file);
  return true;
});

// Sağ tık › Resim içinde resim. Video adresiyle (blob: dahil) ya da tıklanan noktayla
// bulunur (yakınlaştırma hesaba katılır). Menü tıklaması kullanıcı hareketi olarak iletilir;
// sayfa betiği bu yolu kendiliğinden tetikleyemez.
function toggleVideoPictureInPicture(wc, arg) {
  if (!wc || wc.isDestroyed()) return;
  const src = JSON.stringify(String((arg && arg.src) || ''));
  const zoom = wc.getZoomFactor() || 1;
  const x = Math.round((Number(arg && arg.x) || 0) / zoom);
  const y = Math.round((Number(arg && arg.y) || 0) / zoom);
  const code = `(() => {
    const vids = Array.from(document.querySelectorAll('video'));
    let v = ${src} ? vids.find((el) => el.currentSrc === ${src}) : null;
    if (!v) { const hit = document.elementFromPoint(${x}, ${y}); v = hit && hit.closest ? hit.closest('video') : null; }
    if (!v && vids.length === 1) v = vids[0];
    if (!v) return 'yok';
    if (document.pictureInPictureElement === v) return document.exitPictureInPicture().then(() => 'çıktı');
    return v.requestPictureInPicture().then(() => 'açıldı', (e) => e.name);
  })()`;
  wc.executeJavaScript(code, true).catch(() => {});
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
    case 'screenshot': takeScreenshot(win, wc); break;
    case 'inspect':    inspectElementAt(wc, arg); break;
    case 'video-pip':  toggleVideoPictureInPicture(wc, arg); break;
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
    zoomDefault:  normalizePageZoom(config.defaultPageZoom),
    incognito:    state === incognitoState,
    thirdPartyCookiesBlocked: config.blockThirdPartyCookies !== false,
    // Reklam ve izleyici koruması: bu sayfada engellenenler ve site istisnası.
    blocking:     config.blockAds !== false || config.blockTrackers !== false,
    siteAllowed:  isWebUrl(url) ? isWhitelisted(url, url) : false,
    pageBlocked:  tab && tab.pageBlocked ? { ...tab.pageBlocked } : { ads: 0, trackers: 0, cookies: 0, thirdParty: 0 },
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
    type: 'warning', buttons: [T('common.cancel'), T('dialog.resetPerms.reset')], defaultId: 0, cancelId: 0,
    title: T('dialog.resetPerms.title'),
    message: T('dialog.resetPerms.message'),
    detail: T('dialog.resetPerms.detail'),
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
  if (!origin || !wc) return { ok: false, error: T('siteData.invalidSite') };
  const host = new URL(origin).hostname;
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const r = await dialog.showMessageBox(parent, {
    type: 'warning', buttons: [T('common.cancel'), T('common.delete')], defaultId: 0, cancelId: 0,
    title: T('dialog.siteData.title'),
    message: T('dialog.siteData.message', { host }),
    detail: T('dialog.siteData.detail'),
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
    return { ok: false, error: T('siteData.failed') };
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
      return { url: t.pendingLoad.url, title: t.title, pinned: !!t.pinned, entries: r ? r.entries : null, index: r ? r.index : undefined, groupId: t.groupId };
    }
    let entries = null;
    let index;
    try {
      const h = t.view.webContents.navigationHistory;
      entries = h.getAllEntries();
      index = h.getActiveIndex();
    } catch {}
    return { url: t.url, title: t.title, pinned: !!t.pinned, entries, index, groupId: t.groupId };
  });
  const used = new Set(tabs.map((t) => t.groupId).filter(Boolean));
  const { list, index: groupIndex } = tabGroups.serializeGroups([...mainState.groups.values()], used);
  for (const t of tabs) { t.group = groupIndex.has(t.groupId) ? groupIndex.get(t.groupId) : undefined; delete t.groupId; }
  return serializeSession(tabs, ids.indexOf(mainState.activeTabId), list);
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
  const groupIds = (saved.groups || []).map((g) => createGroup(mainState, g));
  saved.tabs.forEach((t, i) => {
    const tab = mainState.tabs.get(ids[i]);
    if (tab && Number.isInteger(t.group) && groupIds[t.group]) tab.groupId = groupIds[t.group];
  });
  reorderTabs(mainState, tabGroups.contiguous([...mainState.tabs.keys()], (id) => mainState.tabs.get(id).groupId));
  pruneGroups(mainState);
  setActiveTab(mainWindow, mainState, ids[saved.activeIndex] != null ? ids[saved.activeIndex] : ids[0]);
  diag.info('session', 'Oturum geri yüklendi', { tabs: ids.length, pinned: saved.tabs.filter((t) => t.pinned).length, groups: mainState.groups.size });
  return true;
}

// ─── Sekme işlemleri: sabitle, sessize al, taşı, çoğalt, sağ tık menüsü ───────
function reorderTabs(state, ids) {
  const next = new Map();
  for (const id of ids) if (state.tabs.has(id)) next.set(id, state.tabs.get(id));
  state.tabs = next;
}

// ─── Sekme grupları (kararlar tab-groups.js'te) ───────────────────────────────
function createGroup(state, init = {}) {
  const id = 'g' + (++state.groupCounter);
  state.groups.set(id, {
    id,
    title: tabGroups.normalizeTitle(init.title),
    color: init.color ? tabGroups.normalizeColor(init.color) : tabGroups.nextColor([...state.groups.values()]),
    collapsed: init.collapsed === true,
  });
  return id;
}

// Sekmesi kalmayan grup silinir.
function pruneGroups(state) {
  const used = new Set([...state.tabs.values()].map((t) => t.groupId).filter(Boolean));
  for (const id of [...state.groups.keys()]) if (!used.has(id)) state.groups.delete(id);
}

function groupOrderIds(state) {
  return tabGroups.contiguous([...state.tabs.keys()], (id) => state.tabs.get(id).groupId);
}

// Daraltılan grupta etkin sekme varsa grubun dışındaki en yakın sekmeye geçilir;
// dışarıda sekme yoksa grup daraltılmaz.
function collapseGroup(win, state, groupId) {
  const group = state.groups.get(groupId);
  if (!group) return false;
  const active = state.tabs.get(state.activeTabId);
  if (active && active.groupId === groupId) {
    const ids = [...state.tabs.keys()];
    const i = ids.indexOf(state.activeTabId);
    const outside = ids.map((id, j) => ({ id, d: Math.abs(j - i) }))
      .filter(({ id }) => state.tabs.get(id).groupId !== groupId)
      .sort((a, b) => a.d - b.d)[0];
    if (!outside) return false;
    setActiveTab(win, state, outside.id);
  }
  group.collapsed = true;
  return true;
}

function runGroupAction(win, state, groupId, action, value) {
  const group = state.groups.get(groupId);
  if (!group || !win || win.isDestroyed()) return { ok: false };
  const members = [...state.tabs.keys()].filter((id) => state.tabs.get(id).groupId === groupId);
  switch (action) {
    case 'rename': group.title = tabGroups.normalizeTitle(value); break;
    case 'color': group.color = tabGroups.normalizeColor(value); break;
    case 'toggle-collapse':
      if (group.collapsed) group.collapsed = false;
      else if (!collapseGroup(win, state, groupId)) return { ok: false };
      break;
    case 'new-tab': {
      const url = config.newTabMode === 'custom' && isWebUrl(config.customNewTabUrl) ? config.customNewTabUrl : 'about:blank';
      const newId = createTab(win, state, url);
      state.tabs.get(newId).groupId = groupId;
      group.collapsed = false;
      reorderTabs(state, tabGroups.placeInGroup([...state.tabs.keys()], (id) => state.tabs.get(id).groupId, newId, groupId));
      setActiveTab(win, state, newId);
      break;
    }
    case 'ungroup':
      for (const id of members) delete state.tabs.get(id).groupId;
      state.groups.delete(groupId);
      break;
    case 'close':
      group.collapsed = false;
      for (const id of members) closeTab(win, state, id);
      break;
    default:
      return { ok: false };
  }
  pruneGroups(state);
  sendTabsUpdate(win, state);
  return { ok: true };
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
      if (tab.pinned) { pinnedSet.add(tabId); delete tab.groupId; } else pinnedSet.delete(tabId);
      reorderTabs(state, orderAfterPin(ids, pinnedSet, tabId));
      break;
    case 'group-new': {
      if (tab.pinned) return { ok: false };
      const groupId = createGroup(state);
      tab.groupId = groupId;
      reorderTabs(state, groupOrderIds(state));
      // Yeni grubun adı hemen yazılabilsin (Chrome'daki gibi düzenleme kutusu açılır).
      win.webContents.send('tab-group-rename', { groupId });
      break;
    }
    case 'group-add': {
      const groupId = String(arg || '');
      if (tab.pinned || !state.groups.has(groupId)) return { ok: false };
      tab.groupId = groupId;
      reorderTabs(state, tabGroups.placeInGroup(ids, (id) => state.tabs.get(id).groupId, tabId, groupId));
      break;
    }
    case 'group-remove': {
      if (!tab.groupId) return { ok: false };
      const groupId = tab.groupId;
      delete tab.groupId;
      // Grubun sonuna taşınır ki grup bölünmesin.
      const rest = ids.filter((id) => id !== tabId);
      let last = -1;
      rest.forEach((id, i) => { if (state.tabs.get(id).groupId === groupId) last = i; });
      rest.splice(last + 1 || index, 0, tabId);
      reorderTabs(state, rest);
      break;
    }
    case 'mute':
    case 'unmute':
    case 'toggle-mute': {
      const muted = action === 'toggle-mute' ? !wc.isAudioMuted() : action === 'mute';
      wc.setAudioMuted(muted);
      tab.muted = muted;
      break;
    }
    case 'move': {
      const moved = moveTabId(ids, pinnedSet, tabId, Number(arg));
      // Grup üyeliği yeni komşulara göre (iki komşusu aynı gruptaysa o gruba girer).
      const g = tab.pinned ? null : tabGroups.groupAfterMove(moved, (id) => state.tabs.get(id).groupId, tabId);
      if (g) tab.groupId = g; else delete tab.groupId;
      reorderTabs(state, tabGroups.contiguous(moved, (id) => state.tabs.get(id).groupId));
      break;
    }
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
      if (tab.groupId) state.tabs.get(newId).groupId = tab.groupId;   // gruptaki sekmenin sağı: aynı grup
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
    case 'split-with':
      return startSplit(win, state, tabId);
    case 'split-exit':
      if (!inSplit(state, tabId)) return { ok: false };
      endSplit(win, state);
      break;
    default:
      return { ok: false };
  }
  pruneGroups(state);
  sendTabsUpdate(win, state);
  return { ok: true };
}

ipcMain.handle('tab-action', (event, payload) => {
  const { win, state } = getContextFromEvent(event);
  const action = String((payload && payload.action) || '');
  if (!TAB_ACTIONS.has(action)) return { ok: false };
  try {
    return runTabAction(win, state, Number(payload.tabId), action, action === 'group-add' ? payload.groupId : payload.toIndex);
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
    groups: [...state.groups.values()], groupId: tab.groupId || null,
    canSplit: tabId !== state.activeTabId && !inSplit(state, tabId) && isWebUrl(tab.url) && isWebUrl(state.tabs.get(state.activeTabId)?.url),
    inSplit: inSplit(state, tabId),
  });
  const toTemplate = (item) => (item.type ? { type: 'separator' } : item.submenu ? {
    label: item.label, enabled: item.enabled, submenu: item.submenu.map(toTemplate),
  } : {
    label: item.label,
    enabled: item.enabled,
    click: () => {
      try { runTabAction(win, state, tabId, item.id, item.arg); } catch (e) { logError('tab-menu', e, { id: item.id }); }
    },
  });
  Menu.buildFromTemplate(model.map(toTemplate)).popup({ window: win });
  return { ok: true };
});

// Ekranı bölme: araç çubuğu düğmesi (sağ bölme için seçim), seçim, oran, kapatma.
ipcMain.handle('split-start', (event) => {
  const { win, state } = getContextFromEvent(event);
  if (splitActive(state)) { endSplit(win, state); return { ok: true, ended: true }; }
  return startSplit(win, state, null);
});
ipcMain.handle('split-choose', (event, payload) => {
  const { win, state } = getContextFromEvent(event);
  const sp = state.split;
  if (!sp || !sp.choosing || !state.tabs.has(sp.left)) return { ok: false };
  let rightId = null;
  if (payload && payload.tabId != null) {
    const id = Number(payload.tabId);
    const t = state.tabs.get(id);
    if (!t || id === sp.left || !isWebUrl(t.url)) return { ok: false };
    rightId = id;
  } else {
    const url = inputToUrl(payload && payload.text);
    if (!url || !isWebUrl(url)) return { ok: false };
    rightId = createTab(win, state, url);
    const ids = [...state.tabs.keys()];
    const pins = new Set(ids.filter((id) => state.tabs.get(id).pinned));
    reorderTabs(state, moveTabId(ids, pins, rightId, ids.indexOf(sp.left) + 1));
  }
  state.split = { ...sp, right: rightId, choosing: false };
  setActiveTab(win, state, rightId);
  return { ok: true };
});
ipcMain.handle('split-exit', (event) => {
  const { win, state } = getContextFromEvent(event);
  endSplit(win, state);
  return { ok: true };
});
ipcMain.on('split-ratio', (event, ratio) => {
  const { win, state } = getContextFromEvent(event);
  if (!splitActive(state)) return;
  state.split.ratio = normalizeSplitRatio(ratio);
  layoutSplit(win, state);
});
ipcMain.handle('split-swap', (event) => {
  const { win, state } = getContextFromEvent(event);
  if (!splitActive(state) || state.split.choosing) return { ok: false };
  state.split = { ...state.split, left: state.split.right, right: state.split.left, ratio: 1 - normalizeSplitRatio(state.split.ratio) };
  layoutSplit(win, state);
  sendTabsUpdate(win, state);
  return { ok: true };
});

// Grup başlığı: tıklayınca daralt/aç, sağ tıkta menü, çift tıkta ad.
const GROUP_ACTIONS = new Set(['rename', 'color', 'toggle-collapse', 'new-tab', 'ungroup', 'close']);
ipcMain.handle('tab-group-action', (event, payload) => {
  const { win, state } = getContextFromEvent(event);
  const action = String((payload && payload.action) || '');
  if (!GROUP_ACTIONS.has(action)) return { ok: false };
  try { return runGroupAction(win, state, String(payload.groupId || ''), action, payload.value); }
  catch (e) { logError('tab-group', e, { action }); return { ok: false }; }
});

ipcMain.handle('tab-group-menu', (event, payload) => {
  const { win, state } = getContextFromEvent(event);
  const groupId = String((payload && payload.groupId) || '');
  const group = state.groups.get(groupId);
  if (!group || !win || win.isDestroyed()) return { ok: false };
  const run = (action, value) => () => {
    try { runGroupAction(win, state, groupId, action, value); } catch (e) { logError('tab-group-menu', e, { action }); }
  };
  Menu.buildFromTemplate([
    { label: T('tabGroup.rename'), click: () => win.webContents.send('tab-group-rename', { groupId }) },
    { label: T('tabGroup.colorMenu'), submenu: tabGroups.COLOR_IDS.map((c) => ({
      label: T('tabGroup.color.' + c), type: 'radio', checked: group.color === c, click: run('color', c),
    })) },
    { type: 'separator' },
    { label: T('tabGroup.newTab'), click: run('new-tab') },
    { label: group.collapsed ? T('tabGroup.expand') : T('tabGroup.collapse'), click: run('toggle-collapse') },
    { type: 'separator' },
    { label: T('tabGroup.ungroup'), click: run('ungroup') },
    { label: T('tabGroup.close'), click: run('close') },
  ]).popup({ window: win });
  return { ok: true };
});

// ─── Tam ekran uyarısı ────────────────────────────────────────────────────────
// "Çıkmak için Esc" ayrı bir görünümde: sayfa bu katmanı gizleyemez ya da taklit
// edemez (tam ekran sahteciliğine karşı). Betik çalıştırmaz.
const FULLSCREEN_NOTICE_HTML = '<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:transparent;font:14px/1.2 Segoe UI,system-ui,sans-serif"><div style="background:rgba(14,20,34,.92);color:#f3ead6;padding:11px 18px;border-radius:8px;border:1px solid rgba(212,168,90,.55)">' + i18n.TH('fullscreen.notice', {}, { key: '<b>Esc</b>' }) + '</div></body>';

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
ipcMain.handle('new-tab', (event, url, opts) => {
  const { win, state } = getContextFromEvent(event);
  const id = createTab(win, state, url);
  // Orta tık ve Ctrl+tık (yer imleri, geçmiş, kartlar) arka planda açar; Chrome gibi.
  if (!(opts && opts.background === true)) setActiveTab(win, state, id);
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
const MAIN_OWNED_KEYS = ['permissionDecisions', 'authSessionEnc', 'passwordNeverSave', 'consents', 'webPanels'];
function publicConfig() {
  const c = { ...config };
  for (const k of MAIN_OWNED_KEYS) delete c[k];
  return c;
}

ipcMain.handle('get-config',  ()          => publicConfig());
ipcMain.handle('save-config', (e, newCfg) => {
  const incoming = newCfg && typeof newCfg === 'object' ? { ...newCfg } : {};
  for (const k of MAIN_OWNED_KEYS) delete incoming[k];
  // Kaydın kaynağı (onay kayıtları için): senkron uzak ayarları uygularken 'sync' gönderir.
  const source = incoming.__source === 'sync' ? 'sync' : 'settings';
  delete incoming.__source;
  // Tanılama izni yalnızca kendi düğmesinden ya da Veri ve Gizlilik'ten değişir: Ayarlar'ın
  // Kaydet'i panel açıldığındaki eski değeri geri gönderip izni geri çeviriyordu.
  delete incoming.diagnosticsConsent;
  // Arayüzden gelen değerler doğrulanır: geçersiz politika Chromium'a verilmez.
  if ('webrtcPolicy' in incoming) incoming.webrtcPolicy = normalizeWebrtcPolicy(incoming.webrtcPolicy);
  if ('secureDns' in incoming) incoming.secureDns = normalizeSecureDns(incoming.secureDns);
  if ('blockThirdPartyCookies' in incoming) incoming.blockThirdPartyCookies = incoming.blockThirdPartyCookies !== false;
  if ('startupMode' in incoming) incoming.startupMode = normalizeStartupMode(incoming.startupMode);
  if ('threatProtection' in incoming) incoming.threatProtection = incoming.threatProtection !== false;
  if ('defaultPageZoom' in incoming) incoming.defaultPageZoom = normalizePageZoom(incoming.defaultPageZoom);
  if ('minimumFontSize' in incoming) incoming.minimumFontSize = normalizeMinFontSize(incoming.minimumFontSize);
  if ('reduceMotion' in incoming) incoming.reduceMotion = incoming.reduceMotion === true;
  if ('highContrast' in incoming) incoming.highContrast = incoming.highContrast === true;
  for (const k of ['globalPrivacyControl', 'cleanLinks', 'blockAutoplay', 'fingerprintShield']) if (k in incoming) incoming[k] = incoming[k] !== false;
  for (const k of ['clearSiteDataOnExit', 'clearHistoryOnExit', 'warnOnCloseTabs', 'doNotTrack']) if (k in incoming) incoming[k] = incoming[k] === true;
  for (const k of ['omniboxHistory', 'autoUpdateCheck', 'discoverFeed', 'syncSettings', 'syncBookmarks', 'logEnabled', 'offerToSavePasswords']) if (k in incoming) incoming[k] = incoming[k] !== false;
  for (const k of ['verticalTabs', 'verticalTabsCollapsed']) if (k in incoming) incoming[k] = incoming[k] === true;
  if ('hardwareAcceleration' in incoming) incoming.hardwareAcceleration = incoming.hardwareAcceleration !== false;
  if ('tabSleepMinutes' in incoming) incoming.tabSleepMinutes = normalizeTabSleepMinutes(incoming.tabSleepMinutes);
  if ('language' in incoming) incoming.language = i18n.LANGUAGES.some((l) => l.code === incoming.language) ? incoming.language : 'auto';
  const previous = configEffectsSnapshot();
  const before = dataCatalog.snapshot(config);
  config = { ...config, ...incoming };
  saveConfig(config);
  applyConfigEffects(previous);
  recordConsentChanges(before, source);
  return publicConfig();
});

// ─── Veri ve Gizlilik ─────────────────────────────────────────────────────────
// Katalogdaki bir iznin değeri nereden değişirse değişsin (Veri ve Gizlilik sayfası, Ayarlar,
// senkron, sıfırlama, tanılama sorusu) onay kayıtlarına yazılır.
function recordConsentChanges(before, source) {
  try { consentLog.recordChanges(dataCatalog.diff(before, dataCatalog.snapshot(config)), source); }
  catch (e) { console.error('Onay kaydı yazılamadı:', e.message); }
}

function dataCenterState() {
  return {
    values: dataCatalog.snapshot(config),
    searchEngine: SEARCH_ENGINES[config.searchEngine] ? config.searchEngine : 'duckduckgo',
    secureDns: normalizeSecureDns(config.secureDns),
    vpnEnabled: config.vpnEnabled === true,
  };
}

ipcMain.handle('data-center-state', () => dataCenterState());

// Tek bir izni açar ya da kapatır. Kapatılan iznin bağlı izinleri de kapanır (ör. Ülgen'in
// sohbet izni kapanınca sayfa paylaşımı). Üst izin kapalıyken alt izin açılamaz.
ipcMain.handle('data-center-set', (e, id, value, from) => {
  const item = dataCatalog.BY_ID[id];
  if (!item || item.soon || typeof value !== 'boolean') return { ok: false, error: 'invalid' };
  if (value && item.requires && !dataCatalog.valueOf(dataCatalog.BY_ID[item.requires], config)) return { ok: false, error: 'requires', requires: item.requires };
  const source = from === 'ulgen' ? 'ulgen' : 'data-center';
  const previous = configEffectsSnapshot();
  const before = dataCatalog.snapshot(config);
  const next = { ...config, consents: { ...(config.consents || {}) } };
  const apply = (it, on) => {
    if (it.consent) next.consents[it.id] = on;
    else next[it.config] = dataCatalog.configValue(it, on);
  };
  apply(item, value);
  if (!value) for (const dep of dataCatalog.dependentsOf(id)) apply(dataCatalog.BY_ID[dep], false);
  config = next;
  saveConfig(config);
  applyConfigEffects(previous);
  const changes = dataCatalog.diff(before, dataCatalog.snapshot(config));
  try { consentLog.recordChanges(changes, source); } catch (err) { console.error('Onay kaydı yazılamadı:', err.message); }
  return { ok: true, changes, ...dataCenterState() };
});

ipcMain.handle('consent-log-list', (e, opts) => {
  const limit = Math.min(200, Math.max(1, Number(opts && opts.limit) || 30));
  const before = opts && Number.isInteger(opts.before) ? opts.before : null;
  return consentLog.list({ limit, before });
});
ipcMain.handle('consent-log-verify', () => consentLog.verify());
ipcMain.handle('consent-log-export', async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(parent, {
    title: T('data.log.exportTitle'),
    defaultPath: path.join(app.getPath('documents'), 'ilgezdi-onay-kayitlari-' + stamp + '.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(r.filePath, JSON.stringify(consentLog.exportData(), null, 2));
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// Ayar değişikliğinin çalışan uygulamaya etkileri: Kaydet ve Ayarları sıfırla ortak kullanır.
function configEffectsSnapshot() {
  return { webrtcPolicy: config.webrtcPolicy, secureDns: config.secureDns, startupMode: config.startupMode, threatProtection: config.threatProtection !== false, defaultPageZoom: normalizePageZoom(config.defaultPageZoom) };
}

function applyConfigEffects(previous) {
  if (config.webrtcPolicy !== previous.webrtcPolicy) applyWebrtcPolicyToAllTabs();
  if (config.secureDns !== previous.secureDns) applySecureDns();
  if (normalizePageZoom(config.defaultPageZoom) !== previous.defaultPageZoom) applyDefaultZoomToOpenTabs();
  // Koruma yeniden açıldıysa, zamanı gelmiş listeler hemen indirilir.
  if ((config.threatProtection !== false) !== previous.threatProtection && threats) threats.onConfigChanged();
  if (config.startupMode !== previous.startupMode) {
    if (normalizeStartupMode(config.startupMode) === 'restore') scheduleSessionSave();
    else deleteSessionFiles();   // kapatılınca açık sekmelerin kaydı diskte tutulmaz
  }
}

// Ayarlar › Genel › Sistem › Ayarları sıfırla. Geri alınamaz: açık onay alınır ve neyin
// korunduğu söylenir (bkz. browser-commands.js → resetConfig).
ipcMain.handle('reset-settings', async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  let confirmed = false;
  try {
    const r = await dialog.showMessageBox(parent, {
      type: 'warning', buttons: [T('common.cancel'), T('dialog.resetSettings.confirm')], defaultId: 0, cancelId: 0,
      title: T('dialog.resetSettings.title'), message: T('dialog.resetSettings.message'),
      detail: T('dialog.resetSettings.detail'),
    });
    confirmed = r.response === 1;
  } catch { confirmed = false; }
  if (!confirmed) return { ok: false, canceled: true };
  const previous = configEffectsSnapshot();
  const before = dataCatalog.snapshot(config);
  config = resetConfig(config, DEFAULT_CONFIG);
  saveConfig(config);
  applyConfigEffects(previous);
  recordConsentChanges(before, 'reset');
  updateBlockerConfig({ level: config.blockLevel || 'medium', whitelist: [], enabled: config.blockAds !== false || config.blockTrackers !== false });
  diag.info('settings', 'Ayarlar varsayılana döndürüldü');
  return { ok: true, config: publicConfig(), relaunchNeeded: (config.hardwareAcceleration !== false) !== hardwareAccelerationAtStart };
});

ipcMain.handle('app-runtime-info', () => ({ hardwareAcceleration: hardwareAccelerationAtStart, language: languageAtStart, locale: i18n.locale() }));
// "Kaydet ve yeniden başlat" (donanım hızlandırma). Açık sekmeler "Kaldığım yerden devam et"
// seçiliyse geri gelir.
ipcMain.handle('app-relaunch', () => { app.relaunch(); app.quit(); return true; });

// VPN
ipcMain.handle('vpn-get-profiles',   ()           => vpnManager?.getProfiles() || []);
// Doğrulama hatası kullanıcıya gösterilecek bir mesaj — ham Electron IPC
// istisnası olarak sızdırmak yerine düzgün bir sonuç nesnesi döndürülür.
ipcMain.handle('vpn-add-profile',    async (e, profile) => {
  try {
    const p = await vpnManager?.addProfile(profile);
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
  vpnManager ? vpnManager.testDnsLeak() : { tested: false, error: T('vpn.moduleNotReady') });

// Faz 3 — Şifreli Loglar
ipcMain.handle('logs-get-stats',  ()            => secureLog?.getStats() || {});
ipcMain.handle('logs-search',     (e, query)    => secureLog?.search(query) || { items: [], total: 0, pages: 1, page: 1 });
ipcMain.handle('logs-export-csv', (e, query)    => secureLog?.exportCSV(query) || '');
ipcMain.handle('logs-clear',      ()            => { secureLog?.clearLogs(); return true; });
ipcMain.handle('logs-clear-range', (e, range) => {
  const since = historyRangeStart(range);
  if (since === null || !secureLog) return { ok: false };
  if (since === 0) { secureLog.clearLogs(); return { ok: true, all: true }; }
  return { ok: true, removed: secureLog.clearSince(since) };
});
ipcMain.handle('logs-delete',     (e, ids)      => ({ ok: true, removed: secureLog ? secureLog.deleteEntries(sanitizeLogIds(ids)) : 0 }));
ipcMain.handle('logs-sync',       async (e, { serverUrl, apiKey }) => {
  return await secureLog?.syncToServer(serverUrl, apiKey) || { synced: 0, success: false };
});

// Faz 4 — Ayarlar & Özelleştirme
ipcMain.handle('pick-download-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: T('dialog.downloadFolder.title'),
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
      buttons:   [T('common.cancel'), T('dialog.clearData.confirm')],
      defaultId: 0,
      cancelId:  0,
      title:     T('dialog.clearData.title'),
      message:   T('dialog.clearData.message'),
      detail:    T('dialog.clearData.detail'),
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
  if (!d || d.state !== 'completed' || !d.savePath || !fs.existsSync(d.savePath)) return { ok: false, error: T('downloads.fileMissing') };
  if (isDangerousFile(d.filename)) {
    const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const r = await dialog.showMessageBox(parent, {
      type: 'warning', buttons: [T('common.cancel'), T('common.open')], defaultId: 0, cancelId: 0,
      title: T('dialog.openFile.title'),
      message: T('dialog.openFile.message', { file: d.filename }),
      detail: T('dialog.openFile.detail'),
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

// ─── Parmak izi koruması (fingerprint-shield.js) ─────────────────────────────
// Ön yükleme her çerçevede sayfa betiklerinden önce betiği ister. Site ve tohum sayfanın
// beyanından değil ana süreçteki çerçeve ağacından okunur: alt çerçeveler üst sayfanın
// sitesini kullanır, tohum oturum başına rastgele anahtarla üretilir (gizli pencerenin
// oturumu ayrı anahtar alır). Koruma kapalıyken ya da sitede engelleme kapatılmışsa
// yalnızca deviceMemory sınırı uygulanır.
const fingerprintSeedFor = createSeeder();
function fingerprintScriptFor(frame, ses) {
  const top = frame ? (frame.top || frame) : null;
  const topUrl = top ? String(top.url || '') : '';
  const web = /^https?:\/\//i.test(topUrl);
  const farble = web && config.fingerprintShield !== false && !isWhitelisted(topUrl, topUrl);
  const site = farble ? registrableDomain(new URL(topUrl).hostname) : '';
  return shieldScript({ farble, seed: farble ? fingerprintSeedFor(ses, site) : '' });
}
ipcMain.on('fp-script', (event) => {
  try { event.returnValue = fingerprintScriptFor(event.senderFrame, event.sender.session); } catch { event.returnValue = ''; }
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
  if (!event.senderFrame || event.senderFrame.parent) return;   // yalnızca ana çerçeve
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

  // İlgezdi'nin oluşturduğu şifre gönderildi: sormadan kaydedilir (Chrome gibi). Kullanıcı
  // şifreyi hiç görmediği için öneri yok sayılırsa hesaba bir daha giremezdi.
  const gen = ctx.tab.generatedPassword;
  if (gen && gen.origin === origin && gen.password === password) {
    ctx.tab.generatedPassword = null;
    saveCapturedCredential({ url: pageUrl, username, password, action: kind.action, existingId: kind.id || null }).then((r) => {
      const win = ctx.state === incognitoState ? incognitoWindow : mainWindow;
      if (r && r.ok && win && !win.isDestroyed()) win.webContents.send('pw-generated-saved', { host: new URL(origin).host, username });
    }).catch((e) => logError('pw-generated', e));
    return;
  }

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
  if (!offer) return { ok: false, error: T('pwOffer.expired') };
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

// Ayarlar › Şifreler › Yeni Şifre Ekle formundaki "Oluştur" düğmesi.
ipcMain.handle('pw-generate', () => generatePassword());

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
  if (!event.senderFrame || event.senderFrame.parent) return;   // yalnızca ana çerçeve
  const ctx = tabFromContents(event.sender);
  if (!ctx || !ctx.win || ctx.win.isDestroyed() || ctx.state.activeTabId !== ctx.tabId) return;
  const wc = event.sender;
  const pageUrl = wc.getURL();
  const origin = webOrigin(pageUrl);
  const creds = origin ? getForOrigin(pageUrl) : [];
  // Kayıt formunda güçlü şifre önerisi: yalnızca şifre kasaya kaydedilebilecekse (gizli
  // pencerede, ayar kapalıyken ya da "bu sitede asla" denen sitede oluşturulan şifre kaybolurdu).
  const offerGenerate = !!(rect && rect.newPassword === true) && !!origin && !ctx.incognito
    && config.offerToSavePasswords !== false && canSavePasswords()
    && !(Array.isArray(config.passwordNeverSave) && config.passwordNeverSave.includes(origin));
  if (!creds.length && !offerGenerate) return;
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
  const generated = offerGenerate ? generatePassword() : '';
  const useGenerated = () => {
    if (wc.isDestroyed() || webOrigin(wc.getURL()) !== origin) return;
    ctx.tab.generatedPassword = { origin, password: generated };
    wc.send('pw-fill', { password: generated, generated: true });
  };
  const template = [
    ...(offerGenerate ? [
      { label: T('pwMenu.useGenerated', { password: generated }), click: useGenerated },
      { label: T('pwMenu.savedOnSubmit'), enabled: false },
      { type: 'separator' },
    ] : []),
    ...(creds.length ? [
      { label: T('pwMenu.savedAccounts', { host: new URL(origin).host }), enabled: false },
      { type: 'separator' },
      ...creds.slice(0, 10).map((c) => ({ label: c.username || T('pwMenu.noUsername'), click: () => fill(c.id) })),
      { type: 'separator' },
    ] : []),
    { label: T('pwMenu.manage'), click: () => { if (!ctx.win.isDestroyed()) ctx.win.webContents.send('browser-command', 'passwords'); } },
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
  const { win, state } = getContextFromEvent(event);
  state.viewHidden = true;
  const tab = state.tabs.get(state.activeTabId);
  if (tab) tab.view.setVisible(false);
  // Bölme açıksa ortak bölme de gizlenir (ekran katmanının üstünde kalmasın).
  const partner = splitPartner(state);
  if (partner) partner.view.setVisible(false);
  sendSplitState(win, state);
});

ipcMain.handle('show-active-tab', (event) => {
  const { win, state } = getContextFromEvent(event);
  state.viewHidden = false;
  resizeActiveView(win, state);
});

ipcMain.on('panel-opened', (event, isOpen) => {
  const { win, state } = getContextFromEvent(event);
  state.panelIsOpen = isOpen;
  if (!isOpen && win === mainWindow) hideWebPanel(win);
  resizeActiveView(win, state);
});

// ─── Kenar çubuğunda web paneli ───────────────────────────────────────────────
// Site sağ panelde, sekmelerle aynı oturum ve korumalarla (engelleyici, parmak izi,
// WebRTC) açılır. Panel kapatılınca görünüm ağaçtan çıkar ama yaşar (sohbet bağlantısı
// kopmaz); listeden kaldırılınca kapatılır. Gizli pencerede web paneli yok.
const webPanelViews = new Map();   // id → WebContentsView (yalnızca ana pencere)
let webPanelOpenId = null;

function webPanelRect(win) {
  const b = win.getContentBounds();
  const top = TOOLBAR_HEIGHT + webPanels.HEADER_HEIGHT;
  return { x: Math.max(b.width - PANEL_WIDTH, 0), y: top, width: PANEL_WIDTH, height: Math.max(b.height - top - STATUSBAR_HEIGHT, 100) };
}

function webPanelList() {
  const list = webPanels.normalizePanels(config.webPanels);
  return list;
}

function sendWebPanelState(win) {
  if (!win || win.isDestroyed()) return;
  const view = webPanelOpenId && webPanelViews.get(webPanelOpenId);
  const wc = view && !view.webContents.isDestroyed() ? view.webContents : null;
  win.webContents.send('webpanel-state', {
    openId: webPanelOpenId,
    title: wc ? wc.getTitle() : '',
    url: wc ? wc.getURL() : '',
    canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
    loading: wc ? wc.isLoading() : false,
  });
}

function createWebPanelView(win, panel) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/page-preload.js'),
      minimumFontSize: normalizeMinFontSize(config.minimumFontSize),
      autoplayPolicy: autoplayPolicyFor(config),
      additionalArguments: config.globalPrivacyControl !== false ? ['--ilgezdi-gpc'] : [],
      nodeIntegrationInSubFrames: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: BROWSING_PARTITION,
    },
  });
  const wc = view.webContents;
  configureSession(wc.session);
  applyWebrtcPolicy(wc);
  bindBrowserInput(wc, win, mainState, 'page');
  // Panelden açılan bağlantılar yeni sekmede; panel başka bir şemaya gidemez.
  wc.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url) && win && !win.isDestroyed()) setActiveTab(win, mainState, createTab(win, mainState, url));
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => { if (!isWebUrl(url)) e.preventDefault(); });
  for (const ev of ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-stop-loading', 'did-start-loading']) {
    wc.on(ev, () => { if (webPanelViews.get(panel.id) === view && webPanelOpenId === panel.id) sendWebPanelState(win); });
  }
  wc.on('page-favicon-updated', (e, favicons) => {
    if (!faviconCache) return;
    faviconCache.update(wc.session, wc.getURL(), favicons, { incognito: false })
      .then((dataUrl) => { if (dataUrl && win && !win.isDestroyed()) win.webContents.send('webpanel-favicon', { id: panel.id, dataUrl }); })
      .catch(() => {});
  });
  wc.loadURL(panel.url).catch(() => {});
  return view;
}

function showWebPanel(win, id) {
  const panel = webPanelList().find((p) => p.id === id);
  if (!panel || !win || win.isDestroyed()) return false;
  if (webPanelOpenId && webPanelOpenId !== id) hideWebPanel(win);
  let view = webPanelViews.get(id);
  if (!view || view.webContents.isDestroyed()) {
    view = createWebPanelView(win, panel);
    webPanelViews.set(id, view);
  }
  win.contentView.addChildView(view);
  view.setBounds(webPanelRect(win));
  view.setVisible(true);
  webPanelOpenId = id;
  mainState.panelIsOpen = true;
  resizeActiveView(win, mainState);
  sendWebPanelState(win);
  return true;
}

function hideWebPanel(win) {
  if (!webPanelOpenId) return;
  const view = webPanelViews.get(webPanelOpenId);
  webPanelOpenId = null;
  if (view && win && !win.isDestroyed()) { try { win.contentView.removeChildView(view); } catch {} }
  sendWebPanelState(win);
}

function destroyWebPanel(win, id) {
  const view = webPanelViews.get(id);
  if (webPanelOpenId === id) hideWebPanel(win);
  webPanelViews.delete(id);
  try { if (view && !view.webContents.isDestroyed()) view.webContents.close(); } catch {}
}

function mainOnly(event) {
  const { win, state } = getContextFromEvent(event);
  return state === mainState && win && !win.isDestroyed() ? win : null;
}

ipcMain.handle('webpanel-list', (event) => ({ panels: webPanelList(), openId: webPanelOpenId, allowed: !!mainOnly(event) }));
ipcMain.handle('webpanel-add', (event, input) => {
  const win = mainOnly(event);
  if (!win) return { ok: false, error: 'incognito' };
  // Adres boşsa etkin sekmenin sayfası eklenir.
  const text = String(input || '').trim() || (mainState.tabs.get(mainState.activeTabId)?.url || '');
  const r = webPanels.addPanel(config.webPanels, text, () => require('crypto').randomBytes(5).toString('hex'));
  if (r.error) return { ok: false, error: r.error };
  config.webPanels = r.list;
  saveConfig(config);
  return { ok: true, id: r.id, existed: !!r.existed, panels: webPanelList() };
});
ipcMain.handle('webpanel-remove', (event, id) => {
  const win = mainOnly(event);
  if (!win) return { ok: false };
  destroyWebPanel(win, String(id || ''));
  config.webPanels = webPanels.removePanel(config.webPanels, String(id || ''));
  saveConfig(config);
  return { ok: true, panels: webPanelList() };
});
ipcMain.handle('webpanel-open', (event, id) => {
  const win = mainOnly(event);
  return { ok: !!win && showWebPanel(win, String(id || '')) };
});
ipcMain.handle('webpanel-hide', (event) => {
  const win = mainOnly(event);
  if (win) hideWebPanel(win);
  return { ok: true };
});
ipcMain.handle('webpanel-action', (event, action) => {
  const win = mainOnly(event);
  const view = webPanelOpenId && webPanelViews.get(webPanelOpenId);
  if (!win || !view || view.webContents.isDestroyed()) return { ok: false };
  const wc = view.webContents;
  const panel = webPanelList().find((p) => p.id === webPanelOpenId);
  switch (action) {
    case 'reload': wc.reload(); break;
    case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'home': if (panel) wc.loadURL(panel.url).catch(() => {}); break;
    case 'open-tab': {
      const url = wc.getURL();
      if (isWebUrl(url)) setActiveTab(win, mainState, createTab(win, mainState, url));
      break;
    }
    default: return { ok: false };
  }
  return { ok: true };
});

// Arayüz yerleşimi değişti (dikey sekmeler açıldı/daraldı): içerik alanının sol kenarı.
ipcMain.on('ui-layout', (event, layout) => {
  const { win, state } = getContextFromEvent(event);
  const left = Number(layout && layout.left);
  if (!Number.isFinite(left) || left < 0 || left > 800) return;
  state.leftInset = Math.round(left);
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
// ─── Varsayılan tarayıcı: başka uygulamalardan gelen bağlantılar ─────────────
// Windows bağlantıyı `"İlgezdi.exe" "https://…"` diye başlatır (kayıt: build/installer.nsh).
// Aynı profille ikinci süreç açılmaz (profil dosyaları iki süreçte bozulurdu): ikinci
// başlatma kilidi alamayıp kapanır, adres çalışan pencereye iletilir, yeni sekmede açılır.
const pendingExternalUrls = urlsFromArgv(process.argv);
const isDuplicateInstance = !app.requestSingleInstanceLock();
if (isDuplicateInstance) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const urls = urlsFromArgv(argv);
    if (!mainWindow || mainWindow.isDestroyed()) { pendingExternalUrls.push(...urls); return; }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    openExternalUrls(urls);
  });
}

function openExternalUrls(urls) {
  if (!mainWindow || mainWindow.isDestroyed() || !urls || !urls.length) return false;
  let last = null;
  for (const u of urls) last = createTab(mainWindow, mainState, u);
  if (last) setActiveTab(mainWindow, mainState, last);
  return true;
}

// Varsayılan tarayıcı durumu (Ayarlar › Genel). Windows'ta kullanıcının seçimi (UserChoice)
// okunur. Windows 10+ uygulamanın kendini varsayılan yapmasına izin vermez: düğme Ayarlar ›
// Varsayılan uygulamalar sayfasını İlgezdi seçili açar. macOS/Linux'ta doğrudan istenir.
const DEFAULT_BROWSER_PROGID = 'IlgezdiURL';
function readUserChoiceProgId() {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'],
      { windowsHide: true, timeout: 5000 }, (err, stdout) => {
        const m = !err && String(stdout).match(/ProgId\s+REG_SZ\s+(\S+)/);
        resolve(m ? m[1] : '');
      });
  });
}
ipcMain.handle('default-browser-status', async () => {
  if (process.platform !== 'win32') {
    return { supported: true, isDefault: app.isDefaultProtocolClient('https'), current: '', packaged: app.isPackaged, platform: process.platform };
  }
  const current = await readUserChoiceProgId();
  return { supported: true, isDefault: current === DEFAULT_BROWSER_PROGID, current: current.slice(0, 80), packaged: app.isPackaged, platform: process.platform };
});
ipcMain.handle('default-browser-set', async () => {
  if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Ilgezdi');
    return { ok: true, openedSettings: true };
  }
  return { ok: app.setAsDefaultProtocolClient('http') && app.setAsDefaultProtocolClient('https') };
});

app.whenReady().then(async () => {
  // Aynı profille ikinci başlatma: bağlantı ilk sürece iletildi, bu süreç kapanıyor.
  if (isDuplicateInstance) return;
  // Windows: görev çubuğu / bildirimlerde doğru uygulama kimliği + ikon eşleşmesi
  if (process.platform === 'win32') app.setAppUserModelId('com.ilgezdi.browser');

  // Tanılama İLK kurulur: bundan sonraki her kurulum adımında oluşan hata
  // yakalanıp günlüğe yazılabilsin. (Çökme yakalayıcıları da burada takılıyor.)
  setupDiagnostics(ipcMain, {
    userDataPath:  USER_DATA,
    getConfig:     () => config,
    saveConfig:    (cfg) => { config = cfg; saveConfig(config); },
    getMainWindow: () => mainWindow,
    // Tanılama izni Veri ve Gizlilik kataloğunda da var: değişiklik onay kayıtlarına yazılır.
    onConsentChange: (from, to, source) => {
      try { consentLog.recordChanges([{ id: 'diagnostics', from, to }], source); } catch {}
    },
  });

  // Onay kayıtlarının ilk satırı: kaydın başladığı andaki durum (varsayılanların ispatı).
  try { consentLog.ensureBaseline(dataCatalog.snapshot(config), CONFIG_EXISTED_AT_START ? 'migration' : 'first-run'); }
  catch (e) { console.error('Onay kaydı başlatılamadı:', e.message); }

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
  // Günlük anahtarı işletim sistemi anahtar kasasından eşzamansız çözülür. Oturum, indirme
  // geçmişi ve site simgeleri aynı anahtarla şifreli: pencere ve sekmeler bundan sonra kurulur.
  secureLog  = await SecureLogManager.create(USER_DATA);
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
            title: T('notify.vpnDropped.title'),
            body:  T('notify.vpnDropped.body'),
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
  // Adres çubuğu öneri listesi: sekme görünümü arayüzün üstüne çizildiği için ayrı pencerede.
  setupSuggestPopup({ ipcMain, BrowserWindow, screen, harden: hardenChromeWindow });
  createWindow();

  // Arku Uzak Masaüstü eklentisi: arka plan sürüm denetimi + kullanıcı onaylı güncelleme
  setupBookmarkImport(ipcMain, () => mainWindow);
  setupPasswordManager(ipcMain, {
    userDataPath: USER_DATA,
    getMainWindow: () => mainWindow,
    // Sızmış şifre denetimi: çerezsiz, bellek içi ayrı oturum. Paketlenmemiş kopyada sonda
    // sahte sunucuya yönlendirebilir; kurulu uygulamada adres sabittir.
    fetchPwnedRange: async (prefix) => {
      if (!/^[0-9A-F]{5}$/.test(String(prefix))) throw new Error('geçersiz ön ek');
      const base = (!app.isPackaged && process.env.ILGEZDI_PWNED_BASE) || PWNED_RANGE_URL;
      const res = await session.fromPartition('ilgezdi-pwned').fetch(base + prefix, {
        headers: { 'Add-Padding': 'true' }, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    },
  });

  // Otomatik güncelleme: arka planda denetim + kullanıcı onaylı indirme/kurulum
  setupAutoUpdater(() => mainWindow, { autoCheck: () => config.autoUpdateCheck !== false });

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
    if (mainState.tabs.size !== 0) { openExternalUrls(pendingExternalUrls.splice(0)); return; }
    // "Kaldığım yerden devam et": kayıtlı oturum varsa sekmeler geri gelir.
    const saved = normalizeStartupMode(config.startupMode) === 'restore' ? readSessionFile() : null;
    const external = pendingExternalUrls.splice(0);
    if (saved && restoreSession(saved)) { openExternalUrls(external); return; }
    // Başka bir uygulamadaki bağlantıyla açıldıysa ana sayfa yerine o bağlantı açılır.
    if (openExternalUrls(external)) return;
    // Kullanıcının belirlediği anasayfayı aç (boşsa İlgezdi başlangıç sayfası)
    const id = createTab(mainWindow, mainState, homepageUrl());
    setActiveTab(mainWindow, mainState, id);
  }, 800);
});

// Kapatınca verileri sil (Ayarlar › Genel). Kapanış bir kez ertelenir, silme bitince
// (en çok 8 sn) yeniden istenir. Oturum dosyası pencere kapanırken zaten yazıldı:
// "Kaldığım yerden devam et" açıksa sekmeler geri gelir.
let appQuitting = false;
app.on('before-quit', () => { appQuitting = true; });

let exitCleanupStarted = false;
app.on('before-quit', (event) => {
  if (exitCleanupStarted) return;
  const steps = exitCleanupPlan(config);
  if (!steps.length) return;
  exitCleanupStarted = true;
  event.preventDefault();
  const ses = browsingSession();
  const run = {
    cache:     () => ses.clearCache(),
    siteData:  () => ses.clearStorageData(),
    history:   () => secureLog?.clearLogs(),
    downloads: () => { for (const [id, d] of downloads) if (!d.item) downloads.delete(id); saveDownloadHistoryNow(); },
    favicons:  () => faviconCache?.clear(),
  };
  const work = Promise.all(steps.map((s) => Promise.resolve().then(run[s]).catch((e) => logError('exit-cleanup', e))));
  const limit = new Promise((resolve) => setTimeout(resolve, 8000));
  Promise.race([work, limit]).finally(() => app.quit());
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
  incognitoState.groups = new Map();
  incognitoState.groupCounter = 0;
  incognitoState.split = null;

  incognitoWindow = new BrowserWindow({
    width: 1200, height: 800,
    frame: false,
    backgroundColor: '#0a0e1a',
    title: T('window.incognitoTitle'),
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

async function readAuthSession() {
  // Yeni format: şifreli blob
  if (config.authSessionEnc) {
    try {
      if (!(await osCrypto.isAvailable())) return null;
      const { text, reencrypt } = await osCrypto.decryptBuffer(Buffer.from(config.authSessionEnc, 'base64'));
      const session = JSON.parse(text);
      // İşletim sistemi anahtarı yenilendiyse oturum yeni anahtarla yeniden yazılır.
      if (reencrypt) await writeAuthSession(session);
      return session;
    } catch { return null; }
  }
  // Eski format (düz metin) → şifreli formata taşı
  if (config.authSession) {
    const legacy = config.authSession;
    await writeAuthSession(legacy);
    return legacy;
  }
  return null;
}

async function writeAuthSession(sessionData) {
  // Önce şifrelenir; yapılandırma nesnesine şifreleme bittikten sonra yazılır (arada
  // save-config yapılandırmayı yeni bir nesneyle değiştirmiş olabilir).
  const enc = sessionData && (await osCrypto.isAvailable())
    ? (await osCrypto.encryptText(JSON.stringify(sessionData))).toString('base64')
    : null;
  delete config.authSession; // düz metin kopya asla kalmasın
  if (enc) config.authSessionEnc = enc;
  else delete config.authSessionEnc;
  saveConfig(config);
}

ipcMain.handle('auth-get-session', () => readAuthSession());

ipcMain.handle('auth-save-session', async (e, sessionData) => {
  await writeAuthSession(sessionData);
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
