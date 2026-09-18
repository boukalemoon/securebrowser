/**
 * İlgezdi — Profiller paneli (araç çubuğundaki renkli baş harf).
 *
 * Her profil ayrı bir veri klasörü ve ayrı bir penceredir (main/profiles.js). Bu panelden
 * bu profilin adı ve rengi değiştirilir, başka profil açılır, yeni profil (isteğe bağlı
 * gizli: kapatınca her şey silinir) oluşturulur ve profil silinir (onayı ana süreç alır).
 */

'use strict';

(function () {
  const sb = window.secureBrowser;
  const esc = (s) => window.ilgezdiHtml.esc(s);
  const COLORS = ['gold', 'blue', 'green', 'red', 'purple', 'cyan', 'pink', 'grey'];
  let data = null;          // { current, currentPrivate, profiles: [{ id, name, color, private, hex }] }
  let newColor = 'blue';

  const colorName = (c) => T(c === 'gold' ? 'profiles.color.gold' : 'tabGroup.color.' + c);
  const nameOf = (p) => p.name || (p.id === 'default' ? T('profiles.defaultName') : '?');
  const initialOf = (p) => nameOf(p).charAt(0).toLocaleUpperCase();
  const current = () => data && data.profiles.find((p) => p.id === data.current);

  function swatches(selected, group) {
    return `<div class="pf-colors" role="radiogroup" aria-label="${TH('profiles.colorLabel')}">${COLORS.map((c) => `
      <button type="button" class="pf-swatch pf-c-${c}" role="radio" data-group="${group}" data-color="${c}"
              aria-checked="${c === selected}" title="${esc(colorName(c))}" aria-label="${esc(colorName(c))}"></button>`).join('')}</div>`;
  }

  function avatar(p, cls = 'pf-avatar') {
    return `<span class="${cls}" style="--pf:${esc(p.hex || '#d4a85a')}" aria-hidden="true">${esc(initialOf(p))}</span>`;
  }

  function applyChrome() {
    const me = current();
    if (!me) return;
    const av = document.getElementById('profile-avatar');
    if (av) { av.textContent = initialOf(me); av.style.setProperty('--pf', me.hex); }
    const btn = document.getElementById('btn-profile');
    const label = T('ui.profile', { name: nameOf(me) });
    if (btn) { btn.title = label; btn.setAttribute('aria-label', label); btn.classList.toggle('is-private', !!data.currentPrivate); }
    // Varsayılan dışındaki profillerde pencere başlığı profil adını taşır (görev çubuğu).
    if (data.current !== 'default' && !document.documentElement.hasAttribute('data-incognito')) document.title = nameOf(me) + ' · İlgezdi';
    if (data.currentPrivate && !document.getElementById('private-profile-badge')) {
      document.documentElement.setAttribute('data-private-profile', 'true');
      const brand = document.getElementById('app-brand');
      if (brand) {
        const badge = document.createElement('span');
        badge.id = 'private-profile-badge';
        badge.textContent = T('profiles.privateBadge');
        brand.appendChild(badge);
      }
    }
  }

  function render(message, isError) {
    const panel = document.getElementById('panel-profiles');
    if (!panel || !data) return;
    const me = current();
    const others = data.profiles.filter((p) => p.id !== data.current);
    panel.innerHTML = `
      <div class="panel-header">
        <h2>${TH('profiles.title')}</h2>
        <button class="panel-close" data-panel="profiles" aria-label="${TH('common.closePanel')}">✕</button>
      </div>
      <div class="panel-body pf-body">
        <section class="pf-card pf-current" aria-labelledby="pf-current-name">
          <div class="pf-row">
            ${avatar(me, 'pf-avatar lg')}
            <div class="pf-text">
              <div class="pf-name" id="pf-current-name">${esc(nameOf(me))}</div>
              <div class="pf-sub">${TH('profiles.thisWindow')}${data.currentPrivate ? ' · <span class="pf-badge">' + TH('profiles.private') + '</span>' : ''}</div>
            </div>
          </div>
          <label class="pf-label" for="pf-name">${TH('profiles.nameLabel')}</label>
          <input type="text" id="pf-name" maxlength="40" value="${esc(me.name)}" placeholder="${esc(nameOf(me))}" autocomplete="off" />
          <div class="pf-label">${TH('profiles.colorLabel')}</div>
          ${swatches(me.color, 'current')}
          ${data.currentPrivate ? `<p class="pf-hint">${TH('profiles.privateHint')}</p>` : ''}
        </section>

        <section class="pf-section" aria-labelledby="pf-others-title">
          <h3 id="pf-others-title">${TH('profiles.others')}</h3>
          ${others.length ? `<div class="pf-list">${others.map((p) => `
            <div class="pf-item" data-id="${esc(p.id)}">
              ${avatar(p)}
              <div class="pf-text"><div class="pf-name">${esc(nameOf(p))}</div>${p.private ? `<div class="pf-sub"><span class="pf-badge">${TH('profiles.private')}</span></div>` : ''}</div>
              <button type="button" class="page-btn sm" data-pf="open">${TH('profiles.open')}</button>
              ${p.id === 'default' ? '' : `<button type="button" class="pf-icon-btn" data-pf="remove" title="${TH('profiles.remove')}" aria-label="${TH('profiles.remove')}: ${esc(nameOf(p))}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg></button>`}
            </div>`).join('')}</div>` : `<p class="pf-empty">${TH('profiles.none')}</p>`}
        </section>

        <section class="pf-section pf-new" aria-labelledby="pf-new-title">
          <h3 id="pf-new-title">${TH('profiles.new')}</h3>
          <form id="pf-new-form" novalidate>
            <label class="pf-label" for="pf-new-name">${TH('profiles.nameLabel')}</label>
            <input type="text" id="pf-new-name" maxlength="40" placeholder="${TH('profiles.newPlaceholder')}" autocomplete="off" />
            <div class="pf-label">${TH('profiles.colorLabel')}</div>
            ${swatches(newColor, 'new')}
            <label class="check-row pf-check"><input type="checkbox" id="pf-new-private" /> <span>${TH('profiles.newPrivate')}<small>${TH('profiles.privateHint')}</small></span></label>
            <button type="submit" class="page-btn primary">${TH('profiles.create')}</button>
          </form>
        </section>

        <p class="pf-status${isError ? ' is-error' : ''}" id="pf-status" role="status" aria-live="polite">${message ? esc(message) : ''}</p>
        <p class="pf-note">${TH('profiles.note')}</p>
      </div>`;
  }

  function setStatus(text, isError) {
    const el = document.getElementById('pf-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
  }

  async function refresh() {
    try { data = await sb.profiles.list(); } catch { data = null; }
    applyChrome();
  }

  function bind() {
    const panel = document.getElementById('panel-profiles');
    document.getElementById('btn-profile')?.addEventListener('click', async () => {
      if (panel.classList.contains('visible')) { window.ilgezdiCloseAllPanels?.(); return; }
      window.ilgezdiCloseAllPanels?.();
      await refresh();
      render();
      panel.classList.remove('hidden');
      requestAnimationFrame(() => panel.classList.add('visible'));
      document.getElementById('btn-profile')?.classList.add('active');
      sb.panelOpened(true);
    });

    panel.addEventListener('click', async (e) => {
      const sw = e.target.closest('.pf-swatch');
      if (sw) {
        const group = sw.dataset.group;
        panel.querySelectorAll(`.pf-swatch[data-group="${group}"]`).forEach((b) => b.setAttribute('aria-checked', String(b === sw)));
        if (group === 'new') { newColor = sw.dataset.color; return; }
        const r = await sb.profiles.update(data.current, { color: sw.dataset.color });
        if (r && r.ok) { data = r; applyChrome(); setStatus(T('profiles.saved')); }
        return;
      }
      const btn = e.target.closest('[data-pf]');
      if (!btn) return;
      const id = btn.closest('.pf-item')?.dataset.id;
      if (btn.dataset.pf === 'open') {
        const r = await sb.profiles.open(id);
        setStatus(r && r.ok ? T('profiles.opened') : T('profiles.errOpen'), !(r && r.ok));
      } else if (btn.dataset.pf === 'remove') {
        const r = await sb.profiles.remove(id);
        if (r && r.ok) { data = r; render(); }
        else if (r && r.error === 'in-use') setStatus(T('profiles.errInUse'), true);
      }
    });

    panel.addEventListener('change', async (e) => {
      if (e.target.id !== 'pf-name') return;
      const r = await sb.profiles.update(data.current, { name: e.target.value });
      if (r && r.ok) {
        data = r;
        applyChrome();
        const nameEl = document.getElementById('pf-current-name');
        if (nameEl) nameEl.textContent = nameOf(current());
        setStatus(T('profiles.saved'));
      }
    });

    panel.addEventListener('submit', async (e) => {
      if (e.target.id !== 'pf-new-form') return;
      e.preventDefault();
      const name = document.getElementById('pf-new-name').value;
      const r = await sb.profiles.create({ name, color: newColor, private: document.getElementById('pf-new-private').checked, open: true });
      if (!r || !r.ok) {
        setStatus(T(r && r.error === 'full' ? 'profiles.errFull' : r && r.error === 'name' ? 'profiles.errName' : 'profiles.errOpen'), true);
        return;
      }
      data = r;
      render(T('profiles.opened'));
    });
  }

  async function init() {
    if (!sb?.profiles) return;
    await refresh();
    bind();
  }

  window.addEventListener('load', () => setTimeout(init, 300));
  window.ilgezdiProfiles = { data: () => data };
})();
