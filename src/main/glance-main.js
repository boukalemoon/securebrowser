/**
 * İlgezdi — Glance Özelliği (Main Process)
 * glance-main.js
 *
 * Denetim düzeltmeleri (O-10):
 *   • Glance içindeki HER gezinme `did-finish-load` tetikliyor ve her seferinde
 *     YENİ bir 200 ms'lik buton yoklaması başlıyordu; eskiler durmadığı için
 *     birikiyordu. Artık glance başına tek yoklama var, kapanışta temizleniyor.
 *   • `glance-loaded` her yüklemede gönderiliyordu; arayüz her seferinde yeni
 *     bir kaplama/araç çubuğu ekleyip üst üste bindiriyordu. Yalnızca ilk yüklemede.
 *   • `did-fail-load` alt çerçeveler ve normal yönlendirme iptalleri (-3) için de
 *     tetikleniyor, açık ve çalışan glance'te "Sayfa yüklenemedi" gösteriyordu.
 *   • Araç çubuğu sayfaya innerHTML ile basılan başlıktan kuruluyordu; textContent.
 */

'use strict';

const { WebContentsView, BrowserWindow } = require('electron');
const { T } = require('./i18n');

let glanceView = null;
let glanceWin  = null;
let glanceOpen = false;
let glancePoll = null;    // glance başına TEK buton yoklaması
let glanceShown = false;  // arayüze glance-loaded yalnızca bir kez

// Pencere kapanırken BrowserWindow henüz yok edilmemiş ama arayüz webContents'i
// yok edilmiş olabilir. Eskiden bu anda gelen did-finish-load / did-fail-load
// send() çağrısı ana süreçte yakalanmamış hata fırlatıyordu.
function sendToWindow(win, channel, payload) {
  try {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
  } catch {}
}

function stopPoll() {
  if (glancePoll) { clearInterval(glancePoll); glancePoll = null; }
}

// Sayfaya enjekte edilen araç çubuğu. Sayfa bağlamında çalışır (ayrıcalıksız);
// yine de başlık/host textContent ile yazılır.
const toolbarScript = () => `
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

    var left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:8px;overflow:hidden;flex:1';
    var eye = document.createElement('span'); eye.style.fontSize = '14px'; eye.textContent = '👁';
    var host = document.createElement('span');
    host.style.cssText = 'font-size:11px;color:#8892a4;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    host.textContent = document.location.hostname;
    var title = document.createElement('span');
    title.style.cssText = 'font-size:11px;color:#e8eaf6;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    title.textContent = String(document.title || '').substring(0, 60);
    left.appendChild(eye); left.appendChild(host); left.appendChild(title);

    var right = document.createElement('div');
    right.style.cssText = 'display:flex;gap:6px;flex-shrink:0';
    var openBtn = document.createElement('button');
    openBtn.style.cssText = 'padding:4px 10px;border:1px solid #1e2d45;border-radius:4px;background:#1c2333;color:#8892a4;font-size:11px;cursor:pointer';
    openBtn.textContent = ${JSON.stringify(T('glance.openInTab'))};
    openBtn.onclick = function() { window.__glanceOpenTab = true; };
    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'width:26px;height:26px;border:1px solid #1e2d45;border-radius:50%;background:#1c2333;color:#8892a4;font-size:12px;cursor:pointer';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', ${JSON.stringify(T('glance.close'))});
    closeBtn.onclick = function() { window.__glanceClose = true; };
    right.appendChild(openBtn); right.appendChild(closeBtn);

    bar.appendChild(left); bar.appendChild(right);
    document.documentElement.style.paddingTop = '36px';
    if (document.body) document.body.style.paddingTop = '0';
    document.documentElement.insertBefore(bar, document.documentElement.firstChild);
  })();
`;

