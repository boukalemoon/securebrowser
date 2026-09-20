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
  // Auth / QR ekranı: SVG yaklaşımı yerine gerçek İlgezdi logosu (dairesel amblem).
  if (au) au.innerHTML =
    '<img src="assets/logo-mark.png" alt="İlgezdi" ' +
    'style="width:64px;height:64px;object-fit:contain;border-radius:50%;display:block;' +
    'box-shadow:0 4px 18px rgba(0,0,0,0.45);"/>';
}

// ─── State ────────────────────────────────────────────────────────────────────
let currentTabs   = [];
let currentConfig = {};
let currentScreen = null; // 'newtab' | 'bookmarks' | 'history' | 'downloads' | 'discover' | null

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
function formatDate(ts) {
  const I = window.ilgezdiI18n;
  return I.formatDate(ts, { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + I.formatTime(ts, { hour: '2-digit', minute: '2-digit' });
}

function truncateUrl(url, maxLen = 80) {
  return url.length > maxLen ? url.slice(0, maxLen) + '…' : url;
}

// ─── Panel Yönetimi ────────────────────────────────────────────────────────────
const ALL_PANELS = ['settings', 'logs', 'bookmarks', 'blocker', 'shield', 'vpn', 'arku', 'ulgen', 'siteinfo', 'webpanel', 'profiles', 'notes', 'page'];

function closeAllPanels() {
  ALL_PANELS.forEach(name => {
    const panel = document.getElementById(`panel-${name}`);
    if (!panel) return;
    panel.classList.remove('visible');
    panel.classList.add('hidden');
    // Sayfa paneli kapanınca içeriği bırakılmaz: aynı sayfa tam sayfada açılırsa
    // kimlikler çakışır ve arayüz gizli kopyayı bulur.
    if (name === 'page') { panel.replaceChildren(); panel.dataset.page = ''; }
  });
  // Panel butonlarının aktif stilini kaldır (data-screen butonlarına dokunma)
  ['btn-shield', 'btn-bookmarks', 'btn-logs', 'btn-blocker', 'btn-settings', 'btn-arku', 'btn-ulgen', 'security-icon', 'btn-webpanel-add', 'btn-profile', 'btn-notes', 'btn-vpn-panel'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  document.querySelectorAll('.webpanel-btn.active').forEach((b) => b.classList.remove('active'));
  // Sayfa paneli kapanınca kenar çubuğundaki işaret de kalkar; tam sayfa açıksa
  // işareti showScreen kendi koyar (bu sırada currentScreen doludur).
  if (!currentScreen) {
    document.querySelectorAll('.sidebar-btn[data-screen]').forEach((b) => b.classList.toggle('active', b.dataset.screen === 'newtab'));
  }
  // Ayarlar kapanınca kasa kilidi yeniden devreye girer: panel açıkken bir kez
  // doğrulayan kişi paneli kapatıp gidince şifreler yeniden korumasız kalmasın.
  sb.passwords?.gate?.lock?.().catch?.(() => {});
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

// ─── Sayfa panelleri ──────────────────────────────────────────────────────────
// Kenar çubuğundaki her düğme aynı yerde açılır: sağdaki panel (Burak'ın kararı,
// 20 Eyl 2026 — "bazıları sağda küçük, bazıları komple büyük menü açıyor"). Uzun
// listeler için panel başlığındaki "Tam sayfa aç" aynı içeriği eski geniş
// görünümde açar; çizim ve olay bağlama işini iki görünüm de paylaşır.
const PAGE_PANELS = {
  history:   { title: 'ui.history',    render: () => renderHistoryPage(),    init: initHistoryPage },
  downloads: { title: 'ui.downloads',  render: () => renderDownloadsPage(),  init: initDownloadsPage },
  discover:  { title: 'ui.discover',   render: () => renderDiscoverPage(),   init: initDiscoverPage },
  data:      { title: 'ui.dataCenter', render: () => window.ilgezdiDataCenter?.render() || '', init: () => window.ilgezdiDataCenter?.init() },
  feedback:  { title: 'ui.feedback',   render: () => renderFeedbackPage(),   init: initFeedbackPage },
};

// Bir sayfa hem panelde hem tam sayfada açılabildiği için "şu an açık olan sayfa" iki yerden
// gelebilir. Canlı güncellemeler (indirme ilerlemesi, giriş sonrası tazeleme) bunu sorar.
function acikSayfa() {
  if (currentScreen) return currentScreen;
  const panel = document.getElementById('panel-page');
  return panel && panel.classList.contains('visible') ? (panel.dataset.page || null) : null;
}

const FULL_PAGE_ICON ='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M21 3l-8 8"/><path d="M9 21H3v-6"/><path d="M3 21l8-8"/></svg>';

function openPagePanel(name) {
  const def = PAGE_PANELS[name];
  const panel = document.getElementById('panel-page');
  if (!def || !panel) return;
  const zatenAcik = panel.classList.contains('visible') && panel.dataset.page === name;
  // Tam sayfa açılmış bir sayfa varsa kapanır (aynı içerik iki yerde çizilirse kimlikler
  // çakışır ve getElementById gizli kopyayı bulur). Yeni sekme, okuma modu gibi ekranlar
  // yerinde kalır: panel onların üstünde açılır, kullanıcı bağlamını kaybetmez.
  if (currentScreen && PAGE_PANELS[currentScreen]) {
    hideScreen();
    document.getElementById('screen-content')?.replaceChildren();
  }
  closeAllPanels();
  if (zatenAcik) return;                       // aynı düğmeye ikinci basış kapatır
  panel.dataset.page = name;
  panel.innerHTML = `
    <div class="panel-header">
      <h2>${TH(def.title)}</h2>
      <div class="page-panel-actions">
        <button class="page-panel-full" id="page-panel-full" title="${TH('ui.openFullPage')}" aria-label="${TH('ui.openFullPage')}">${FULL_PAGE_ICON}</button>
        <button class="panel-close" data-panel="page" aria-label="${TH('common.closePanel')}">✕</button>
      </div>
    </div>
    <div class="panel-body page-panel-body" id="page-panel-body"></div>`;
  document.getElementById('page-panel-body').innerHTML = def.render();
  document.getElementById('page-panel-full').addEventListener('click', () => {
    closeAllPanels();                      // panelin kopyası kalmasın (kimlik çakışması)
    showScreen(name, def.render).then(() => def.init && def.init());
  });
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  document.querySelectorAll('.sidebar-btn[data-screen]').forEach((b) => b.classList.remove('active'));
  document.querySelector(`.sidebar-btn[data-screen="${name}"]`)?.classList.add('active');
  sb.panelOpened(true);
  if (def.init) def.init();
}

// ─── Ekran (Screen Overlay) ────────────────────────────────────────────────────
async function showScreen(name, renderFn) {
  currentScreen = name;
  closeAllPanels();
  document.getElementById('btn-reader')?.classList.toggle('active', name === 'reader');

  // Sidebar aktif butonu işaretle
  document.querySelectorAll('.sidebar-btn[data-screen]').forEach(b => b.classList.remove('active'));
  document.querySelector(`.sidebar-btn[data-screen="${name}"]`)?.classList.add('active');

  // WebContentsView'ı gizle
  try { await sb.hideActiveTab?.(); } catch(_) {}

  const overlay = document.getElementById('screen-overlay');
  if (!overlay) return;
  // Az önce kapanan ekranın bekleyen "gizle" zamanlayıcısı yeni açılan ekranı gizlemesin.
  clearTimeout(screenHideTimer);
  screenHideTimer = null;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const sc = document.getElementById('screen-content');
  if (sc && renderFn) sc.innerHTML = renderFn();
}

// Giriş ekranı açık mı? 'visible' sınıfı bir kare sonra eklendiği için 'hidden'
// sınıfına bakılır; açılış animasyonu sırasında da açık sayılır.
function isAuthScreenOpen() {
  const el = document.getElementById('auth-screen');
  return !!el && !el.classList.contains('hidden');
}

// Kapanış animasyonu (200 ms) bitince katmana 'hidden' eklenir. Bu arada yeni bir ekran
// açılırsa (ör. sayfadan çıkıp hemen yeni sekme) zamanlayıcı iptal edilir; eskiden katman
// "visible hidden" kalıyor, yeni sekme boş ekran olarak görünüyordu (gerçek girdiyle görüldü).
let screenHideTimer = null;

function hideScreen() {
  if (!currentScreen) return;
  currentScreen = null;
  document.getElementById('btn-reader')?.classList.remove('active');

  const overlay = document.getElementById('screen-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    clearTimeout(screenHideTimer);
    screenHideTimer = setTimeout(() => {
      screenHideTimer = null;
      if (!currentScreen) {
        overlay.classList.add('hidden');
        // Kapanma animasyonu bitti: içerik bırakılmaz, yoksa aynı sayfa panelde
        // açılınca kimlikler çakışır (getElementById gizli kopyayı bulur).
        document.getElementById('screen-content')?.replaceChildren();
      }
    }, 200);
  }

  // WebContentsView'ı geri göster. Giriş ekranı açıksa gösterme: sayfa görünümü
  // DOM'un üstünde çizildiği için giriş penceresini örtüyor, arayüzün geri kalanı
  // karartılmış kalıyordu (kullanıcı ekran görüntüsüyle bildirdi).
  if (!isAuthScreenOpen()) { try { sb.showActiveTab?.(); } catch(_) {} }

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
  lbl.textContent = enabled ? T('ui.vpnOn') : T('ui.vpnOff');
}

// ─── Sekme Render ─────────────────────────────────────────────────────────────
const TAB_SVG_SPEAKER = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const TAB_SVG_MUTED   = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/></svg>';

// Yenile düğmesi etkin sekme yüklenirken "Durdur"a dönüşür (Chrome/Edge gibi).
const RELOAD_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>';
const STOP_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
let reloadIsStop = false;
function updateReloadButton(activeTab) {
  const btn = document.getElementById('btn-reload');
  const loading = !!(activeTab && activeTab.loading);
  if (!btn || loading === reloadIsStop) return;
  reloadIsStop = loading;
  btn.innerHTML = loading ? STOP_SVG : RELOAD_SVG;
  btn.title = loading ? T('ui.stopLoading') : T('ui.reload');
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('is-loading', loading);
}

function renderTabs(tabs) {
  currentTabs = tabs;
  if (currentScreen === 'tabs') renderTabsList();
  updateReloadButton(tabs.find((t) => t.isActive));
  const container = document.getElementById('tabs-container');
  if (!container) return;
  // Klavye odağı bir sekmedeyse yeniden çizimden sonra aynı sekmeye geri verilir.
  const focusedId = document.activeElement?.closest?.('.tab')?.dataset.id;
  const renamingFocused = !!groupRenameInput && document.activeElement === groupRenameInput;
  container.innerHTML = '';

  let prevGroup = null;
  tabs.forEach(tab => {
    // Grup başlığı grubun ilk sekmesinden önce; daraltılmış grubun sekmeleri çizilmez.
    const g = tab.group;
    if (g && g.id !== prevGroup) {
      if (groupRenameInput && groupRenameInput.dataset.groupId === g.id) container.appendChild(groupRenameInput);
      else container.appendChild(buildGroupChip(g, tabs.filter((t) => t.group && t.group.id === g.id).length));
    }
    prevGroup = g ? g.id : null;
    if (g && g.collapsed && !tab.isActive) return;
    const label = tab.title || tab.url || T('tab.new');
    const el = document.createElement('div');
    el.className = 'tab' + (tab.isActive ? ' active' : '') + (tab.pinned ? ' pinned' : '') + (tab.sleeping ? ' sleeping' : '') + (g ? ' in-group' : '');
    if (g) el.style.setProperty('--group-color', g.hex);
    el.dataset.id = tab.id;
    el.draggable = true;
    // Sabitlenmiş sekme yalnızca alan adının baş harfini gösterir; adı ekran okuyucu için etikette.
    let initial = '•';
    try { initial = (new URL(tab.url).hostname.replace(/^www\./, '')[0] || '•').toLocaleUpperCase('tr'); } catch {}
    el.dataset.initial = initial;
    if (tab.pinned) el.setAttribute('aria-label', T('tab.pinnedLabel', { title: label }));
    // Erişilebilirlik: sekme şeridi bir tablist. Yalnızca etkin sekme Tab ile
    // odak alır; diğerlerine ok tuşlarıyla geçilir, Enter/Boşluk ile açılır.
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', tab.isActive ? 'true' : 'false');
    el.tabIndex = tab.isActive ? 0 : -1;

    // Sekme simgesi: yüklenirken dönen halka, yüklendiyse site simgesi (ana süreçten
    // data: URL olarak gelir), yoksa alan adının baş harfi.
    const icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.setAttribute('aria-hidden', 'true');
    if (tab.loading) {
      const spin = document.createElement('span');
      spin.className = 'tab-spinner';
      icon.appendChild(spin);
      el.setAttribute('aria-busy', 'true');
    } else if (tab.favicon && /^data:image\//.test(tab.favicon)) {
      const img = document.createElement('img');
      img.src = tab.favicon;
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => { icon.replaceChildren(); icon.textContent = initial; icon.classList.add('tab-initial'); });
      icon.appendChild(img);
    } else {
      icon.textContent = initial;
      icon.classList.add('tab-initial');
    }
    el.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = label;
    title.title = tab.url || '';
    // Daraltılmış dikey sekmelerde yalnızca simge görünür: ad ipucunda.
    el.title = label;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.tabIndex = -1;                                   // klavyede Ctrl+W
    closeBtn.setAttribute('aria-label', T('tab.closeLabel', { title: label }));
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sb.closeTab(tab.id);
    });

    // Ekranı bölmedeki sekme: küçük iki sütun işareti.
    if (tab.split) {
      el.classList.add('in-split');
      const mark = document.createElement('span');
      mark.className = 'tab-split-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>';
      el.appendChild(mark);
    }
    el.appendChild(title);
    if (tab.audible || tab.muted) {
      const audio = document.createElement('button');
      audio.className = 'tab-audio' + (tab.muted ? ' muted' : '');
      audio.tabIndex = -1;
      audio.title = tab.muted ? T('tab.unmute') : T('tab.mute');
      audio.setAttribute('aria-label', T(tab.muted ? 'tab.unmuteLabel' : 'tab.muteLabel', { title: label }));
      audio.innerHTML = tab.muted ? TAB_SVG_MUTED : TAB_SVG_SPEAKER;
      audio.addEventListener('click', (e) => {
        e.stopPropagation();
        sb.tabs?.action(tab.id, 'toggle-mute');
      });
      el.appendChild(audio);
    }
    el.appendChild(closeBtn);
    el.addEventListener('click', () => {
      sb.switchTab(tab.id);
      if (currentScreen) hideScreen();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        sb.tabs?.contextMenu(tab.id);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      } else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const all = [...container.querySelectorAll('.tab')];
        const i = all.indexOf(el);
        const next = e.key === 'ArrowRight' || e.key === 'ArrowDown';
        const target = e.key === 'Home' ? all[0]
          : e.key === 'End' ? all[all.length - 1]
          : all[(i + (next ? 1 : -1) + all.length) % all.length];
        target?.focus();
      }
    });
    // Sağ tık: sekme menüsü (ana süreçte yerel menü). Orta tık: kapat.
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      sb.tabs?.contextMenu(tab.id);
    });
    el.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      sb.closeTab(tab.id);
    });
    // Sürükle-bırak ile sıralama (sabitlenmiş sekmeler kendi grubunda kalır).
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/ilgezdi-tab', String(tab.id));
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('text/ilgezdi-tab')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('drop', (e) => {
      const fromId = Number(e.dataTransfer.getData('text/ilgezdi-tab'));
      if (!fromId || fromId === tab.id) return;
      e.preventDefault();
      sb.tabs?.action(fromId, 'move', tabs.findIndex((t) => t.id === tab.id));
    });
    container.appendChild(el);
    if (focusedId && String(tab.id) === focusedId) el.focus();
  });
  if (renamingFocused && groupRenameInput?.isConnected) groupRenameInput.focus();
  if (pendingGroupRename && container.querySelector(`.tab-group-chip[data-group-id="${CSS.escape(pendingGroupRename)}"]`)) {
    const id = pendingGroupRename;
    pendingGroupRename = null;
    startGroupRename(id);
  }
}

