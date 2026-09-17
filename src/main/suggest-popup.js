/**
 * İlgezdi — adres çubuğu öneri listesi penceresi.
 *
 * Sekmenin sayfası (WebContentsView) arayüz DOM'unun ÜSTÜNE çizildiği için adres
 * çubuğunun altına açılan liste sayfanın arkasında kalırdı. Bu yüzden liste, yer imi
 * açılır penceresiyle aynı desende ayrı, çerçevesiz ve odak almayan bir pencerede
 * gösterilir (focusable: false → adres çubuğu odakta kalır, yazmaya devam edilir).
 *
 * Pencere bir kez kurulur, sonra gizlenip gösterilir. İçerik yalnızca ana pencereden
 * gelir; liste penceresi seçilen adresi ana pencereye geri bildirir, gezinmeyi ana
 * süreç yapmaz.
 */

'use strict';

const path = require('path');

const ROW_HEIGHT = 40;
const PADDING = 10;
const MAX_ROWS = 9;

/** Listenin ekran koordinatları: adres çubuğunun pencere içindeki yeri + pencerenin yeri. */
function popupBounds(contentBounds, rect, count, display) {
  const width = Math.max(240, Math.round(rect.width));
  const height = Math.min(MAX_ROWS, Math.max(1, count)) * ROW_HEIGHT + PADDING;
  let x = Math.round(contentBounds.x + rect.x);
  let y = Math.round(contentBounds.y + rect.y + rect.height + 4);
  if (display) {
    const area = display.workArea;
    if (x + width > area.x + area.width) x = Math.max(area.x, area.x + area.width - width);
    if (y + height > area.y + area.height) y = Math.max(area.y, area.y + area.height - height);
  }
  return { x, y, width, height };
}

function setupSuggestPopup({ ipcMain, BrowserWindow, screen, harden }) {
  let win = null;
  let owner = null;
  let ready = false;
  let pending = null;

  /** Sayfa yüklenmeden gönderilen veri kaybolur: yüklenene kadar son veri saklanır. */
  function sendData(payload) {
    if (!win || win.isDestroyed()) return;
    if (!ready) { pending = payload; return; }
    win.webContents.send('suggest-data', payload);
  }

  const destroy = () => {
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    owner = null;
    ready = false;
    pending = null;
  };

  function ensureWindow(ownerWin) {
    if (win && !win.isDestroyed() && owner === ownerWin) return win;
    destroy();
    owner = ownerWin;
    win = new BrowserWindow({
      parent: ownerWin,
      width: 400, height: 100,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      focusable: false,            // adres çubuğu odakta kalsın
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/popup-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    if (typeof harden === 'function') harden(win);
    ready = false;
    pending = null;
    win.webContents.once('did-finish-load', () => {
      ready = true;
      if (pending) { win.webContents.send('suggest-data', pending); pending = null; }
    });
    win.loadFile(path.join(__dirname, '../renderer/suggest-popup.html'));
    ownerWin.once('closed', destroy);
    return win;
  }

  ipcMain.handle('suggest-show', (event, payload) => {
    const ownerWin = BrowserWindow.fromWebContents(event.sender);
    const rect = payload && payload.rect;
    const items = Array.isArray(payload && payload.items) ? payload.items.slice(0, MAX_ROWS) : [];
    if (!ownerWin || ownerWin.isDestroyed() || !rect || !items.length) {
      if (win && !win.isDestroyed()) win.hide();
      return { ok: false };
    }
    const w = ensureWindow(ownerWin);
    const content = ownerWin.getContentBounds();
    const display = screen.getDisplayNearestPoint({ x: content.x + Math.round(rect.x), y: content.y + Math.round(rect.y) });
    w.setBounds(popupBounds(content, rect, items.length, display));
    sendData({ items, selected: Number(payload.selected) });
    if (!w.isVisible()) w.showInactive();
    return { ok: true };
  });

  ipcMain.handle('suggest-hide', () => {
    if (win && !win.isDestroyed() && win.isVisible()) win.hide();
    return { ok: true };
  });

  // Listeden tıklanan adres ana pencereye bildirilir; gezinmeye orası karar verir.
  ipcMain.on('suggest-pick', (event, url) => {
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
    if (win.isVisible()) win.hide();
    if (owner && !owner.isDestroyed() && typeof url === 'string') owner.webContents.send('suggest-picked', url.slice(0, 2048));
  });

  return { closeAll: destroy, _internals: { popupBounds, ROW_HEIGHT, MAX_ROWS } };
}

module.exports = { setupSuggestPopup, popupBounds, ROW_HEIGHT, MAX_ROWS };
