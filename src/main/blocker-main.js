/**
 * İlgezdi — Ana Süreç Reklam / İzleyici Engelleyici
 *
 * main.js configureSession içindeki TEK onBeforeRequest dinleyicisi
 * shouldBlockUrl()'u çağırır (Electron'da bir oturuma tek dinleyici takılabilir).
 * Böylece engelleyici tüm sekme oturumlarında (persist + incognito) çalışır.
 *
 * SEVİYELER — neyi, neden
 *   low    : yalnızca bilinen reklam ağı ALAN ADLARI
 *   medium : + izleyici ve çerez bildirimi alan adları             (varsayılan)
 *   high   : + URL YOLU desenleri (daha agresif, bazı siteleri bozabilir)
 *   full   : + üçüncü taraf alt kaynaklar (yaklaşık kayıtlı alan adı karşılaştırması)
 *
 * Denetim düzeltmeleri (O-08, O-09, D-10):
 *   • Yol desenleri eskiden VARSAYILAN seviyede de uygulanıyor ve çok genişti:
 *     /\/collect/ Shopify'ın /collections/ yollarını, /\/sponsor/ GitHub
 *     /sponsors sayfalarını, /\/banner/ ve /\/pixel/ meşru görselleri engelliyordu.
 *     Yol desenleri artık yalnızca high/full'da ve daraltılmış hâlde.
 *   • 'facebook.com/tr' gibi girdiler hostname kümesindeydi; yalnızca hostname
 *     karşılaştırıldığı için HİÇBİR ZAMAN eşleşmiyordu. Host+yol kurallarına taşındı.
 *   • full seviyesinin tek farkı olan blockThirdParty hiç uygulanmamıştı.
 *   • Her engellenen istekte arayüze IPC mesajı gidiyordu (saniyede yüzlerce);
 *     artık saniyede en fazla bir kez. byDomain sınırsız büyüyordu; sınırlandı.
 */

'use strict';

// ─── Alan adı listeleri ───────────────────────────────────────────────────────
const AD_DOMAINS = new Set([
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'adservice.google.com', 'adnxs.com', 'adsafeprotected.com',
  'advertising.com', 'ads.yahoo.com', 'ads.twitter.com',
  'static.ads-twitter.com', 'amazon-adsystem.com',
  'media.net', 'outbrain.com', 'taboola.com', 'revcontent.com',
  'popads.net', 'popcash.net', 'propellerads.com', 'juicyads.com',
  'trafficjunky.net', 'exoclick.com', 'adsterra.com', 'hilltopads.net',
  'ads.pubmatic.com', 'ads.openx.net', 'rubiconproject.com',
  'casalemedia.com', 'contextweb.com', 'appnexus.com',
]);

const TRACKER_DOMAINS = new Set([
  'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
  'googletagservices.com', 'hotjar.com', 'mixpanel.com', 'segment.com', 'segment.io',
  'amplitude.com', 'heap.io', 'fullstory.com', 'logrocket.com',
  'crazyegg.com', 'mouseflow.com', 'clicktale.com',
  'connect.facebook.net',
  'bat.bing.com', 'analytics.twitter.com', 'ads.linkedin.com',
  'snap.licdn.com',
  'scorecardresearch.com', 'comscore.com', 'quantserve.com',
  'bluekai.com', 'krxd.net', 'demdex.net', 'omtrdc.net',
  'chartbeat.com', 'newrelic.com', 'nr-data.net', 'bugsnag.com',
  'sentry.io', 'datadoghq.com', 'rollbar.com',
]);

// Aynı alan adındaki meşru içerikle karışan izleyiciler: host + yol öneki.
// (Eskiden hostname kümesindeydiler ve hiç eşleşmiyorlardı.)
const TRACKER_HOST_PATHS = [
  { host: 'facebook.com',  path: '/tr' },
  { host: 'pinterest.com', path: '/ct' },
  { host: 'tiktok.com',    path: '/i18n/pixel' },
];

const COOKIE_BANNER_DOMAINS = new Set([
  'cookiebot.com', 'cookielaw.org', 'onetrust.com',
  'trustarc.com', 'quantcast.mgr.consensu.org',
  'cdn.cookie-script.com', 'cdn.cookiepro.com',
]);

