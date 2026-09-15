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
  const d = new Date(ts);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function truncateUrl(url, maxLen = 80) {
  return url.length > maxLen ? url.slice(0, maxLen) + '…' : url;
}

// ─── Panel Yönetimi ────────────────────────────────────────────────────────────
const ALL_PANELS = ['settings', 'logs', 'bookmarks', 'blocker', 'shield', 'vpn', 'arku', 'siteinfo'];

function closeAllPanels() {
  ALL_PANELS.forEach(name => {
    const panel = document.getElementById(`panel-${name}`);
    if (!panel) return;
    panel.classList.remove('visible');
    panel.classList.add('hidden');
  });
  // Panel butonlarının aktif stilini kaldır (data-screen butonlarına dokunma)
  ['btn-shield', 'btn-bookmarks', 'btn-logs', 'btn-blocker', 'btn-settings', 'btn-arku', 'security-icon'].forEach(id => {
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

  const overlay = document.getElementById('screen-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    clearTimeout(screenHideTimer);
    screenHideTimer = setTimeout(() => {
      screenHideTimer = null;
      if (!currentScreen) overlay.classList.add('hidden');
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
  lbl.textContent = enabled ? 'VPN Aktif' : 'VPN Kapalı';
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
  btn.title = loading ? 'Yüklemeyi durdur (Esc)' : 'Yenile (F5)';
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('is-loading', loading);
}

function renderTabs(tabs) {
  currentTabs = tabs;
  updateReloadButton(tabs.find((t) => t.isActive));
  const container = document.getElementById('tabs-container');
  if (!container) return;
  // Klavye odağı bir sekmedeyse yeniden çizimden sonra aynı sekmeye geri verilir.
  const focusedId = document.activeElement?.closest?.('.tab')?.dataset.id;
  container.innerHTML = '';

  tabs.forEach(tab => {
    const label = tab.title || tab.url || 'Yeni Sekme';
    const el = document.createElement('div');
    el.className = 'tab' + (tab.isActive ? ' active' : '') + (tab.pinned ? ' pinned' : '');
    el.dataset.id = tab.id;
    el.draggable = true;
    // Sabitlenmiş sekme yalnızca alan adının baş harfini gösterir; adı ekran okuyucu için etikette.
    let initial = '•';
    try { initial = (new URL(tab.url).hostname.replace(/^www\./, '')[0] || '•').toLocaleUpperCase('tr'); } catch {}
    el.dataset.initial = initial;
    if (tab.pinned) el.setAttribute('aria-label', label + ' (sabitlenmiş)');
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

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.tabIndex = -1;                                   // klavyede Ctrl+W
    closeBtn.setAttribute('aria-label', 'Sekmeyi kapat: ' + label);
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sb.closeTab(tab.id);
    });

    el.appendChild(title);
    if (tab.audible || tab.muted) {
      const audio = document.createElement('button');
      audio.className = 'tab-audio' + (tab.muted ? ' muted' : '');
      audio.tabIndex = -1;
      audio.title = tab.muted ? 'Sekmenin sesini aç' : 'Sekmeyi sessize al';
      audio.setAttribute('aria-label', (tab.muted ? 'Sesi aç: ' : 'Sessize al: ') + label);
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
      } else if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const all = [...container.querySelectorAll('.tab')];
        const i = all.indexOf(el);
        const target = e.key === 'Home' ? all[0]
          : e.key === 'End' ? all[all.length - 1]
          : all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
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
}

// ─── Adres Çubuğu ────────────────────────────────────────────────────────────
function updateAddressBar(url) {
  const bar = document.getElementById('address-bar');
  if (bar && document.activeElement !== bar) bar.value = url || '';

  const icon = document.getElementById('security-icon');
  if (icon) {
    if (url?.startsWith('https://')) {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
      icon.title = 'Site bilgisi · Bağlantı güvenli (HTTPS)';
      icon.style.color = 'var(--gold)';
    } else if (url?.startsWith('http://')) {
      icon.innerHTML = '⚠️'; icon.title = 'Site bilgisi · Bağlantı güvenli değil (HTTP)';
      icon.style.color = 'var(--warning)';
    } else {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
      icon.title = 'Site bilgisi';
      icon.style.color = 'var(--ink-mute)';
    }
  }

  const statusUrl = document.getElementById('status-url');
  if (statusUrl) statusUrl.textContent = url ? truncateUrl(url) : '';
}

// ─── Koruma Durumu ────────────────────────────────────────────────────────────
// ─── Site Bilgisi (kilit simgesi) ─────────────────────────────────────────────
// Bağlantı ve sertifika, bu sitenin izinleri, engellenen açılır pencereler,
// yakınlaştırma ve site verisini silme. Kararlar ana süreçte doğrulanır.
const SITE_DECISION_OPTIONS = {
  ask:     [['ask', 'Sor (varsayılan)'], ['allow', 'İzin ver'], ['block', 'Engelle']],
  popups:  [['default', 'Yalnızca tıklayınca (varsayılan)'], ['allow', 'Her zaman izin ver'], ['block', 'Her zaman engelle']],
  cookies: [['default', 'Genel ayarı kullan'], ['allow', 'Bu sitede izin ver']],
};

function formatTrDate(ms) {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return '—'; }
}

async function loadSiteInfo() {
  const body = document.getElementById('siteinfo-body');
  if (!body) return;
  const H = window.ilgezdiHtml;
  let info = null;
  try { info = await sb.site?.info?.(); } catch {}
  if (!info || !info.origin) {
    body.innerHTML = '<p class="si-empty">Bu sekmede bir web sitesi açık değil.</p>';
    return;
  }

  const secure = info.scheme === 'https';
  const cert = info.certificate;
  const certBad = !!(cert && !cert.ok);
  const statusText = !secure ? 'Bağlantı güvenli değil' : certBad ? 'Sertifika sorunlu' : 'Bağlantı güvenli';

  const certHtml = !secure
    ? '<p class="si-note">Bu site şifrelenmemiş HTTP kullanıyor. Parola ya da kart bilgisi girmeyin.</p>'
    : cert
      ? `<dl class="si-dl">
          <dt>Kime verildi</dt><dd>${H.esc(cert.subject || '—')}</dd>
          <dt>Veren</dt><dd>${H.esc(cert.issuer || '—')}${cert.issuerOrg ? ' · ' + H.esc(cert.issuerOrg) : ''}</dd>
          <dt>Geçerlilik</dt><dd>${H.esc(formatTrDate(cert.validFrom))} – ${H.esc(formatTrDate(cert.validTo))}</dd>
          <dt>Parmak izi</dt><dd class="si-mono">${H.esc(cert.fingerprint || '—')}</dd>
          ${cert.error ? `<dt>Sorun</dt><dd class="si-bad">${H.esc(cert.error)}</dd>` : ''}
        </dl>`
      : '<p class="si-note">Sertifika ayrıntısı bu oturumda henüz alınmadı; sayfayı yenileyince görünür.</p>';

  const permRows = (info.permissions || []).map((p) => {
    const kind = p.permission === 'popups' ? 'popups' : p.permission === 'third-party-cookies' ? 'cookies' : 'ask';
    let opts = SITE_DECISION_OPTIONS[kind];
    if (!opts.some(([v]) => v === p.decision)) opts = [...opts, [p.decision, p.decision === 'block' ? 'Engelle' : p.decision]];
    const id = 'si-perm-' + p.permission;
    const options = opts.map(([v, t]) => `<option value="${H.esc(v)}" ${p.decision === v ? 'selected' : ''}>${H.esc(t)}</option>`).join('');
    return `<div class="si-perm"><label for="${H.esc(id)}">${H.esc(p.label)}</label><select id="${H.esc(id)}" data-permission="${H.esc(p.permission)}">${options}</select></div>`;
  }).join('');

  const popupsHtml = (info.blockedPopups || []).length
    ? `<div class="si-sec"><h3>Engellenen açılır pencereler</h3>${info.blockedPopups.map((u, i) => `
        <div class="si-popup"><span class="si-mono" title="${H.esc(u)}">${H.esc(truncateUrl(u, 46))}</span>
        <button type="button" class="si-btn" data-open-popup="${i}">Aç</button></div>`).join('')}</div>`
    : '';

  const pct = Math.round((Number(info.zoom) || 1) * 100);
  const zoomHtml = pct !== 100
    ? `<div class="si-sec si-row"><span>Yakınlaştırma %${pct}</span><button type="button" class="si-btn" id="si-zoom-reset">Sıfırla</button></div>`
    : '';

  body.innerHTML = `
    <div class="si-head">
      <div class="si-host">${H.esc(info.host)}</div>
      <div class="si-status ${secure && !certBad ? 'ok' : 'bad'}">${H.esc(statusText)}</div>
    </div>
    <div class="si-sec"><h3>Bağlantı ve sertifika</h3>${certHtml}</div>
    ${popupsHtml}
    <div class="si-sec"><h3>Bu site için izinler</h3>${permRows}
      <p class="si-note">Değişiklik hemen kaydedilir. Kamera ve konum gibi izinler sitenin bir sonraki isteğinde geçerli olur.</p>
    </div>
    ${zoomHtml}
    <div class="si-sec">
      <button type="button" class="si-btn danger" id="si-clear-data">Çerezleri ve site verilerini sil</button>
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
      result(r && r.ok ? 'Kaydedildi' : (r && r.error) || 'Kaydedilemedi', !(r && r.ok));
    });
  });
  body.querySelectorAll('[data-open-popup]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await sb.site.openBlockedPopup(Number(btn.dataset.openPopup));
      loadSiteInfo();
    });
  });
  document.getElementById('si-zoom-reset')?.addEventListener('click', async () => {
    await sb.zoom?.reset();
    loadSiteInfo();
  });
  document.getElementById('si-clear-data')?.addEventListener('click', async () => {
    const r = await sb.site.clearData(info.origin);
    if (r && r.canceled) return;
    result(r && r.ok ? 'Bu sitenin çerezleri ve verileri silindi' : (r && r.error) || 'Silinemedi', !(r && r.ok));
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
    { name: 'VPN Bağlantısı', on: vpnOn,
      note: vpnOn ? '' : (vpn?.status === 'dropped' ? 'bağlantı koptu' : 'bağlı değil') },
    { name: 'Kill Switch', on: !!vpn?.killSwitch,
      note: vpn?.killSwitchSupported === false ? 'bu platformda yok' : (vpnOn ? '' : 'VPN kapalı') },
    { name: 'İzleyici Engelleme', on: cfg.blockTrackers !== false },
    { name: 'Reklam Engelleme',   on: cfg.blockAds !== false },
    { name: 'Yalnızca HTTPS',     on: !!cfg.httpsOnly },
    { name: 'Üçüncü Taraf Çerez Engeli', on: cfg.blockThirdPartyCookies !== false },
    { name: 'Şifreli Ziyaret Günlüğü',
      on: cfg.logEnabled !== false && logStats?.encrypted !== false,
      note: cfg.logEnabled === false ? 'kapalı' : (logStats?.encrypted === false ? 'şifreleme kullanılamıyor' : '') },
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
        Bugün ${Number(block?.today) || 0} istek engellendi
      </div>
    </div>
    ${items.map(item => `
      <div class="shield-item">
        <span class="shield-name">${H.esc(item.name)}${item.note ? ` <span style="color:var(--text-muted);font-size:11px">· ${H.esc(item.note)}</span>` : ''}</span>
        <span class="shield-status ${item.on ? 'status-on' : 'status-off'}">
          ${item.on ? '✓ Aktif' : '✗ Kapalı'}
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
  return (s[0] || '?').toLocaleUpperCase('tr');
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const historyView = { text: '', page: 1, items: [], total: 0, logEnabled: true };

function renderHistoryPage() {
  return `
    <div class="page fade-up" id="history-page">
      <div class="page-head">
        <div>
          <h1>Geçmiş</h1>
          <p class="page-sub">Ziyaret günlüğü yalnızca bu cihazda şifreli saklanır. Gizli pencere kaydedilmez.</p>
        </div>
        <div class="right">
          <label class="page-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="history-search" placeholder="Geçmişte ara" aria-label="Geçmişte ara" autocomplete="off">
          </label>
          <button type="button" class="page-btn danger" id="history-clear">Tümünü temizle</button>
        </div>
      </div>
      <div class="http-report" id="history-http-report" hidden></div>
      <div class="list" id="history-list" aria-live="polite"></div>
      <div class="page-more"><button type="button" class="page-btn" id="history-more" hidden>Daha fazla göster</button></div>
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
  const fmt = new Intl.NumberFormat('tr-TR');
  const title = document.createElement('div');
  title.className = 'http-report-title';
  const body = document.createElement('div');
  body.className = 'http-report-body';
  box.classList.toggle('warn', report.http > 0);
  if (!report.http) {
    title.textContent = 'Son 7 günde tüm ziyaretleriniz şifreli bağlantıyla (HTTPS) yapıldı';
    body.textContent = `${fmt.format(report.total)} ziyaret · şifresiz (HTTP) bağlantı yok`;
  } else {
    title.textContent = `Son 7 günde ${fmt.format(report.http)} ziyaret şifresiz bağlantıyla (HTTP) yapıldı`;
    const names = report.top.map((t) => `${t.domain} (${fmt.format(t.count)})`).join(', ');
    body.textContent = `${fmt.format(report.httpDomains)} sitede${names ? ': ' + names : ''}. Bu sayfalarda girilen bilgiler aynı ağdaki başkaları tarafından okunabilir.`;
  }
  box.replaceChildren(title, body);
  if (report.http && !cfg.httpsOnly) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    btn.textContent = 'Yalnızca HTTPS’i aç';
    btn.addEventListener('click', async () => {
      try {
        const current = await sb.getConfig();
        await sb.saveConfig({ ...current, httpsOnly: true });
        const done = document.createElement('span');
        done.className = 'http-report-done';
        done.textContent = 'Yalnızca HTTPS açıldı ✓';
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
    const msg = historyView.text ? 'Aramayla eşleşen kayıt yok.'
      : historyView.logEnabled ? 'Henüz geçmiş yok.'
      : 'Ziyaret günlüğü kapalı. Ayarlar › Gizlilik bölümünden açabilirsiniz.';
    box.innerHTML = `<p class="page-empty">${H.esc(msg)}</p>`;
  } else {
    let html = '';
    let lastDay = '';
    for (const it of historyView.items) {
      if (!isWebHref(it.url)) continue;   // eski sürümlerin günlüğe yazdığı boş sekme kayıtları
      const day = dayLabel(it.timestamp);
      if (day !== lastDay) { html += `<div class="list-day">${H.esc(day)}</div>`; lastDay = day; }
      const time = new Date(it.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const name = it.title || it.url;
      // Şifresiz (HTTP) ziyaret işaretlenir: "Yalnızca HTTPS" kapalı kullanıcı nerede
      // şifresiz bağlantı kullandığını görebilsin (kullanıcı önerisi).
      const insecure = /^http:\/\//i.test(it.url);
      const scheme = insecure
        ? '<span class="lr-scheme http" title="Şifresiz bağlantı (HTTP): bu sayfaya gönderilen bilgiler ağda okunabilir">HTTP</span>'
        : '<span class="lr-scheme https" title="Şifreli bağlantı (HTTPS)" aria-label="HTTPS">🔒</span>';
      html += `
        <div class="list-row${insecure ? ' is-http' : ''}" role="link" tabindex="0" data-url="${H.esc(it.url)}">
          <span class="lr-icon" style="background:${iconColorFor(it.domain)}" aria-hidden="true">${H.esc(initialFor(it.domain))}</span>
          <span class="lr-title">${H.esc(name)}</span>
          <span class="lr-url">${scheme}${H.esc(it.domain || '')}</span>
          <span class="lr-time">${H.esc(time)}</span>
          <button type="button" class="lr-more" data-delete="${H.esc(it.id)}" title="Geçmişten sil" aria-label="Geçmişten sil: ${H.esc(name)}">✕</button>
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
    if (!confirm('Tüm ziyaret geçmişi silinsin mi? Bu işlem geri alınamaz.')) return;
    await sb.logs.clearLogs();
    loadHistory(true);
  });

  const list = document.getElementById('history-list');
  const open = (row, newTab) => {
    const url = row && row.dataset.url;
    if (!isWebHref(url)) return;
    if (newTab) sb.newTab(url);
    else { hideScreen(); sb.navigate(url); }
  };
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
    if (row) open(row, e.ctrlKey || e.metaKey);
  });
  list?.addEventListener('auxclick', (e) => {
    const row = e.button === 1 && e.target.closest('.list-row');
    if (row) { e.preventDefault(); open(row, true); }
  });
  // Liste kaydırılabilir: orta tuş otomatik kaydırmayı başlatıp auxclick'i yutmasın.
  list?.addEventListener('mousedown', (e) => {
    if (e.button === 1 && e.target.closest('.list-row')) e.preventDefault();
  });
  list?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.closest('[data-delete]')) return;
    const row = e.target.closest('.list-row');
    if (row) open(row, e.ctrlKey);
  });
}

