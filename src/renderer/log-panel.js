/**
 * İlgezdi — Log Panel UI (Faz 3)
 * Arama, filtreleme, PDF/CSV dışa aktarma, şifreleme durumu
 */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let logQuery    = { text: '', dateFrom: '', dateTo: '', vpnOnly: false, page: 1, limit: 50 };
let logData     = { items: [], total: 0, pages: 1 };
let logStats    = {};

// ─── CSS Injection ────────────────────────────────────────────────────────────
function injectLogPanelStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Log Panel ── */
    #panel-logs .panel-body { padding: 0; display: flex; flex-direction: column; height: calc(100% - 52px); }

    .log-toolbar {
      padding: 12px 14px 8px;
      border-bottom: 1px solid var(--border-dim);
      flex-shrink: 0;
    }

    .log-search-row {
      display: flex; gap: 6px; margin-bottom: 8px;
    }
    .log-search-row input {
      flex: 1; background: var(--bg-elevated); border: 1px solid var(--border);
      border-radius: 6px; color: var(--text-primary); padding: 7px 10px;
      font-size: 12px; outline: none; transition: border-color 0.2s;
    }
    .log-search-row input:focus { border-color: var(--accent); }

    .log-filter-row {
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .log-filter-row input[type="date"] {
      background: var(--bg-elevated); border: 1px solid var(--border);
      border-radius: 5px; color: var(--text-secondary); padding: 5px 8px;
      font-size: 11px; outline: none; cursor: pointer;
    }
    .log-filter-toggle {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: var(--text-secondary); cursor: pointer;
      padding: 5px 8px; border-radius: 5px; border: 1px solid var(--border);
      background: var(--bg-elevated); transition: all 0.15s; white-space: nowrap;
    }
    .log-filter-toggle.active { border-color: var(--success); color: var(--success); }

    .log-export-row {
      display: flex; gap: 6px; margin-top: 8px;
    }
    .log-export-btn {
      flex: 1; padding: 6px; border: 1px solid var(--border);
      background: var(--bg-elevated); border-radius: 5px;
      color: var(--text-secondary); font-size: 11px; cursor: pointer;
      transition: all 0.15s; text-align: center;
    }
    .log-export-btn:hover { border-color: var(--accent); color: var(--accent); }

    /* Stats Bar */
    .log-stats-bar {
      display: flex; gap: 0; border-bottom: 1px solid var(--border-dim); flex-shrink: 0;
    }
    .stat-chip {
      flex: 1; padding: 8px 4px; text-align: center; border-right: 1px solid var(--border-dim);
    }
    .stat-chip:last-child { border-right: none; }
    .stat-chip .stat-val { font-size: 15px; font-weight: 700; color: var(--accent); display: block; }
    .stat-chip .stat-lbl { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }

    /* Şifreleme badge */
    .enc-badge {
      display: flex; align-items: center; gap: 5px;
      padding: 4px 10px; background: rgba(0,230,118,0.08);
      border-bottom: 1px solid rgba(0,230,118,0.15);
      font-size: 10px; color: var(--success); flex-shrink: 0;
    }

    /* Log listesi */
    .log-list-wrap {
      flex: 1; overflow-y: auto; padding: 8px 0;
    }
    .log-entry {
      padding: 9px 14px; border-bottom: 1px solid rgba(255,255,255,0.03);
      cursor: pointer; transition: background 0.1s;
    }
    .log-entry:hover { background: var(--bg-hover); }
    .log-entry-top {
      display: flex; align-items: center; gap: 8px; margin-bottom: 2px;
    }
    .log-domain {
      font-size: 12px; font-weight: 600; color: var(--text-primary);
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .log-time {
      font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); flex-shrink: 0;
    }
    .log-vpn-tag {
      font-size: 9px; padding: 1px 5px; border-radius: 3px;
      background: rgba(0,230,118,0.12); color: var(--success); flex-shrink: 0;
    }
    .log-title {
      font-size: 11px; color: var(--text-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .log-url {
      font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Sayfalama */
    .log-pagination {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px; border-top: 1px solid var(--border-dim); flex-shrink: 0;
    }
    .page-btn {
      padding: 4px 10px; border-radius: 5px; border: 1px solid var(--border);
      background: var(--bg-elevated); color: var(--text-secondary);
      font-size: 11px; cursor: pointer; transition: all 0.15s;
    }
    .page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .page-btn:disabled { opacity: 0.3; cursor: default; }
    .page-info { font-size: 11px; color: var(--text-muted); }

    .log-empty {
      text-align: center; padding: 40px 20px;
      color: var(--text-muted); font-size: 12px;
    }
    .log-empty .empty-icon { font-size: 32px; margin-bottom: 8px; }
  `;
  document.head.appendChild(style);
}

// ─── HTML Injection ────────────────────────────────────────────────────────────
function injectLogPanelHTML() {
  const panel = document.getElementById('panel-logs');
  if (!panel) return;

  panel.innerHTML = `
    <div class="panel-header">
      <h2>${TH('logs.title')}</h2>
      <button class="panel-close" data-panel="logs" aria-label="${TH('common.closePanel')}">✕</button>
    </div>
    <div class="panel-body">

      <!-- Şifreleme Durumu -->
      <div class="enc-badge">
        ${TH('logs.encrypted')} &nbsp;·&nbsp; <span id="log-size-info">${TH('common.loading')}</span>
      </div>

      <!-- İstatistik Bar -->
      <div class="log-stats-bar">
        <div class="stat-chip">
          <span class="stat-val" id="stat-total">-</span>
          <span class="stat-lbl">${TH('logs.stat.total')}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-val" id="stat-today">-</span>
          <span class="stat-lbl">${TH('logs.stat.today')}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-val" id="stat-domains">-</span>
          <span class="stat-lbl">${TH('logs.stat.domains')}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-val" id="stat-vpn">-</span>
          <span class="stat-lbl">${TH('logs.stat.vpn')}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-val" id="stat-blocked">-</span>
          <span class="stat-lbl">${TH('logs.stat.blocked')}</span>
        </div>
      </div>

      <!-- Arama / Filtre -->
      <div class="log-toolbar">
        <div class="log-search-row">
          <input type="text" id="log-search-input" placeholder="${TH('logs.searchPlaceholder')}" />
          <button class="page-btn" id="btn-log-search">${TH('logs.search')}</button>
          <button class="page-btn" id="btn-log-clear-search" title="${TH('logs.clearSearch')}" aria-label="${TH('logs.clearSearch')}">✕</button>
        </div>
        <div class="log-filter-row">
          <input type="date" id="log-date-from" title="${TH('logs.dateFrom')}" aria-label="${TH('logs.dateFrom')}" />
          <span style="font-size:11px;color:var(--text-muted)">—</span>
          <input type="date" id="log-date-to" title="${TH('logs.dateTo')}" aria-label="${TH('logs.dateTo')}" />
          <button class="log-filter-toggle" id="btn-vpn-filter">${TH('logs.vpnOnly')}</button>
        </div>
        <div class="log-export-row">
          <button class="log-export-btn" id="btn-export-csv">${TH('logs.exportCsv')}</button>
          <button class="log-export-btn" id="btn-export-html">${TH('logs.exportHtml')}</button>
          <button class="log-export-btn" id="btn-clear-logs" style="color:var(--danger)">${TH('logs.clear')}</button>
        </div>
      </div>

      <!-- Log Listesi -->
      <div class="log-list-wrap" id="log-list-wrap">
        <div class="log-empty">
          <div class="empty-icon">📋</div>
          ${TH('logs.empty')}
        </div>
      </div>

      <!-- Sayfalama -->
      <div class="log-pagination">
        <button class="page-btn" id="btn-log-prev">${TH('logs.prev')}</button>
        <span class="page-info" id="log-page-info">1 / 1</span>
        <button class="page-btn" id="btn-log-next">${TH('logs.next')}</button>
      </div>

    </div>
  `;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderLogStats(stats) {
  logStats = stats;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-total',    stats.totalVisits   || 0);
  set('stat-today',    stats.todayVisits   || 0);
  set('stat-domains',  stats.uniqueDomains || 0);
  set('stat-vpn',      stats.vpnVisits     || 0);
  // Engelleme sayısı engelleyicinin kendisinden — eskiden hiç yazılmayan bir
  // sayaçtan okunuyor ve hep 0 gösteriyordu (denetim D-11).
  sb.blocker?.getStats?.().then((b) => set('stat-blocked', Number(b?.today) || 0)).catch(() => {});
  // safeStorage yoksa günlük şifresiz tutulur — "şifreli" diye göstermeyelim.
  set('log-size-info', T(stats.encrypted === false ? 'logs.sizePlain' : 'logs.sizeEncrypted', { size: window.ilgezdiI18n.formatNumber(stats.logSizeKb || 0) }));
}

function renderLogList(data) {
  logData = data;
  const wrap = document.getElementById('log-list-wrap');
  if (!wrap) return;

  if (!data.items?.length) {
    wrap.innerHTML = `<div class="log-empty"><div class="empty-icon">🔍</div>${TH('logs.noResults')}</div>`;
  } else {
    // GÜVENLİK (denetim Y-04): title / url / domain ziyaret edilen sitenin
    // kontrolünde — başlık doğrudan sayfanın <title> etiketinden gelir. Kaçışsız
    // innerHTML, herhangi bir sitenin şifre kasasına erişen ayrıcalıklı arayüze
    // HTML/CSS enjekte etmesine izin veriyordu.
    const H = window.ilgezdiHtml;
    wrap.innerHTML = data.items.map(log => {
      const d    = new Date(log.timestamp);
      const time = window.ilgezdiI18n.formatTime(d, { hour: '2-digit', minute: '2-digit' });
      const date = window.ilgezdiI18n.formatDate(d, { day: '2-digit', month: '2-digit' });
      return `
        <div class="log-entry" data-url="${H.esc(H.safeUrl(log.url))}">
          <div class="log-entry-top">
            <div class="log-domain">${H.esc(log.domain || '-')}</div>
            ${log.vpnActive ? '<span class="log-vpn-tag">VPN</span>' : ''}
            <div class="log-time">${H.esc(date)} ${H.esc(time)}</div>
          </div>
          ${log.title ? `<div class="log-title">${H.esc(log.title)}</div>` : ''}
          <div class="log-url">${H.esc(log.url)}</div>
        </div>
      `;
    }).join('');

    // Log'a tıklayınca o URL'e git
    wrap.querySelectorAll('.log-entry[data-url]').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        if (url && url.startsWith('http')) {
          sb.navigate(url);
          // Paneli kapat
          document.getElementById('panel-logs')?.classList.remove('visible');
          document.getElementById('panel-logs')?.classList.add('hidden');
          sb.panelOpened(false);
        }
      });
    });
  }

  // Sayfalama
  const pageInfo = document.getElementById('log-page-info');
  if (pageInfo) pageInfo.textContent = T('logs.pageInfo', { page: data.page, pages: data.pages || 1, count: data.total });

  const prevBtn = document.getElementById('btn-log-prev');
  const nextBtn = document.getElementById('btn-log-next');
  if (prevBtn) prevBtn.disabled = data.page <= 1;
  if (nextBtn) nextBtn.disabled = data.page >= (data.pages || 1);
}

// ─── Veri Yükleme ─────────────────────────────────────────────────────────────
async function loadLogPanel() {
  const [stats, data] = await Promise.all([
    sb.logs.getStats(),
    sb.logs.search(logQuery),
  ]);
  renderLogStats(stats);
  renderLogList(data);
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function initLogPanelEvents() {

  // Arama
  document.getElementById('btn-log-search')?.addEventListener('click', async () => {
    logQuery.text = document.getElementById('log-search-input')?.value || '';
    logQuery.page = 1;
    const data = await sb.logs.search(logQuery);
    renderLogList(data);
  });

  document.getElementById('log-search-input')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      logQuery.text = e.target.value;
      logQuery.page = 1;
      const data = await sb.logs.search(logQuery);
      renderLogList(data);
    }
  });

  // Aramayı temizle
  document.getElementById('btn-log-clear-search')?.addEventListener('click', async () => {
    logQuery = { text: '', dateFrom: '', dateTo: '', vpnOnly: false, page: 1, limit: 50 };
    const inp = document.getElementById('log-search-input');
    const df  = document.getElementById('log-date-from');
    const dt  = document.getElementById('log-date-to');
    if (inp) inp.value = '';
    if (df)  df.value  = '';
    if (dt)  dt.value  = '';
    document.getElementById('btn-vpn-filter')?.classList.remove('active');
    await loadLogPanel();
  });

  // Tarih filtresi
  document.getElementById('log-date-from')?.addEventListener('change', async (e) => {
    logQuery.dateFrom = e.target.value;
    logQuery.page     = 1;
    const data = await sb.logs.search(logQuery);
    renderLogList(data);
  });
  document.getElementById('log-date-to')?.addEventListener('change', async (e) => {
    logQuery.dateTo = e.target.value;
    logQuery.page   = 1;
    const data = await sb.logs.search(logQuery);
    renderLogList(data);
  });

  // VPN filtresi
  document.getElementById('btn-vpn-filter')?.addEventListener('click', async function() {
    logQuery.vpnOnly = !logQuery.vpnOnly;
    logQuery.page    = 1;
    this.classList.toggle('active', logQuery.vpnOnly);
    const data = await sb.logs.search(logQuery);
    renderLogList(data);
  });

  // Sayfalama
  document.getElementById('btn-log-prev')?.addEventListener('click', async () => {
    if (logQuery.page > 1) {
      logQuery.page--;
      const data = await sb.logs.search(logQuery);
      renderLogList(data);
    }
  });
  document.getElementById('btn-log-next')?.addEventListener('click', async () => {
    if (logQuery.page < (logData.pages || 1)) {
      logQuery.page++;
      const data = await sb.logs.search(logQuery);
      renderLogList(data);
    }
  });

  // CSV Export
  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    const csv = await sb.logs.exportCSV(logQuery);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ilgezdi-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // HTML Rapor Export
  document.getElementById('btn-export-html')?.addEventListener('click', async () => {
    const { items } = await sb.logs.search({ ...logQuery, limit: 99999 });
    const html = generateHTMLReport(items, logStats);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ilgezdi-rapor-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Logları Temizle
  document.getElementById('btn-clear-logs')?.addEventListener('click', async () => {
    if (confirm(T('logs.clearConfirm'))) {
      await sb.logs.clearLogs();
      await loadLogPanel();
    }
  });

  // Panel kapatma (mevcut handler'larla uyumlu)
  document.querySelector('[data-panel="logs"]')?.addEventListener('click', () => {
  window.ilgezdiCloseAllPanels?.();
});
}

// ─── HTML Rapor Oluşturucu ────────────────────────────────────────────────────
function generateHTMLReport(items, stats) {
  // GÜVENLİK (denetim Y-05): Bu dosya uygulamanın DIŞINDA, kullanıcının varsayılan
  // tarayıcısında açılır — İlgezdi'nin CSP koruması orada yoktur. Eskiden sayfa
  // başlıkları ve URL'ler kaçışsız yazılıyordu: <title> etiketine <script> koyan
  // herhangi bir site, rapor açıldığında tüm tarama geçmişini dışarı gönderebiliyordu.
  // Üç katman: (1) her değer kaçışlanır, (2) href yalnızca http(s),
  // (3) belgenin kendi CSP'si betik çalıştırmayı ve dış bağlantıyı tamamen yasaklar.
  const H = window.ilgezdiHtml;
  stats = stats || {};
  const n = (v) => Number(v) || 0;

  const rows = items.map(l => {
    const d     = new Date(l.timestamp);
    const time  = window.ilgezdiI18n.formatDateTime(d);
    const href  = H.safeUrl(l.url);
    const label = H.esc(String(l.title || l.url || '-').slice(0, 60));
    return `<tr>
      <td>${H.esc(time)}</td>
      <td>${H.esc(l.domain || '-')}</td>
      <td>${href ? `<a href="${H.esc(href)}" rel="noopener noreferrer" style="color:#6eb5ff">${label}</a>` : label}</td>
      <td>${l.vpnActive ? '<span style="color:#00e676">✓ VPN</span>' : '-'}</td>
    </tr>`;
  }).join('');

  const encNote = stats.encrypted === false ? T('logs.report.plainNote') : T('logs.report.encNote');

  return `<!DOCTYPE html>
<html lang="${H.esc(window.ilgezdiI18n.locale)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>${TH('logs.report.title')}</title>
<style>
  body { background:#0a0e1a; color:#e0e0e0; font-family:'Segoe UI',sans-serif; padding:30px; }
  h1   { color:#e8b84b; }
  .stats { display:flex; gap:20px; margin:20px 0; flex-wrap:wrap; }
  .stat  { background:#151a2e; padding:16px 24px; border-radius:8px; border:1px solid #1e2540; }
  .stat-val { font-size:28px; font-weight:700; color:#6eb5ff; }
  .stat-lbl { font-size:12px; color:#8a93a8; margin-top:4px; }
  table { width:100%; border-collapse:collapse; margin-top:20px; }
  th    { background:#151a2e; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#8a93a8; border-bottom:2px solid #1e2540; }
  td    { padding:9px 12px; font-size:12px; border-bottom:1px solid #0f1420; word-break:break-word; }
  .enc-note { margin-top:30px; padding:12px; background:rgba(232,184,75,0.06); border:1px solid rgba(232,184,75,0.2); border-radius:6px; font-size:12px; color:#e8b84b; }
</style>
</head>
<body>
<h1>${TH('logs.report.title')}</h1>
<p style="color:#8a93a8;font-size:12px">${TH('logs.report.created', { date: window.ilgezdiI18n.formatDateTime(new Date()) })}</p>
<div class="stats">
  <div class="stat"><div class="stat-val">${n(stats.totalVisits)}</div><div class="stat-lbl">${TH('logs.report.totalVisits')}</div></div>
  <div class="stat"><div class="stat-val">${n(stats.uniqueDomains)}</div><div class="stat-lbl">${TH('logs.report.uniqueDomains')}</div></div>
  <div class="stat"><div class="stat-val">${n(stats.vpnVisits)}</div><div class="stat-lbl">${TH('logs.report.vpnVisits')}</div></div>
</div>
<table>
  <thead><tr><th>${TH('logs.report.colDate')}</th><th>${TH('logs.report.colDomain')}</th><th>${TH('logs.report.colPage')}</th><th>VPN</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#8a93a8;padding:30px">${TH('logs.report.empty')}</td></tr>`}</tbody>
</table>
<div class="enc-note">${H.esc(encNote)}</div>
</body></html>`;
}

// ─── Toolbar Butonu ────────────────────────────────────────────────────────────
function upgradeLogsButton() {
  const btn = document.getElementById('btn-logs');
  if (!btn) return;

  // Mevcut handler'ı değiştir
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

 newBtn.addEventListener('click', async () => {
  const panel = document.getElementById('panel-logs');
  if (!panel) return;

  if (panel.classList.contains('visible')) {
    window.ilgezdiCloseAllPanels?.();
  } else {
    window.ilgezdiCloseAllPanels?.();
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
    newBtn.classList.add('active');
    sb.panelOpened(true);
    await loadLogPanel();
  }
});
}

// ─── Faz 3 Log Başlatıcı ──────────────────────────────────────────────────────
function initFaz3Logs() {
  injectLogPanelStyles();
  injectLogPanelHTML();
  initLogPanelEvents();
  upgradeLogsButton();
  console.log('[Faz3] Log paneli hazır');
}

window.addEventListener('load', () => {
  setTimeout(initFaz3Logs, 600);
});
