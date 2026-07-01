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
}

// ─── Whitelist CRUD ───────────────────────────────────────────────────────────
function blockerAddWhitelist(domain) {
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!domain || blockerWhitelist.includes(domain)) return;
  blockerWhitelist.push(domain);
  blockerSave();
  window.secureBrowser?.saveConfig({ whitelist: blockerWhitelist, blockLevel: blockerLevel });
}

function blockerRemoveWhitelist(domain) {
  blockerWhitelist = blockerWhitelist.filter(d => d !== domain);
  blockerSave();
  window.secureBrowser?.saveConfig({ whitelist: blockerWhitelist, blockLevel: blockerLevel });
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
      showBlockerToast('Engelleme yeniden aktif: ' + domain);
    } else {
      blockerAddWhitelist(domain);
      blockerUpdateSiteBtn(true);
      showBlockerToast('İzin verildi: ' + domain);
    }
    if (document.getElementById('panel-blocker')?.classList.contains('visible')) {
      blockerRenderWhitelist();
    }
  } catch {}
}

function blockerUpdateSiteBtn(isWhitelisted) {
  const btn = document.getElementById('btn-blocker-site');
  if (!btn) return;
  btn.title = isWhitelisted ? 'Bu site için engellemeyi aç' : 'Bu siteye izin ver';
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
  const levelLabels = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', full: 'Tam' };
  const levelColors = { low: 'var(--warning)', medium: 'var(--accent)', high: 'var(--success)', full: '#ff6b6b' };

  el.innerHTML = `
    <div class="bl-stat-card accent">
      <div class="bl-stat-value">${blockerStats.today || 0}</div>
      <div class="bl-stat-label">Bugün Engellendi</div>
    </div>
    <div class="bl-stat-card">
      <div class="bl-stat-value">${blockerStats.total || 0}</div>
      <div class="bl-stat-label">Toplam</div>
    </div>
    <div class="bl-stat-card">
      <div class="bl-stat-value">${blockerStats.ads || 0}</div>
      <div class="bl-stat-label">Reklam</div>
    </div>
    <div class="bl-stat-card">
      <div class="bl-stat-value">${blockerStats.trackers || 0}</div>
      <div class="bl-stat-label">Tracker</div>
    </div>
  `;

  // Seviye göstergesi
  const levelEl = document.getElementById('blocker-level-display');
  if (levelEl) {
    levelEl.textContent = levelLabels[level] || 'Orta';
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

  if (blockerWhitelist.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px">
      Tüm siteler engelleniyor
    </p>`;
    return;
  }

  el.innerHTML = blockerWhitelist.map(domain => `
    <div class="bl-white-item">
      <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=14" 
           width="14" height="14" onerror="this.style.display='none'">
      <span class="bl-white-domain">${domain}</span>
      <button class="bl-white-remove" data-domain="${domain}">✕</button>
    </div>
  `).join('');

  el.querySelectorAll('.bl-white-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      blockerRemoveWhitelist(btn.dataset.domain);
      blockerRenderWhitelist();
      showBlockerToast('Engelleme yeniden aktif: ' + btn.dataset.domain);
    });
  });
}

function blockerRenderTopBlocked() {
  const el = document.getElementById('blocker-top-list');
  if (!el) return;

  const entries = Object.entries(blockerStats.byDomain || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (entries.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:12px">
      Henüz engellenen yok
    </p>`;
    return;
  }

  const max = entries[0]?.[1] || 1;
  el.innerHTML = entries.map(([domain, count]) => `
    <div class="bl-top-item">
      <div class="bl-top-info">
        <span class="bl-top-domain">${domain}</span>
        <span class="bl-top-count">${count}</span>
      </div>
      <div class="bl-top-bar">
        <div class="bl-top-fill" style="width:${Math.round(count/max*100)}%"></div>
      </div>
    </div>
  `).join('');
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────
function blockerInjectPanelHTML() {
  const panel = document.getElementById('panel-blocker');
  if (!panel) return;

  panel.innerHTML = `
    <div class="panel-header">
      <h2>🛡 Engelleyici</h2>
      <button class="panel-close" data-panel="blocker">✕</button>
    </div>

    <div class="bl-content">

      <!-- Engelleme Seviyesi -->
      <div class="bl-section">
        <div class="bl-section-header">
          <span>Engelleme Seviyesi</span>
          <span id="blocker-level-display" style="font-weight:700">Orta</span>
        </div>
        <div class="bl-level-grid">
          <button class="bl-level-btn" data-level="low">🟡 Düşük</button>
          <button class="bl-level-btn active" data-level="medium">🔵 Orta</button>
          <button class="bl-level-btn" data-level="high">🟢 Yüksek</button>
          <button class="bl-level-btn" data-level="full">🔴 Tam</button>
        </div>
        <div class="bl-level-desc" id="bl-level-desc">
          Reklamlar ve izleyiciler engellenir. Çoğu site düzgün çalışır.
        </div>
      </div>

      <!-- İstatistikler -->
      <div class="bl-section">
        <div class="bl-section-header"><span>İstatistikler</span></div>
        <div class="bl-stats-grid" id="blocker-stats-grid"></div>
      </div>

      <!-- Mevcut Sayfa -->
      <div class="bl-section">
        <div class="bl-section-header"><span>Mevcut Sayfa</span></div>
        <div class="bl-current-site">
          <span id="bl-current-domain" style="font-size:12px;color:var(--text-secondary)">—</span>
          <button class="bl-toggle-site" id="btn-toggle-site">
            İzin Ver
          </button>
        </div>
      </div>

      <!-- İzin Verilen Siteler -->
      <div class="bl-section">
        <div class="bl-section-header">
          <span>İzin Verilen Siteler (${blockerWhitelist.length})</span>
        </div>
        <div class="bl-add-row">
          <input type="text" id="bl-add-input" placeholder="ornek.com" />
          <button class="bl-add-btn" id="btn-bl-add">Ekle</button>
        </div>
        <div id="blocker-whitelist"></div>
      </div>

      <!-- En Çok Engellenenler -->
      <div class="bl-section">
        <div class="bl-section-header"><span>En Çok Engellenenler</span></div>
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
      window.secureBrowser?.saveConfig({ blockLevel: blockerLevel, whitelist: blockerWhitelist });
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
        toggleBtn.textContent = isWhite ? '🚫 Engelle' : '✅ İzin Ver';
        toggleBtn.classList.toggle('danger', isWhite);
        toggleBtn.addEventListener('click', () => {
          blockerToggleCurrentSite();
          const nowWhite = blockerIsWhitelisted(document.getElementById('address-bar')?.value);
          toggleBtn.textContent = nowWhite ? '🚫 Engelle' : '✅ İzin Ver';
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
    showBlockerToast('İzin verildi: ' + val);
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
  const descs = {
    low:    '🟡 Yalnızca büyük reklam ağları engellenir. Siteler tam çalışır.',
    medium: '🔵 Reklamlar ve izleyiciler engellenir. Çoğu site düzgün çalışır.',
    high:   '🟢 Agresif engelleme. Bazı siteler bozulabilir.',
    full:   '🔴 Tüm üçüncü taraf içerik engellenir. Yalnızca birinci taraf yüklenir.',
  };
  const el = document.getElementById('bl-level-desc');
  if (el) el.textContent = descs[blockerLevel] || descs.medium;
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
}

function blockerInit() {
  blockerLoad();

  const sb = window.secureBrowser;

  // Adres değişince site butonunu güncelle
  sb?.onActiveUrl?.((url) => {
    setTimeout(() => blockerCheckCurrentSite(), 100);
  });

  // Ana process'ten engelleme istatistikleri
  sb?.onBlockStats?.((data) => blockerUpdateStats(data));

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