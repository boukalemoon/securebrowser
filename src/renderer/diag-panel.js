/**
 * İlgezdi — Tanılama paneli ("Sorun Bildir")
 *
 * Üç işi var:
 *   1) Kullanıcı bir sorunu tek tıkla bildirebilsin
 *   2) GÖNDERİLECEK RAPORUN TAMAMINI gösterebilsin — şeffaflık, gizlilik
 *      odaklı bir üründe pazarlama cümlesi değil, doğrulanabilir olmalı
 *   3) Son olay günlüğü kullanıcıya (ve destek istendiğinde bize) görünür olsun
 *
 * Ayarlar → Tanılama sekmesinden açılır.
 */

'use strict';

(function () {
  const sb = window.secureBrowser;
  if (!sb || !sb.diag) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const LEVEL_COLOR = {
    fatal: 'var(--danger)', error: 'var(--danger)', warn: 'var(--warning)',
    info:  'var(--text-muted)', debug: 'var(--text-muted)',
  };

  function injectStyles() {
    if (document.getElementById('ilgezdi-diag-style')) return;
    const s = document.createElement('style');
    s.id = 'ilgezdi-diag-style';
    s.textContent = `
      .diag-row { display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:8px 0; border-bottom:1px solid var(--border-color); font-size:12px; }
      .diag-row:last-child { border-bottom:none; }
      .diag-k { color:var(--text-muted); }
      .diag-v { font-family:var(--font-mono,monospace); color:var(--text-main); font-size:11.5px;
        text-align:right; word-break:break-all; }
      .diag-note { width:100%; min-height:64px; background:var(--bg-input);
        border:1px solid var(--border-color); border-radius:8px; color:var(--text-main);
        padding:8px 10px; font-size:12px; font-family:var(--font-ui,inherit); resize:vertical;
        box-sizing:border-box; }
      .diag-btns { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
      .diag-btn { padding:8px 12px; border-radius:8px; border:1px solid var(--border-color);
        background:transparent; color:var(--text-main); font-size:12px; cursor:pointer;
        font-family:inherit; transition:all .15s; }
      .diag-btn:hover { border-color:var(--accent); color:var(--accent); }
      .diag-btn.primary { background:var(--accent); color:var(--bg-base); border-color:var(--accent);
        font-weight:600; }
      .diag-btn.primary:hover { opacity:.9; color:var(--bg-base); }
      .diag-btn:disabled { opacity:.55; cursor:wait; }
      .diag-log { max-height:260px; overflow:auto; background:var(--bg-base);
        border:1px solid var(--border-color); border-radius:8px; padding:8px; }
      .diag-line { font-family:var(--font-mono,monospace); font-size:10.5px; line-height:1.55;
        padding:2px 0; border-bottom:1px solid var(--border-dim,transparent); word-break:break-word; }
      .diag-line:last-child { border-bottom:none; }
      .diag-ts { color:var(--text-muted); }
      .diag-cat { color:var(--accent); }
      .diag-empty { color:var(--text-muted); font-size:12px; text-align:center; padding:18px; }
      .diag-preview { max-height:300px; overflow:auto; background:var(--bg-base);
        border:1px solid var(--border-color); border-radius:8px; padding:10px;
        font-family:var(--font-mono,monospace); font-size:10.5px; white-space:pre-wrap;
        word-break:break-word; color:var(--text-secondary); }
      .diag-status { font-size:11.5px; margin-top:8px; min-height:16px; }
    `;
    document.head.appendChild(s);
  }

  // ── Tanılama sekmesi içeriği ────────────────────────────────────────────────
  function renderDiagTab() {
    return `
      <div class="settings-section">
        <h3>${TH('diag.reporting')}</h3>
        <p class="s-hint" style="margin-top:0">${T('diag.reportingHint')}</p>
        <div id="diag-consent-row" class="diag-row">
          <span class="diag-k">${TH('diag.autoSend')}</span>
          <span class="diag-v" id="diag-consent-state">…</span>
        </div>
        <div class="diag-btns">
          <button class="diag-btn" id="diag-consent-on">${TH('diag.autoSendOn')}</button>
          <button class="diag-btn" id="diag-consent-off">${TH('diag.off')}</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>${TH('diag.report')}</h3>
        <p class="s-hint" style="margin-top:0">${TH('diag.reportHint')}</p>
        <textarea class="diag-note" id="diag-note" placeholder="${TH('diag.notePlaceholder')}" aria-label="${TH('diag.report')}"></textarea>
        <div class="diag-btns">
          <button class="diag-btn primary" id="diag-send">${TH('diag.send')}</button>
          <button class="diag-btn" id="diag-export">${TH('diag.export')}</button>
          <button class="diag-btn" id="diag-preview">${TH('diag.preview')}</button>
        </div>
        <div class="diag-status" id="diag-status"></div>
        <div id="diag-preview-box" style="margin-top:10px;display:none"></div>
      </div>

      <div class="settings-section">
        <h3>${TH('diag.system')}</h3>
        <div id="diag-env"></div>
      </div>

      <div class="settings-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <h3 style="margin:0;border:none;padding:0">${TH('diag.recent')}</h3>
          <div style="display:flex;gap:6px">
            <button class="diag-btn" id="diag-refresh" style="padding:4px 9px;font-size:11px">${TH('diag.refresh')}</button>
            <button class="diag-btn" id="diag-open-folder" style="padding:4px 9px;font-size:11px">${TH('diag.openFolder')}</button>
          </div>
        </div>
        <div class="diag-log" id="diag-log"><div class="diag-empty">${TH('common.loading')}</div></div>
      </div>

      <div class="settings-section">
        <h3>${TH('diag.privacy')}</h3>
        <p class="s-hint" style="margin-top:0">${TH('diag.privacyHint')}</p>
        <div class="diag-btns">
          <button class="diag-btn" id="diag-reset-id">${TH('diag.resetId')}</button>
        </div>
      </div>
    `;
  }

  // ── Doldurma ───────────────────────────────────────────────────────────────
  async function fillSummary() {
    let s = null;
    try { s = await sb.diag.getSummary(); } catch {}
    if (!s) return;

    const cs = document.getElementById('diag-consent-state');
    if (cs) {
      cs.textContent = s.consent === true ? T('diag.consent.on') : s.consent === false ? T('diag.consent.off') : T('diag.consent.unset');
      cs.style.color = s.consent === true ? 'var(--success)' : 'var(--text-muted)';
    }

    const env = document.getElementById('diag-env');
    if (env && s.env) {
      const e = s.env;
      const rows = [
        [T('diag.env.version'), e.version],
        ['Electron',       e.electron],
        ['Chromium',       e.chrome],
        [T('diag.env.os'), e.platform + ' ' + e.osRelease + ' (' + e.arch + ')'],
        [T('diag.env.memory'), T('diag.env.memoryValue', { free: e.freeMemMb, total: e.totalMemMb })],
        [T('diag.env.uptime'), T('diag.env.uptimeValue', { sec: e.uptimeSec })],
        [T('diag.env.session'), T('diag.env.sessionValue', { errors: e.counters.error, warns: e.counters.warn, crashes: e.counters.crash })],
        [T('diag.env.installId'), e.installId],
      ];
      env.innerHTML = rows.map(([k, v]) =>
        `<div class="diag-row"><span class="diag-k">${esc(k)}</span><span class="diag-v">${esc(v)}</span></div>`
      ).join('');
    }
  }

  async function fillLog() {
    const box = document.getElementById('diag-log');
    if (!box) return;
    let items = [];
    try { items = await sb.diag.getRecent(200) || []; } catch {}
    if (!items.length) { box.innerHTML = '<div class="diag-empty">' + TH('diag.noEvents') + '</div>'; return; }
    // En yeni üstte
    box.innerHTML = items.slice().reverse().map((l) => {
      const t = String(l.ts || '').slice(11, 19);
      const color = LEVEL_COLOR[l.level] || 'var(--text-main)';
      const extra = l.data ? ' ' + esc(JSON.stringify(l.data)) : '';
      return `<div class="diag-line">`
        + `<span class="diag-ts">${esc(t)}</span> `
        + `<span style="color:${color};font-weight:600">${esc((l.level || '').toUpperCase())}</span> `
        + `<span class="diag-cat">${esc(l.cat || '')}</span> `
        + `<span>${esc(l.msg || '')}</span>`
        + `<span class="diag-ts">${extra}</span>`
        + `</div>`;
    }).join('');
  }

  function status(msg, kind) {
    const el = document.getElementById('diag-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = kind === 'error' ? 'var(--danger)'
                   : kind === 'ok'    ? 'var(--success)'
                   :                    'var(--text-muted)';
    if (kind === 'ok' || kind === 'error') setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 6000);
  }

  function bindDiagEvents() {
    fillSummary();
    fillLog();

    document.getElementById('diag-refresh')?.addEventListener('click', () => { fillSummary(); fillLog(); });
    document.getElementById('diag-open-folder')?.addEventListener('click', () => sb.diag.openLogFolder());

    document.getElementById('diag-consent-on')?.addEventListener('click', async () => {
      await sb.diag.setConsent(true); fillSummary(); status(T('diag.autoSendEnabled'), 'ok');
    });
    document.getElementById('diag-consent-off')?.addEventListener('click', async () => {
      await sb.diag.setConsent(false); fillSummary(); status(T('diag.autoSendDisabled'), 'ok');
    });

    document.getElementById('diag-preview')?.addEventListener('click', async () => {
      const box = document.getElementById('diag-preview-box');
      if (!box) return;
      if (box.style.display !== 'none') { box.style.display = 'none'; box.innerHTML = ''; return; }
      const note = document.getElementById('diag-note')?.value || '';
      let rep = null;
      try { rep = await sb.diag.previewReport(note); } catch {}
      box.innerHTML = `<div class="diag-preview">${esc(JSON.stringify(rep, null, 2))}</div>`;
      box.style.display = '';
    });

    document.getElementById('diag-send')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const note = document.getElementById('diag-note')?.value || '';
      btn.disabled = true; const old = btn.textContent; btn.textContent = T('diag.sending');
      status(T('diag.sendingReport'));
      let r = null;
      try { r = await sb.diag.sendReport(note); } catch (err) { r = { ok: false, reason: String(err) }; }
      btn.disabled = false; btn.textContent = old;
      if (r?.ok) { status(T('diag.sent'), 'ok'); fillSummary(); }
      else if (r?.reason === 'no_consent')      status(T('diag.noConsent'), 'error');
      else if (r?.reason === 'no_endpoint')     status(T('diag.noEndpoint'), 'error');
      else if (r?.reason === 'insecure_endpoint') status(T('diag.insecureEndpoint'), 'error');
      else status(T('diag.sendFailed', { reason: r?.reason || T('common.unknownError') }), 'error');
    });

    document.getElementById('diag-export')?.addEventListener('click', async () => {
      const note = document.getElementById('diag-note')?.value || '';
      const r = await sb.diag.exportReport(note);
      if (r?.ok) status(T('diag.saved', { path: r.path }), 'ok');
      else if (r?.canceled) status('');
      else status(T('diag.saveFailed', { reason: r?.reason || T('common.unknownError') }), 'error');
    });

    document.getElementById('diag-reset-id')?.addEventListener('click', async () => {
      await sb.diag.resetIdentity(); fillSummary(); status(T('diag.idReset'), 'ok');
    });
  }

  // Ayarlar panelinin kullanabilmesi için dışa aç
  injectStyles();
  window.ilgezdiDiagPanel = { render: renderDiagTab, bind: bindDiagEvents, refresh: () => { fillSummary(); fillLog(); } };
})();