// ─── İndirilenler sayfası ─────────────────────────────────────────────────────
const downloadsView = new Map();   // id → ana süreçteki kayıt
const DL_STATE_TEXT = {
  completed: 'Tamamlandı', cancelled: 'İptal edildi', interrupted: 'Yarıda kaldı',
  progressing: 'İndiriliyor', paused: 'Duraklatıldı',
};

function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let x = Number(n) || 0;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return x.toLocaleString('tr-TR', { maximumFractionDigits: i ? 1 : 0 }) + ' ' + units[i];
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
  btn.setAttribute('aria-label', active ? 'İndirmeler, ' + active + ' indirme sürüyor' : 'İndirmeler');
}

function renderDownloadsPage() {
  return `
    <div class="page fade-up" id="downloads-page">
      <div class="page-head">
        <div>
          <h1>İndirilenler</h1>
          <p class="page-sub">Liste bu cihazda şifreli saklanır; gizli pencere indirmeleri kaydedilmez. Listeden kaldırmak dosyayı silmez.</p>
        </div>
        <div class="right"><button type="button" class="page-btn" id="downloads-clear">Listeyi temizle</button></div>
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
    box.innerHTML = '<p class="page-empty">Henüz indirme yok.</p>';
    return;
  }
  box.innerHTML = items.map((d) => {
    const id = H.esc(String(d.id));
    const running = d.state === 'progressing' || d.state === 'paused';
    const state = d.state === 'paused' || (running && d.paused) ? 'paused' : d.state;
    const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
    const missing = d.state === 'completed' && d.exists === false;
    const sizeText = running ? formatBytes(d.received) + (d.total ? ' / ' + formatBytes(d.total) : '') : formatBytes(d.total || d.received);
    const status = missing ? 'Dosya taşınmış ya da silinmiş' : (DL_STATE_TEXT[state] || state);
    const ext = (String(d.filename).includes('.') ? String(d.filename).split('.').pop() : '').slice(0, 4).toUpperCase() || 'DOS';
    const actions = [];
    if (running) {
      actions.push(`<button type="button" class="page-btn sm" data-dl="pause" data-id="${id}">${state === 'paused' ? 'Sürdür' : 'Duraklat'}</button>`);
      actions.push(`<button type="button" class="page-btn sm" data-dl="cancel" data-id="${id}">İptal</button>`);
    } else {
      if (d.state === 'completed' && !missing) {
        actions.push(`<button type="button" class="page-btn sm" data-dl="open" data-id="${id}">Aç</button>`);
        actions.push(`<button type="button" class="page-btn sm" data-dl="show" data-id="${id}">Klasörde göster</button>`);
      }
      actions.push(`<button type="button" class="page-btn sm ghost" data-dl="remove" data-id="${id}" title="Listeden kaldır" aria-label="Listeden kaldır: ${H.esc(d.filename)}">✕</button>`);
    }
    return `
      <div class="dl-row${d.dangerous ? ' dangerous' : ''}" data-row="${id}">
        <div class="file-icon" aria-hidden="true">${H.esc(ext)}</div>
        <div class="dl-main">
          <div class="name">${H.esc(d.filename)}</div>
          <div class="src">${H.esc(d.sourceHost || '')}${d.dangerous ? ' · <span class="dl-warn">program çalıştırabilir</span>' : ''}</div>
          ${running ? `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${H.esc(d.filename)} indiriliyor"><i style="width:${pct}%"></i></div>` : ''}
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
          <h1>Keşfet</h1>
          <p class="page-sub">İlgezdi’yi geliştiren ekibin diğer yazılımları.</p>
        </div>
      </div>
      <div class="discover-grid" id="discover-grid" aria-live="polite"><p class="page-empty">Yükleniyor…</p></div>
    </div>`;
}

async function initDiscoverPage() {
  const grid = document.getElementById('discover-grid');
  if (!grid) return;
  let items = [];
  try { items = await sb.discover.list(); } catch {}
  grid.replaceChildren();
  const cards = (Array.isArray(items) ? items : []).filter((it) => it && /^https:\/\//i.test(it.url));
  if (!cards.length) {
    const p = document.createElement('p');
    p.className = 'page-empty';
    p.textContent = 'Şu an gösterilecek içerik yok.';
    grid.appendChild(p);
    return;
  }
  const part = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; e.textContent = text || ''; return e; };
  for (const it of cards) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'discover-card';
    card.setAttribute('aria-label', `${it.name}: ${it.tagline}. Siteyi yeni sekmede aç`);
    const mark = part('span', 'discover-mark', it.letter);
    if (/^#[0-9a-f]{6}$/i.test(it.color)) mark.style.background = `linear-gradient(135deg, ${it.color}, color-mix(in srgb, ${it.color} 55%, #000))`;
    const body = document.createElement('span');
    body.className = 'discover-body';
    body.append(part('span', 'discover-cat', it.category), part('span', 'discover-name', it.name),
      part('span', 'discover-tagline', it.tagline), part('span', 'discover-desc', it.description), part('span', 'discover-cta', 'Siteyi aç →'));
    card.append(mark, body);
    card.addEventListener('click', () => { hideScreen(); sb.newTab(it.url); });
    grid.appendChild(card);
  }
}

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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
    const link = src ? ` role="link" tabindex="0" data-source="${H.esc(src)}" title="Kaynağı aç: ${H.esc(item.sourceName)}"` : '';
    const text = `
            <h4>${H.esc(item.title)}</h4>
            <p>${H.esc(item.body)}</p>
            <div class="card-source">Kaynak: ${H.esc(item.sourceName)}</div>`;
    if (item.feature) {
      return `
        <div class="news-card feature"${link}>
          <div class="feature-img"><span class="feature-emoji">${H.esc(item.icon)}</span></div>
          <div class="body-pad">
            <div class="meta"><span class="cat">${H.esc(item.category)}</span><span>Günün bilgisi</span></div>${text}
          </div>
        </div>`;
    }
    return `
      <div class="news-card"${link}>
        <div class="meta"><span class="cat">${H.esc(item.icon)} ${H.esc(item.category)}</span></div>${text}
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
      <div class="http-report" id="newtab-http-report" hidden></div>
      <div class="section-head">
        <div class="title-block">
          <span class="runes">𐱅𐰇𐰼𐰰</span>
          <h3>Bilgi Kartları</h3>
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
    card.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); sb.newTab(url); } });
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
  document.getElementById('btn-reload')?.addEventListener('click',  () => (reloadIsStop ? sb.stop?.() : sb.reload()));
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
        showScreen('newtab', renderNewTab).then(initNewTabEvents);
      } else if (screen === 'history') {
        showScreen('history', renderHistoryPage).then(initHistoryPage);
      } else if (screen === 'downloads') {
        showScreen('downloads', renderDownloadsPage).then(initDownloadsPage);
      } else if (screen === 'discover') {
        showScreen('discover', renderDiscoverPage).then(initDiscoverPage);
      } else {
        const titles = {
          bookmarks: 'Yer İşaretleri',
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
    zoomBtn.hidden = pct === 100;
    zoomBtn.textContent = '%' + pct;
    zoomBtn.setAttribute('aria-label', 'Yakınlaştırma yüzde ' + pct + ', sıfırlamak için tıklayın');
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
    popupBtn.setAttribute('aria-label', n + ' açılır pencere engellendi, ayrıntı için tıklayın');
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
    if (currentScreen === 'downloads') renderDownloadsList();
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
      case 'toggle-bookmarks': document.getElementById('btn-bookmarks')?.click(); break;
      case 'logs':             document.getElementById('btn-logs')?.click(); break;
      case 'vpn-panel':        document.getElementById('btn-vpn-panel')?.click(); break;
      case 'history-page':     document.getElementById('sb-history')?.click(); break;
      case 'downloads-page':   document.getElementById('sb-downloads')?.click(); break;
    }
  });

  // Esc ana süreçte yakalanmaz: önce bul çubuğu, sonra ekran, sonra paneller kapanır.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Giriş penceresi en üstte: Esc önce onu kapatır, altındaki Ayarlar açık kalır.
    if (isAuthScreenOpen()) window.ilgezdiAuth?.close?.();
    else if (!findBar.hidden) closeFindBar(true);
    else if (currentScreen) hideScreen();
    else closeAllPanels();
  });

  // Marka logolarını enjekte et (toolbar + auth)
  injectBrandMarks();

  // Durum çubuğundaki sürüm — eskiden index.html'e sabit "v0.6" yazılıydı (D-02).
  sb.updater?.currentVersion?.().then((v) => {
    const el = document.getElementById('status-version');
    if (el && v) el.textContent = 'İlgezdi v' + v;
  }).catch(() => {});

  // İlk açılışta yeni sekme ekranını göster. Olaylar içerik eklendikten SONRA bağlanır:
  // showScreen önce sekme görünümünü gizlemeyi (IPC) bekliyor; requestAnimationFrame
  // ondan önce çalışıp boş sayfaya bağlanıyordu (kartlar, arama, kısayollar tepkisizdi).
  showScreen('newtab', renderNewTab).then(initNewTabEvents);

  console.log('[İlgezdi] UI hazır');
});
