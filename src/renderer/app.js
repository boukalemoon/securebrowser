/**
 * İlgezdi — Renderer (UI) Mantığı (Faz 4 güncel)
 */

'use strict';

const sb = window.secureBrowser;

// ─── State ────────────────────────────────────────────────────────────────────
let currentTabs   = [];
let currentConfig = {};

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
       + ' ' + formatTime(ts);
}

function truncateUrl(url, maxLen = 55) {
  return url.length > maxLen ? url.slice(0, maxLen) + '…' : url;
}

// ─── Panel Yönetimi (MERKEZİ) ─────────────────────────────────────────────────
const ALL_PANELS = ['settings', 'logs', 'bookmarks', 'blocker', 'shield', 'vpn'];

function closeAllPanels() {
  ALL_PANELS.forEach(name => {
    const panel = document.getElementById(`panel-${name}`);
    if (!panel) return;
    panel.classList.remove('visible');
    panel.classList.add('hidden');
  });
  document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
  sb.panelOpened(false);
}

function togglePanel(panelName, btnId, onOpen) {
  const panel = document.getElementById(`panel-${panelName}`);
  if (!panel) return;

  const isOpen = panel.classList.contains('visible');
  closeAllPanels();

  if (!isOpen) {
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
    if (btnId) document.getElementById(btnId)?.classList.add('active');
    sb.panelOpened(true);
    if (onOpen) onOpen();
  }
}

// Diğer JS dosyaları bu fonksiyonları kullanır
window.ilgezdiTogglePanel    = togglePanel;
window.ilgezdiCloseAllPanels = closeAllPanels;

// ─── VPN Göstergesi ───────────────────────────────────────────────────────────
function updateVpnIndicator(enabled) {
  const el  = document.getElementById('vpn-indicator');
  const lbl = document.getElementById('vpn-label');
  if (!el || !lbl) return;
  if (enabled) {
    el.className = 'vpn-on';
    lbl.textContent = 'VPN Aktif';
  } else {
    el.className = 'vpn-off';
    lbl.textContent = 'VPN Kapalı';
  }
}

// ─── Sekme Render ─────────────────────────────────────────────────────────────
function renderTabs(tabs) {
  currentTabs = tabs;
  const container = document.getElementById('tabs-container');
  if (!container) return;
  container.innerHTML = '';

  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.isActive ? ' active' : '');
    el.dataset.id = tab.id;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || 'Yeni Sekme';
    title.title = tab.url;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sb.closeTab(tab.id);
    });

    el.appendChild(title);
    el.appendChild(closeBtn);
    el.addEventListener('click', () => sb.switchTab(tab.id));
    container.appendChild(el);
  });
}

// ─── Adres Çubuğu ────────────────────────────────────────────────────────────
function updateAddressBar(url) {
  const bar = document.getElementById('address-bar');
  if (!bar) return;
  if (document.activeElement !== bar) bar.value = url || '';

  const icon = document.getElementById('security-icon');
  if (!icon) return;
  if (url && url.startsWith('https://')) {
    icon.textContent = '🔒'; icon.title = 'Güvenli bağlantı (HTTPS)';
  } else if (url && url.startsWith('http://')) {
    icon.textContent = '⚠️'; icon.title = 'Güvensiz bağlantı (HTTP)';
  } else {
    icon.textContent = '🌐'; icon.title = '';
  }
}