// Glance'i tetikleyen pencerede (ana ya da incognito) açılmalı — sabit mainWindow değil.
// hooks.partitionFor(win): önizlemenin açılacağı oturum bölümü (gizli pencere → gizli oturum)
// hooks.onViewCreated(view, win): kısayol, sağ tık menüsü ve WebRTC politikası bağlantısı
function setupGlance(mainWindow, ipcMain, hooks = {}) {
  // Bir pencere için resize/move olduğunda glance'i kapat. Aynı pencereye
  // birden fazla kez bağlanmayı önlemek için işaretliyoruz.
  const bindAutoClose = (win) => {
    if (!win || win.__glanceBound) return;
    win.__glanceBound = true;
    win.on('resize', () => { if (glanceOpen) closeGlance(); });
    win.on('move',   () => { if (glanceOpen) closeGlance(); });
    // Önizleme açıkken pencere kapanırsa durum sıfırlanır; ölü görünüm referansı kalmaz.
    win.on('closed', () => { if (glanceWin === win) { closeGlance(); glanceWin = null; } });
  };
  bindAutoClose(mainWindow);

  ipcMain.handle('glance-open', (event, { url, triggerX, triggerY } = {}) => {
    // Uzak içerik yüklenecek — yalnızca http(s) kabul et
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false };
    if (glanceOpen) closeGlance();

    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    glanceWin = win;
    bindAutoClose(win);
    const winBounds = win.getBounds();
    const PW = Math.min(820, winBounds.width  - 80);
    const PH = Math.min(560, winBounds.height - 160);
    const CHROME_H = 122;

    let px = Math.round((Number(triggerX) || 0) - PW / 2);
    let py = Math.round((Number(triggerY) || 0) + 50);

    if (px < 10) px = 10;
    if (px + PW > winBounds.width  - 10) px = winBounds.width  - PW - 10;
    if (py + PH > winBounds.height - 20) py = CHROME_H + 10;
    if (py < CHROME_H + 10) py = CHROME_H + 10;

    // WebContentsView (BrowserView Electron 30'dan beri kullanımdan kaldırılmış)
    glanceView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        // Tetikleyen pencerenin sekmeleriyle aynı oturum: engelleyici ve izin yöneticisi
        // burada da geçerli. Eskiden sabit 'persist:securebrowser' idi; gizli pencerede
        // önizlenen sitenin çerezleri kalıcı profile yazılıyordu.
        partition: hooks.partitionFor ? hooks.partitionFor(win) : 'persist:securebrowser',
      },
    });
    const view = glanceView;       // bu glance'e ait referans (kapanış yarışlarına karşı)
    try { if (hooks.onViewCreated) hooks.onViewCreated(view, win); } catch (e) { console.error('[Glance] görünüm kancası:', e); }
    glanceShown = false;

    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.contentView.addChildView(view);
    view.setBounds({ x: px, y: py, width: PW, height: PH });
    view.webContents.loadURL(url).catch(() => {});
    glanceOpen = true;

    view.webContents.on('did-finish-load', () => {
      if (glanceView !== view) return;       // bu arada kapandı/yenisi açıldı

      // Araç çubuğu her yüklemede yeniden gerekir (gezinme DOM'u değiştirir)
      view.webContents.executeJavaScript(toolbarScript()).catch(() => {});

      // Arayüz kaplamasını YALNIZCA ilk yüklemede kur — sonraki gezinmelerde
      // tekrar göndermek üst üste binen kaplamalar oluşturuyordu.
      if (!glanceShown) {
        glanceShown = true;
        sendToWindow(win, 'glance-loaded', {
          url: view.webContents.getURL(),
          title: view.webContents.getTitle(),
          x: px, y: py, width: PW, height: PH,
        });
      }

      // Buton yoklaması: glance başına TEK tane
      if (!glancePoll) {
        glancePoll = setInterval(async () => {
          if (glanceView !== view || !glanceOpen) { stopPoll(); return; }
          try {
            const r = await view.webContents.executeJavaScript(
              '(function(){ var c=!!window.__glanceClose, o=!!window.__glanceOpenTab;' +
              ' window.__glanceClose=false; window.__glanceOpenTab=false; return {c:c,o:o}; })()'
            );
            if (r && r.c) {
              closeGlance();
            } else if (r && r.o) {
              const tabUrl = view.webContents.getURL();
              closeGlance();
              sendToWindow(win, 'glance-new-tab', { url: tabUrl });
            }
          } catch {
            // Sayfa gezinme ortasındaysa executeJavaScript başarısız olabilir — geçici,
            // yoklamayı DURDURMA (eskiden durduruyordu ve düğmeler ölü kalıyordu).
          }
        }, 250);
        if (glancePoll.unref) glancePoll.unref();
      }
    });

    view.webContents.on('did-fail-load', (_e, errorCode, _desc, _url, isMainFrame) => {
      // -3 = ERR_ABORTED: yönlendirme / kullanıcı gezinmesi, hata değil.
      // Alt çerçeve hataları da glance'in kendisinin yüklenemediği anlamına gelmez.
      if (!isMainFrame || errorCode === -3) return;
      if (glanceView !== view) return;
      sendToWindow(win, 'glance-error');
    });

    return { ok: true, x: px, y: py, width: PW, height: PH };
  });

  ipcMain.handle('glance-close', () => { closeGlance(); return { ok: true }; });

  ipcMain.handle('glance-open-tab', (event) => {
    if (!glanceView) return { ok: false };
    const url = glanceView.webContents.getURL();
    const target = glanceWin || BrowserWindow.fromWebContents(event.sender) || mainWindow;
    closeGlance();
    sendToWindow(target, 'glance-new-tab', { url });
    return { ok: true };
  });

  console.log('[İlgezdi] Glance kuruldu');
}

function closeGlance() {
  // Açık bir glance yoksa sessizce çık (sekme değişiminde her seferinde çağrılıyor;
  // arayüze gereksiz 'glance-closed' olayı gönderilmesin).
  if (!glanceView && !glanceOpen) return;
  stopPoll();
  if (glanceView) {
    const view = glanceView;
    glanceView = null;
    try { if (glanceWin && !glanceWin.isDestroyed()) glanceWin.contentView.removeChildView(view); } catch {}
    try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch {}
  }
  glanceOpen = false;
  glanceShown = false;
  sendToWindow(glanceWin, 'glance-closed');
}

module.exports = { setupGlance, closeGlance };