// ─── Sekme grupları: başlık (renkli), daralt/aç, menü, ad ────────────────────
let groupRenameInput = null;     // ad yazılırken şerit yeniden çizilse de kutu korunur
let pendingGroupRename = null;   // yeni grup: başlık çizilince ad kutusu açılır

function groupDisplayName(g) {
  return g.title || T('tabGroup.untitled', { color: T('tabGroup.color.' + g.color) });
}

function buildGroupChip(g, count) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tab-group-chip' + (g.collapsed ? ' collapsed' : '') + (g.title ? '' : ' untitled');
  chip.dataset.groupId = g.id;
  chip.dataset.title = g.title || '';
  chip.style.setProperty('--group-color', g.hex);
  chip.tabIndex = -1;
  const label = T('tabGroup.chipLabel', { name: groupDisplayName(g), count });
  chip.title = label;
  chip.setAttribute('aria-label', label);
  chip.setAttribute('aria-expanded', g.collapsed ? 'false' : 'true');
  if (g.title) {
    const name = document.createElement('span');
    name.className = 'tab-group-name';
    name.textContent = g.title;
    chip.appendChild(name);
  }
  if (g.collapsed) {
    const n = document.createElement('span');
    n.className = 'tab-group-count';
    n.textContent = String(count);
    chip.appendChild(n);
  }
  chip.addEventListener('click', () => sb.tabGroups?.action(g.id, 'toggle-collapse'));
  chip.addEventListener('contextmenu', (e) => { e.preventDefault(); sb.tabGroups?.menu(g.id); });
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'F2') { e.preventDefault(); startGroupRename(g.id); }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); sb.tabGroups?.menu(g.id); }
  });
  // Sekmeyi başlığın üstüne bırakmak onu gruba ekler.
  chip.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('text/ilgezdi-tab')) return;
    e.preventDefault();
    chip.classList.add('drop');
  });
  chip.addEventListener('dragleave', () => chip.classList.remove('drop'));
  chip.addEventListener('drop', (e) => {
    chip.classList.remove('drop');
    const id = Number(e.dataTransfer.getData('text/ilgezdi-tab'));
    if (!id) return;
    e.preventDefault();
    sb.tabs?.addToGroup(id, g.id);
  });
  return chip;
}

function startGroupRename(groupId) {
  const chip = document.querySelector(`.tab-group-chip[data-group-id="${CSS.escape(groupId)}"]`);
  if (!chip) { pendingGroupRename = groupId; return; }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-group-input';
  input.maxLength = 60;
  input.value = chip.dataset.title || '';
  input.placeholder = T('tabGroup.namePlaceholder');
  input.setAttribute('aria-label', T('tabGroup.namePlaceholder'));
  input.dataset.groupId = groupId;
  input.style.setProperty('--group-color', chip.style.getPropertyValue('--group-color'));
  input.spellcheck = false;
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    groupRenameInput = null;
    if (save) sb.tabGroups?.action(groupId, 'rename', input.value);
    else renderTabs(currentTabs);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  // Şerit yeniden çizilirken kutu bir an DOM'dan çıkar; o sırada gelen blur kaydetmesin.
  input.addEventListener('blur', () => { if (input.isConnected) finish(true); });
  input.addEventListener('dragstart', (e) => e.preventDefault());
  groupRenameInput = input;
  chip.replaceWith(input);
  input.focus();
  input.select();
}

// ─── Sekme konumu: üstte ya da yanda ─────────────────────────────────────────
// Dikey sekmelerde sekme listesi ve sekme düğmeleri (yeni sekme, sekmelerde ara, konum)
// kenar çubuğunun yanındaki sütuna taşınır; aynı öğeler taşındığı için olaylar korunur.
// Sayfa görünümü arayüzün üstünde çizildiği için içerik alanının yeni sol kenarı ana
// sürece bildirilir (ui-layout).
function reportContentLeft() {
  requestAnimationFrame(() => {
    const area = document.getElementById('content-area');
    if (area) sb.setLayout?.({ left: Math.round(area.getBoundingClientRect().left) });
  });
}

function applyTabLayout(cfg) {
  const vertical = !!cfg && cfg.verticalTabs === true;
  const collapsed = vertical && cfg.verticalTabsCollapsed === true;
  document.body.classList.toggle('vertical-tabs', vertical);
  document.body.classList.toggle('vtabs-collapsed', collapsed);
  const strip = document.querySelector('.tab-strip');
  const column = document.getElementById('vtabs');
  const tabs = document.getElementById('tabs-container');
  const buttons = ['btn-new-tab', 'btn-tab-search', 'btn-tab-layout'].map((id) => document.getElementById(id)).filter(Boolean);
  if (strip && column && tabs) {
    column.hidden = !vertical;
    if (vertical) {
      document.getElementById('vtabs-head')?.append(...buttons);
      document.getElementById('vtabs-list')?.append(tabs);
    } else {
      strip.append(tabs, ...buttons);
    }
    tabs.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  }
  const layoutBtn = document.getElementById('btn-tab-layout');
  if (layoutBtn) {
    const label = T(vertical ? 'ui.tabsToTop' : 'ui.tabsToSide');
    layoutBtn.title = label;
    layoutBtn.setAttribute('aria-label', label);
  }
  const collapseBtn = document.getElementById('btn-vtabs-collapse');
  if (collapseBtn) {
    const label = T(collapsed ? 'ui.vtabsExpand' : 'ui.vtabsCollapse');
    collapseBtn.title = label;
    collapseBtn.setAttribute('aria-label', label);
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
  reportContentLeft();
}

// ─── Adres Çubuğu ────────────────────────────────────────────────────────────
function updateAddressBar(url) {
  const bar = document.getElementById('address-bar');
  if (bar && document.activeElement !== bar) bar.value = url || '';

  const icon = document.getElementById('security-icon');
  if (icon) {
    if (url?.startsWith('https://')) {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
      icon.title = T('ui.siteInfoSecure');
      icon.style.color = 'var(--gold)';
    } else if (url?.startsWith('http://')) {
      icon.innerHTML = '⚠️'; icon.title = T('ui.siteInfoInsecure');
      icon.style.color = 'var(--warning)';
    } else {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
      icon.title = T('ui.siteInfo');
      icon.style.color = 'var(--ink-mute)';
    }
  }

  const statusUrl = document.getElementById('status-url');
  if (statusUrl) statusUrl.textContent = url ? truncateUrl(url) : '';
  const readerBtn = document.getElementById('btn-reader');
  if (readerBtn) readerBtn.hidden = !/^https?:\/\//i.test(url || '');
}

// ─── Koruma Durumu ────────────────────────────────────────────────────────────
// ─── Site Bilgisi (kilit simgesi) ─────────────────────────────────────────────
// Bağlantı ve sertifika, bu sitenin izinleri, engellenen açılır pencereler,
// yakınlaştırma ve site verisini silme. Kararlar ana süreçte doğrulanır.
const SITE_DECISION_OPTIONS = {
  ask:     [['ask', 'siteInfo.decision.askDefault'], ['allow', 'siteInfo.decision.allow'], ['block', 'siteInfo.decision.block']],
  popups:  [['default', 'siteInfo.decision.popupsDefault'], ['allow', 'siteInfo.decision.alwaysAllow'], ['block', 'siteInfo.decision.alwaysBlock']],
  cookies: [['default', 'siteInfo.decision.cookiesDefault'], ['allow', 'siteInfo.decision.allowHere']],
};

function formatTrDate(ms) {
  if (!ms) return '—';
  return window.ilgezdiI18n.formatDate(ms, { day: 'numeric', month: 'long', year: 'numeric' }) || '—';
}

async function loadSiteInfo() {
  const body = document.getElementById('siteinfo-body');
  if (!body) return;
  const H = window.ilgezdiHtml;
  let info = null;
  try { info = await sb.site?.info?.(); } catch {}
  if (!info || !info.origin) {
    body.innerHTML = `<p class="si-empty">${TH('siteInfo.noSite')}</p>`;
    return;
  }

  const secure = info.scheme === 'https';
  const cert = info.certificate;
  const certBad = !!(cert && !cert.ok);
  const statusText = !secure ? T('siteInfo.insecure') : certBad ? T('siteInfo.certProblem') : T('siteInfo.secure');

  const certHtml = !secure
    ? `<p class="si-note">${TH('siteInfo.httpWarning')}</p>`
    : cert
      ? `<dl class="si-dl">
          <dt>${TH('siteInfo.cert.subject')}</dt><dd>${H.esc(cert.subject || '—')}</dd>
          <dt>${TH('siteInfo.cert.issuer')}</dt><dd>${H.esc(cert.issuer || '—')}${cert.issuerOrg ? ' · ' + H.esc(cert.issuerOrg) : ''}</dd>
          <dt>${TH('siteInfo.cert.validity')}</dt><dd>${H.esc(formatTrDate(cert.validFrom))} – ${H.esc(formatTrDate(cert.validTo))}</dd>
          <dt>${TH('siteInfo.cert.fingerprint')}</dt><dd class="si-mono">${H.esc(cert.fingerprint || '—')}</dd>
          ${cert.error ? `<dt>${TH('siteInfo.cert.problem')}</dt><dd class="si-bad">${H.esc(cert.error)}</dd>` : ''}
        </dl>`
      : `<p class="si-note">${TH('siteInfo.cert.notYet')}</p>`;

  const permRows = (info.permissions || []).map((p) => {
    const kind = p.permission === 'popups' ? 'popups' : p.permission === 'third-party-cookies' ? 'cookies' : 'ask';
    let opts = SITE_DECISION_OPTIONS[kind];
    if (!opts.some(([v]) => v === p.decision)) opts = [...opts, [p.decision, p.decision === 'block' ? 'siteInfo.decision.block' : p.decision]];
    const id = 'si-perm-' + p.permission;
    const options = opts.map(([v, key]) => `<option value="${H.esc(v)}" ${p.decision === v ? 'selected' : ''}>${TH(key)}</option>`).join('');
    return `<div class="si-perm"><label for="${H.esc(id)}">${H.esc(p.label)}</label><select id="${H.esc(id)}" data-permission="${H.esc(p.permission)}">${options}</select></div>`;
  }).join('');

  const popupsHtml = (info.blockedPopups || []).length
    ? `<div class="si-sec"><h3>${TH('siteInfo.blockedPopups')}</h3>${info.blockedPopups.map((u, i) => `
        <div class="si-popup"><span class="si-mono" title="${H.esc(u)}">${H.esc(truncateUrl(u, 46))}</span>
        <button type="button" class="si-btn" data-open-popup="${i}">${TH('siteInfo.open')}</button></div>`).join('')}</div>`
    : '';

  // Reklam ve izleyici koruması (Brave'in kalkanları gibi): sayaç ve site istisnası.
  const pb = info.pageBlocked || {};
  const blockedTotal = ['ads', 'trackers', 'cookies', 'thirdParty'].reduce((n, k) => n + (Number(pb[k]) || 0), 0);
  const blockedParts = [[pb.trackers, 'siteInfo.blocked.trackers'], [pb.ads, 'siteInfo.blocked.ads'], [pb.cookies, 'siteInfo.blocked.cookies'], [pb.thirdParty, 'siteInfo.blocked.thirdParty']]
    .filter(([n]) => Number(n) > 0).map(([n, key]) => T(key, { count: Number(n) })).join(', ');
  const shieldHtml = !info.blocking
    ? `<div class="si-sec"><h3>${TH('siteInfo.shield.title')}</h3><p class="si-note">${TH('siteInfo.shield.globalOff')}</p></div>`
    : `<div class="si-sec"><h3>${TH('siteInfo.shield.title')}</h3>
        <div class="si-row"><span id="si-blocked">${info.siteAllowed ? TH('siteInfo.shield.siteOff') : blockedTotal ? TH('siteInfo.shield.blocked', { count: blockedTotal }) : TH('siteInfo.shield.none')}</span></div>
        ${!info.siteAllowed && blockedParts ? `<p class="si-note">${H.esc(blockedParts)}</p>` : ''}
        <div class="si-row"><label for="si-shield">${TH('siteInfo.shield.toggle')}</label><input type="checkbox" id="si-shield" ${info.siteAllowed ? '' : 'checked'}></div>
        <p class="si-note">${TH('siteInfo.shield.hint')} ${TH('siteInfo.shield.fingerprintNote')}</p>
      </div>`;

  const pct = Math.round((Number(info.zoom) || 1) * 100);
  const zoomDefaultPct = Math.round((Number(info.zoomDefault) || 1) * 100);
  const zoomHtml = pct !== zoomDefaultPct
    ? `<div class="si-sec si-row"><span>${TH('siteInfo.zoom', { percent: pct })}</span><button type="button" class="si-btn" id="si-zoom-reset">${TH('siteInfo.reset')}</button></div>`
    : '';

  body.innerHTML = `
    <div class="si-head">
      <div class="si-host">${H.esc(info.host)}</div>
      <div class="si-status ${secure && !certBad ? 'ok' : 'bad'}">${H.esc(statusText)}</div>
    </div>
    <div class="si-sec"><h3>${TH('siteInfo.connection')}</h3>${certHtml}</div>
    ${shieldHtml}
    ${popupsHtml}
    <div class="si-sec"><h3>${TH('siteInfo.permissions')}</h3>${permRows}
      <p class="si-note">${TH('siteInfo.permissionsHint')}</p>
    </div>
    ${zoomHtml}
    <div class="si-sec">
      <button type="button" class="si-btn danger" id="si-clear-data">${TH('siteInfo.clearData')}</button>
      <div class="si-result" id="si-result" role="status" aria-live="polite"></div>
    </div>`;

  const result = (msg, bad) => {
    const el = document.getElementById('si-result');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
  };
  body.querySelectorAll('select[data-permission]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const decision = sel.value === 'default' ? 'ask' : sel.value;
      const r = await sb.site.setPermission(info.origin, sel.dataset.permission, decision);
      result(r && r.ok ? T('siteInfo.saved') : (r && r.error) || T('siteInfo.saveFailed'), !(r && r.ok));
    });
  });
  body.querySelectorAll('[data-open-popup]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await sb.site.openBlockedPopup(Number(btn.dataset.openPopup));
      loadSiteInfo();
    });
  });
  document.getElementById('si-shield')?.addEventListener('change', async (e) => {
    // Engelleyici panelindeki istisna listesiyle aynı (blocker-panel.js); alan adı www'suz.
    const domain = String(info.host || '').replace(/^www\./, '');
    if (!domain) return;
    if (e.target.checked) blockerRemoveWhitelist(domain);
    else blockerAddWhitelist(domain);
    blockerCheckCurrentSite?.();
    await new Promise((r) => setTimeout(r, 150));   // istisna ana sürece ulaşsın
    sb.reload();
    setTimeout(loadSiteInfo, 1200);
  });
  document.getElementById('si-zoom-reset')?.addEventListener('click', async () => {
    await sb.zoom?.reset();
    loadSiteInfo();
  });
  document.getElementById('si-clear-data')?.addEventListener('click', async () => {
    const r = await sb.site.clearData(info.origin);
    if (r && r.canceled) return;
    result(r && r.ok ? T('siteInfo.dataCleared') : (r && r.error) || T('siteInfo.clearFailed'), !(r && r.ok));
  });
}