// ─── Koruma Durumu Paneli ─────────────────────────────────────────────────────
async function loadShield() {
  const cfg   = await sb.getConfig();
  const stats = await sb.getBlockedStats();

  const items = [
    { name: 'VPN Bağlantısı',       on: cfg.vpnEnabled },
    { name: 'Tracker Engelleme',    on: cfg.blockTrackers },
    { name: 'Reklam Engelleme',     on: cfg.blockAds },
    { name: 'Fingerprint Koruması', on: cfg.fingerprintProtection },
    { name: 'User-Agent Rotasyonu', on: cfg.userAgentRotation },
    { name: 'Ziyaret Logları',      on: cfg.logEnabled },
  ];
  const activeCount = items.filter(i => i.on).length;

  const el = document.getElementById('shield-stats');
  if (!el) return;

  el.innerHTML = `
    <div style="text-align:center;padding:16px 0 24px">
      <div style="font-size:48px;margin-bottom:8px">${activeCount >= 5 ? '🛡️' : activeCount >= 3 ? '⚠️' : '🔓'}</div>
      <div style="font-size:18px;font-weight:700;color:${activeCount >= 5 ? 'var(--success)' : activeCount >= 3 ? 'var(--warning)' : 'var(--danger)'}">
        ${activeCount}/${items.length} Koruma Aktif
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
        Bugün ${stats.today || 0} istek engellendi
      </div>
    </div>
    ${items.map(item => `
      <div class="shield-item">
        <span class="shield-name">${item.name}</span>
        <span class="shield-status ${item.on ? 'status-on' : 'status-off'}">
          ${item.on ? '✓ Aktif' : '✗ Kapalı'}
        </span>
      </div>
    `).join('')}
  `;
}

// ─── Event Listener'lar ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  currentConfig = await sb.getConfig();
  updateVpnIndicator(currentConfig.vpnEnabled);

  // Pencere kontrolleri
  document.getElementById('btn-minimize').addEventListener('click', () => sb.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => sb.maximize());
  document.getElementById('btn-close').addEventListener('click',    () => sb.close());

  // Yeni sekme
  document.getElementById('btn-new-tab').addEventListener('click', async () => {
    const cfg    = await sb.getConfig();
    const mode   = cfg.newTabMode || 'blank';
    const custom = cfg.customNewTabUrl || '';
    let url;
    if      (mode === 'dash')             url = 'about:blank';
    else if (mode === 'custom' && custom) url = custom;
    else                                  url = 'about:blank';
    sb.newTab(url);
  });

  // Sekme çubuğuna çift tıkla → yeni sekme
  document.getElementById('tabbar').addEventListener('dblclick', (e) => {
    if (e.target.closest('.tab') || e.target.closest('#btn-new-tab')) return;
    sb.newTab();
  });

  document.getElementById('btn-back').addEventListener('click',    () => sb.goBack());
  document.getElementById('btn-forward').addEventListener('click', () => sb.goForward());
  document.getElementById('btn-reload').addEventListener('click',  () => sb.reload());
  document.getElementById('btn-home').addEventListener('click',    () => {
    sb.navigate(currentConfig.homepage || 'https://duckduckgo.com');
  });

  // Adres çubuğu
  const addressBar = document.getElementById('address-bar');
  addressBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = addressBar.value.trim();
      if (val) sb.navigate(val);
    }
    if (e.key === 'Escape') addressBar.blur();
  });
  addressBar.addEventListener('focus', () => setTimeout(() => addressBar.select(), 50));
  document.getElementById('btn-search').addEventListener('click', () => {
    const val = addressBar.value.trim();
    if (val) sb.navigate(val);
  });

  // Shield paneli
  document.getElementById('btn-shield').addEventListener('click', () => {
    togglePanel('shield', 'btn-shield', () => loadShield());
  });

  // Panel kapat butonları — tüm paneller (event delegation)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.panel-close');
    if (!btn) return;
    closeAllPanels();
  });

  // Main process güncellemeleri
  sb.onTabsUpdate((tabs) => renderTabs(tabs));
  sb.onActiveUrl((url)   => updateAddressBar(url));
  sb.onVpnStatus?.((data) => updateVpnIndicator(data.connected));

  // Klavye kısayolları
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 't') { e.preventDefault(); sb.newTab(); }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      const active = currentTabs.find(t => t.isActive);
      if (active) sb.closeTab(active.id);
    }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); addressBar.focus(); }
    if (e.key === 'F5')             { e.preventDefault(); sb.reload(); }
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); sb.goBack(); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); sb.goForward(); }
    if (e.key === 'Escape') { closeAllPanels(); }
  });

  console.log('[İlgezdi] UI hazır');
});