/**
 * İlgezdi — Kenar çubuğunda web paneli (arayüz tarafı).
 *
 * Kenar çubuğundaki site simgeleri ve sağ paneldeki başlık (geri, yenile, sekmede aç,
 * kaldır) burada; site görünümü ana süreçte başlığın altına çizilir (main.js › showWebPanel).
 * Liste ve adres doğrulaması ana süreçte (web-panels.js). Gizli pencerede web paneli yok.
 */

'use strict';

(function () {
  const sb = window.secureBrowser;
  const esc = (s) => window.ilgezdiHtml.esc(s);
  let panels = [];
  let openId = null;
  const favicons = {};

  const ICONS = {
    back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    reload: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>',
    tab: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    remove: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
  };

  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const initialOf = (p) => (p.title || hostOf(p.url) || '?').charAt(0).toLocaleUpperCase();

  // Ekle düğmesi listenin son öğesidir: liste kayınca onunla birlikte kayar, kenar çubuğunun
  // alttaki düğmelerini (Öneri, Ayarlar) aşağı itmez.
  function renderList() {
    const box = document.getElementById('webpanel-list');
    if (!box) return;
    const addBtn = document.getElementById('btn-webpanel-add');
    box.querySelectorAll('.webpanel-btn').forEach((el) => el.remove());
    for (const p of panels) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sidebar-btn webpanel-btn' + (p.id === openId ? ' active' : '');
      b.dataset.id = p.id;
      b.title = p.title || hostOf(p.url);
      b.setAttribute('aria-label', b.title);
      if (favicons[p.id]) {
        const img = document.createElement('img');
        img.src = favicons[p.id];
        img.alt = '';
        img.width = 18;
        img.height = 18;
        img.addEventListener('error', () => { img.remove(); b.textContent = initialOf(p); });
        b.appendChild(img);
      } else {
        b.textContent = initialOf(p);
      }
      if (addBtn && addBtn.parentNode === box) box.insertBefore(b, addBtn); else box.appendChild(b);
    }
    if (addBtn && addBtn.parentNode !== box) box.appendChild(addBtn);
  }

  async function loadFavicons() {
    for (const p of panels) {
      if (favicons[p.id]) continue;
      try {
        const map = await sb.favicons?.lookup([p.url]);
        const data = map && Object.values(map)[0];
        if (data && /^data:image\//.test(data)) favicons[p.id] = data;
      } catch {}
    }
    renderList();
  }

  function panelEl() { return document.getElementById('panel-webpanel'); }

  function showPanelShell() {
    const panel = panelEl();
    if (!panel) return;
    window.ilgezdiCloseAllPanels?.();
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
  }

  function renderSite(p) {
    const panel = panelEl();
    panel.dataset.mode = 'site';
    panel.innerHTML = `
      <div class="panel-header wp-header">
        <div class="wp-id">
          <span class="wp-icon" aria-hidden="true">${favicons[p.id] ? `<img src="${esc(favicons[p.id])}" alt="" width="16" height="16">` : esc(initialOf(p))}</span>
          <div class="wp-text"><h2 class="wp-title" id="wp-title">${esc(p.title || hostOf(p.url))}</h2><div class="wp-host" id="wp-host">${esc(hostOf(p.url))}</div></div>
        </div>
        <div class="wp-actions">
          <button type="button" class="wp-btn" data-wp="back" id="wp-back" title="${TH('webpanel.back')}" aria-label="${TH('webpanel.back')}" disabled>${ICONS.back}</button>
          <button type="button" class="wp-btn" data-wp="reload" title="${TH('webpanel.reload')}" aria-label="${TH('webpanel.reload')}">${ICONS.reload}</button>
          <button type="button" class="wp-btn" data-wp="open-tab" title="${TH('webpanel.openTab')}" aria-label="${TH('webpanel.openTab')}">${ICONS.tab}</button>
          <button type="button" class="wp-btn danger" data-wp="remove" title="${TH('webpanel.remove')}" aria-label="${TH('webpanel.remove')}">${ICONS.remove}</button>
          <button type="button" class="panel-close" data-panel="webpanel" aria-label="${TH('common.closePanel')}">✕</button>
        </div>
      </div>
      <div class="panel-body wp-body" aria-hidden="true"></div>`;
  }

  function renderAddForm(message) {
    const panel = panelEl();
    panel.dataset.mode = 'add';
    panel.innerHTML = `
      <div class="panel-header">
        <h2>${TH('webpanel.addTitle')}</h2>
        <button class="panel-close" data-panel="webpanel" aria-label="${TH('common.closePanel')}">✕</button>
      </div>
      <div class="panel-body wp-add">
        <p class="wp-hint">${TH('webpanel.addHint')}</p>
        <form id="wp-add-form" class="wp-add-form" novalidate>
          <label for="wp-url">${TH('webpanel.urlLabel')}</label>
          <div class="wp-add-row">
            <input type="text" id="wp-url" autocomplete="off" spellcheck="false" placeholder="${TH('webpanel.urlPlaceholder')}" />
            <button type="submit" class="page-btn primary">${TH('webpanel.addBtn')}</button>
          </div>
        </form>
        <button type="button" class="page-btn" id="wp-add-current">${TH('webpanel.addCurrent')}</button>
        <p class="wp-error" id="wp-error" role="alert">${message ? esc(message) : ''}</p>
      </div>`;
    setTimeout(() => document.getElementById('wp-url')?.focus(), 50);
  }

  async function openPanel(id) {
    const p = panels.find((x) => x.id === id);
    if (!p) return;
    if (openId === id && panelEl()?.classList.contains('visible')) { window.ilgezdiCloseAllPanels?.(); return; }
    showPanelShell();
    renderSite(p);
    openId = id;
    renderList();
    await sb.webPanels.open(id);
  }

  async function addFromInput(text) {
    const r = await sb.webPanels.add(text);
    if (!r || !r.ok) {
      const el = document.getElementById('wp-error');
      if (el) el.textContent = T(r && r.error === 'full' ? 'webpanel.full' : 'webpanel.invalid');
      return;
    }
    panels = r.panels || panels;
    renderList();
    loadFavicons();
    openPanel(r.id);
  }

  function bind() {
    document.getElementById('webpanel-list')?.addEventListener('click', (e) => {
      const b = e.target.closest('.webpanel-btn');
      if (b) openPanel(b.dataset.id);
    });
    document.getElementById('btn-webpanel-add')?.addEventListener('click', () => {
      const panel = panelEl();
      if (panel?.classList.contains('visible') && panel.dataset.mode === 'add') { window.ilgezdiCloseAllPanels?.(); return; }
      showPanelShell();
      document.getElementById('btn-webpanel-add')?.classList.add('active');
      sb.panelOpened(true);
      openId = null;
      renderAddForm('');
    });
    panelEl()?.addEventListener('submit', (e) => {
      if (e.target.id !== 'wp-add-form') return;
      e.preventDefault();
      addFromInput(document.getElementById('wp-url').value);
    });
    panelEl()?.addEventListener('click', async (e) => {
      if (e.target.closest('#wp-add-current')) { addFromInput(''); return; }
      const btn = e.target.closest('[data-wp]');
      if (!btn) return;
      const action = btn.dataset.wp;
      if (action === 'remove') {
        const id = openId;
        window.ilgezdiCloseAllPanels?.();
        const r = await sb.webPanels.remove(id);
        if (r && r.panels) { panels = r.panels; delete favicons[id]; renderList(); }
        return;
      }
      sb.webPanels.action(action);
    });
    sb.webPanels.onState((st) => {
      openId = st.openId || null;
      if (!openId) { renderList(); return; }
      const title = document.getElementById('wp-title');
      const host = document.getElementById('wp-host');
      if (title && st.title) title.textContent = st.title;
      if (host && st.url) host.textContent = hostOf(st.url);
      const back = document.getElementById('wp-back');
      if (back) back.disabled = !st.canGoBack;
      panelEl()?.classList.toggle('wp-loading', !!st.loading);
    });
    sb.webPanels.onFavicon(({ id, dataUrl } = {}) => {
      if (!id || !/^data:image\//.test(dataUrl || '') || favicons[id] === dataUrl) return;
      favicons[id] = dataUrl;
      renderList();
    });
  }

  async function init() {
    if (!sb?.webPanels) return;
    let r = null;
    try { r = await sb.webPanels.list(); } catch {}
    const allowed = !!(r && r.allowed);
    for (const id of ['webpanel-divider', 'webpanel-list', 'btn-webpanel-add']) {
      const el = document.getElementById(id);
      if (el) el.hidden = !allowed;
    }
    if (!allowed) return;
    panels = r.panels || [];
    openId = r.openId || null;
    bind();
    renderList();
    loadFavicons();
  }

  window.addEventListener('load', () => setTimeout(init, 400));
  window.ilgezdiWebPanels = { list: () => panels.slice() };
})();