async function loadShield() {
  // GERÇEK DURUM (denetim O-06). Eskiden bu panel yapılandırma BAYRAKLARINI koruma
  // gibi gösteriyordu: kaldırılmış UA rotasyonu "✓ Aktif", VPN bağlantısı yerine
  // vpnEnabled ayarı, engellenen istek sayısı ise hiç yazılmayan ölü bir tablodan
  // (hep 0). Artık her satır çalışma zamanındaki gerçek kaynaktan okunuyor.
  const [cfg, vpn, block, logStats] = await Promise.all([
    sb.getConfig(),
    sb.vpn?.getStatus?.().catch(() => null),
    sb.blocker?.getStats?.().catch(() => null),
    sb.logs?.getStats?.().catch(() => null),
  ]);
  const H = window.ilgezdiHtml;
  const vpnOn = vpn?.status === 'connected';

  const items = [
    { name: T('shield.vpn'), on: vpnOn,
      note: vpnOn ? '' : (vpn?.status === 'dropped' ? T('shield.vpnDropped') : T('shield.vpnDisconnected')) },
    { name: T('shield.killSwitch'), on: !!vpn?.killSwitch,
      note: vpn?.killSwitchSupported === false ? T('shield.notOnPlatform') : (vpnOn ? '' : T('shield.vpnOff')) },
    { name: T('shield.trackers'), on: cfg.blockTrackers !== false },
    { name: T('shield.ads'),      on: cfg.blockAds !== false },
    { name: T('shield.httpsOnly'), on: !!cfg.httpsOnly },
    { name: T('shield.thirdPartyCookies'), on: cfg.blockThirdPartyCookies !== false },
    { name: T('shield.encryptedLog'),
      on: cfg.logEnabled !== false && logStats?.encrypted !== false,
      note: cfg.logEnabled === false ? T('shield.off') : (logStats?.encrypted === false ? T('shield.noEncryption') : '') },
  ];
  const activeCount = items.filter(i => i.on).length;

  const el = document.getElementById('shield-stats');
  if (!el) return;

  el.innerHTML = `
    <div style="text-align:center;padding:16px 0 24px">
      <div style="font-size:48px;margin-bottom:8px">${activeCount >= 5 ? '🛡️' : activeCount >= 3 ? '⚠️' : '🔓'}</div>
      <div style="font-size:18px;font-weight:700;color:${activeCount >= 5 ? 'var(--success)' : activeCount >= 3 ? 'var(--warning)' : 'var(--danger)'}">
        ${TH('shield.activeCount', { active: activeCount, total: items.length })}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
        ${TH('shield.blockedToday', { count: Number(block?.today) || 0 })}
      </div>
    </div>
    ${items.map(item => `
      <div class="shield-item">
        <span class="shield-name">${H.esc(item.name)}${item.note ? ` <span style="color:var(--text-muted);font-size:11px">· ${H.esc(item.note)}</span>` : ''}</span>
        <span class="shield-status ${item.on ? 'status-on' : 'status-off'}">
          ${item.on ? TH('shield.on') : TH('shield.offStatus')}
        </span>
      </div>
    `).join('')}
  `;
}

// ─── Yeni Sekme Sayfası ────────────────────────────────────────────────────────
// ─── Geçmiş sayfası ───────────────────────────────────────────────────────────
// Kaynak: şifreli ziyaret günlüğü (gizli pencere kaydedilmez).
const PAGE_ICON_COLORS = ['#3a6db5', '#b85c3a', '#5a7a4a', '#8a4a7a', '#c89540', '#4a5a8a', '#7a4a3a', '#3a5a4a'];
const isWebHref = (u) => /^https?:\/\//i.test(String(u || ''));

function iconColorFor(key) {
  let h = 0;
  for (const ch of String(key || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PAGE_ICON_COLORS[h % PAGE_ICON_COLORS.length];
}

function initialFor(host) {
  const s = String(host || '').replace(/^www\./, '');
  return (s[0] || '?').toLocaleUpperCase(window.ilgezdiI18n.intl);
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return T('history.today');
  if (diff === 1) return T('history.yesterday');
  return window.ilgezdiI18n.formatDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const historyView = { text: '', page: 1, items: [], total: 0, logEnabled: true };

function renderHistoryPage() {
  return `
    <div class="page fade-up" id="history-page">
      <div class="page-head">
        <div>
          <h1>${TH('history.title')}</h1>
          <p class="page-sub">${TH('history.subtitle')}</p>
        </div>
        <div class="right">
          <label class="page-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="history-search" placeholder="${TH('history.search')}" aria-label="${TH('history.search')}" autocomplete="off">
          </label>
          <select class="page-select" id="history-clear-range" aria-label="${TH('history.rangeLabel')}">
            <option value="hour">${TH('history.range.hour')}</option>
            <option value="day">${TH('history.range.day')}</option>
            <option value="week">${TH('history.range.week')}</option>
            <option value="month">${TH('history.range.month')}</option>
            <option value="all" selected>${TH('history.range.all')}</option>
          </select>
          <button type="button" class="page-btn danger" id="history-clear">${TH('history.clear')}</button>
        </div>
      </div>
      <div class="http-report" id="history-http-report" hidden></div>
      <div class="list" id="history-list" aria-live="polite"></div>
      <div class="page-more"><button type="button" class="page-btn" id="history-more" hidden>${TH('history.more')}</button></div>
    </div>`;
}

// Son 7 günün şifresiz (HTTP) ziyaret özeti — farkındalık için (kullanıcı önerisi).
// Yalnızca alan adı ve sayı gösterilir; "Yalnızca HTTPS" kapalıysa tek tıkla açma.
async function renderHttpReport(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  let report = null;
  let cfg = {};
  try {
    const res = await Promise.all([sb.logs.httpReport(), sb.getConfig()]);
    report = res[0];
    cfg = res[1] || {};
  } catch {}
  if (!report || !report.total) { box.hidden = true; return; }
  const fmt = { format: (n) => window.ilgezdiI18n.formatNumber(n) };
  const title = document.createElement('div');
  title.className = 'http-report-title';
  const body = document.createElement('div');
  body.className = 'http-report-body';
  box.classList.toggle('warn', report.http > 0);
  if (!report.http) {
    title.textContent = T('httpReport.allSecureTitle');
    body.textContent = T('httpReport.allSecureBody', { count: report.total });
  } else {
    title.textContent = T('httpReport.insecureTitle', { count: report.http });
    const names = report.top.map((t) => `${t.domain} (${fmt.format(t.count)})`).join(', ');
    body.textContent = `${T('httpReport.siteCount', { count: report.httpDomains })}${names ? ': ' + names : ''}. ${T('httpReport.risk')}`;
  }
  box.replaceChildren(title, body);
  if (report.http && !cfg.httpsOnly) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    btn.textContent = T('httpReport.enable');
    btn.addEventListener('click', async () => {
      try {
        const current = await sb.getConfig();
        await sb.saveConfig({ ...current, httpsOnly: true });
        window.ilgezdiSync?.schedulePush();
        const done = document.createElement('span');
        done.className = 'http-report-done';
        done.textContent = T('httpReport.enabled');
        btn.replaceWith(done);
      } catch {}
    });
    box.appendChild(btn);
  }
  box.hidden = false;
}

async function loadHistory(reset) {
  if (reset) { historyView.page = 1; historyView.items = []; }
  if (reset && !historyView.text) renderHttpReport('history-http-report');
  let r = { items: [], total: 0 };
  try { r = await sb.logs.search({ text: historyView.text, page: historyView.page, limit: 100 }); } catch {}
  historyView.items = historyView.page === 1 ? r.items : historyView.items.concat(r.items);
  historyView.total = r.total;
  renderHistoryList();
}

function renderHistoryList() {
  const box = document.getElementById('history-list');
  if (!box) return;
  const H = window.ilgezdiHtml;
  if (!historyView.items.length) {
    const msg = historyView.text ? T('history.noMatch')
      : historyView.logEnabled ? T('history.empty')
      : T('history.logOff');
    box.innerHTML = `<p class="page-empty">${H.esc(msg)}</p>`;
  } else {
    let html = '';
    let lastDay = '';
    for (const it of historyView.items) {
      if (!isWebHref(it.url)) continue;   // eski sürümlerin günlüğe yazdığı boş sekme kayıtları
      const day = dayLabel(it.timestamp);
      if (day !== lastDay) { html += `<div class="list-day">${H.esc(day)}</div>`; lastDay = day; }
      const time = window.ilgezdiI18n.formatTime(it.timestamp, { hour: '2-digit', minute: '2-digit' });
      const name = it.title || it.url;
      // Şifresiz (HTTP) ziyaret işaretlenir: "Yalnızca HTTPS" kapalı kullanıcı nerede
      // şifresiz bağlantı kullandığını görebilsin (kullanıcı önerisi).
      const insecure = /^http:\/\//i.test(it.url);
      const scheme = insecure
        ? `<span class="lr-scheme http" title="${TH('history.httpBadge')}">HTTP</span>`
        : `<span class="lr-scheme https" title="${TH('history.httpsBadge')}" aria-label="HTTPS">🔒</span>`;
      html += `
        <div class="list-row${insecure ? ' is-http' : ''}" role="link" tabindex="0" data-url="${H.esc(it.url)}">
          <span class="lr-icon" style="background:${iconColorFor(it.domain)}" aria-hidden="true">${H.esc(initialFor(it.domain))}</span>
          <span class="lr-title">${H.esc(name)}</span>
          <span class="lr-url">${scheme}${H.esc(it.domain || '')}</span>
          <span class="lr-time">${H.esc(time)}</span>
          <button type="button" class="lr-more" data-delete="${H.esc(it.id)}" title="${TH('history.delete')}" aria-label="${TH('history.deleteLabel', { title: name })}">✕</button>
        </div>`;
    }
    box.innerHTML = html;
  }
  const more = document.getElementById('history-more');
  if (more) more.hidden = historyView.items.length >= historyView.total;
}

async function initHistoryPage() {
  const cfg = await sb.getConfig().catch(() => ({}));
  historyView.logEnabled = cfg.logEnabled !== false;
  historyView.text = '';
  await loadHistory(true);

  const search = document.getElementById('history-search');
  let timer = null;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { historyView.text = search.value.trim(); loadHistory(true); }, 200);
  });
  document.getElementById('history-more')?.addEventListener('click', () => {
    historyView.page += 1;
    loadHistory(false);
  });
  document.getElementById('history-clear')?.addEventListener('click', async () => {
    const sel = document.getElementById('history-clear-range');
    const range = sel ? sel.value : 'all';
    const question = range === 'all'
      ? T('history.confirmAll')
      : T('history.confirmRange', { range: sel.selectedOptions[0].textContent });
    if (!confirm(question)) return;
    await sb.logs.clearRange(range);
    loadHistory(true);
  });

  const list = document.getElementById('history-list');
  // Tık: bu sekmede; orta tık ve Ctrl+tık arka planda, Ctrl+Shift+tık önde yeni sekmede (Chrome gibi).
  const open = (row, mode) => {
    const url = row && row.dataset.url;
    if (!isWebHref(url)) return;
    if (mode === 'current') { hideScreen(); sb.navigate(url); }
    else sb.newTab(url, { background: mode === 'background' });
  };
  const modeOf = (e) => (e.ctrlKey || e.metaKey ? (e.shiftKey ? 'foreground' : 'background') : 'current');
  list?.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.delete;
      await sb.logs.deleteEntries([id]);
      historyView.items = historyView.items.filter((x) => x.id !== id);
      historyView.total = Math.max(0, historyView.total - 1);
      renderHistoryList();
      return;
    }
    const row = e.target.closest('.list-row');
    if (row) open(row, modeOf(e));
  });
  list?.addEventListener('auxclick', (e) => {
    const row = e.button === 1 && e.target.closest('.list-row');
    if (row) { e.preventDefault(); open(row, 'background'); }
  });
  // Liste kaydırılabilir: orta tuş otomatik kaydırmayı başlatıp auxclick'i yutmasın.
  list?.addEventListener('mousedown', (e) => {
    if (e.button === 1 && e.target.closest('.list-row')) e.preventDefault();
  });
  list?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.closest('[data-delete]')) return;
    const row = e.target.closest('.list-row');
    if (row) open(row, modeOf(e));
  });
}

