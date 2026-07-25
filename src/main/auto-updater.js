/**
 * İlgezdi — Otomatik Güncelleme (ana süreç)
 *
 * Akış (KULLANICI ONAYLI — Chrome/Discord benzeri):
 *   1) Uygulama açılışında (ve periyodik olarak) arka planda sessizce yeni
 *      sürüm var mı diye GitHub Releases denetlenir.
 *   2) Yeni sürüm bulunursa renderer'a bildirilir → uygulama içinde bir şerit
 *      çıkar: "Yeni sürüm X hazır — [Güncelle]". Otomatik İNDİRİLMEZ.
 *   3) Kullanıcı "Güncelle" derse indirme başlar (ilerleme % gösterilir).
 *   4) İndirme bitince "Yeniden başlat & kur" → NSIS kurulumu çalışır.
 *
 * Geliştirme modunda (app.isPackaged=false) hiçbir şey yapmaz.
 */

'use strict';

const { app, ipcMain } = require('electron');
const { autoUpdater }  = require('electron-updater');

let _getWin    = () => null;
let _checking  = false;
let _lastInfo  = null; // en son bulunan güncelleme bilgisi
let _available = null; // son denetimde daha yeni sürüm var mı (true/false/null)

function send(channel, payload) {
  try { _getWin()?.webContents?.send(channel, payload); } catch {}
}

// releaseNotes string | {version,note}[] | null olabilir → düz metne indirge
function normalizeNotes(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return notes.replace(/<[^>]+>/g, '').trim();
  if (Array.isArray(notes)) {
    return notes.map(n => (typeof n === 'string' ? n : (n && n.note) || '')).join('\n').replace(/<[^>]+>/g, '').trim();
  }
  return '';
}

function setupAutoUpdater(getMainWindow) {
  if (typeof getMainWindow === 'function') _getWin = getMainWindow;

  // Kullanıcı onaylı: kendiliğinden indirme ve çıkışta kurulum KAPALI.
  autoUpdater.autoDownload         = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease      = false;
  autoUpdater.allowDowngrade       = false;

  autoUpdater.on('checking-for-update', () => { _available = null; send('updater-status', { state: 'checking' }); });
  autoUpdater.on('update-available', (info) => {
    _available = true; _lastInfo = info;
    send('updater-status', { state: 'available', version: info.version, notes: normalizeNotes(info.releaseNotes) });
  });
  autoUpdater.on('update-not-available', () => { _available = false; send('updater-status', { state: 'none' }); });
  autoUpdater.on('error', (err) => send('updater-status', { state: 'error', message: String(err && err.message || err) }));
  autoUpdater.on('download-progress', (p) => send('updater-status', {
    state: 'downloading',
    percent: Math.round(p.percent || 0),
    transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond,
  }));
  autoUpdater.on('update-downloaded', (info) => send('updater-status', { state: 'downloaded', version: info.version }));

  // ── IPC ──────────────────────────────────────────────────────────────────────
  // Elle "güncellemeleri denetle" (Ayarlar) ve otomatik denetim aynı yolu kullanır.
  ipcMain.handle('updater-check', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev' };
    if (_checking) return { ok: true, pending: true };
    _checking = true;
    try {
      const r = await autoUpdater.checkForUpdates();
      // _available, 'update-available' / 'update-not-available' olaylarından gelir
      // (electron-updater downgrade/allowPrerelease kurallarını uygular).
      const latest = r && r.updateInfo && r.updateInfo.version;
      return { ok: true, version: _available ? latest : null, latest };
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) };
    } finally { _checking = false; }
  });

  ipcMain.handle('updater-download', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev' };
    try { await autoUpdater.downloadUpdate(); return { ok: true }; }
    catch (err) { return { ok: false, reason: String(err && err.message || err) }; }
  });

  ipcMain.handle('updater-install', () => {
    // isSilent=false → NSIS sihirbazını göster; isForceRunAfter=true → kurulumdan sonra aç.
    setImmediate(() => { try { autoUpdater.quitAndInstall(false, true); } catch {} });
    return { ok: true };
  });

  ipcMain.handle('updater-current-version', () => app.getVersion());

  // ── Otomatik arka plan denetimi ───────────────────────────────────────────────
  if (app.isPackaged) {
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 8000);          // açılıştan 8 sn sonra
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 60 * 60 * 1000); // 6 saatte bir
  }
}

module.exports = { setupAutoUpdater };
