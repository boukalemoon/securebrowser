/**
 * İlgezdi — Renderer (UI) Mantığı (Faz 5)
 */

'use strict';

const sb = window.secureBrowser;

// ─── Marka Logosu (Claude Design SVG BrandMark) ────────────────────────────────
// Şeffaf, tema-duyarlı vektör logo — beyaz arka planlı PNG'nin yerine.
function brandMarkSVG(size = 28, uid = 'm', glow = false) {
  const zig = Array.from({ length: 16 }).map((_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const x1 = 50 + Math.cos(a) * 41, y1 = 50 + Math.sin(a) * 41;
    const x2 = 50 + Math.cos(a) * 46, y2 = 50 + Math.sin(a) * 46;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#8aa6c8" stroke-width="0.8" opacity="0.7"/>`;
  }).join('');
  return `
<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display:block">
  <defs>
    <radialGradient id="globe-${uid}" cx="0.4" cy="0.35">
      <stop offset="0%" stop-color="#cfe2f5"/><stop offset="60%" stop-color="#7fa6c8"/><stop offset="100%" stop-color="#3a5a7a"/>
    </radialGradient>
    <linearGradient id="gold-${uid}" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f0c674"/><stop offset="100%" stop-color="#a8742a"/>
    </linearGradient>
    <linearGradient id="silver-${uid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#e8eef4"/><stop offset="100%" stop-color="#8a9eb3"/>
    </linearGradient>
    ${glow ? `<filter id="glow-${uid}"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
  </defs>
  <circle cx="50" cy="50" r="48" fill="#162840" stroke="#d4a85a" stroke-width="0.8"/>
  <circle cx="50" cy="50" r="44" fill="none" stroke="#8aa6c8" stroke-width="0.6" stroke-dasharray="2 3" opacity="0.6"/>
  ${zig}
  <circle cx="50" cy="50" r="26" fill="url(#globe-${uid})" stroke="#d4a85a" stroke-width="0.6"/>
  <ellipse cx="50" cy="50" rx="26" ry="10" fill="none" stroke="#3a5a7a" stroke-width="0.4" opacity="0.7"/>
  <ellipse cx="50" cy="50" rx="10" ry="26" fill="none" stroke="#3a5a7a" stroke-width="0.4" opacity="0.7"/>
  <line x1="24" y1="50" x2="76" y2="50" stroke="#3a5a7a" stroke-width="0.4" opacity="0.6"/>
  <line x1="50" y1="24" x2="50" y2="76" stroke="#3a5a7a" stroke-width="0.4" opacity="0.6"/>
  <g ${glow ? `filter="url(#glow-${uid})"` : ''}>
    <rect x="46" y="32" width="8" height="34" fill="url(#silver-${uid})" stroke="#3a5a7a" stroke-width="0.4"/>
    <polygon points="46,32 50,28 54,32" fill="url(#silver-${uid})" stroke="#3a5a7a" stroke-width="0.4"/>
    <polygon points="46,66 50,70 54,66" fill="url(#silver-${uid})" stroke="#3a5a7a" stroke-width="0.4"/>
  </g>
  <g ${glow ? `filter="url(#glow-${uid})"` : ''}>
    <polygon points="64,36 68,32 56,52 52,48" fill="url(#gold-${uid})" stroke="#a8742a" stroke-width="0.4"/>
    <polygon points="36,64 32,68 44,48 48,52" fill="#444" opacity="0.5"/>
  </g>
  <g fill="#8aa6c8" opacity="0.85">
    <path d="M38,82 q1.5,-3 4,-3 q1,-2 2,-1 q1,-2 2,-1 q0.5,1 0,2 q1,1 0,2 q1,1.5 -1,2 q-2,0.5 -3,0 q-2,0.5 -4,-1z"/>
    <path d="M55,82 q1.5,-3 4,-3 q1,-2 2,-1 q1,-2 2,-1 q0.5,1 0,2 q1,1 0,2 q1,1.5 -1,2 q-2,0.5 -3,0 q-2,0.5 -4,-1z"/>
  </g>
</svg>`;
}
window.brandMarkSVG = brandMarkSVG;

function injectBrandMarks() {
  const tb = document.getElementById('app-brand-mark');
  if (tb) tb.innerHTML = brandMarkSVG(28, 'tb');
  const au = document.getElementById('auth-brand-mark');
  if (au) au.innerHTML = brandMarkSVG(64, 'au', true);
}

// ─── State ────────────────────────────────────────────────────────────────────
let currentTabs   = [];
let currentConfig = {};
let currentScreen = null; // 'newtab' | 'bookmarks' | 'history' | 'downloads' | 'discover' | null

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function truncateUrl(url, maxLen = 80) {
  return url.length > maxLen ? url.slice(0, maxLen) + '…' : url;
}

// ─── Panel Yönetimi ────────────────────────────────────────────────────────────
const ALL_PANELS = ['settings', 'logs', 'bookmarks', 'blocker', 'shield', 'vpn', 'arku'];

function closeAllPanels() {
  ALL_PANELS.forEach(name => {
    const panel = document.getElementById(`panel-${name}`);
    if (!panel) return;
    panel.classList.remove('visible');
    panel.classList.add('hidden');
  });
  // Panel butonlarının aktif stilini kaldır (data-screen butonlarına dokunma)
  ['btn-shield', 'btn-bookmarks', 'btn-logs', 'btn-blocker', 'btn-settings', 'btn-arku'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  sb.panelOpened(false);
}

function togglePanel(panelName, btnEl, onOpen) {
  const panel = document.getElementById(`panel-${panelName}`);
  if (!panel) return;

  const isOpen = panel.classList.contains('visible');
  closeAllPanels();

  if (!isOpen) {
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
    btnEl?.classList.add('active');
    sb.panelOpened(true);
    if (onOpen) onOpen();
  }
}

// Diğer panel JS dosyaları bu fonksiyonlara ihtiyaç duyar
window.ilgezdiTogglePanel    = togglePanel;
window.ilgezdiCloseAllPanels = closeAllPanels;

// ─── Ekran (Screen Overlay) ────────────────────────────────────────────────────
async function showScreen(name, renderFn) {
  currentScreen = name;
  closeAllPanels();

  // Sidebar aktif butonu işaretle
  document.querySelectorAll('.sidebar-btn[data-screen]').forEach(b => b.classList.remove('active'));
  document.querySelector(`.sidebar-btn[data-screen="${name}"]`)?.classList.add('active');

  // BrowserView'ı gizle
  try { await sb.hideActiveTab?.(); } catch(_) {}

  const overlay = document.getElementById('screen-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const sc = document.getElementById('screen-content');
  if (sc && renderFn) sc.innerHTML = renderFn();
}

function hideScreen() {
  if (!currentScreen) return;
  currentScreen = null;

  const overlay = document.getElementById('screen-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 200);
  }

  // BrowserView'ı geri göster
  try { sb.showActiveTab?.(); } catch(_) {}

  // Sidebar'da home butonunu aktif yap
  document.querySelectorAll('.sidebar-btn[data-screen]').forEach(b => b.classList.remove('active'));
  document.querySelector('.sidebar-btn[data-screen="newtab"]')?.classList.add('active');
}

// ─── VPN Göstergesi ───────────────────────────────────────────────────────────
function updateVpnIndicator(enabled) {
  const el  = document.getElementById('vpn-indicator');
  const lbl = document.getElementById('vpn-label');
  if (!el || !lbl) return;
  el.className = enabled ? 'vpn-on' : 'vpn-off';
  lbl.textContent = enabled ? 'VPN Aktif' : 'VPN Kapalı';
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
    title.title = tab.url || '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sb.closeTab(tab.id);
    });

    el.appendChild(title);
    el.appendChild(closeBtn);
    el.addEventListener('click', () => {
      sb.switchTab(tab.id);
      if (currentScreen) hideScreen();
    });
    container.appendChild(el);
  });
}

// ─── Adres Çubuğu ────────────────────────────────────────────────────────────
function updateAddressBar(url) {
  const bar = document.getElementById('address-bar');
  if (bar && document.activeElement !== bar) bar.value = url || '';

  const icon = document.getElementById('security-icon');
  if (icon) {
    if (url?.startsWith('https://')) {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
      icon.title = 'Güvenli bağlantı (HTTPS)';
      icon.style.color = 'var(--gold)';
    } else if (url?.startsWith('http://')) {
      icon.innerHTML = '⚠️'; icon.title = 'Güvensiz bağlantı (HTTP)';
      icon.style.color = 'var(--warning)';
    } else {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
      icon.title = '';
      icon.style.color = 'var(--ink-mute)';
    }
  }

  const statusUrl = document.getElementById('status-url');
  if (statusUrl) statusUrl.textContent = url ? truncateUrl(url) : '';
}

// ─── Koruma Durumu ────────────────────────────────────────────────────────────
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

// ─── Yeni Sekme Sayfası ────────────────────────────────────────────────────────
const QUICK_LINKS = [
  { name: 'Atlas',  url: 'https://maps.google.com',        color: '#3a6db5', letter: 'A' },
  { name: 'Boy',    url: 'https://tr.wikipedia.org',        color: '#b85c3a', letter: 'B' },
  { name: 'Kurgan', url: 'https://github.com',              color: '#5a7a4a', letter: 'K' },
  { name: 'Otağ',  url: 'https://mail.google.com',         color: '#8a4a7a', letter: 'O' },
  { name: 'Tamga', url: 'https://duckduckgo.com',          color: '#c89540', letter: 'T' },
  { name: 'Yıldız',url: 'https://www.youtube.com',         color: '#4a5a8a', letter: 'Y' },
  { name: 'Damga', url: 'https://www.trthaber.com',        color: '#7a4a3a', letter: 'D' },
  { name: 'Arşiv', url: 'https://archive.org',             color: '#3a5a4a', letter: 'A' },
];

// Türk tarihi/kültürü haber havuzu — her yeni sekmede karıştırılıp döner.
const NEWS_POOL = [
  { cat: 'TARİH',  read: '8 dk', icon: '🗿', title: 'Orhun Yazıtları: Türk Tarihinin Mihenk Taşı', body: 'Bilge Kağan döneminde dikildiği düşünülen yazıtlar, Türkçenin bilinen en eski belgelerinden sayılmaktadır.' },
  { cat: 'KEŞİF',  read: '4 dk', icon: '⛏️', title: 'Sibirya Bozkırlarında Yeni Kurgan Bulundu', body: 'Arkeologlar, Altay eteklerinde bozulmadan korunmuş bir beylik mezarı gün yüzüne çıkardı.' },
  { cat: 'KÜLTÜR', read: '6 dk', icon: '🐎', title: 'Demir Devri Atlı Göçebe Sanatı', body: 'Hayvan üslubu motifleri, bozkır sanatının Avrasya boyunca yayılışını gösteriyor.' },
  { cat: 'DİL',    read: '5 dk', icon: '𐰚', title: 'Göktürkçe Alfabe ve 38 Harf', body: 'Runik yazının ses değerleri ve taş yazıtlardaki kullanımı üzerine kısa bir gezinti.' },
  { cat: 'EFSANE', read: '3 dk', icon: '🐺', title: 'Ergenekon Destanı: Kurttan Türeyiş', body: 'Demir dağı eriten bozkurt önderliğinde özgürlüğe çıkış anlatısı.' },
  { cat: 'TARİH',  read: '7 dk', icon: '🏹', title: 'Mete Han ve İlk Düzenli Ordu', body: 'Onlu sistemin bozkır savaş sanatına getirdiği devrim niteliğindeki düzen.' },
  { cat: 'KÜLTÜR', read: '5 dk', icon: '🎶', title: 'Bozkırın Sesi: Kopuz ve Ozanlar', body: 'Destanları kuşaktan kuşağa taşıyan ozan geleneği ve kopuzun yeri.' },
  { cat: 'BİLİM',  read: '6 dk', icon: '🌌', title: 'Türk Takvimi ve On İki Hayvanlı Sistem', body: 'Gökyüzü gözlemine dayanan yıl döngüsü ve sembolizmi.' },
  { cat: 'COĞRAFYA', read: '9 dk', icon: '🗺️', title: 'İpek Yolu Üzerinde Türk Boyları', body: 'Kervan yollarının kavşağında ticaret, göç ve kültür alışverişi.' },
  { cat: 'MİMARİ', read: '4 dk', icon: '🏛️', title: 'Otağ’dan Kervansaraya', body: 'Göçebe çadırından anıtsal taş yapılara uzanan mimari süreklilik.' },
  { cat: 'EFSANE', read: '3 dk', icon: '🦅', title: 'Umay Ana ve Bereket İnancı', body: 'Bozkır inanç dünyasında koruyucu dişil ruh Umay’ın izleri.' },
  { cat: 'KEŞİF',  read: '5 dk', icon: '💎', title: 'Pazırık Kurganları’nda Buzda Kalan Hazine', body: 'Donmuş toprak sayesinde bozulmadan gelen halı, eyer ve dövmeler.' },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderNewTab() {
  // Her render'da havuzu karıştır → 1 öne çıkan + 4 yan haber döner
  const picked = shuffle(NEWS_POOL).slice(0, 5).map((it, i) => ({ ...it, feature: i === 0 }));
  const shortcutsHtml = QUICK_LINKS.map(link => `
    <button class="shortcut" data-url="${link.url}" title="${link.name}">
      <span class="tile-mark" style="background:linear-gradient(135deg,${link.color},color-mix(in srgb,${link.color} 55%,#000));box-shadow:0 6px 14px -8px ${link.color}88">
        <span>${link.letter}</span>
      </span>
      <span class="label">${link.name}</span>
    </button>
  `).join('');

  const newsHtml = picked.map((item) => {
    if (item.feature) {
      return `
        <div class="news-card feature">
          <div class="feature-img"><span class="feature-emoji">${item.icon}</span></div>
          <div class="body-pad">
            <div class="meta"><span class="cat">${item.cat}</span><span>${item.read}</span></div>
            <h4>${item.title}</h4>
            ${item.body ? `<p>${item.body}</p>` : ''}
          </div>
        </div>`;
    }
    return `
      <div class="news-card">
        <div class="meta"><span class="cat">${item.icon} ${item.cat}</span><span>${item.read}</span></div>
        <h4>${item.title}</h4>
        ${item.body ? `<p>${item.body}</p>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="newtab fade-up">
      <div class="newtab-greet">
        <div class="runes-greet">𐰚𐰢 𐱅𐰉𐰍𐰢</div>
        <h2>İyi Yolculuklar, Gezgin</h2>
        <div class="sub">Bilgi yolu uzun, atın hazır.</div>
      </div>
      <form class="big-search" id="newtab-search-form">
        <div class="field">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="newtab-search-input"
                 placeholder="İlgezdi ile ara veya bir adres yaz…"
                 autocomplete="off" spellcheck="false" autofocus />
          <button class="search-go" type="submit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="runes-hint">𐰉𐰽𐱃 𐰚𐰢 𐱅𐰢𐰍 · ARA</div>
      </form>
      <div class="shortcuts">
        ${shortcutsHtml}
      </div>
      <div class="section-head">
        <div class="title-block">
          <span class="runes">𐱅𐰇𐰼𐰰</span>
          <h3>Keşfedilecekler</h3>
        </div>
      </div>
      <div class="news-grid">
        ${newsHtml}
      </div>
    </div>
  `;
}

function initNewTabEvents() {
  document.getElementById('newtab-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = document.getElementById('newtab-search-input')?.value.trim();
    if (val) { hideScreen(); sb.navigate(val); }
  });
  document.querySelectorAll('.shortcut[data-url]').forEach(btn => {
    btn.addEventListener('click', () => { hideScreen(); sb.navigate(btn.dataset.url); });
  });
}