// ─── Açık sekmeler (Ctrl+Shift+A) ─────────────────────────────────────────────
// Sayfa görünümü arayüzün üstünde çizildiği için sekme şeridinin altına açılır liste
// konamaz; Geçmiş gibi tam sayfa ekran olarak açılır. Liste ana süreçten gelen sekme
// bilgisinden (currentTabs) çizilir ve sekmeler değişince yenilenir.
let tabsQuery = '';

function openTabsScreen() {
  if (currentScreen === 'tabs') { hideScreen(); return; }
  showScreen('tabs', renderTabsPage).then(initTabsPage);
}

function renderTabsPage() {
  return `
    <div class="page fade-up" id="tabs-page">
      <div class="page-head">
        <div>
          <h1>${TH('tabsPage.title')}</h1>
          <p class="page-sub">${TH('tabsPage.subtitle')}</p>
        </div>
        <div class="right">
          <label class="page-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="tabs-search" placeholder="${TH('ui.tabSearchLabel')}" aria-label="${TH('ui.tabSearchLabel')}" autocomplete="off">
          </label>
        </div>
      </div>
      <div class="list" id="tabs-list" aria-live="polite"></div>
    </div>`;
}

// Her kelime başlıkta ya da adreste geçmeli (arayüz dilinin büyük/küçük harf kuralıyla: İ/i, I/ı).
function tabMatches(tab, query) {
  const lang = (typeof window !== 'undefined' && window.ilgezdiI18n && window.ilgezdiI18n.locale) || 'tr';
  const words = String(query || '').toLocaleLowerCase(lang).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${tab.title || ''} ${tab.url || ''}`.toLocaleLowerCase(lang);
  return words.every((w) => hay.includes(w));
}

function renderTabsList() {
  const list = document.getElementById('tabs-list');
  if (!list) return;
  const H = window.ilgezdiHtml;
  const focusedIndex = [...list.querySelectorAll('.tab-row')].indexOf(document.activeElement?.closest?.('.tab-row'));
  const rows = currentTabs.filter((t) => tabMatches(t, tabsQuery));
  if (!rows.length) {
    list.innerHTML = `<p class="page-empty">${tabsQuery ? TH('tabsPage.noMatch') : TH('tabsPage.empty')}</p>`;
    return;
  }
  list.innerHTML = rows.map((t) => {
    let host = '';
    try { host = new URL(t.url).hostname; } catch {}
    const blank = !t.url || t.url === 'about:blank';
    const title = t.title || (blank ? T('tab.new') : host || t.url);
    const icon = t.favicon && /^data:image\//.test(t.favicon)
      ? `<img class="lr-icon" src="${H.esc(t.favicon)}" alt="" aria-hidden="true">`
      : `<span class="lr-icon" style="background:${iconColorFor(host || title)}" aria-hidden="true">${H.esc(initialFor(host || title))}</span>`;
    const state = [t.isActive ? T('tabsPage.active') : '', t.sleeping ? T('tabsPage.sleeping') : '', t.pinned ? T('tabsPage.pinned') : '', t.muted ? T('tabsPage.muted') : (t.audible ? T('tabsPage.audible') : '')].filter(Boolean).join(' · ');
    return `
      <div class="list-row tab-row${t.isActive ? ' is-active' : ''}" role="button" tabindex="0" data-tab-id="${H.esc(String(t.id))}" data-blank="${blank ? '1' : ''}">
        ${icon}
        <span class="lr-title">${H.esc(title)}</span>
        <span class="lr-url">${H.esc(blank ? '' : host)}</span>
        <span class="lr-time">${H.esc(state)}</span>
        <button type="button" class="lr-more" data-close-tab="${H.esc(String(t.id))}" title="${TH('tabsPage.close')}" aria-label="${TH('tab.closeLabel', { title })}">✕</button>
      </div>`;
  }).join('');
  // Kapatılan satırın yerine gelen satır odak alır (klavyeyle art arda kapatma).
  if (focusedIndex >= 0) {
    const all = list.querySelectorAll('.tab-row');
    (all[Math.min(focusedIndex, all.length - 1)] || document.getElementById('tabs-search'))?.focus();
  }
}

function initTabsPage() {
  tabsQuery = '';
  renderTabsList();
  const search = document.getElementById('tabs-search');
  const list = document.getElementById('tabs-list');
  search?.focus();
  const openRow = async (row) => {
    const id = Number(row && row.dataset.tabId);
    if (!Number.isFinite(id)) return;
    await sb.switchTab(id);
    // Boş sekmede yeni sekme sayfası açılır (etkin sekme adres bildirimi); zaten etkinse elle.
    if (row.dataset.blank) { if (currentScreen === 'tabs') showScreen('newtab', renderNewTab).then(initNewTabEvents); }
    else if (currentScreen === 'tabs') hideScreen();
  };
  search?.addEventListener('input', () => { tabsQuery = search.value.trim(); renderTabsList(); });
  search?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); openRow(list?.querySelector('.tab-row')); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list?.querySelector('.tab-row')?.focus(); }
  });
  list?.addEventListener('click', (e) => {
    const close = e.target.closest('[data-close-tab]');
    if (close) { e.stopPropagation(); sb.closeTab(Number(close.dataset.closeTab)); return; }
    const row = e.target.closest('.tab-row');
    if (row) openRow(row);
  });
  list?.addEventListener('keydown', (e) => {
    const row = e.target.closest('.tab-row');
    if (!row || e.target.closest('[data-close-tab]')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(row); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); row.nextElementSibling?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (row.previousElementSibling || search)?.focus(); }
    else if (e.key === 'Delete') { e.preventDefault(); sb.closeTab(Number(row.dataset.tabId)); }
  });
}

// ─── Okuma modu (F9) ──────────────────────────────────────────────────────────
// Makale ana süreçten doğrulanmış bir ağaç olarak gelir; burada yine yalnızca bilinen
// etiketler, http(s) bağlantılar ve data:image resimlerle, innerHTML kullanılmadan çizilir.
const READER_TAGS_UI = new Set(['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'em', 'i', 'strong', 'b', 'u', 's', 'sub', 'sup', 'small', 'mark', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'dl', 'dt', 'dd', 'div']);
const READER_PREFS_KEY = 'ilgezdi-reader';
const READER_SIZES = [15, 17, 19, 21, 24, 28];
let readerSourceUrl = null;
let readerRequest = 0;

function readerPrefs() {
  const def = { size: 19, theme: 'paper', font: 'serif' };
  try {
    const p = { ...def, ...JSON.parse(localStorage.getItem(READER_PREFS_KEY) || '{}') };
    return {
      size: READER_SIZES.includes(p.size) ? p.size : def.size,
      theme: ['paper', 'light', 'dark'].includes(p.theme) ? p.theme : def.theme,
      font: ['serif', 'sans'].includes(p.font) ? p.font : def.font,
    };
  } catch { return def; }
}

function saveReaderPrefs(p) {
  try { localStorage.setItem(READER_PREFS_KEY, JSON.stringify(p)); } catch {}
}

function buildReaderNodes(parent, nodes, depth = 0) {
  if (!Array.isArray(nodes) || depth > 40) return;
  for (const n of nodes) {
    if (typeof n === 'string') { parent.append(n); continue; }
    if (!Array.isArray(n) || !READER_TAGS_UI.has(n[0])) continue;
    const [tag, attrs, kids] = n;
    const el = document.createElement(tag);
    if (tag === 'a' && attrs && isWebHref(attrs.href)) { el.href = attrs.href; el.rel = 'noreferrer'; }
    if (tag === 'img') {
      if (!attrs || !/^data:image\/(png|jpeg|gif|webp|avif|svg\+xml);base64,/.test(String(attrs.src || ''))) continue;
      el.src = attrs.src;
      el.alt = typeof attrs.alt === 'string' ? attrs.alt : '';
      el.loading = 'lazy';
    }
    if (tag !== 'img' && tag !== 'br' && tag !== 'hr') buildReaderNodes(el, kids, depth + 1);
    parent.append(el);
  }
}

function applyReaderPrefs(page, p) {
  page.dataset.theme = p.theme;
  page.dataset.font = p.font;
  page.style.setProperty('--reader-size', p.size + 'px');
  page.querySelectorAll('[data-reader-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.readerTheme === p.theme)));
  page.querySelectorAll('[data-reader-font]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.readerFont === p.font)));
}

function renderReaderShell() {
  return `
    <div class="reader-page" id="reader-page">
      <div class="reader-bar" role="toolbar" aria-label="${TH('reader.toolbar')}">
        <button type="button" data-reader-act="close" title="${TH('reader.backTitle')}">${TH('reader.back')}</button>
        <span class="reader-site" id="reader-site"></span>
        <button type="button" data-reader-act="smaller" aria-label="${TH('reader.smaller')}" title="${TH('reader.smaller')}">A−</button>
        <button type="button" data-reader-act="larger" aria-label="${TH('reader.larger')}" title="${TH('reader.larger')}">A+</button>
        <button type="button" data-reader-font="serif" title="${TH('reader.serifTitle')}">Serif</button>
        <button type="button" data-reader-font="sans" title="${TH('reader.sansTitle')}">Sans</button>
        <button type="button" data-reader-theme="paper">${TH('reader.paper')}</button>
        <button type="button" data-reader-theme="light">${TH('reader.light')}</button>
        <button type="button" data-reader-theme="dark">${TH('reader.dark')}</button>
      </div>
      <article class="reader-article" id="reader-article" aria-busy="true"><p class="reader-meta">${TH('reader.preparing')}</p></article>
    </div>`;
}

async function openReader() {
  if (currentScreen === 'reader') { hideScreen(); return; }
  const active = currentTabs.find((t) => t.isActive);
  if (!active || !isWebHref(active.url)) return;
  const req = ++readerRequest;
  readerSourceUrl = active.url;
  document.getElementById('btn-reader')?.classList.add('active');
  await showScreen('reader', renderReaderShell);
  const page = document.getElementById('reader-page');
  if (!page) return;
  applyReaderPrefs(page, readerPrefs());
  initReaderEvents(page);
  let r = null;
  try { r = await sb.reader.extract(); } catch {}
  if (req !== readerRequest || currentScreen !== 'reader') return;
  const article = document.getElementById('reader-article');
  article.removeAttribute('aria-busy');
  article.replaceChildren();
  if (!r || !r.ok) {
    const p = document.createElement('p');
    p.className = 'reader-empty';
    p.textContent = r && r.reason === 'navigated' ? T('reader.navigated') : T('reader.noArticle');
    article.append(p);
    return;
  }
  readerSourceUrl = r.url;
  let host = '';
  try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch {}
  document.getElementById('reader-site').textContent = r.siteName || host;
  if (r.lang) article.lang = r.lang;
  article.dir = r.dir === 'rtl' ? 'rtl' : 'ltr';
  const h1 = document.createElement('h1');
  h1.className = 'reader-title';
  h1.textContent = r.title || host;
  const meta = document.createElement('p');
  meta.className = 'reader-meta';
  meta.textContent = [r.byline, T('reader.minutes', { count: Number(r.minutes) || 1 })].filter(Boolean).join(' · ');
  article.append(h1, meta);
  buildReaderNodes(article, r.nodes);
}

function initReaderEvents(page) {
  page.addEventListener('click', (e) => {
    const act = e.target.closest('[data-reader-act]')?.dataset.readerAct;
    const theme = e.target.closest('[data-reader-theme]')?.dataset.readerTheme;
    const font = e.target.closest('[data-reader-font]')?.dataset.readerFont;
    if (act === 'close') { hideScreen(); return; }
    if (act || theme || font) {
      const p = readerPrefs();
      if (act === 'smaller') p.size = READER_SIZES[Math.max(0, READER_SIZES.indexOf(p.size) - 1)];
      if (act === 'larger') p.size = READER_SIZES[Math.min(READER_SIZES.length - 1, READER_SIZES.indexOf(p.size) + 1)];
      if (theme) p.theme = theme;
      if (font) p.font = font;
      saveReaderPrefs(p);
      applyReaderPrefs(page, p);
      return;
    }
    // Makaledeki bağlantı: tıklama sekmede açar (okuma modu kapanır); Ctrl/orta tık arka planda.
    const a = e.target.closest('.reader-article a[href]');
    if (!a) return;
    e.preventDefault();
    if (!isWebHref(a.href)) return;
    if (e.ctrlKey || e.metaKey) { sb.newTab(a.href, { background: !e.shiftKey }); return; }
    hideScreen();
    sb.navigate(a.href);
  });
  page.addEventListener('auxclick', (e) => {
    const a = e.button === 1 && e.target.closest('.reader-article a[href]');
    if (a) { e.preventDefault(); if (isWebHref(a.href)) sb.newTab(a.href, { background: true }); }
  });
  page.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('.reader-article a[href]')) e.preventDefault(); });
}

// ─── İndirilenler sayfası ─────────────────────────────────────────────────────
const downloadsView = new Map();   // id → ana süreçteki kayıt
const DL_STATES = ['completed', 'cancelled', 'interrupted', 'progressing', 'paused'];

function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let x = Number(n) || 0;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return window.ilgezdiI18n.formatNumber(x, { maximumFractionDigits: i ? 1 : 0 }) + ' ' + units[i];
}

function updateDownloadsBadge() {
  const btn = document.getElementById('sb-downloads');
  if (!btn) return;
  let badge = document.getElementById('downloads-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'downloads-badge';
    badge.setAttribute('aria-hidden', 'true');
    btn.appendChild(badge);
  }
  // Duraklatılmış indirme de sürüyor sayılır (ana süreç durumu 'paused' olarak gönderir).
  const active = [...downloadsView.values()].filter((d) => d.state === 'progressing' || d.state === 'paused').length;
  badge.textContent = String(active);
  badge.hidden = active === 0;
  btn.setAttribute('aria-label', active ? T('downloads.badgeLabel', { count: active }) : T('ui.downloads'));
}

function renderDownloadsPage() {
  return `
    <div class="page fade-up" id="downloads-page">
      <div class="page-head">
        <div>
          <h1>${TH('downloads.title')}</h1>
          <p class="page-sub">${TH('downloads.subtitle')}</p>
        </div>
        <div class="right"><button type="button" class="page-btn" id="downloads-clear">${TH('downloads.clear')}</button></div>
      </div>
      <div id="downloads-list" aria-live="polite"></div>
    </div>`;
}

function renderDownloadsList() {
  const box = document.getElementById('downloads-list');
  if (!box) return;
  const H = window.ilgezdiHtml;
  const items = [...downloadsView.values()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (!items.length) {
    box.innerHTML = `<p class="page-empty">${TH('downloads.empty')}</p>`;
    return;
  }
  box.innerHTML = items.map((d) => {
    const id = H.esc(String(d.id));
    const running = d.state === 'progressing' || d.state === 'paused';
    const state = d.state === 'paused' || (running && d.paused) ? 'paused' : d.state;
    const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
    const missing = d.state === 'completed' && d.exists === false;
    const sizeText = running ? formatBytes(d.received) + (d.total ? ' / ' + formatBytes(d.total) : '') : formatBytes(d.total || d.received);
    const status = missing ? T('downloads.missing') : (DL_STATES.includes(state) ? T('downloads.state.' + state) : state);
    const ext = (String(d.filename).includes('.') ? String(d.filename).split('.').pop() : '').slice(0, 4).toUpperCase() || T('downloads.fileExt');
    const actions = [];
    if (running) {
      actions.push(`<button type="button" class="page-btn sm" data-dl="pause" data-id="${id}">${state === 'paused' ? TH('downloads.resume') : TH('downloads.pause')}</button>`);
      actions.push(`<button type="button" class="page-btn sm" data-dl="cancel" data-id="${id}">${TH('downloads.cancel')}</button>`);
    } else {
      if (d.state === 'completed' && !missing) {
        actions.push(`<button type="button" class="page-btn sm" data-dl="open" data-id="${id}">${TH('downloads.open')}</button>`);
        actions.push(`<button type="button" class="page-btn sm" data-dl="show" data-id="${id}">${TH('downloads.showInFolder')}</button>`);
      }
      actions.push(`<button type="button" class="page-btn sm ghost" data-dl="remove" data-id="${id}" title="${TH('downloads.remove')}" aria-label="${TH('downloads.removeLabel', { name: d.filename })}">✕</button>`);
    }
    return `
      <div class="dl-row${d.dangerous ? ' dangerous' : ''}" data-row="${id}">
        <div class="file-icon" aria-hidden="true">${H.esc(ext)}</div>
        <div class="dl-main">
          <div class="name">${H.esc(d.filename)}</div>
          <div class="src">${H.esc(d.sourceHost || '')}${d.dangerous ? ` · <span class="dl-warn">${TH('downloads.dangerous')}</span>` : ''}</div>
          ${running ? `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${TH('downloads.progressLabel', { name: d.filename })}"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        <div class="pct">${H.esc(sizeText)}</div>
        <div class="dl-status ${H.esc(state)}">${H.esc(status)}</div>
        <div class="dl-actions">${actions.join('')}</div>
      </div>`;
  }).join('');
}

