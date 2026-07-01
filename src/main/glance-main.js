/**
 * İlgezdi — Glance Özelliği (Main Process)
 * glance-main.js
 */

'use strict';

const { BrowserView, BrowserWindow } = require('electron');

let glanceView = null;
let glanceWin  = null;
let glanceOpen = false;

// Glance'i tetikleyen pencerede (ana ya da incognito) açılmalı — sabit mainWindow değil.
function setupGlance(mainWindow, ipcMain) {
  // Bir pencere için resize/move olduğunda glance'i kapat. Aynı pencereye
  // birden fazla kez bağlanmayı önlemek için işaretliyoruz.
  const bindAutoClose = (win) => {
    if (!win || win.__glanceBound) return;
    win.__glanceBound = true;
    win.on('resize', () => { if (glanceOpen) closeGlance(); });
    win.on('move',   () => { if (glanceOpen) closeGlance(); });
  };
  bindAutoClose(mainWindow);

  ipcMain.handle('glance-open', (event, { url, triggerX, triggerY }) => {
    if (glanceOpen) closeGlance();

    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    glanceWin = win;
    bindAutoClose(win);
    const winBounds = win.getBounds();
    const PW = Math.min(820, winBounds.width  - 80);
    const PH = Math.min(560, winBounds.height - 160);
    const CHROME_H = 122;

    let px = Math.round(triggerX - PW / 2);
    let py = Math.round(triggerY + 50);

    if (px < 10) px = 10;
    if (px + PW > winBounds.width  - 10) px = winBounds.width  - PW - 10;
    if (py + PH > winBounds.height - 20) py = CHROME_H + 10;
    if (py < CHROME_H + 10) py = CHROME_H + 10;

    glanceView = new BrowserView({
      webPreferences: { nodeIntegration: false, contextIsolation: false, sandbox: false }
    });

    win.addBrowserView(glanceView);
    // Toolbar için 36px boşluk bırak üstte
    glanceView.setBounds({ x: px, y: py, width: PW, height: PH });
    glanceView.setAutoResize({ width: false, height: false });
    glanceView.webContents.loadURL(url);
    glanceOpen = true;

    glanceView.webContents.on('did-finish-load', () => {
      if (!glanceView) return;

      const title = glanceView.webContents.getTitle();
      const currentUrl = glanceView.webContents.getURL();

      // Toolbar'ı BrowserView içine inject et
      glanceView.webContents.executeJavaScript(`
        (function() {
          if (document.getElementById('__ilgezdi_glance_bar')) return;

          var bar = document.createElement('div');
          bar.id = '__ilgezdi_glance_bar';
          bar.style.cssText = [
            'position:fixed','top:0','left:0','right:0','height:36px',
            'background:#111827','border-bottom:1px solid #00d4ff',
            'display:flex','align-items:center','justify-content:space-between',
            'padding:0 12px','z-index:2147483647','font-family:sans-serif',
            'box-shadow:0 2px 12px rgba(0,212,255,0.2)'
          ].join(';');

          bar.innerHTML = [
            '<div style="display:flex;align-items:center;gap:8px;overflow:hidden;flex:1">',
              '<span style="font-size:14px">👁</span>',
              '<span style="font-size:11px;color:#8892a4;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">',
                document.location.hostname,
              '</span>',
              '<span style="font-size:11px;color:#e8eaf6;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">',
                document.title.substring(0, 60),
              '</span>',
            '</div>',
            '<div style="display:flex;gap:6px;flex-shrink:0">',
              '<button id="__glance_newtab" style="padding:4px 10px;border:1px solid #1e2d45;border-radius:4px;background:#1c2333;color:#8892a4;font-size:11px;cursor:pointer">⊕ Sekmeye Aç</button>',
              '<button id="__glance_close" style="width:26px;height:26px;border:1px solid #1e2d45;border-radius:50%;background:#1c2333;color:#8892a4;font-size:12px;cursor:pointer">✕</button>',
            '</div>'
          ].join('');

          document.documentElement.style.paddingTop = '36px';
          document.body.style.paddingTop = '0';
          document.documentElement.insertBefore(bar, document.documentElement.firstChild);

          document.getElementById('__glance_close').onclick = function() {
            window.__glanceClose = true;
          };
          document.getElementById('__glance_newtab').onclick = function() {
            window.__glanceOpenTab = true;
          };
        })();
      `).catch(() => {});

      // Renderer'a bildir
      win.webContents.send('glance-loaded', {
        url: currentUrl, title,
        x: px, y: py, width: PW, height: PH,
      });

      // Buton polling
      const btnPoll = setInterval(async () => {
        if (!glanceView || !glanceOpen) { clearInterval(btnPoll); return; }
        try {
          const close   = await glanceView.webContents.executeJavaScript('(function(){ var r=window.__glanceClose; window.__glanceClose=false; return r||false; })()');
          const openTab = await glanceView.webContents.executeJavaScript('(function(){ var r=window.__glanceOpenTab; window.__glanceOpenTab=false; return r||false; })()');
          if (close) {
            clearInterval(btnPoll);
            closeGlance();
          } else if (openTab) {
            clearInterval(btnPoll);
            const tabUrl = glanceView.webContents.getURL();
            closeGlance();
            win.webContents.send('glance-new-tab', { url: tabUrl });
          }
        } catch { clearInterval(btnPoll); }
      }, 200);
    });

    glanceView.webContents.on('did-fail-load', () => {
      win.webContents.send('glance-error');
    });

    return { ok: true, x: px, y: py, width: PW, height: PH };
  });

  ipcMain.handle('glance-close', () => { closeGlance(); return { ok: true }; });

  ipcMain.handle('glance-open-tab', (event) => {
    if (!glanceView) return { ok: false };
    const url = glanceView.webContents.getURL();
    const target = glanceWin || BrowserWindow.fromWebContents(event.sender) || mainWindow;
    closeGlance();
    if (target && !target.isDestroyed()) target.webContents.send('glance-new-tab', { url });
    return { ok: true };
  });

  console.log('[İlgezdi] Glance kuruldu');
}

function closeGlance() {
  if (glanceView && glanceWin) {
    try { glanceWin.removeBrowserView(glanceView); glanceView.webContents.destroy(); } catch {}
    glanceView = null;
  }
  glanceOpen = false;
  if (glanceWin && !glanceWin.isDestroyed()) glanceWin.webContents.send('glance-closed');
}

module.exports = { setupGlance };