// ─── DOMContentLoaded ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  currentConfig = await sb.getConfig();
  updateVpnIndicator(currentConfig.vpnEnabled);

  // Pencere kontrol stili (macOS / Windows)
  const wcStyle = currentConfig.windowControlStyle || 'windows';
  document.documentElement.dataset.wc = wcStyle;

  // macOS dot butonları
  document.getElementById('mac-btn-close')?.addEventListener('click',    () => sb.close());
  document.getElementById('mac-btn-minimize')?.addEventListener('click', () => sb.minimize());
  document.getElementById('mac-btn-maximize')?.addEventListener('click', () => sb.maximize());

  // Windows kontroller
  document.getElementById('btn-minimize')?.addEventListener('click', () => sb.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => sb.maximize());
  document.getElementById('btn-close')?.addEventListener('click',    () => sb.close());

  // Gizli mod
  const isIncognito = await sb.isIncognito();
  if (isIncognito) {
    document.documentElement.setAttribute('data-incognito', 'true');
    const brand = document.getElementById('app-brand');
    if (brand) {
      const badge = document.createElement('span');
      badge.id = 'incognito-badge';
      badge.textContent = '🕶 Gizli';
      brand.appendChild(badge);
    }
    document.title = 'İlgezdi — Gizli Pencere';
    document.getElementById('btn-bookmark-star')?.style.setProperty('display', 'none');
  }

  // Yeni sekme açma
  async function openNewTab() {
    const cfg = await sb.getConfig();
    const url = (cfg.newTabMode === 'custom' && cfg.customNewTabUrl)
      ? cfg.customNewTabUrl
      : 'about:blank';
    sb.newTab(url);
  }

  document.getElementById('btn-new-tab')?.addEventListener('click', openNewTab);

  // Tab strip çift tıklama → yeni sekme
  document.querySelector('.tab-strip')?.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tab') || e.target.closest('#btn-new-tab')) return;
    openNewTab();
  });

  // Navigasyon
  document.getElementById('btn-back')?.addEventListener('click',    () => sb.goBack());
  document.getElementById('btn-forward')?.addEventListener('click', () => sb.goForward());
  document.getElementById('btn-reload')?.addEventListener('click',  () => sb.reload());
  document.getElementById('btn-home')?.addEventListener('click', () => {
    const hp = (currentConfig.homepage || '').trim();
    if (hp && hp !== 'about:blank') sb.navigate(hp);
    else sb.newTab('about:blank'); // boş anasayfa → İlgezdi başlangıç sayfası
  });

  // Adres çubuğu
  const addressBar = document.getElementById('address-bar');
  addressBar?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = addressBar.value.trim();
      if (val) { hideScreen(); sb.navigate(val); }
    }
    if (e.key === 'Escape') addressBar.blur();
  });
  addressBar?.addEventListener('focus', () => setTimeout(() => addressBar.select(), 50));

  document.getElementById('address-bar-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = addressBar?.value.trim();
    if (val) { hideScreen(); sb.navigate(val); }
  });

  // Gizli pencere
  document.getElementById('btn-incognito')?.addEventListener('click', () => sb.openIncognito());

  // ── Kenar çubuğu — sayfa butonları (data-screen) ─────────────────────────
  document.querySelectorAll('.sidebar-btn[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      if (currentScreen === screen) {
        hideScreen();
        return;
      }
      if (screen === 'newtab') {
        showScreen('newtab', renderNewTab);
        requestAnimationFrame(initNewTabEvents);
      } else {
        const titles = {
          history:   'Geçmiş',
          bookmarks: 'Yer İşaretleri',
          downloads: 'İndirmeler',
          discover:  'Keşfet',
        };
        showScreen(screen, () => `
          <div class="page fade-up">
            <div class="page-head">
              <h1>${titles[screen] || screen}</h1>
            </div>
            <p style="color:var(--text-muted);padding:24px;font-size:14px">Yakında eklenecek…</p>
          </div>
        `);
      }
    });
  });

  // ── Koruma durumu paneli — app.js yönetir (panel JS dosyası yok) ──────────
  document.getElementById('btn-shield')?.addEventListener('click', function() {
    togglePanel('shield', this, loadShield);
  });

  // ── Panel kapat butonları (event delegation) ──────────────────────────────
  document.addEventListener('click', (e) => {
    if (e.target.closest('.panel-close')) closeAllPanels();
  });

  // ── Main process güncellemeleri ───────────────────────────────────────────
  sb.onTabsUpdate((tabs) => renderTabs(tabs));
  sb.onActiveUrl((url) => {
    updateAddressBar(url);
    // Boş sekme → İlgezdi yeni sekme sayfasını göster; gerçek URL → gizle
    const blank = !url || url === 'about:blank' || url === 'ilgezdi://newtab';
    if (blank) {
      if (currentScreen !== 'newtab') {
        showScreen('newtab', renderNewTab);
        requestAnimationFrame(initNewTabEvents);
      } else {
        // Zaten newtab ekranındayız ama main süreci setActiveTab ile boş
        // BrowserView'ı yeniden göstermiş olabilir → tekrar gizle (aksi halde
        // ~1sn sonra boş beyaz ekran overlay'in üstünü kapatıyor).
        sb.hideActiveTab?.();
      }
    } else if (currentScreen === 'newtab') {
      hideScreen();
    } else if (!currentScreen) {
      // Güvenlik ağı: gerçek sayfa + ekran overlay'i yok → view görünür olmalı.
      // (Auth ekranı gibi bir modal açıkken dokunma — o kapanırken kendisi
      // showActiveTab çağırır.) Sekme geçişinde takılı-gizli durumu kurtarır.
      const authVisible = document.getElementById('auth-screen')?.classList.contains('visible');
      if (!authVisible) sb.showActiveTab?.();
    }
  });
  sb.onVpnStatus?.((data) => updateVpnIndicator(data.connected));

  // ── Klavye kısayolları ────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 't') { e.preventDefault(); openNewTab(); }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      const active = currentTabs.find(t => t.isActive);
      if (active) sb.closeTab(active.id);
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
      e.preventDefault(); sb.openIncognito();
    }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); addressBar?.focus(); }
    if (e.key === 'F5')              { e.preventDefault(); sb.reload(); }
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); sb.goBack(); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); sb.goForward(); }
    if (e.key === 'Escape') {
      if (currentScreen) hideScreen();
      else closeAllPanels();
    }
  });

  // Marka logolarını enjekte et (toolbar + auth)
  injectBrandMarks();

  // İlk açılışta yeni sekme ekranını göster
  showScreen('newtab', renderNewTab);
  requestAnimationFrame(initNewTabEvents);

  console.log('[İlgezdi] UI hazır');
});