async function refreshDownloads() {
  try {
    const list = await sb.downloads.list();
    downloadsView.clear();
    for (const d of list || []) downloadsView.set(d.id, d);
  } catch {}
  renderDownloadsList();
  updateDownloadsBadge();
}

async function initDownloadsPage() {
  await refreshDownloads();
  document.getElementById('downloads-clear')?.addEventListener('click', async () => {
    await sb.downloads.clear();
    refreshDownloads();
  });
  document.getElementById('downloads-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-dl]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.dl;
    if (action === 'open') await sb.downloads.open(id);
    else if (action === 'show') await sb.downloads.showInFolder(id);
    else if (action === 'pause') await sb.downloads.pause(id);
    else if (action === 'cancel') await sb.downloads.cancel(id);
    else if (action === 'remove') {
      const r = await sb.downloads.remove(id);
      if (r && r.ok) downloadsView.delete(id);
      renderDownloadsList();
    }
  });
}

// ─── Keşfet: TrendTech yazılımları ────────────────────────────────────────────
// Kartlar ana süreçten gelir (discover-feed.js: uygulamadaki liste + ilgezdi.com.tr'den
// günlük tazeleme). Görsel ve tıklama sayımı yok; kart yeni sekmede siteyi açar.
function renderDiscoverPage() {
  return `
    <div class="page fade-up" id="discover-page">
      <div class="page-head">
        <div>
          <h1>${TH('discover.title')}</h1>
          <p class="page-sub">${TH('discover.subtitle')}</p>
        </div>
      </div>
      <div class="discover-grid" id="discover-grid" aria-live="polite"><p class="page-empty">${TH('common.loading')}</p></div>
      <section class="community" id="review-section" aria-labelledby="review-title">
        <div class="community-head">
          <h2 id="review-title">${TH('discover.reviewTitle')}</h2>
          <p class="page-sub" id="review-summary">${TH('discover.reviewTail')}</p>
        </div>
        <div class="community-body" id="review-body"><p class="page-empty">${TH('common.loading')}</p></div>
        <div class="review-list" id="review-list" aria-live="polite"></div>
      </section>
    </div>`;
}

async function initDiscoverPage() {
  const grid = document.getElementById('discover-grid');
  if (!grid) return;
  initReviewSection();
  let items = [];
  try { items = await sb.discover.list(); } catch {}
  grid.replaceChildren();
  const cards = (Array.isArray(items) ? items : []).filter((it) => it && /^https:\/\//i.test(it.url));
  if (!cards.length) {
    const p = document.createElement('p');
    p.className = 'page-empty';
    p.textContent = T('discover.empty');
    grid.appendChild(p);
    return;
  }
  const part = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; e.textContent = text || ''; return e; };
  // Sunucudaki katalog Türkçe; bilinen ürünlerin metinleri diğer dillerde çeviriden gelir.
  const I = window.ilgezdiI18n;
  const localized = (it) => {
    if (I.locale === 'tr') return it;
    const pick = (field) => (I.has('discover.item.' + it.id + '.' + field) ? T('discover.item.' + it.id + '.' + field) : it[field]);
    return { ...it, category: pick('category'), tagline: pick('tagline'), description: pick('description') };
  };
  for (const raw of cards) {
    const it = localized(raw);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'discover-card';
    card.setAttribute('aria-label', T('discover.cardLabel', { name: it.name, tagline: it.tagline }));
    const mark = part('span', 'discover-mark', it.letter);
    if (/^#[0-9a-f]{6}$/i.test(it.color)) mark.style.background = `linear-gradient(135deg, ${it.color}, color-mix(in srgb, ${it.color} 55%, #000))`;
    const body = document.createElement('span');
    body.className = 'discover-body';
    body.append(part('span', 'discover-cat', it.category), part('span', 'discover-name', it.name),
      part('span', 'discover-tagline', it.tagline), part('span', 'discover-desc', it.description), part('span', 'discover-cta', T('discover.openSite')));
    card.append(mark, body);
    card.addEventListener('click', () => { hideScreen(); sb.newTab(it.url); });
    grid.appendChild(card);
  }
}

// ─── Topluluk: Keşfet'te yorumlar, Öneri sayfası ─────────────────────────────
// İstekler ana süreçte (main/community.js) yalnızca İlgezdi sunucusuna gider. Yorum
// yazmak QRtım hesabı ister (kullanıcı kararı); öneri anonim de gönderilebilir, hesapla
// gönderilince durumu ve ekibin yanıtı burada izlenir. Sunucudan ve kullanıcıdan gelen
// tüm metinler DOM'a textContent ile yazılır.
// Değerler sunucuyla paylaşılan kimliklerdir (Türkçe kalır); görünen metinler çeviriden.
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
const FEEDBACK_TYPES_UI = ['hata', 'eksik', 'ozellestirme', 'elestiri', 'diger'];
const FEEDBACK_AREAS_UI = ['genel', 'sekmeler', 'adres-arama', 'yer-imleri', 'gecmis-indirmeler', 'gizlilik-guvenlik', 'reklam-engelleme',
  'vpn', 'sifreler', 'ayarlar', 'yeni-sekme', 'kesfet', 'arku', 'senkron-hesap', 'performans', 'gorunum', 'diger'];
const FEEDBACK_STATUSES = ['yeni', 'inceleniyor', 'planlandi', 'tamamlandi', 'reddedildi'];
const feedbackStatusText = (s) => (FEEDBACK_STATUSES.includes(s) ? T('feedback.status.' + s) : T('feedback.status.yeni'));

function communityEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}

async function communitySession() {
  try {
    const s = await window.ilgezdiAuth?.getSession?.();
    return s && (s.userId || s.email) ? s : null;
  } catch { return null; }
}

// Sunucu "oturum doğrulanamadı" derse erişim anahtarı bir kez yenilenip yeniden denenir.
async function withCommunityToken(fn) {
  const get = async (refresh) => {
    try { return (await window.ilgezdiAuth?.getAccessToken?.({ refresh })) || ''; } catch { return ''; }
  };
  const token = await get(false);
  let r = await fn(token);
  if (token && r && r.code === 'unauthorized') {
    const fresh = await get(true);
    if (fresh) r = await fn(fresh);
  }
  return r;
}

const SESSION_LOST = { ok: false, code: 'unauthorized', get error() { return T('community.sessionLost'); } };

let _reviewRenderSeq = 0;
async function initReviewSection() {
  const body = document.getElementById('review-body');
  if (!body) return;
  const seq = ++_reviewRenderSeq;
  const session = await communitySession();
  const r = await withCommunityToken((token) => sb.community.reviews(session ? token : ''));
  if (seq !== _reviewRenderSeq || !body.isConnected) return;
  renderReviewList(r);
  body.replaceChildren();
  if (!session) {
    body.append(communityEl('p', 'community-note', T('review.loginNote')));
    const login = communityEl('button', 'page-btn primary', T('review.loginButton'));
    login.type = 'button';
    login.id = 'review-login';
    login.addEventListener('click', () => window.ilgezdiAuth?.open?.());
    body.append(login);
    return;
  }
  body.append(buildReviewForm(r && r.ok ? r.mine : null, (r && r.ok && r.displayName) || session.displayName || ''));
}

