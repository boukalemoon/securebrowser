/**
 * İlgezdi — Glance Özelliği (Renderer)
 * glance-renderer.js
 *
 * Alt + Link Tıklama → Glance popup açar
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let glanceActive  = false;
let glanceOverlay = null;
let glanceBar     = null;

// ─── Overlay (şeffaf tıklama yakalayıcı + toolbar) ───────────────────────────
function glanceShowUI(data) {
  glanceActive = true;

  // Overlay — dışarı tıklayınca kapat
  glanceOverlay = document.createElement('div');
  glanceOverlay.id = 'glance-overlay';
  glanceOverlay.addEventListener('click', glanceClose);
  document.body.appendChild(glanceOverlay);

  // Toolbar — popup üstünde gösterilir
  glanceBar = document.createElement('div');
  glanceBar.id = 'glance-bar';
  glanceBar.style.top  = (data.y - 40) + 'px';
  glanceBar.style.left = data.x + 'px';
  glanceBar.style.width = data.width + 'px';

  glanceBar.innerHTML = `
    <div class="glance-bar-left">
      <span class="glance-icon">👁</span>
      <span class="glance-url" id="glance-url-text">${shortenUrl(data.url)}</span>
      <span class="glance-loading" id="glance-loading">Yükleniyor…</span>
    </div>
    <div class="glance-bar-right">
      <button class="glance-btn" id="btn-glance-tab" title="Yeni sekmede aç">⊕ Sekmeye Aç</button>
      <button class="glance-btn glance-btn-close" id="btn-glance-close" title="Kapat (Esc)">✕</button>
    </div>
  `;

  document.body.appendChild(glanceBar);

  // Buton olayları
  document.getElementById('btn-glance-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    glanceClose();
  });

  document.getElementById('btn-glance-tab')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.secureBrowser?.glance?.openTab();
    glanceCleanupUI();
  });

  // Kenarlık kutusu (BrowserView'ın etrafına)
  const border = document.createElement('div');
  border.id = 'glance-border';
  border.style.left   = (data.x - 2) + 'px';
  border.style.top    = (data.y - 2) + 'px';
  border.style.width  = (data.width  + 4) + 'px';
  border.style.height = (data.height + 4) + 'px';
  document.body.appendChild(border);
}

function glanceUpdateLoaded(data) {
  const loading = document.getElementById('glance-loading');
  const urlText = document.getElementById('glance-url-text');
  if (loading) loading.style.display = 'none';
  if (urlText && data.title) urlText.textContent = data.title;
}

function glanceCleanupUI() {
  glanceActive = false;
  document.getElementById('glance-overlay')?.remove();
  document.getElementById('glance-bar')?.remove();
  document.getElementById('glance-border')?.remove();
  glanceOverlay = null;
  glanceBar     = null;
}

function glanceClose() {
  window.secureBrowser?.glance?.close();
  glanceCleanupUI();
}

// ─── Alt + Tıklama yakalama ───────────────────────────────────────────────────
function glanceSetupLinkCapture() {
  // BrowserView içindeki linkleri yakalayamayız (cross-process)
  // Ama adres çubuğundaki URL'ye Alt+Enter veya toolbar'daki linklere Alt+tıklama yapılabilir.
  // Ana yöntem: main process'ten gelen 'open-glance' eventi (BrowserView'da Alt+tıklama)

  // Renderer içindeki linkler (panel içi, bookmark listesi vb.)
  document.addEventListener('click', (e) => {
    if (!e.altKey) return;
    const link = e.target.closest('a[href]');
    if (!link) return;
    const url = link.href;
    if (!url || url.startsWith('javascript:') || url.startsWith('#')) return;

    e.preventDefault();
    e.stopPropagation();
    glanceOpenUrl(url, e.clientX, e.clientY);
  }, true);

  // Adres çubuğu — Alt+Enter
  document.getElementById('address-bar')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const url = normalizeUrl(e.target.value.trim());
      if (url) glanceOpenUrl(url, window.innerWidth / 2, 60);
    }
  });

  // Esc ile kapat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && glanceActive) glanceClose();
  });
}

function glanceOpenUrl(url, clientX, clientY) {
  if (glanceActive) glanceClose();
  window.secureBrowser?.glance?.open({ url, triggerX: clientX, triggerY: clientY });
}

function normalizeUrl(input) {
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  if (/^[\w-]+\.\w+/.test(input)) return 'https://' + input;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(input);
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname.slice(0, 30) : '');
  } catch { return url.slice(0, 40); }
}

// ─── Main process olayları ────────────────────────────────────────────────────
function glanceInitEvents() {
  const sb = window.secureBrowser;
  if (!sb) return;

  // BrowserView'dan gelen Alt+tıklama (main process iletir)
  sb.glance?.onOpenRequest?.((data) => {
    glanceOpenUrl(data.url, data.x, data.y);
  });

  // Glance yüklendi
  sb.glance?.onLoaded?.((data) => {
    glanceUpdateLoaded(data);
    glanceShowUI(data);
  });

  // Glance kapandı (dışarıdan)
  sb.glance?.onClosed?.(() => glanceCleanupUI());

  // Yeni sekme aç
  sb.glance?.onNewTab?.((data) => {
    sb.newTab?.(data.url);
  });

  // Hata
  sb.glance?.onError?.(() => {
    glanceCleanupUI();
    showGlanceToast('Sayfa yüklenemedi');
  });
}

function showGlanceToast(msg) {
  const t = document.createElement('div');
  t.className   = 'glance-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function glanceInit() {
  glanceSetupLinkCapture();
  glanceInitEvents();
  console.log('[İlgezdi] Glance hazır — Alt+Tıklama veya Alt+Enter');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', glanceInit);
} else {
  glanceInit();
}