// ─── URL yolu desenleri (yalnızca high / full) ───────────────────────────────
// Dar tutuldu: her desen gerçek bir reklam/izleyici uç noktasını hedefler ve
// yaygın meşru yollarla (collections, sponsors, banner görselleri) çakışmaz.
const AD_PATH_PATTERNS = [
  /\/(ads|adserver|adframe|pagead)\//i,
  /\/popunder/i,
  /doubleclick/i,
];
const TRACKER_PATH_PATTERNS = [
  /\/gtag\/js/i,
  /\/ga\.js(\?|$)/i,
  /\/analytics\.js(\?|$)/i,
  /\/fbevents\.js/i,
  /\/(g\/|r\/)?collect\?/i,           // GA toplama uç noktası (sorgu dizesiyle)
  /\/(pixel|beacon|tracking-pixel)\.(gif|png)(\?|$)/i,
];

// ─── Seviye ayarları ─────────────────────────────────────────────────────────
const LEVEL_CONFIG = {
  low:    { blockAds: true, blockTrackers: false, blockCookieBanners: false, pathPatterns: false, blockThirdParty: false },
  medium: { blockAds: true, blockTrackers: true,  blockCookieBanners: true,  pathPatterns: false, blockThirdParty: false },
  high:   { blockAds: true, blockTrackers: true,  blockCookieBanners: true,  pathPatterns: true,  blockThirdParty: false },
  full:   { blockAds: true, blockTrackers: true,  blockCookieBanners: true,  pathPatterns: true,  blockThirdParty: true  },
};

// ─── Durum ────────────────────────────────────────────────────────────────────
let blockerConfig = { level: 'medium', whitelist: [], enabled: true };

const BY_DOMAIN_MAX = 200;
let blockStats = {
  total: 0, ads: 0, trackers: 0, cookies: 0, thirdParty: 0,
  today: 0, todayDate: new Date().toDateString(),
  byDomain: {},
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}
function getDomain(url) {
  return hostOf(url).replace(/^www\./, '');
}

function isWhitelisted(url, pageUrl) {
  // Beyaz liste SAYFA bazında da uygulanır: kullanıcı "bu siteye izin ver"
  // dediğinde o sayfanın yüklediği üçüncü taraf kaynaklar da engellenmemeli.
  const candidates = [getDomain(url)];
  if (pageUrl) candidates.push(getDomain(pageUrl));
  return blockerConfig.whitelist.some(d =>
    candidates.some(dom => dom && (dom === d || dom.endsWith('.' + d)))
  );
}

function matchesDomainSet(url, set) {
  const domain = getDomain(url);
  if (!domain) return false;
  if (set.has(domain)) return true;
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function matchesHostPath(url, rules) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  return rules.some(r =>
    (host === r.host || host.endsWith('.' + r.host)) && u.pathname.startsWith(r.path)
  );
}

// Yaklaşık kayıtlı alan adı (eTLD+1). Tam Public Suffix List yerine yaygın iki
// seviyeli uzantılar elle ele alınır — "full" seviyesinin yeterince doğru olması
// için yeterli; yanlış tahmin yalnızca ek engellemeye değil İZNE yol açacak
// şekilde tasarlandı (bilinmeyen durumda üçüncü taraf SAYILMAZ).
const TWO_LEVEL_SUFFIXES = new Set([
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr', 'k12.tr', 'bel.tr', 'gen.tr', 'av.tr', 'biz.tr', 'info.tr', 'web.tr',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'co.kr', 'com.br', 'com.cn', 'co.in', 'co.nz', 'co.za',
]);
function registrableDomain(host) {
  const parts = String(host || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  if (TWO_LEVEL_SUFFIXES.has(last2)) return parts.slice(-3).join('.');
  return last2;
}

function isThirdParty(url, pageUrl) {
  if (!pageUrl) return false;                 // bilinmiyorsa izin ver (siteyi bozma)
  const a = registrableDomain(hostOf(url));
  const b = registrableDomain(hostOf(pageUrl));
  return !!a && !!b && a !== b;
}

function isAdUrl(url, cfg) {
  if (matchesDomainSet(url, AD_DOMAINS)) return true;
  return cfg.pathPatterns && AD_PATH_PATTERNS.some(p => p.test(url));
}

function isTrackerUrl(url, cfg) {
  if (matchesDomainSet(url, TRACKER_DOMAINS)) return true;
  if (matchesHostPath(url, TRACKER_HOST_PATHS)) return true;
  return cfg.pathPatterns && TRACKER_PATH_PATTERNS.some(p => p.test(url));
}

function isCookieBannerUrl(url) {
  return matchesDomainSet(url, COOKIE_BANNER_DOMAINS);
}

function updateTodayStats() {
  const today = new Date().toDateString();
  if (blockStats.todayDate !== today) {
    blockStats.today     = 0;
    blockStats.todayDate = today;
  }
}

function recordBlock(url, type) {
  updateTodayStats();
  blockStats.total++;
  blockStats.today++;
  blockStats[type] = (blockStats[type] || 0) + 1;
  const domain = getDomain(url);
  if (!domain) return;
  if (domain in blockStats.byDomain) {
    blockStats.byDomain[domain]++;
    return;
  }
  // Sınır: uzun oturumlarda sınırsız büyüyüp bellek tüketmesin. Sınırdaysa en
  // az engellenen alan adını çıkar.
  const keys = Object.keys(blockStats.byDomain);
  if (keys.length >= BY_DOMAIN_MAX) {
    let minKey = keys[0];
    for (const k of keys) if (blockStats.byDomain[k] < blockStats.byDomain[minKey]) minKey = k;
    delete blockStats.byDomain[minKey];
  }
  blockStats.byDomain[domain] = 1;
}

// ─── Arayüz bildirimi (kısılmış) ──────────────────────────────────────────────
let notifyWindow = null;
let notifyTimer  = null;

function scheduleNotify() {
  if (notifyTimer) return;                     // bu saniye içinde zaten planlandı
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    if (notifyWindow && !notifyWindow.isDestroyed()) {
      notifyWindow.webContents.send('block-stats', { ...blockStats, byDomain: { ...blockStats.byDomain } });
    }
  }, 1000);
  if (notifyTimer.unref) notifyTimer.unref();
}