function renderReviewList(r) {
  const list = document.getElementById('review-list');
  const summary = document.getElementById('review-summary');
  if (!list || !summary) return;
  list.replaceChildren();
  const tail = T('discover.reviewTail');
  if (!r || !r.ok) {
    summary.textContent = `${tail} ${(r && r.error) || ''}`.trim();
    return;
  }
  summary.textContent = r.count && r.avgRating
    ? `${T('review.average', { rating: window.ilgezdiI18n.formatNumber(r.avgRating, { maximumFractionDigits: 1 }), count: r.count })} ${tail}`
    : tail;
  for (const it of r.items.slice(0, 6)) {
    const card = communityEl('article', 'review-card');
    const head = communityEl('div', 'review-card-head');
    head.append(communityEl('span', 'review-name', it.name || T('review.anonymous')));
    if (it.rating) {
      const stars = communityEl('span', 'review-rating', '★'.repeat(it.rating) + '☆'.repeat(5 - it.rating));
      stars.setAttribute('aria-label', `${it.rating} / 5`);
      head.append(stars);
    }
    if (it.verified) head.append(communityEl('span', 'review-verified', T('review.verified')));
    card.append(head, communityEl('p', 'review-text', it.comment));
    list.append(card);
  }
}

function buildReviewForm(mine, defaultName) {
  const form = communityEl('form', 'review-form');
  form.id = 'review-form';
  form.noValidate = true;
  if (mine) {
    form.append(communityEl('p', 'review-mine ' + mine.status,
      T('review.mine', { status: T('review.status.' + (REVIEW_STATUSES.includes(mine.status) ? mine.status : 'pending')) })));
  }

  const stars = communityEl('fieldset', 'review-stars');
  stars.append(communityEl('legend', '', T('review.rating')));
  const row = communityEl('div', 'stars-row');
  // Sağdan sola dizilir (row-reverse): seçilen yıldız ve solundakiler CSS ile boyanır.
  for (let i = 5; i >= 1; i--) {
    const input = communityEl('input');
    input.type = 'radio';
    input.name = 'review-rating';
    input.value = String(i);
    input.id = 'review-star-' + i;
    if (mine && mine.rating === i) input.checked = true;
    const label = communityEl('label', '', '★');
    label.htmlFor = input.id;
    label.title = `${i} / 5`;
    label.setAttribute('aria-label', T('review.stars', { count: i }));
    row.append(input, label);
  }
  stars.append(row);

  const nameLabel = communityEl('label', 'field-label', T('review.nameLabel'));
  nameLabel.htmlFor = 'review-name';
  const name = communityEl('input');
  name.type = 'text';
  name.id = 'review-name';
  name.maxLength = 60;
  name.value = (mine && mine.name) || defaultName || '';
  const commentLabel = communityEl('label', 'field-label', T('review.commentLabel'));
  commentLabel.htmlFor = 'review-comment';
  const comment = communityEl('textarea');
  comment.id = 'review-comment';
  comment.rows = 4;
  comment.maxLength = 1000;
  comment.placeholder = T('review.placeholder');
  comment.value = (mine && mine.comment) || '';

  const actions = communityEl('div', 'feedback-actions');
  const submit = communityEl('button', 'page-btn primary', mine ? T('review.update') : T('review.send'));
  submit.type = 'submit';
  submit.id = 'review-submit';
  const status = communityEl('span', 'review-status');
  status.id = 'review-status';
  status.setAttribute('role', 'status');
  actions.append(submit, status);
  form.append(stars, nameLabel, name, commentLabel, comment, actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = Number(form.querySelector('input[name="review-rating"]:checked')?.value || 0);
    submit.disabled = true;
    status.className = 'review-status';
    status.textContent = T('community.sending');
    const r = await withCommunityToken((token) => sb.community.sendReview({ token, rating, name: name.value, comment: comment.value }));
    submit.disabled = false;
    if (r && r.ok) {
      status.className = 'review-status ok';
      status.textContent = r.updated ? T('review.updated') : T('review.thanks');
      submit.textContent = T('review.update');
    } else {
      status.className = 'review-status err';
      status.textContent = (r && r.error) || T('review.failed');
    }
  });
  return form;
}

function renderFeedbackPage() {
  return `
    <div class="page fade-up" id="feedback-page">
      <div class="page-head">
        <div>
          <h1>${TH('feedback.title')}</h1>
          <p class="page-sub">${TH('feedback.subtitle')}</p>
        </div>
      </div>
      <div class="feedback-layout">
        <form class="feedback-form" id="feedback-form" novalidate>
          <fieldset class="feedback-types">
            <legend>${TH('feedback.whatType')}</legend>
            <div class="feedback-type-grid" id="feedback-types"></div>
          </fieldset>
          <label class="field-label" for="feedback-area">${TH('feedback.area')}</label>
          <select id="feedback-area"></select>
          <label class="field-label" for="feedback-title">${TH('feedback.shortTitle')}</label>
          <input id="feedback-title" type="text" maxlength="120" autocomplete="off">
          <label class="field-label" for="feedback-message">${TH('feedback.description')}</label>
          <textarea id="feedback-message" rows="7" maxlength="4000"></textarea>
          <div class="feedback-count" id="feedback-count" aria-live="polite"></div>
          <label class="check-row"><input type="checkbox" id="feedback-diag" checked> <span>${TH('feedback.includeDiag')} <small>${TH('feedback.includeDiagNote')}</small></span></label>
          <label class="check-row" id="feedback-contact-row" hidden><input type="checkbox" id="feedback-contact"> <span>${TH('feedback.contactOk')}</span></label>
          <p class="community-note" id="feedback-account-note"></p>
          <div class="feedback-actions">
            <button type="submit" class="page-btn primary" id="feedback-submit">${TH('feedback.send')}</button>
            <span class="review-status" id="feedback-status" role="status"></span>
          </div>
        </form>
        <aside class="feedback-mine" aria-labelledby="feedback-mine-title">
          <h2 id="feedback-mine-title">${TH('feedback.mine')}</h2>
          <div id="feedback-mine"><p class="page-empty">${TH('common.loading')}</p></div>
        </aside>
      </div>
    </div>`;
}

let _feedbackSession = null;

function initFeedbackPage() {
  const form = document.getElementById('feedback-form');
  if (!form) return;
  const types = document.getElementById('feedback-types');
  for (const value of FEEDBACK_TYPES_UI) {
    const label = T('feedback.type.' + value);
    const hint = T('feedback.type.' + value + '.hint');
    const input = communityEl('input');
    input.type = 'radio';
    input.name = 'feedback-type';
    input.value = value;
    input.id = 'feedback-type-' + value;
    const lab = communityEl('label', 'feedback-type');
    lab.htmlFor = input.id;
    lab.append(communityEl('span', 'feedback-type-name', label), communityEl('span', 'feedback-type-hint', hint));
    types.append(input, lab);
  }
  const area = document.getElementById('feedback-area');
  for (const value of FEEDBACK_AREAS_UI) {
    const o = communityEl('option', '', T('feedback.area.' + value));
    o.value = value;
    area.append(o);
  }
  const title = document.getElementById('feedback-title');
  const message = document.getElementById('feedback-message');
  const count = document.getElementById('feedback-count');
  const status = document.getElementById('feedback-status');
  const submit = document.getElementById('feedback-submit');

  // Türe göre açıklama kutusu neyin yazılacağını sorar (iyi hata raporu için yol gösterir).
  types.addEventListener('change', (e) => {
    if (FEEDBACK_TYPES_UI.includes(e.target.value)) message.placeholder = T('feedback.type.' + e.target.value + '.placeholder');
  });
  message.addEventListener('input', () => { count.textContent = message.value ? `${message.value.length} / 4000` : ''; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const session = _feedbackSession;
    const payload = {
      type: form.querySelector('input[name="feedback-type"]:checked')?.value || '',
      area: area.value,
      title: title.value,
      message: message.value,
      includeDiag: document.getElementById('feedback-diag').checked,
      contactOk: !!session && document.getElementById('feedback-contact').checked,
    };
    submit.disabled = true;
    status.className = 'review-status';
    status.textContent = T('community.sending');
    // Hesapla gönderiliyorsa oturum anahtarı zorunlu: yenilenemezse sessizce anonime düşülmez.
    const r = await withCommunityToken((token) => (session && !token
      ? Promise.resolve(SESSION_LOST)
      : sb.community.sendFeedback({ ...payload, token: session ? token : '' })));
    submit.disabled = false;
    if (r && r.ok) {
      status.className = 'review-status ok';
      status.textContent = session ? T('feedback.thanksTracked') : T('feedback.thanks');
      form.reset();
      count.textContent = '';
      message.placeholder = '';
      if (session) loadMyFeedback();
    } else {
      status.className = 'review-status err';
      status.textContent = (r && r.error) || T('feedback.failed');
    }
  });
  refreshFeedbackAccount();
}

async function refreshFeedbackAccount() {
  const note = document.getElementById('feedback-account-note');
  if (!note) return;
  _feedbackSession = await communitySession();
  if (!note.isConnected) return;
  document.getElementById('feedback-contact-row').hidden = !_feedbackSession;
  note.replaceChildren();
  if (_feedbackSession) {
    note.textContent = T('feedback.accountNote');
    loadMyFeedback();
    return;
  }
  const login = communityEl('button', 'link-btn', T('feedback.loginLink'));
  login.type = 'button';
  login.addEventListener('click', () => window.ilgezdiAuth?.open?.());
  // Cümle çeviride; düğme {login} yerine DOM düğümü olarak girer (metin kaçışlanmış kalır).
  const [before, after] = T('feedback.anonymousNote').split('{login}');
  note.append(before || '', login, after || '');
  document.getElementById('feedback-mine')?.replaceChildren(
    communityEl('p', 'page-empty', T('feedback.loginToTrack')));
}

async function loadMyFeedback() {
  const box = document.getElementById('feedback-mine');
  if (!box) return;
  const r = await withCommunityToken((token) => (token ? sb.community.myFeedback(token) : Promise.resolve(SESSION_LOST)));
  if (!box.isConnected) return;
  box.replaceChildren();
  if (!r || !r.ok) { box.append(communityEl('p', 'page-empty', (r && r.error) || T('feedback.listFailed'))); return; }
  if (!r.items.length) { box.append(communityEl('p', 'page-empty', T('feedback.none'))); return; }
  for (const it of r.items) {
    const card = communityEl('article', 'feedback-item');
    const head = communityEl('div', 'feedback-item-head');
    head.append(
      communityEl('span', 'feedback-chip ' + it.status, feedbackStatusText(it.status)),
      communityEl('span', 'feedback-item-type', FEEDBACK_TYPES_UI.includes(it.type) ? T('feedback.type.' + it.type) : ''));
    card.append(head, communityEl('div', 'feedback-item-title', it.title));
    if (it.reply) {
      const reply = communityEl('p', 'feedback-reply');
      reply.append(communityEl('strong', '', T('feedback.teamReply')), it.reply);
      card.append(reply);
    }
    const when = it.updatedAt || it.createdAt;
    if (when) card.append(communityEl('div', 'feedback-item-date', window.ilgezdiI18n.formatDate(when, { dateStyle: 'medium' })));
    box.append(card);
  }
}

// Çeviri cümlesindeki {ad} yerlerine metin ya da DOM düğümü koyar (kullanıcı adı gibi vurgulu
// parçalar için). Metin parçaları düz metin düğümü olarak girer: HTML işlenmez.
function richText(template, parts) {
  return String(template).split(/(\{\w+\})/).filter((s) => s !== '').map((piece) => {
    const m = /^\{(\w+)\}$/.exec(piece);
    if (!m || !Object.prototype.hasOwnProperty.call(parts, m[1])) return piece;
    const v = parts[m[1]];
    return v instanceof Node ? v : String(v);
  });
}

// ─── Şifre kaydetme önerisi ───────────────────────────────────────────────────
// Ana süreç (pw-capture) gönderilen girişi kasayla karşılaştırıp öneriyi yollar. Parola
// arayüze hiç gelmez: yalnızca site, kullanıcı adı ve öneri türü. Şerit yer imleri
// çubuğunun satırında durur (sayfa görünümü bu satırı örtmez); karar verilmezse 45 sn
// sonra kendiliğinden kapanır ("şimdi değil").
let pwOfferId = null;
let pwOfferTimer = null;

function hidePasswordOffer() {
  clearTimeout(pwOfferTimer);
  pwOfferId = null;
  const bar = document.getElementById('pw-offer');
  if (bar) bar.hidden = true;
}

function showPasswordOffer(offer) {
  const bar = document.getElementById('pw-offer');
  if (!bar || !offer || typeof offer.offerId !== 'string') return;
  pwOfferId = offer.offerId;
  const update = offer.action === 'update';
  const username = typeof offer.username === 'string' ? offer.username : '';
  const text = document.getElementById('pw-offer-text');
  const key = 'pwOffer.question.' + (update ? 'update' : 'new') + (username ? 'User' : '');
  text.replaceChildren(...richText(T(key), { host: String(offer.host || ''), user: communityEl('strong', 'pw-offer-user', username) }));
  if (offer.insecure) text.append(communityEl('span', 'pw-offer-warn', T('pwOffer.insecure')));
  document.getElementById('pw-offer-status').textContent = '';
  const save = document.getElementById('pw-offer-save');
  save.hidden = false;
  save.textContent = update ? T('pwOffer.update') : T('pwOffer.save');
  document.getElementById('pw-offer-never').hidden = update;
  bar.hidden = false;
  clearTimeout(pwOfferTimer);
  pwOfferTimer = setTimeout(() => decidePasswordOffer('dismiss'), 45000);
}

