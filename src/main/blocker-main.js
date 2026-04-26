/**
 * İlgezdi — Faz 6: Ana Process Engelleyici
 * blocker-main.js — main.js içine require edilecek
 * 
 * Kullanım (main.js içinde):
 *   const { setupBlocker } = require('./blocker-main');
 *   setupBlocker(session, mainWindow);
 */

'use strict';

const { net } = require('electron');

// ─── Engelleme Listeleri ───────────────────────────────────────────────────────
// Yaygın reklam & tracker domainleri (genişletilebilir)
const AD_DOMAINS = new Set([
  'doubleclick.net','googlesyndication.com','googleadservices.com',
  'adservice.google.com','adnxs.com','adsafeprotected.com',
  'advertising.com','ads.yahoo.com','ads.twitter.com',
  'connect.facebook.net','static.ads-twitter.com','amazon-adsystem.com',
  'media.net','outbrain.com','taboola.com','revcontent.com',
  'popads.net','popcash.net','propellerads.com','juicyads.com',
  'trafficjunky.net','exoclick.com','adsterra.com','hilltopads.net',
  'ads.pubmatic.com','ads.openx.net','rubiconproject.com',
  'casalemedia.com','contextweb.com','appnexus.com',
]);

const TRACKER_DOMAINS = new Set([
  'google-analytics.com','analytics.google.com','googletagmanager.com',
  'googletagservices.com','hotjar.com','mixpanel.com','segment.com',
  'amplitude.com','heap.io','fullstory.com','logrocket.com',
  'crazyegg.com','mouseflow.com','clicktale.com',
  'facebook.com/tr','connect.facebook.net',
  'bat.bing.com','analytics.twitter.com','ads.linkedin.com',
  'snap.licdn.com','pinterest.com/ct','tiktok.com/i18n',
  'scorecardresearch.com','comscore.com','quantserve.com',
  'bluekai.com','krxd.net','demdex.net','omtrdc.net',
  'chartbeat.com','newrelic.com','bugsnag.com',
  'sentry.io','datadoghq.com','rollbar.com',
]);

const COOKIE_BANNER_DOMAINS = new Set([
  'cookiebot.com','cookielaw.org','onetrust.com',
  'trustarc.com','quantcast.mgr.consensu.org',
  'cdn.cookie-script.com','cdn.cookiepro.com',
]);

// ─── Engelleme Seviyesi Ayarları ──────────────────────────────────────────────
const LEVEL_CONFIG = {
  low: {
    blockAds: true, blockTrackers: false,
    blockCookieBanners: false, blockThirdParty: false,
  },
  medium: {
    blockAds: true, blockTrackers: true,
    blockCookieBanners: true, blockThirdParty: false,
  },
  high: {
    blockAds: true, blockTrackers: true,
    blockCookieBanners: true, blockThirdParty: false,
    extraPatterns: true,
  },
  full: {
    blockAds: true, blockTrackers: true,
    blockCookieBanners: true, blockThirdParty: true,
  },
};

// ─── State ────────────────────────────────────────────────────────────────────
let blockerConfig = {
  level: 'medium',
  whitelist: [],
  enabled: true,
};

let blockStats = {
  total: 0, ads: 0, trackers: 0, cookies: 0,
  today: 0, todayDate: new Date().toDateString(),
  byDomain: {},
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch { return ''; }
}

function isWhitelisted(url) {
  const domain = getDomain(url);
  return blockerConfig.whitelist.some(d =>
    domain === d || domain.endsWith('.' + d)
  );
}

function matchesDomainSet(url, set) {
  const domain = getDomain(url);
  if (set.has(domain)) return true;
  // Alt domain kontrolü
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function isAdUrl(url) {
  if (matchesDomainSet(url, AD_DOMAINS)) return true;
  // URL pattern eşleşmesi
  const adPatterns = [
    /\/ads?\//i, /\/adserver/i, /\/banner/i,
    /\/sponsor/i, /doubleclick/i, /pagead/i,
    /\/adframe/i, /\/popup/i, /\/popunder/i,
  ];
  return adPatterns.some(p => p.test(url));
}

function isTrackerUrl(url) {
  if (matchesDomainSet(url, TRACKER_DOMAINS)) return true;
  const trackerPatterns = [
    /\/analytics/i, /\/tracking/i, /\/beacon/i,
    /\/pixel/i, /\/collect/i, /\/telemetry/i,
    /ga\.js/i, /gtag\/js/i, /fbevents\.js/i,
  ];
  return trackerPatterns.some(p => p.test(url));
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
  blockStats.byDomain[domain] = (blockStats.byDomain[domain] || 0) + 1;
}

// ─── Ana Kurulum ──────────────────────────────────────────────────────────────
function setupBlocker(session, mainWindow) {
  const cfg = LEVEL_CONFIG[blockerConfig.level] || LEVEL_CONFIG.medium;

  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const url = details.url;

    // Engelleyici kapalıysa geç
    if (!blockerConfig.enabled) return callback({ cancel: false });

    // Whitelist kontrolü
    if (isWhitelisted(url)) return callback({ cancel: false });

    // Data/blob URL'leri geç
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return callback({ cancel: false });
    }

    let blocked = false;
    let type    = null;

    if (cfg.blockAds && isAdUrl(url)) {
      blocked = true; type = 'ads';
    } else if (cfg.blockTrackers && isTrackerUrl(url)) {
      blocked = true; type = 'trackers';
    } else if (cfg.blockCookieBanners && isCookieBannerUrl(url)) {
      blocked = true; type = 'cookies';
    }

    if (blocked && type) {
      recordBlock(url, type);
      // Renderer'a istatistik gönder
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('block-stats', { ...blockStats });
      }
      return callback({ cancel: true });
    }

    callback({ cancel: false });
  });

  // Cookie banner JS enjeksiyonu
  session.webRequest.onCompleted({ urls: ['<all_urls>'] }, (details) => {
    if (!cfg.blockCookieBanners) return;
    if (isWhitelisted(details.url)) return;
  });

  console.log('[İlgezdi] Faz 6 Engelleyici aktif — Seviye:', blockerConfig.level);
}

// ─── Config Güncelleme (IPC üzerinden) ───────────────────────────────────────
function updateBlockerConfig(newConfig) {
  if (newConfig.level)     blockerConfig.level     = newConfig.level;
  if (newConfig.whitelist) blockerConfig.whitelist  = newConfig.whitelist;
  if (typeof newConfig.enabled === 'boolean') {
    blockerConfig.enabled = newConfig.enabled;
  }
}

function getBlockStats() {
  updateTodayStats();
  return { ...blockStats };
}

module.exports = { setupBlocker, updateBlockerConfig, getBlockStats };