function attachBlocker(mainWindow) {
  notifyWindow = mainWindow;
  console.log('[İlgezdi] Engelleyici aktif — Seviye:', blockerConfig.level);
}

/**
 * true dönerse istek engellenmeli (istatistik de kaydedilir).
 * @param {string} url
 * @param {{ resourceType?: string, referrer?: string, pageUrl?: string }} [details]
 *   main.js onBeforeRequest ayrıntıları. Verilmezse üçüncü taraf ve sayfa bazlı
 *   beyaz liste denetimi atlanır (geriye dönük uyumlu).
 */
function shouldBlockUrl(url, details) {
  if (!blockerConfig.enabled) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;

  const resourceType = details && details.resourceType;
  // Ana çerçeve gezinmesini asla engelleme: kullanıcı bir adrese gitmek istedi.
  if (resourceType === 'mainFrame') return false;

  const pageUrl = details && (details.pageUrl || details.referrer) || '';
  if (isWhitelisted(url, pageUrl)) return false;

  const cfg = LEVEL_CONFIG[blockerConfig.level] || LEVEL_CONFIG.medium;
  let type = null;
  if (cfg.blockAds && isAdUrl(url, cfg))                          type = 'ads';
  else if (cfg.blockTrackers && isTrackerUrl(url, cfg))           type = 'trackers';
  else if (cfg.blockCookieBanners && isCookieBannerUrl(url))      type = 'cookies';
  else if (cfg.blockThirdParty && isThirdParty(url, pageUrl))     type = 'thirdParty';
  if (!type) return false;

  recordBlock(url, type);
  scheduleNotify();
  return true;
}

// ─── Yapılandırma (IPC üzerinden) ─────────────────────────────────────────────
function updateBlockerConfig(newConfig) {
  if (!newConfig || typeof newConfig !== 'object') return;
  if (newConfig.level && LEVEL_CONFIG[newConfig.level]) blockerConfig.level = newConfig.level;
  if (Array.isArray(newConfig.whitelist)) {
    blockerConfig.whitelist = newConfig.whitelist
      .map(d => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
      .filter(Boolean)
      .slice(0, 1000);
  }
  if (typeof newConfig.enabled === 'boolean') blockerConfig.enabled = newConfig.enabled;
}

function getBlockStats() {
  updateTodayStats();
  return { ...blockStats, byDomain: { ...blockStats.byDomain }, level: blockerConfig.level };
}

module.exports = {
  attachBlocker, shouldBlockUrl, updateBlockerConfig, getBlockStats,
  _internals: { registrableDomain, isThirdParty, matchesDomainSet, LEVEL_CONFIG },
  _resetForTest: () => {
    blockerConfig = { level: 'medium', whitelist: [], enabled: true };
    blockStats = { total: 0, ads: 0, trackers: 0, cookies: 0, thirdParty: 0, today: 0, todayDate: new Date().toDateString(), byDomain: {} };
  },
};