// Oluşturulan şifre form gönderilince sormadan kaydedildi: yalnızca bilgi verilir.
function showGeneratedPasswordSaved(d) {
  const bar = document.getElementById('pw-offer');
  if (!bar || !d) return;
  pwOfferId = null;
  const text = document.getElementById('pw-offer-text');
  const withUser = typeof d.username === 'string' && d.username;
  text.replaceChildren(...richText(T(withUser ? 'pwOffer.generatedSavedUser' : 'pwOffer.generatedSaved'),
    { host: String(d.host || ''), user: communityEl('strong', 'pw-offer-user', withUser ? d.username : '') }));
  document.getElementById('pw-offer-status').textContent = '';
  document.getElementById('pw-offer-save').hidden = true;
  document.getElementById('pw-offer-never').hidden = true;
  bar.hidden = false;
  clearTimeout(pwOfferTimer);
  pwOfferTimer = setTimeout(hidePasswordOffer, 6000);
}

async function decidePasswordOffer(action) {
  const id = pwOfferId;
  if (!id) { hidePasswordOffer(); return; }
  clearTimeout(pwOfferTimer);
  let r = null;
  try { r = await sb.passwords.saveDecision(id, action); } catch {}
  if (id !== pwOfferId) return;   // bu arada yeni bir öneri geldi
  if (action !== 'save') { hidePasswordOffer(); return; }
  const status = document.getElementById('pw-offer-status');
  if (!r || r.ok === false) {
    status.textContent = (r && r.error) || T('pwOffer.saveFailed');
    pwOfferTimer = setTimeout(hidePasswordOffer, 6000);
    return;
  }
  status.textContent = r.action === 'updated' ? T('pwOffer.updated') : T('pwOffer.saved');
  document.getElementById('pw-offer-save').hidden = true;
  document.getElementById('pw-offer-never').hidden = true;
  pwOfferTimer = setTimeout(hidePasswordOffer, 1800);
}

// Giriş/çıkış olunca açık topluluk sayfası yerinde güncellenir (yazılan öneri kaybolmaz).
window.addEventListener('ilgezdi-auth-changed', () => {
  if (acikSayfa() === 'discover') initReviewSection();
  else if (acikSayfa() === 'feedback') refreshFeedbackAccount();
});

