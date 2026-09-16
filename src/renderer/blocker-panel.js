/**
 * İlgezdi — Faz 6: Gelişmiş Reklam/Cookie Engelleyici
 * blocker-panel.js
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let blockerStats = {
  total: 0, ads: 0, trackers: 0, cookies: 0,
  today: 0, byDomain: {}
};
let blockerWhitelist = [];
let blockerLevel     = 'medium'; // low | medium | high | full

// ─── Storage ──────────────────────────────────────────────────────────────────
function blockerLoad() {
  try {
    blockerWhitelist = JSON.parse(localStorage.getItem('ilgezdi-whitelist') || '[]');
    blockerLevel     = localStorage.getItem('ilgezdi-block-level') || 'medium';
  } catch {}
}

function blockerSave() {
  try {
    localStorage.setItem('ilgezdi-whitelist', JSON.stringify(blockerWhitelist));
    localStorage.setItem('ilgezdi-block-level', blockerLevel);
  } catch {}
  blockerPushToMain();
}

// KRİTİK: Ayarı ana sürece BİLDİR. Eskiden yalnızca localStorage ve config.json'a
// yazılıyordu; engelleyicinin gerçek durumunu tutan updateBlockerConfig() hiç
// çağrılmadığı için seviye ve beyaz liste hiçbir etki yapmıyordu — "bu siteye
// izin ver" düğmesi sessizce hiçbir şey yapmıyordu.
function blockerPushToMain() {
  window.secureBrowser?.blocker?.updateConfig?.({
    level:     blockerLevel,
    whitelist: blockerWhitelist,
    enabled:   true,
  });
  // Ayrıca config.json'a yaz: yeniden başlatmada ana süreç buradan okuyup uygular.
  window.secureBrowser?.saveConfig({ whitelist: blockerWhitelist, blockLevel: blockerLevel });
}

// ─── Whitelist CRUD ───────────────────────────────────────────────────────────
function blockerAddWhitelist(domain) {
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!domain || blockerWhitelist.includes(domain)) return;
  blockerWhitelist.push(domain);
  blockerSave();
  window.ilgezdiSync?.schedulePush();
}

function blockerRemoveWhitelist(domain) {
  blockerWhitelist = blockerWhitelist.filter(d => d !== domain);
  blockerSave();
  window.ilgezdiSync?.schedulePush();
}

function blockerIsWhitelisted(url) {
  try {
    const domain = new URL(url).hostname;
    return blockerWhitelist.some(d => domain === d || domain.endsWith('.' + d));
  } catch { return false; }
}

// ─── Mevcut sayfayı whitelist ekle/kaldır ────────────────────────────────────
function blockerToggleCurrentSite() {
  const url = document.getElementById('address-bar')?.value;
  if (!url || url.startsWith('about:')) return;

  try {
    const domain = new URL(url).hostname;
    if (blockerIsWhitelisted(url)) {
      blockerRemoveWhitelist(domain);
      blockerUpdateSiteBtn(false);
      showBlockerToast(T('blocker.reenabled', { domain }));
    } else {
      blockerAddWhitelist(domain);
      blockerUpdateSiteBtn(true);
      showBlockerToast(T('blocker.allowed', { domain }));
    }
    if (document.getElementById('panel-blocker')?.classList.contains('visible')) {
      blockerRenderWhitelist();
    }
  } catch {}
}

function blockerUpdateSiteBtn(isWhitelisted) {
  const btn = document.getElementById('btn-blocker-site');
  if (!btn) return;
  btn.title = isWhitelisted ? T('blocker.siteBtnOn') : T('blocker.siteBtnAllow');
  btn.classList.toggle('whitelisted', isWhitelisted);
}

function blockerCheckCurrentSite() {
  const url = document.getElementById('address-bar')?.value;
  blockerUpdateSiteBtn(url ? blockerIsWhitelisted(url) : false);
}

// ─── İstatistik Güncelle ──────────────────────────────────────────────────────
function blockerUpdateStats(data) {
  if (!data) return;
  blockerStats = { ...blockerStats, ...data };
  // Mini badge güncelle
  const badge = document.getElementById('blocker-count-badge');
  if (badge) {
    badge.textContent = blockerStats.today || 0;
    badge.style.display = blockerStats.today > 0 ? 'flex' : 'none';
  }
  // Panel açıksa yenile
  if (document.getElementById('panel-blocker')?.classList.contains('visible')) {
    blockerRenderStats();
  }
}

// ─── Panel Render ─────────────────────────────────────────────────────────────
function blockerRenderStats() {
  const el = document.getElementById('blocker-stats-grid');
  if (!el) return;

  const level = blockerLevel;
  const levelLabel = (l) => (['low', 'medium', 'high', 'full'].includes(l) ? T('blocker.level.' + l) : T('blocker.level.medium'));
  const levelColors = { low: 'var(--warning)', medium: 'var(--accent)', high: 'var(--success)', full: '#ff6b6b' };

  el.innerHTML = `
    <div class="bl-stat-card accent">
      <div class="bl-stat-value">${blockerStats.today || 0}</div>
      <div class="bl-stat-label">${TH('blocker.stat.today')}</div>
    </div>
    <div class="bl-stat-card">
      <div class="bl-stat-value">${blockerStats.total || 0}</div>
      <div class="bl-stat-label">${TH('blocker.stat.total')}</div>
    </div>
    <div class="bl-stat-card">
      <div class="bl-stat-value">${blockerStats.ads || 0}</div>
      <div class="bl-stat-label">${TH('blocker.stat.ads')}</div>
    </div>
    <div class="bl-stat-card">
      <div class="bl-stat-value">${blockerStats.trackers || 0}</div>
      <div class="bl-stat-label">${TH('blocker.stat.trackers')}</div>
    </div>
  `;

  // Seviye göstergesi
  const levelEl = document.getElementById('blocker-level-display');
  if (levelEl) {
    levelEl.textContent = levelLabel(level);
    levelEl.style.color = levelColors[level] || 'var(--accent)';
  }

  // Seviye butonları
  document.querySelectorAll('.bl-level-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === blockerLevel);
  });
}

function blockerRenderWhitelist() {
  const el = document.getElementById('blocker-whitelist');
  if (!el) return;
  const H = window.ilgezdiHtml;

  if (blockerWhitelist.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px">
      ${TH('blocker.allSitesBlocked')}
    </p>`;
    return;
  }

  // GİZLİLİK: Eskiden her satır için google.com/s2/favicons?domain=… isteniyordu —
  // yani kullanıcının engellemeyi kapattığı her site, panel her açıldığında
  // Google'a bildiriliyordu. Yerine yerel bir harf rozeti kullanılıyor.
  // (Satır içi onerror da CSP'ye takıldığı için zaten çalışmıyordu — D-05.)
  el.innerHTML = blockerWhitelist.map(domain => {
    const letter = (String(domain).replace(/^www[.]/, '').charAt(0) || '?').toUpperCase();
    return `
    <div class="bl-white-item">
      <span aria-hidden="true" style="display:inline-grid;place-items:center;width:14px;height:14px;border-radius:3px;background:var(--bg-input);color:var(--text-muted);font-size:9px;font-weight:700;flex-shrink:0">${H.esc(letter)}</span>
      <span class="bl-white-domain">${H.esc(domain)}</span>
      <button class="bl-white-remove" data-domain="${H.esc(domain)}" aria-label="${TH('blocker.reenableLabel', { domain })}">✕</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.bl-white-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      blockerRemoveWhitelist(btn.dataset.domain);
      blockerRenderWhitelist();
      showBlockerToast(T('blocker.reenabled', { domain: btn.dataset.domain }));
    });
  });
}

function blockerRenderTopBlocked() {
  const el = document.getElementById('blocker-top-list');
  if (!el) return;
  const H = window.ilgezdiHtml;

  const entries = Object.entries(blockerStats.byDomain || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (entries.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:12px">
      ${TH('blocker.noneYet')}
    </p>`;
    return;
  }

  // Alan adları engellenen isteklerden geliyor (dış kaynaklı) — kaçışlanır.
  const max = Number(entries[0]?.[1]) || 1;
  el.innerHTML = entries.map(([domain, count]) => {
    const c = Number(count) || 0;
    return `
    <div class="bl-top-item">
      <div class="bl-top-info">
        <span class="bl-top-domain">${H.esc(domain)}</span>
        <span class="bl-top-count">${c}</span>
      </div>
      <div class="bl-top-bar">
        <div class="bl-top-fill" style="width:${Math.round(c / max * 100)}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────
function blockerInjectPanelHTML() {
  const panel = document.getElementById('panel-blocker');
  if (!panel) return;

  panel.innerHTML = `
    <div class="panel-header">
      <h2>${TH('blocker.title')}</h2>
      <button class="panel-close" data-panel="blocker" aria-label="${TH('common.closePanel')}">✕</button>
    </div>

    <div class="bl-content">

      <!-- Engelleme Seviyesi -->
      <div class="bl-section">
        <div class="bl-section-header">
          <span>${TH('blocker.levelTitle')}</span>
          <span id="blocker-level-display" style="font-weight:700">${TH('blocker.level.medium')}</span>
        </div>
        <div class="bl-level-grid">
          <button class="bl-level-btn" data-level="low">${TH('blocker.levelBtn.low')}</button>
          <button class="bl-level-btn active" data-level="medium">${TH('blocker.levelBtn.medium')}</button>
          <button class="bl-level-btn" data-level="high">${TH('blocker.levelBtn.high')}</button>
          <button class="bl-level-btn" data-level="full">${TH('blocker.levelBtn.full')}</button>
        </div>
        <div class="bl-level-desc" id="bl-level-desc">
          ${TH('blocker.desc.medium')}
        </div>
      </div>

      <!-- İstatistikler -->
      <div class="bl-section">
        <div class="bl-section-header"><span>${TH('blocker.stats')}</span></div>
        <div class="bl-stats-grid" id="blocker-stats-grid"></div>
      </div>

      <!-- Mevcut Sayfa -->
      <div class="bl-section">
        <div class="bl-section-header"><span>${TH('blocker.currentPage')}</span></div>
        <div class="bl-current-site">
          <span id="bl-current-domain" style="font-size:12px;color:var(--text-secondary)">—</span>
          <button class="bl-toggle-site" id="btn-toggle-site">
            ${TH('blocker.allow')}
          </button>
        </div>
      </div>

      <!-- İzin Verilen Siteler -->
      <div class="bl-section">
        <div class="bl-section-header">
          <span>${TH('blocker.allowedSites', { count: blockerWhitelist.length })}</span>
        </div>
        <div class="bl-add-row">
          <input type="text" id="bl-add-input" placeholder="${TH('common.exampleDomain')}" aria-label="${TH('blocker.addInputLabel')}" />
          <button class="bl-add-btn" id="btn-bl-add">${TH('blocker.add')}</button>
        </div>
        <div id="blocker-whitelist"></div>
      </div>

      <!-- En Çok Engellenenler -->
      <div class="bl-section">
        <div class="bl-section-header"><span>${TH('blocker.topBlocked')}</span></div>
        <div id="blocker-top-list"></div>
      </div>

    </div>
  `;
}

// ─── Panel Events ─────────────────────────────────────────────────────────────
function blockerInitPanelEvents() {
  // Seviye seçimi
  document.querySelectorAll('.bl-level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      blockerLevel = btn.dataset.level;
      blockerSave();
      window.ilgezdiSync?.schedulePush();
      blockerRenderStats();
      updateLevelDesc();
    });
  });

  // Mevcut sayfa toggle
  const url = document.getElementById('address-bar')?.value;
  if (url && !url.startsWith('about:')) {
    try {
      const domain = new URL(url).hostname;
      const domainEl = document.getElementById('bl-current-domain');
      if (domainEl) domainEl.textContent = domain;
      const toggleBtn = document.getElementById('btn-toggle-site');
      if (toggleBtn) {
        const isWhite = blockerIsWhitelisted(url);
        toggleBtn.textContent = isWhite ? T('blocker.block') : T('blocker.allow');
        toggleBtn.classList.toggle('danger', isWhite);
        toggleBtn.addEventListener('click', () => {
          blockerToggleCurrentSite();
          const nowWhite = blockerIsWhitelisted(document.getElementById('address-bar')?.value);
          toggleBtn.textContent = nowWhite ? T('blocker.block') : T('blocker.allow');
          toggleBtn.classList.toggle('danger', nowWhite);
          blockerRenderWhitelist();
        });
      }
    } catch {}
  }

  // Manuel site ekle
  document.getElementById('btn-bl-add')?.addEventListener('click', () => {
    const input = document.getElementById('bl-add-input');
    const val   = input?.value.trim();
    if (!val) return;
    blockerAddWhitelist(val);
    if (input) input.value = '';
    blockerRenderWhitelist();
    showBlockerToast(T('blocker.allowed', { domain: val }));
  });

  document.getElementById('bl-add-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-bl-add')?.click();
  });

  // Panel kapat
 document.querySelector('[data-panel="blocker"].panel-close')?.addEventListener('click', () => {
  window.ilgezdiCloseAllPanels?.();
});

  updateLevelDesc();
}

function updateLevelDesc() {
  const el = document.getElementById('bl-level-desc');
  if (el) el.textContent = T('blocker.desc.' + (['low', 'medium', 'high', 'full'].includes(blockerLevel) ? blockerLevel : 'medium'));
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function showBlockerToast(msg) {
  const t = document.createElement('div');
  t.className  = 'bl-toast';
  t.textContent = msg;
  (document.getElementById('app') || document.body).appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ─── Ana Init ─────────────────────────────────────────────────────────────────
function blockerOpenPanel() {
  blockerLoad();
  blockerInjectPanelHTML();
  blockerInitPanelEvents();
  blockerRenderStats();
  blockerRenderWhitelist();
  blockerRenderTopBlocked();
  // Canlı istatistikleri ana süreçten çek. Yalnızca olay akışına güvenmek,
  // panel açılışında her zaman 0 göstermeye yol açıyordu.
  window.secureBrowser?.blocker?.getStats?.().then((s) => {
    if (s) blockerUpdateStats(s);
  }).catch(() => {});
}

function blockerInit() {
  blockerLoad();
  // Kaydedilmiş seviye/beyaz listeyi açılışta ana sürece uygula — yoksa
  // engelleyici her açılışta kodda gömülü 'medium' ve boş listeyle başlıyordu.
  blockerPushToMain();

  const sb = window.secureBrowser;

  // Adres değişince site butonunu güncelle
  sb?.onActiveUrl?.((url) => {
    setTimeout(() => blockerCheckCurrentSite(), 100);
  });

  // Ana process'ten engelleme istatistikleri
  // preload bunu secureBrowser.blocker.onStats olarak açıyor. Eskiden
  // sb.onBlockStats deniyordu; öyle bir anahtar olmadığı için `?.` sessizce
  // kısa devre yapıyor ve istatistikler panele hiç ulaşmıyordu.
  sb?.blocker?.onStats?.((data) => blockerUpdateStats(data));

  // Panel butonu
  document.getElementById('btn-blocker')?.addEventListener('click', () => {
    const panel = document.getElementById('panel-blocker');
    if (!panel) return;

    if (panel.classList.contains('visible')) {
  window.ilgezdiCloseAllPanels?.();
} else {
  window.ilgezdiCloseAllPanels?.();
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  document.getElementById('btn-blocker')?.classList.add('active');
  sb?.panelOpened(true);
  blockerOpenPanel();
}
  });

  console.log('[İlgezdi] Faz 6 Engelleyici hazır');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', blockerInit);
} else {
  blockerInit();
}