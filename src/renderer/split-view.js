/**
 * İlgezdi — Ekranı bölme (arayüz tarafı).
 *
 * Sayfa görünümleri arayüzün üstünde çizildiği için bölme çizgisi ve odak şeritleri
 * bölmelerin arasındaki boşluğa yerleştirilir; yerleri ana süreçten gelir (split-state,
 * pencere içi koordinatlar). Sağ bölme için seçim yapılırken o bölmede görünüm yoktur:
 * seçici (açık sekmeler + adres kutusu) orada gösterilir.
 */

'use strict';

(function () {
  const sb = window.secureBrowser;
  const esc = (s) => window.ilgezdiHtml.esc(s);
  let state = { active: false };
  let dragging = false;

  function build() {
    if (document.getElementById('split-ui')) return;
    const ui = document.createElement('div');
    ui.id = 'split-ui';
    ui.hidden = true;
    ui.innerHTML = `
      <div class="split-focus" data-side="left"></div>
      <div class="split-focus" data-side="right"></div>
      <div class="split-divider" role="separator" aria-orientation="vertical" tabindex="0"
           aria-label="${TH('split.divider')}" title="${TH('split.divider')}"><span class="split-grip" aria-hidden="true"></span></div>
      <section class="split-chooser" aria-labelledby="split-chooser-title" hidden>
        <h2 id="split-chooser-title">${TH('split.chooseTitle')}</h2>
        <form class="split-form" id="split-form">
          <input type="text" id="split-address" autocomplete="off" spellcheck="false"
                 placeholder="${TH('split.addressPlaceholder')}" aria-label="${TH('split.addressPlaceholder')}" />
          <button type="submit" class="page-btn primary">${TH('split.open')}</button>
        </form>
        <div class="split-tabs-title">${TH('split.openTabs')}</div>
        <div class="split-tabs" id="split-tabs"></div>
        <button type="button" class="page-btn ghost split-cancel" id="split-cancel">${TH('common.cancel')}</button>
      </section>`;
    document.getElementById('app').appendChild(ui);

    const divider = ui.querySelector('.split-divider');
    // Sürükleme: işaretçi yakalanır; bölmelerin üstünden geçerken de olaylar çizgide kalır.
    divider.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !state.active || state.choosing) return;
      e.preventDefault();
      dragging = true;
      divider.setPointerCapture(e.pointerId);
      divider.classList.add('dragging');
    });
    divider.addEventListener('pointermove', (e) => {
      if (!dragging || !state.rects) return;
      const a = state.rects.area;
      sb.split.ratio((e.clientX - a.x - 3) / Math.max(a.width - 6, 1));
    });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove('dragging');
      try { divider.releasePointerCapture(e.pointerId); } catch {}
    };
    divider.addEventListener('pointerup', stop);
    divider.addEventListener('pointercancel', stop);
    divider.addEventListener('dblclick', () => sb.split.ratio(0.5));
    divider.addEventListener('keydown', (e) => {
      if (!state.active || state.choosing) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        sb.split.ratio((state.ratio || 0.5) + (e.key === 'ArrowLeft' ? -0.05 : 0.05));
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        sb.split.ratio(e.key === 'Home' ? 0.2 : 0.8);
      }
    });

    document.getElementById('split-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('split-address').value.trim();
      if (text) await sb.split.choose({ text });
    });
    document.getElementById('split-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab-id]');
      if (b) sb.split.choose({ tabId: Number(b.dataset.tabId) });
    });
    document.getElementById('split-cancel').addEventListener('click', () => sb.split.exit());
    ui.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.choosing) { e.preventDefault(); sb.split.exit(); }
    });
  }

  const place = (el, r) => {
    el.style.left = r.x + 'px';
    el.style.top = r.y + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
  };

  function renderChooserTabs(list) {
    const box = document.getElementById('split-tabs');
    if (!box) return;
    const all = Array.isArray(list) ? list : (typeof currentTabs !== 'undefined' ? currentTabs : []);
    const tabs = all.filter((t) => t.id !== state.leftId && t.id !== state.rightId && /^https?:/i.test(t.url || ''));
    box.innerHTML = tabs.length
      ? tabs.map((t) => `<button type="button" class="split-tab" data-tab-id="${esc(t.id)}">
          <span class="split-tab-title">${esc(t.title || t.url)}</span><span class="split-tab-url">${esc(t.url)}</span></button>`).join('')
      : `<p class="split-empty">${TH('split.noTabs')}</p>`;
  }

  function apply(next) {
    state = next || { active: false };
    build();
    const ui = document.getElementById('split-ui');
    const btn = document.getElementById('btn-split');
    btn?.setAttribute('aria-pressed', state.active ? 'true' : 'false');
    btn?.classList.toggle('active', !!state.active);
    if (btn) {
      const label = T(state.active ? 'ui.splitExit' : 'ui.split');
      btn.title = label;
      btn.setAttribute('aria-label', label);
    }
    ui.hidden = !state.active;
    if (!state.active) return;
    const r = state.rects;
    const focusLeft = ui.querySelector('.split-focus[data-side="left"]');
    const focusRight = ui.querySelector('.split-focus[data-side="right"]');
    place(focusLeft, { x: r.left.x, y: r.area.y, width: r.left.width, height: r.left.y - r.area.y });
    place(focusRight, { x: r.right.x, y: r.area.y, width: r.right.width, height: r.right.y - r.area.y });
    focusLeft.classList.toggle('on', state.focus === 'left');
    focusRight.classList.toggle('on', state.focus === 'right' && !state.choosing);
    const divider = ui.querySelector('.split-divider');
    place(divider, r.divider);
    divider.setAttribute('aria-valuenow', String(Math.round((state.ratio || 0.5) * 100)));
    const chooser = ui.querySelector('.split-chooser');
    chooser.hidden = !state.choosing;
    if (state.choosing) {
      place(chooser, r.right);
      renderChooserTabs();
      const input = document.getElementById('split-address');
      if (document.activeElement !== input) { input.value = ''; setTimeout(() => input.focus(), 0); }
    }
  }

  function init() {
    build();
    sb.split?.onState(apply);
    document.getElementById('btn-split')?.addEventListener('click', async () => {
      const r = await sb.split.toggle();
      if (r && r.ok === false && r.error === 'web-only') {
        const note = document.getElementById('status-note');
        if (note) { note.textContent = T('split.webOnly'); note.hidden = false; setTimeout(() => { note.hidden = true; }, 3500); }
      }
    });
    // Seçici açıkken sekme listesi değişirse (yeni sekme, başlık) liste tazelenir.
    sb.onTabsUpdate?.((tabs) => { if (state.active && state.choosing) renderChooserTabs(tabs); });
  }

  window.addEventListener('DOMContentLoaded', init);
  window.ilgezdiSplit = { state: () => state };
})();