// Google kısayolları (Haritalar, Gmail, YouTube) kaldırıldı (Burak, 16.09.2026): İlgezdi
// kullanıcıyı Google uygulamalarına yönlendirmez.
const QUICK_LINKS = [
  { name: 'Boy',    url: 'https://tr.wikipedia.org',        color: '#b85c3a', letter: 'B' },
  { name: 'Kurgan', url: 'https://github.com',              color: '#5a7a4a', letter: 'K' },
  { name: 'Tamga', url: 'https://duckduckgo.com',          color: '#c89540', letter: 'T' },
  { name: 'Damga', url: 'https://www.trthaber.com',        color: '#7a4a3a', letter: 'D' },
  { name: 'Arşiv', url: 'https://archive.org',             color: '#3a5a4a', letter: 'A' },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CARD_CATEGORY_KEYS = {
  'TARİH': 'cards.category.history', 'OSMANLI': 'cards.category.ottoman', 'CUMHURİYET': 'cards.category.republic',
  'COĞRAFYA': 'cards.category.geography', 'DİL': 'cards.category.language', 'KÜLTÜR': 'cards.category.culture',
};

function renderNewTab() {
  // Bilgi kartları (info-cards.js): her bilgi kaynağında doğrulandı. Öne çıkan "günün
  // bilgisi" güne göre değişir (aynı gün aynı kalır); diğer dördü her yeni sekmede, her biri
  // ayrı kategoriden karışık seçilir. Eski havuzdaki kaynaksız ve uydurma "haber" kartları
  // kaldırıldı (kullanıcı bildirdi).
  const H = window.ilgezdiHtml;
  const cards = Array.isArray(window.ILGEZDI_INFO_CARDS) ? window.ILGEZDI_INFO_CARDS : [];
  const dayIndex = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  const featured = cards.length ? cards[dayIndex % cards.length] : null;
  const picked = featured ? [{ ...featured, feature: true }] : [];
  const seenCategories = new Set(picked.map((c) => c.category));
  for (const c of shuffle(cards)) {
    if (picked.length === 5) break;
    if (!seenCategories.has(c.category)) { seenCategories.add(c.category); picked.push(c); }
  }
  const shortcutsHtml = QUICK_LINKS.map(link => `
    <button class="shortcut" data-url="${link.url}" title="${link.name}">
      <span class="tile-mark" style="background:linear-gradient(135deg,${link.color},color-mix(in srgb,${link.color} 55%,#000));box-shadow:0 6px 14px -8px ${link.color}88">
        <span>${link.letter}</span>
      </span>
      <span class="label">${link.name}</span>
    </button>
  `).join('');

  const newsHtml = picked.map((item) => {
    const src = H.safeUrl(item.sourceUrl);
    const link = src ? ` role="link" tabindex="0" data-source="${H.esc(src)}" title="${TH('cards.openSource', { name: item.sourceName })}"` : '';
    // Kart metni arayüz dilinde (tr.json'da kaynak metin); çevirisi yoksa Türkçe.
    const title = T('cards.' + item.id + '.title');
    const body = T('cards.' + item.id + '.body');
    const text = `
            <h4>${H.esc(title === 'cards.' + item.id + '.title' ? item.title : title)}</h4>
            <p>${H.esc(body === 'cards.' + item.id + '.body' ? item.body : body)}</p>
            <div class="card-source">${TH('cards.source', { name: item.sourceName })}</div>`;
    const category = CARD_CATEGORY_KEYS[item.category] ? T(CARD_CATEGORY_KEYS[item.category]) : item.category;
    if (item.feature) {
      return `
        <div class="news-card feature"${link}>
          <div class="feature-img"><span class="feature-emoji">${H.esc(item.icon)}</span></div>
          <div class="body-pad">
            <div class="meta"><span class="cat">${H.esc(category)}</span><span>${TH('cards.dayFact')}</span></div>${text}
          </div>
        </div>`;
    }
    return `
      <div class="news-card"${link}>
        <div class="meta"><span class="cat">${H.esc(item.icon)} ${H.esc(category)}</span></div>${text}
      </div>`;
  }).join('');

  return `
    <div class="newtab fade-up">
      <div class="newtab-greet">
        <div class="runes-greet">𐰚𐰢 𐱅𐰉𐰍𐰢</div>
        <h2>${TH('newtab.greeting')}</h2>
        <div class="sub">${TH('newtab.subgreeting')}</div>
      </div>
      <form class="big-search" id="newtab-search-form">
        <div class="field">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="newtab-search-input"
                 placeholder="${TH('newtab.searchPlaceholder')}"
                 autocomplete="off" spellcheck="false" autofocus />
          <button class="search-go" type="submit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="runes-hint">𐰉𐰽𐱃 𐰚𐰢 𐱅𐰢𐰍 · ${TH('newtab.searchHint')}</div>
      </form>
      <div class="shortcuts">
        ${shortcutsHtml}
      </div>
      <div class="http-report" id="newtab-http-report" hidden></div>
      <div class="section-head">
        <div class="title-block">
          <span class="runes">𐱅𐰇𐰼𐰰</span>
          <h3>${TH('newtab.cardsTitle')}</h3>
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
  // Bilgi kartı → kaynağı: tıklama/Enter aynı sekmede (kısayollar gibi), orta tık yeni sekmede.
  document.querySelectorAll('.news-card[data-source]').forEach((card) => {
    const url = window.ilgezdiHtml.safeUrl(card.dataset.source);
    if (!url) return;
    card.addEventListener('click', () => { hideScreen(); sb.navigate(url); });
    card.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); sb.newTab(url, { background: true }); } });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hideScreen(); sb.navigate(url); }
    });
    // Sayfa kaydırılabilir olduğundan orta tuş Chromium'da otomatik kaydırmayı başlatıp
    // auxclick'i yutuyordu (gerçek girdiyle görüldü) → basışta engelle.
    card.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  });
  // Haftalık şifresiz bağlantı özeti: yeni sekmede yalnızca HTTP ziyaret varsa görünür
  // (her şey şifreliyse yeni sekmeyi kalabalıklaştırmaz; o bilgi Geçmiş sayfasında).
  renderHttpReport('newtab-http-report').then(() => {
    const box = document.getElementById('newtab-http-report');
    if (box && !box.classList.contains('warn')) box.hidden = true;
  });
}

// ─── DOMContentLoaded ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  currentConfig = await sb.getConfig();
  // Göstergeyi yapılandırma bayrağından değil GERÇEK bağlantı durumundan başlat.
  updateVpnIndicator(false);
  sb.vpn?.getStatus?.().then((st) => updateVpnIndicator(st?.status === 'connected')).catch(() => {});

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
      badge.textContent = T('ui.incognitoBadge');
      brand.appendChild(badge);
    }
    document.title = T('ui.incognitoTitle');
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

  // Sekme konumu (üstte / yanda). Hemen uygulanır ve kaydedilir; Ayarlar'dan da seçilir.
  applyTabLayout(currentConfig);
  document.getElementById('btn-tab-layout')?.addEventListener('click', async () => {
    const vertical = !document.body.classList.contains('vertical-tabs');
    currentConfig = await sb.saveConfig({ verticalTabs: vertical }) || { ...currentConfig, verticalTabs: vertical };
    applyTabLayout(currentConfig);
    window.ilgezdiSync?.schedulePush?.();
  });
  document.getElementById('btn-vtabs-collapse')?.addEventListener('click', async () => {
    const collapsed = !document.body.classList.contains('vtabs-collapsed');
    currentConfig = await sb.saveConfig({ verticalTabsCollapsed: collapsed }) || { ...currentConfig, verticalTabsCollapsed: collapsed };
    applyTabLayout(currentConfig);
  });
  window.addEventListener('ilgezdi-settings-saved', async () => { currentConfig = await sb.getConfig(); applyTabLayout(currentConfig); });
  window.addEventListener('ilgezdi-sync-applied', async () => { currentConfig = await sb.getConfig(); applyTabLayout(currentConfig); });
  window.addEventListener('resize', reportContentLeft);
  document.getElementById('vtabs-list')?.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.tab')) openNewTab();
  });

  // Tab strip çift tıklama → yeni sekme
  document.querySelector('.tab-strip')?.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tab') || e.target.closest('#btn-new-tab')) return;
    openNewTab();
  });

  // Navigasyon
  document.getElementById('btn-back')?.addEventListener('click',    () => sb.goBack());
  document.getElementById('btn-forward')?.addEventListener('click', () => sb.goForward());
  document.getElementById('btn-reload')?.addEventListener('click',  () => (reloadIsStop ? sb.stop?.() : sb.reload()));
  document.getElementById('btn-home')?.addEventListener('click', () => {
    const hp = (currentConfig.homepage || '').trim();
    if (hp && hp !== 'about:blank') sb.navigate(hp);
    else sb.newTab('about:blank'); // boş anasayfa → İlgezdi başlangıç sayfası
  });

  // Adres çubuğu ve öneriler (omnibox.js; kaynak yalnızca cihazdaki geçmiş ve yer imleri,
  // yazılan harf hiçbir sunucuya gitmez). Gizli pencerede geçmiş önerisi gösterilmez.
  const addressBar = document.getElementById('address-bar');
  let suggestItems = [];
  let suggestIndex = -1;
  let suggestTyped = '';
  let suggestTimer = null;

  function hideSuggestions() {
    clearTimeout(suggestTimer);
    suggestItems = [];
    suggestIndex = -1;
    sb.suggest?.hide();
  }
  async function showSuggestions() {
    const typed = addressBar.value.trim();
    suggestTyped = typed;
    if (!typed) { hideSuggestions(); return; }
    const O = window.ilgezdiOmnibox;
    let items = [];
    // Veri ve Gizlilik › "Adres çubuğunda geçmişten öneriler" kapalıysa yalnızca arama satırı.
    let historyOn = true;
    try { historyOn = (await sb.getConfig())?.omniboxHistory !== false; } catch {}
    if (O && !isIncognito && historyOn) {
      let history = [];
      try { history = (await sb.logs.search({ text: typed, limit: 120 }))?.items || []; } catch {}
      let bookmarks = [];
      try { bookmarks = JSON.parse(localStorage.getItem('ilgezdi-bm-items') || '[]'); } catch {}
      items = O.rankSuggestions({ query: typed, history, bookmarks, limit: 8 });
    }
    // Yazılan metin adres değilse en sona "ara" satırı; adres ise gerek yok.
    if (!O || !O.looksLikeUrl(typed)) {
      items = items.slice(0, 7).concat([{ url: typed, title: T('omnibox.search', { query: typed }), kind: 'search' }]);
    }
    if (addressBar.value.trim() !== typed) return;        // kullanıcı yazmaya devam etti
    suggestItems = items;
    if (suggestIndex >= items.length) suggestIndex = -1;
    if (!items.length) { hideSuggestions(); return; }
    const r = addressBar.getBoundingClientRect();
    sb.suggest?.show({ rect: { x: r.x, y: r.y, width: r.width, height: r.height }, items, selected: suggestIndex });
  }
  function moveSuggestion(delta) {
    if (!suggestItems.length) return false;
    suggestIndex += delta;
    if (suggestIndex < -1) suggestIndex = suggestItems.length - 1;
    if (suggestIndex >= suggestItems.length) suggestIndex = -1;
    const item = suggestItems[suggestIndex];
    addressBar.value = item ? (item.kind === 'search' ? suggestTyped : item.url) : suggestTyped;
    const r = addressBar.getBoundingClientRect();
    sb.suggest?.show({ rect: { x: r.x, y: r.y, width: r.width, height: r.height }, items: suggestItems, selected: suggestIndex });
    return true;
  }
  function goSuggestion(url) {
    hideSuggestions();
    hideScreen();
    sb.navigate(url);
  }

  addressBar?.addEventListener('input', () => {
    suggestIndex = -1;
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(showSuggestions, 70);
  });
  addressBar?.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
  sb.suggest?.onPicked((url) => { if (url) goSuggestion(url); });

  addressBar?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (moveSuggestion(e.key === 'ArrowDown' ? 1 : -1)) e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const picked = suggestItems[suggestIndex];
      const val = picked && picked.kind !== 'search' ? picked.url : addressBar.value.trim();
      if (val) goSuggestion(val);
    }
    if (e.key === 'Escape') {
      if (suggestItems.length) { hideSuggestions(); return; }
      addressBar.blur();
    }
  });
  addressBar?.addEventListener('focus', () => setTimeout(() => addressBar.select(), 50));

  document.getElementById('address-bar-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = addressBar?.value.trim();
    if (val) { hideScreen(); sb.navigate(val); }
  });

  // Gizli pencere
  document.getElementById('btn-incognito')?.addEventListener('click', () => sb.openIncognito());
  document.getElementById('btn-tab-search')?.addEventListener('click', openTabsScreen);
  document.getElementById('btn-reader')?.addEventListener('click', openReader);

  // ── Kenar çubuğu — sayfa butonları (data-screen) ─────────────────────────
  document.querySelectorAll('.sidebar-btn[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      if (currentScreen === screen) {
        hideScreen();
        return;
      }
      if (screen === 'newtab') {
        showScreen('newtab', renderNewTab).then(initNewTabEvents);
      } else if (PAGE_PANELS[screen]) {
        openPagePanel(screen);
      } else {
        showScreen(screen, () => `
          <div class="page fade-up">
            <div class="page-head">
              <h1>${window.ilgezdiHtml.esc(screen)}</h1>
            </div>
            <p style="color:var(--text-muted);padding:24px;font-size:14px">${TH('ui.comingSoon')}</p>
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
  sb.tabGroups?.onRename?.(({ groupId } = {}) => { if (groupId) startGroupRename(String(groupId)); });
  sb.passwords?.onSaveOffer?.(showPasswordOffer);
  sb.passwords?.onGeneratedSaved?.(showGeneratedPasswordSaved);
  document.getElementById('pw-offer')?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-pw-action]');
    if (btn) decidePasswordOffer(btn.dataset.pwAction);
  });
  sb.onActiveUrl((url) => {
    updateAddressBar(url);
    if (document.getElementById('panel-siteinfo')?.classList.contains('visible')) loadSiteInfo();
    // Boş sekme → İlgezdi yeni sekme sayfasını göster; gerçek URL → gizle
    const blank = !url || url === 'about:blank' || url === 'ilgezdi://newtab';
    if (blank) {
      if (currentScreen !== 'newtab') {
        showScreen('newtab', renderNewTab).then(initNewTabEvents);
      } else {
        // Zaten newtab ekranındayız ama main süreci setActiveTab ile boş
        // WebContentsView'ı yeniden göstermiş olabilir → tekrar gizle (aksi halde
        // ~1sn sonra boş beyaz ekran overlay'in üstünü kapatıyor).
        sb.hideActiveTab?.();
      }
    } else if (currentScreen === 'newtab') {
      hideScreen();
    } else if (currentScreen === 'reader' && url !== readerSourceUrl) {
      // Sekme değişti ya da sayfa başka adrese gitti: okuma modu o sayfaya aitti.
      hideScreen();
    } else if (!currentScreen) {
      // Güvenlik ağı: gerçek sayfa + ekran overlay'i yok → view görünür olmalı.
      // (Auth ekranı gibi bir modal açıkken dokunma — o kapanırken kendisi
      // showActiveTab çağırır.) Sekme geçişinde takılı-gizli durumu kurtarır.
      if (!isAuthScreenOpen()) sb.showActiveTab?.();
    }
  });
  // getStatus() { status, … } döndürür; `connected` diye bir alan YOKTU —
  // başlık çubuğundaki gösterge bu yüzden hiç yanmıyordu (denetim D-01).
  sb.onVpnStatus?.((data) => updateVpnIndicator(data?.status === 'connected'));

  // ── Sayfada bul (Ctrl+F) ──────────────────────────────────────────────────
  const findBar   = document.getElementById('find-bar');
  const findInput = document.getElementById('find-input');
  const findCount = document.getElementById('find-count');
  let findTimer   = null;
  let findSession = '';     // son yeni arama oturumunun metni

  function renderFindCount(result) {
    if (!findInput.value) {
      findCount.textContent = '';
      findCount.classList.remove('none');
      return;
    }
    if (!result) return;
    findCount.textContent = result.matches ? result.active + '/' + result.matches : '0/0';
    findCount.classList.toggle('none', !result.matches);
  }

  function runFind(forward, newSession) {
    clearTimeout(findTimer);
    if (!findInput.value) {
      findSession = '';
      sb.find?.stop();
      renderFindCount(null);
      return;
    }
    if (newSession) findSession = findInput.value;
    sb.find?.start(findInput.value, { forward, newSession });
  }

  function openFindBar() {
    // Yeni sekme ya da bir İlgezdi sayfası açıkken aranacak web sayfası yok.
    if (currentScreen) return;
    findBar.hidden = false;
    findInput.focus();
    findInput.select();
    if (findInput.value) runFind(true, true);
  }

  function closeFindBar(focusPage) {
    if (findBar.hidden) return;
    clearTimeout(findTimer);
    findBar.hidden = true;
    findSession = '';
    findCount.textContent = '';
    sb.find?.stop({ focusPage: !!focusPage });
  }

  function findStep(forward) {
    if (findBar.hidden || !findInput.value) { openFindBar(); return; }
    // Metin değiştiyse ve gecikmeli arama henüz gitmediyse yeni oturum başlat.
    runFind(forward, findInput.value !== findSession);
  }

  findInput?.addEventListener('input', () => {
    clearTimeout(findTimer);
    findTimer = setTimeout(() => runFind(true, true), 120);
  });
  findInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findStep(!e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFindBar(true); }
  });
  document.getElementById('find-prev')?.addEventListener('click', () => findStep(false));
  document.getElementById('find-next')?.addEventListener('click', () => findStep(true));
  document.getElementById('find-close')?.addEventListener('click', () => closeFindBar(true));
  sb.find?.onResult((r) => { if (!findBar.hidden) renderFindCount(r); });
  sb.find?.onReset(() => closeFindBar(false));

  // ── Yakınlaştırma göstergesi ──────────────────────────────────────────────
  const zoomBtn = document.getElementById('zoom-indicator');
  zoomBtn?.addEventListener('click', () => sb.zoom?.reset());
  sb.zoom?.onChanged((data) => {
    if (!zoomBtn) return;
    const pct = Math.round((Number(data?.factor) || 1) * 100);
    const def = Math.round((Number(data?.defaultFactor) || 1) * 100);
    // Varsayılan sayfa yakınlaştırmasındayken (Ayarlar) gösterge gizli; sıfırla varsayılana döner.
    zoomBtn.hidden = pct === def;
    zoomBtn.textContent = '%' + pct;
    zoomBtn.setAttribute('aria-label', T('ui.zoomLabel', { percent: pct }));
  });

  // ── Site bilgisi (kilit simgesi) ve engellenen açılır pencereler ───────────
  const siteBtn  = document.getElementById('security-icon');
  const popupBtn = document.getElementById('popup-blocked-indicator');
  const siteInfoOpen = () => document.getElementById('panel-siteinfo')?.classList.contains('visible');
  siteBtn?.addEventListener('click', () => togglePanel('siteinfo', siteBtn, loadSiteInfo));
  popupBtn?.addEventListener('click', () => {
    if (siteInfoOpen()) loadSiteInfo();
    else togglePanel('siteinfo', siteBtn, loadSiteInfo);
  });
  sb.site?.onPopupState((data) => {
    const n = Number(data?.count) || 0;
    if (!popupBtn) return;
    popupBtn.hidden = n === 0;
    const c = document.getElementById('popup-blocked-count');
    if (c) c.textContent = String(n);
    popupBtn.setAttribute('aria-label', T('ui.popupBlockedLabel', { count: n }));
    if (n && siteInfoOpen()) loadSiteInfo();
  });

  // ── İndirmeler: canlı durum ve kenar çubuğu rozeti ──────────────────────────
  sb.downloads?.list?.().then((list) => {
    for (const d of list || []) downloadsView.set(d.id, d);
    updateDownloadsBadge();
  }).catch(() => {});
  sb.downloads?.onUpdated?.((d) => {
    if (!d || d.id == null) return;
    downloadsView.set(d.id, { ...(downloadsView.get(d.id) || {}), ...d });
    updateDownloadsBadge();
    if (acikSayfa() === 'downloads') renderDownloadsList();
  });

  // ── Klavye kısayolları ────────────────────────────────────────────────────
  // Kısayolların tamamı ana süreçte (browser-commands.js) yakalanır. Eskiden
  // buradaydı ve odak sayfadayken hiçbiri çalışmıyordu. Arayüze ait olanlar
  // 'browser-command' olarak buraya gelir.
  sb.onBrowserCommand?.((cmd) => {
    switch (cmd) {
      case 'new-tab':          openNewTab(); break;
      case 'focus-address':    addressBar?.focus(); break;
      case 'find':             openFindBar(); break;
      case 'find-next':        findStep(true); break;
      case 'find-prev':        findStep(false); break;
      case 'bookmark-page':    if (!isIncognito) document.getElementById('btn-bookmark-star')?.click(); break;
      case 'settings':         document.getElementById('btn-settings')?.click(); break;
      case 'passwords':        window.ilgezdiOpenSettings?.('passwords'); break;
      case 'toggle-bookmarks': document.getElementById('btn-bookmarks')?.click(); break;
      case 'logs':             document.getElementById('btn-logs')?.click(); break;
      case 'vpn-panel':        document.getElementById('btn-vpn-panel')?.click(); break;
      case 'history-page':     document.getElementById('sb-history')?.click(); break;
      case 'downloads-page':   document.getElementById('sb-downloads')?.click(); break;
      case 'tab-search':       openTabsScreen(); break;
      case 'reader':           openReader(); break;
    }
  });

  // Durum çubuğu bildirimi: sayfa görünümü arayüzün üstünde çizildiği için köşe bildirimi
  // web sayfası açıkken görünmez; durum çubuğu sayfanın altında her zaman görünür.
  const statusNote = document.getElementById('status-note');
  let statusNoteTimer = null;
  sb.onStatusNote?.((d) => {
    if (!statusNote || !d || typeof d.text !== 'string') return;
    statusNote.textContent = d.text.slice(0, 160);
    statusNote.classList.toggle('error', d.error === true);
    if (typeof d.reveal === 'string') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-note-btn';
      btn.textContent = T('ui.showInFolder');
      btn.addEventListener('click', () => sb.revealScreenshot?.(d.reveal));
      statusNote.append(btn);
    }
    statusNote.hidden = false;
    clearTimeout(statusNoteTimer);
    statusNoteTimer = setTimeout(() => { statusNote.hidden = true; statusNote.textContent = ''; }, 10000);
  });

  // Esc ana süreçte yakalanmaz: önce bul çubuğu, sonra ekran, sonra paneller kapanır.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Giriş penceresi en üstte: Esc önce onu kapatır, altındaki Ayarlar açık kalır.
    if (isAuthScreenOpen()) window.ilgezdiAuth?.close?.();
    else if (!findBar.hidden) closeFindBar(true);
    else if (currentScreen) hideScreen();
    else {
      const anyPanel = ALL_PANELS.some((n) => document.getElementById(`panel-${n}`)?.classList.contains('visible'));
      closeAllPanels();
      // Kapatılacak bir şey yoksa yüklenen sayfa durdurulur (yenile düğmesindeki "Esc").
      if (!anyPanel && reloadIsStop) sb.stop?.();
    }
  });

  // Marka logolarını enjekte et (toolbar + auth)
  injectBrandMarks();

  // Durum çubuğundaki sürüm — eskiden index.html'e sabit "v0.6" yazılıydı (D-02).
  sb.updater?.currentVersion?.().then((v) => {
    const el = document.getElementById('status-version');
    if (el && v) el.textContent = T('ui.versionLabel', { version: v });
  }).catch(() => {});

  // İlk açılışta yeni sekme ekranını göster. Olaylar içerik eklendikten SONRA bağlanır:
  // showScreen önce sekme görünümünü gizlemeyi (IPC) bekliyor; requestAnimationFrame
  // ondan önce çalışıp boş sayfaya bağlanıyordu (kartlar, arama, kısayollar tepkisizdi).
  showScreen('newtab', renderNewTab).then(initNewTabEvents);

  console.log('[İlgezdi] UI hazır');
});
