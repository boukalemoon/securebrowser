/**
 * İlgezdi — Arku Uzak Masaüstü eklentisi (ana süreç)
 *
 * Arku, tarayıcıya gömülü bir web mini-uygulaması olarak çalışır
 * (https://arku-remote.vercel.app). Bu modül, eklenti mantığıyla:
 *   - Kurulu (kabul edilmiş) Arku sürümünü userData/arku-app.json'da tutar,
 *   - GitHub Releases üzerinden yeni sürümü arka planda denetler,
 *   - Yeni sürüm bulununca renderer'a bildirir (arku-update-available),
 *   - Kullanıcı ONAY verince açık Arku sekmelerini önbelleği atlayarak
 *     yeniler ve sürüm kaydını günceller. Onay olmadan hiçbir şey değişmez.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const ARKU_URL         = 'https://arku-remote.vercel.app';
const RELEASES_API     = 'https://api.github.com/repos/boukalemoon/arku-remote/releases/latest';
const CHECK_INTERVAL   = 6 * 60 * 60 * 1000; // 6 saat
const FIRST_CHECK_MS   = 30 * 1000;          // açılıştan 30 sn sonra ilk denetim

let statePath = null;
let arkuState = { installedVersion: null, lastCheckAt: null };
let latestKnown = null;   // son denetimde görülen sürüm
let notifiedFor = null;   // aynı sürüm için tek bildirim
let deps = null;          // { getMainWindow, forEachTabView }

function loadState() {
  try {
    if (fs.existsSync(statePath)) {
      arkuState = { ...arkuState, ...JSON.parse(fs.readFileSync(statePath, 'utf-8')) };
    }
  } catch { /* bozuk dosya — varsayılanla devam */ }
}

function saveState() {
  try { fs.writeFileSync(statePath, JSON.stringify(arkuState, null, 2)); } catch {}
}

function isNewer(a, b) {
  // a > b ise true (basit sayısal semver karşılaştırması)
  if (!a) return false;
  if (!b) return true;
  return a.localeCompare(b, undefined, { numeric: true }) > 0;
}

async function fetchLatestVersion() {
  const res = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ilgezdi-browser' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const rel = await res.json();
  const v = String(rel.tag_name || '').replace(/^v/, '');
  if (!v) throw new Error('Sürüm etiketi okunamadı');
  return v;
}

function getInfo() {
  return {
    url: ARKU_URL,
    installedVersion: arkuState.installedVersion,
    latestVersion: latestKnown,
    updateAvailable: isNewer(latestKnown, arkuState.installedVersion),
    lastCheckAt: arkuState.lastCheckAt,
  };
}

async function checkForUpdate({ notify = true } = {}) {
  try {
    latestKnown = await fetchLatestVersion();
    arkuState.lastCheckAt = Date.now();

    // İlk çalıştırma: mevcut sürümü "kurulu" kabul et, bildirim üretme.
    if (!arkuState.installedVersion) {
      arkuState.installedVersion = latestKnown;
      saveState();
      return getInfo();
    }
    saveState();

    const info = getInfo();
    if (notify && info.updateAvailable && notifiedFor !== latestKnown) {
      notifiedFor = latestKnown;
      const win = deps.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('arku-update-available', info);
      }
    }
    return info;
  } catch {
    return getInfo(); // çevrimdışı vb. — eldeki bilgiyle dön
  }
}

// Kullanıcı onayı sonrası: sürümü benimse + açık Arku sekmelerini tazele.
function applyUpdate() {
  if (!latestKnown) return getInfo();
  arkuState.installedVersion = latestKnown;
  saveState();
  let reloaded = 0;
  deps.forEachTabView((view) => {
    try {
      const url = view.webContents.getURL();
      if (url && url.startsWith(ARKU_URL)) {
        view.webContents.reloadIgnoringCache();
        reloaded++;
      }
    } catch {}
  });
  return { ...getInfo(), reloadedTabs: reloaded };
}

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {object} options
 * @param {() => Electron.BrowserWindow|null} options.getMainWindow
 * @param {(cb: (view: Electron.BrowserView) => void) => void} options.forEachTabView
 * @param {string} options.userDataPath
 */
function setupArku(ipcMain, options) {
  deps = options;
  statePath = path.join(options.userDataPath, 'arku-app.json');
  loadState();

  ipcMain.handle('arku-get-info',     () => getInfo());
  ipcMain.handle('arku-open-url',     () => ARKU_URL);
  ipcMain.handle('arku-check-update', () => checkForUpdate({ notify: false }));
  ipcMain.handle('arku-apply-update', () => applyUpdate());

  setTimeout(() => checkForUpdate(), FIRST_CHECK_MS);
  setInterval(() => checkForUpdate(), CHECK_INTERVAL);
}

module.exports = { setupArku, ARKU_URL };
