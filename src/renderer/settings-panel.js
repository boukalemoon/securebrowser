'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let settingsConfig  = {};
let currentLang     = 'tr';

// Kaydedilmiş (gerçek) değerler
let _savedTheme      = 'otuken';
let _savedAccent     = '#c8803a';
let _savedFontSize   = 13;
let _savedFontFamily = "'DM Sans', sans-serif";

// Panel içinde seçilen (henüz kaydedilmemiş) değerler
let _pendingTheme      = null;
let _pendingAccent     = null;
let _pendingFontSize   = null;
let _pendingFontFamily = null;

const THEMES = {
  otuken: { bg:'#0f1218', surface:'#161c28', tab:'#1a2030', input:'#222a3a', textMain:'#e2e8f0', textMuted:'#8090a8', accent:'#c8803a', border:'#222a3a', success:'#68d391', danger:'#fc8181', warning:'#f6ad55' },
  hibrit:  { bg:'#080c12', surface:'#0f1520', tab:'#141c28', input:'#0c1118', textMain:'#e2e8f0', textMuted:'#6a7a90', accent:'#d4a935', border:'#1e2838', success:'#68d391', danger:'#fc8181', warning:'#f6ad55' },
  umay:    { bg:'#edf2f7', surface:'#f7fafc', tab:'#e2e8f0', input:'#e8edf5', textMain:'#1a202c', textMuted:'#4a5a70', accent:'#3182ce', border:'#c8d4e4', success:'#276749', danger:'#c53030', warning:'#b45309' },
  kagan:   { bg:'#cec5b0', surface:'#ddd4be', tab:'#bfb8a5', input:'#e8e0cc', textMain:'#2c3340', textMuted:'#5c5048', accent:'#a82020', border:'#b8ae98', success:'#276749', danger:'#7b1818', warning:'#854d0e' },
};

const ACCENT_COLORS = [
  { name:'Bakır',      value:'#c8803a' },
  { name:'Altın',      value:'#d4a935' },
  { name:'Gök Mavisi', value:'#3182ce' },
  { name:'Terracotta', value:'#a82020' },
  { name:'Yeşil',      value:'#68d391' },
  { name:'Mor',        value:'#9f7aea' },
  { name:'Turkuaz',    value:'#0bc5ea' },
  { name:'Kırmızı',    value:'#fc8181' },
];

const FONT_FAMILIES = [
  { name:"DM Sans (Varsayılan)", value:"'DM Sans', sans-serif" },
  { name:"Cinzel (Runik)",       value:"'Cinzel', serif" },
  { name:"System UI",            value:"system-ui, sans-serif" },
  { name:"Segoe UI",             value:"'Segoe UI', sans-serif" },
  { name:"Georgia",              value:"Georgia, serif" },
];

// ─── Gerçek tema uygulama (sadece Kaydet'te çağrılır) ─────────────────────────
// YENİ MİMARİ: Tüm renkleri inline style olarak yazmak yerine
// <html data-theme="..."> attribute'unu set ediyoruz. CSS dosyaları
// (themes/otuken-default in semantic.css, themes/hibrit.css vs.)
// kalan her şeyi otomatik halleder.
//
// Custom accent ise tema default'undan farklı bir renk seçtiyse inline yazılır,
// aynı default'u seçtiyse inline temizlenir (CSS'deki tema default'u devreye girer).

const THEME_DEFAULT_ACCENTS = {
  otuken: '#c8803a',
  hibrit: '#d4a935',
  umay:   '#2868a8',
  kagan:  '#b02828',
};

// Tema + accent'i sadece DOM'a yansıtır. localStorage'a yazmaz, _savedXxx'lere
// dokunmaz. Önizleme ve commit'in ortak yardımcısı.
function applyThemeToDOM(themeName, accentColor) {
  const root = document.documentElement;
  root.setAttribute('data-theme', themeName);

  const themeDefault = THEME_DEFAULT_ACCENTS[themeName] || '#c8803a';
  if (accentColor && accentColor !== themeDefault) {
    root.style.setProperty('--accent',        accentColor);
    root.style.setProperty('--accent-glow',   accentColor + '2e');
    root.style.setProperty('--accent-border', accentColor + '80');
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-border');
  }
}

// Kullanıcı "Kaydet"e basınca çağrılır. State'i + localStorage'ı + DOM'u günceller.
function commitTheme(themeName, accentColor, fontSize, fontFamily) {
  _savedTheme      = themeName || 'otuken';
  _savedFontSize   = parseInt(fontSize) || 13;
  _savedFontFamily = fontFamily || "'DM Sans', sans-serif";

  const themeDefault = THEME_DEFAULT_ACCENTS[_savedTheme] || '#c8803a';
  _savedAccent = (accentColor && accentColor !== themeDefault) ? accentColor : themeDefault;

  // Eski body.theme-* class'larını temizle (eski sistem kalıntısı)
  document.body.className = document.body.className.replace(/theme-\S+/g, '').trim();

  // DOM'a yansıt — yardımcı fonksiyon kullanıyoruz
  applyThemeToDOM(_savedTheme, _savedAccent);

  // Font
  document.body.style.fontSize   = _savedFontSize + 'px';
  document.body.style.fontFamily = _savedFontFamily;

 // config.json'a kaydet (Electron fs ile diske senkron yazılır — kayıp olmaz)
window.secureBrowser?.saveConfig({
  theme:       _savedTheme,
  accentColor: _savedAccent,
  fontSize:    _savedFontSize,
  fontFamily:  _savedFontFamily,
}).then(() => {
  console.log('[İlgezdi/Theme] kaydedildi:', { theme: _savedTheme, accent: _savedAccent });
}).catch(e => {
  console.warn('[İlgezdi/Theme] kayıt hatası:', e);
});
}

async function loadSavedTheme() {
  try {
    const cfg = await window.secureBrowser?.getConfig();
    console.log('[İlgezdi/Theme] config.json yüklenenler:', {
      theme: cfg?.theme, accent: cfg?.accentColor
    });

    // Geçersiz/eski tema değerlerine karşı koruma
    const validThemes = ['otuken', 'hibrit', 'umay', 'kagan'];
    const theme      = validThemes.includes(cfg?.theme) ? cfg.theme : 'otuken';
    const accent     = cfg?.accentColor || null;
    const fontSize   = cfg?.fontSize    || 13;
    const fontFamily = cfg?.fontFamily  || "'DM Sans', sans-serif";

    commitTheme(theme, accent, fontSize, fontFamily);
  } catch (e) {
    console.warn('[İlgezdi/Theme] yükleme hatası:', e);
    commitTheme('otuken', null, 13, "'DM Sans', sans-serif");
  }
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
function injectSettingsPanelStyles() {
  if (document.getElementById('ilgezdi-settings-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-settings-style';
  s.textContent = `
    #panel-settings { width:400px !important; min-width:400px !important; max-width:400px !important; }
    .settings-tabs { display:flex; background:var(--bg-surface); border-bottom:1px solid var(--border-color); padding:0 12px; flex-shrink:0; }
    .settings-tab { padding:10px 10px; font-size:10px; font-weight:600; color:var(--text-muted); cursor:pointer; border:none; border-bottom:2px solid transparent; background:none; white-space:nowrap; transition:all .15s; }
    .settings-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
    .settings-tab:hover { color:var(--text-main); }
    .settings-content { flex:1; overflow-y:auto; padding:14px; background:var(--bg-surface); }
    .settings-section { margin-bottom:20px; }
    .settings-section h3 { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--accent); margin-bottom:10px; padding-bottom:5px; border-bottom:1px solid var(--border-color); }

    /* Unsaved değişiklik uyarısı */
    .settings-unsaved-bar {
      padding:6px 14px; background:rgba(200,128,58,.12);
      border-bottom:1px solid rgba(200,128,58,.3);
      font-size:10px; color:var(--accent); flex-shrink:0;
      display:none; align-items:center; justify-content:space-between;
    }
    .settings-unsaved-bar.visible { display:flex; }
    .settings-unsaved-discard {
      font-size:10px; color:var(--text-muted); cursor:pointer;
      background:none; border:none; text-decoration:underline;
    }
    .settings-unsaved-discard:hover { color:var(--danger); }

    /* Önizleme kutusu */
    .theme-preview-box {
      background:var(--bg-input); border:1px solid var(--border-color);
      border-radius:8px; padding:10px 12px; margin-bottom:12px;
      font-size:11px; color:var(--text-muted);
    }
    .preview-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .preview-swatch { width:16px; height:16px; border-radius:4px; flex-shrink:0; }
    .preview-label { font-size:10px; color:var(--text-muted); flex:1; }
    .preview-value { font-size:10px; font-family:monospace; color:var(--text-main); }

    .s-toggle-row { display:flex; align-items:center; justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--border-color); }
    .s-toggle-label { font-size:12px; color:var(--text-main); }
    .s-toggle-sub { font-size:10px; color:var(--text-muted); margin-top:2px; }
    .switch { position:relative; display:inline-block; width:34px; height:19px; flex-shrink:0; }
    .switch input { opacity:0; width:0; height:0; }
    .slider { position:absolute; cursor:pointer; inset:0; background:var(--border-color); border-radius:19px; transition:.2s; }
    .slider:before { position:absolute; content:""; height:13px; width:13px; left:3px; bottom:3px; background:var(--text-muted); border-radius:50%; transition:.2s; }
    input:checked + .slider { background:var(--accent); }
    input:checked + .slider:before { transform:translateX(15px); background:var(--bg-base); }
    .s-input-row { margin-bottom:10px; }
    .s-input-row label { display:block; font-size:10px; color:var(--text-muted); margin-bottom:4px; }
    .s-input-row input, .s-input-row select { width:100%; background:var(--bg-input); border:1px solid var(--border-color); border-radius:6px; color:var(--text-main); padding:7px 10px; font-size:12px; outline:none; transition:border-color .2s; box-sizing:border-box; }
    .s-input-row input:focus, .s-input-row select:focus { border-color:var(--accent); }
    .s-input-row select option { background:var(--bg-input); color:var(--text-main); }

    .theme-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:12px; }
    .theme-card { padding:9px; border-radius:9px; border:2px solid var(--border-color); cursor:pointer; transition:all .15s; text-align:center; }
    .theme-card:hover { border-color:var(--accent); opacity:.9; }
    .theme-card.selected { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow); }
    .theme-card.selected > span { color:var(--accent); }
    .theme-preview { height:32px; border-radius:5px; margin-bottom:5px; display:flex; align-items:center; justify-content:center; gap:4px; position:relative; }
    .theme-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .theme-card > span { font-size:10px; color:var(--text-muted); display:block; }
    .theme-badge { position:absolute; top:2px; right:4px; font-size:7px; font-weight:700; }

    .accent-grid { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:10px; }
    .accent-swatch { width:28px; height:28px; border-radius:50%; cursor:pointer; border:2px solid transparent; transition:all .15s; display:flex; align-items:center; justify-content:center; }
    .accent-swatch.selected { border-color:white; box-shadow:0 0 0 2px rgba(255,255,255,.3); transform:scale(1.15); }
    .accent-swatch:hover:not(.selected) { transform:scale(1.1); }

    .font-slider-wrap { display:flex; align-items:center; gap:10px; margin:6px 0; }
    .font-slider { flex:1; accent-color:var(--accent); cursor:pointer; }
    .font-size-badge { min-width:36px; padding:2px 6px; text-align:center; background:var(--bg-input); border:1px solid var(--border-color); border-radius:5px; font-size:11px; color:var(--accent); font-weight:600; }
    .font-preview { padding:8px 10px; background:var(--bg-input); border-radius:6px; border:1px solid var(--border-color); margin-top:6px; color:var(--text-muted); line-height:1.4; }

    .clear-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .clear-btn { padding:8px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-muted); font-size:11px; cursor:pointer; transition:all .15s; text-align:center; }
    .clear-btn:hover { border-color:var(--danger); color:var(--danger); }
    .shortcut-table { width:100%; border-collapse:collapse; }
    .shortcut-table td { padding:7px 4px; font-size:11px; border-bottom:1px solid var(--border-color); color:var(--text-muted); }
    .shortcut-table td:last-child { text-align:right; }
    .kbd { display:inline-block; padding:2px 6px; background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; font-size:9px; font-family:monospace; color:var(--accent); }
    .pwd-entry { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--border-color); }
    .pwd-entry-info { flex:1; min-width:0; }
    .pwd-site { font-size:12px; font-weight:600; color:var(--text-main); }
    .pwd-user { font-size:10px; color:var(--text-muted); }
    .pwd-pass { font-size:11px; font-family:monospace; color:var(--text-muted); letter-spacing:2px; }
    .pwd-actions { display:flex; gap:3px; }
    .pwd-btn { padding:3px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-muted); font-size:10px; cursor:pointer; transition:all .15s; }
    .pwd-btn:hover { border-color:var(--accent); color:var(--accent); }
    .pwd-btn.danger:hover { border-color:var(--danger); color:var(--danger); }
    .settings-footer { padding:10px 14px; border-top:1px solid var(--border-color); background:var(--bg-surface); flex-shrink:0; display:flex; gap:8px; }
    .btn-save-settings { flex:1; padding:10px; background:var(--accent); color:var(--bg-base); border:none; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; transition:all .2s; }
    .btn-save-settings:hover { opacity:.9; transform:translateY(-1px); }
    .btn-discard-settings { padding:10px 14px; background:transparent; color:var(--text-muted); border:1px solid var(--border-color); border-radius:7px; font-size:12px; cursor:pointer; transition:all .15s; }
    .btn-discard-settings:hover { border-color:var(--danger); color:var(--danger); }
    .folder-row { display:flex; gap:6px; }
    .folder-row input { flex:1; }
    .folder-btn { padding:7px 10px; background:var(--bg-input); border:1px solid var(--border-color); border-radius:6px; color:var(--text-muted); font-size:11px; cursor:pointer; transition:all .15s; }
    .folder-btn:hover { border-color:var(--accent); color:var(--accent); }
    .settings-toast { position:fixed; bottom:20px; right:20px; z-index:99999; padding:9px 16px; border-radius:8px; font-size:12px; font-weight:600; box-shadow:0 4px 20px rgba(0,0,0,.4); }
  `;
  document.head.appendChild(s);
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────
function injectSettingsPanelHTML() {
  const panel = document.getElementById('panel-settings');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-header"><h2>⚙ Ayarlar</h2><button class="panel-close" data-panel="settings">✕</button></div>
    <div class="settings-tabs">
      <button class="settings-tab active" data-tab="customization">🎨 Özelleştir</button>
      <button class="settings-tab" data-tab="general">⚙ Genel</button>
      <button class="settings-tab" data-tab="privacy">🛡 Gizlilik</button>
      <button class="settings-tab" data-tab="passwords">🔑 Şifreler</button>
    </div>
    <div class="settings-unsaved-bar" id="settings-unsaved-bar">
      <span>⚠ Kaydedilmemiş değişiklikler var</span>
      <button class="settings-unsaved-discard" id="btn-discard-changes">Geri Al</button>
    </div>
    <div class="settings-content" id="settings-content"></div>
    <div class="settings-footer">
      <button class="btn-discard-settings" id="btn-discard-all" style="display:none">↩ Geri Al</button>
      <button class="btn-save-settings" id="btn-save-all">💾 Kaydet</button>
    </div>
  `;
}

// ─── Pending state yönetimi ───────────────────────────────────────────────────
function initPendingState() {
  _pendingTheme      = _savedTheme;
  _pendingAccent     = _savedAccent;
  _pendingFontSize   = _savedFontSize;
  _pendingFontFamily = _savedFontFamily;
}

function hasPendingChanges() {
  return (
    _pendingTheme      !== _savedTheme      ||
    _pendingAccent     !== _savedAccent     ||
    _pendingFontSize   !== _savedFontSize   ||
    _pendingFontFamily !== _savedFontFamily
  );
}

function updateUnsavedBar() {
  const bar     = document.getElementById('settings-unsaved-bar');
  const discBtn = document.getElementById('btn-discard-all');
  const hasChg  = hasPendingChanges();
  if (bar)     bar.classList.toggle('visible', hasChg);
  if (discBtn) discBtn.style.display = hasChg ? '' : 'none';
}

function discardPendingChanges() {
  _pendingTheme      = _savedTheme;
  _pendingAccent     = _savedAccent;
  _pendingFontSize   = _savedFontSize;
  _pendingFontFamily = _savedFontFamily;

  // DOM'u kayıtlı haline geri çek (önizlemeyi temizle)
  applyThemeToDOM(_savedTheme, _savedAccent);

  updateUnsavedBar();
  renderSettingsTab('customization', settingsConfig);
}

// ─── Panel önizleme güncelleyici (asıl UI'a dokunmaz) ─────────────────────────
function updatePreviewBox() {
  const box = document.getElementById('theme-preview-box');
  if (!box) return;
  const th  = THEMES[_pendingTheme] || THEMES.otuken;
  const acc = _pendingAccent || th.accent;
  box.innerHTML = `
    <div class="preview-row">
      <div class="preview-swatch" style="background:${th.bg};border:1px solid ${th.border}"></div>
      <span class="preview-label">Arka Plan</span>
      <span class="preview-value">${th.bg}</span>
    </div>
    <div class="preview-row">
      <div class="preview-swatch" style="background:${acc}"></div>
      <span class="preview-label">Vurgu</span>
      <span class="preview-value">${acc}</span>
    </div>
    <div class="preview-row">
      <div class="preview-swatch" style="background:${th.textMain}"></div>
      <span class="preview-label">Metin</span>
      <span class="preview-value" style="font-size:${_pendingFontSize}px">Aa — ${_pendingFontSize}px</span>
    </div>`;
}

// ─── Tab HTML ─────────────────────────────────────────────────────────────────
function renderCustomizationTab(cfg) {
  const themeList = [
    { id:'otuken', label:'Ötüken Kayalıkları', bg:'#0f1218', dots:['#1a2030','#c8803a','#68d391'], badge:'Ana' },
    { id:'hibrit',  label:'Hibrit Altın',       bg:'#080c12', dots:['#141c28','#d4a935','#90cdf4'], badge:'' },
    { id:'umay',    label:'Umay Ana Işığı',      bg:'#edf2f7', dots:['#f7fafc','#3182ce','#d4a935'], badge:'' },
    { id:'kagan',   label:'Kağan Otağı',         bg:'#cec5b0', dots:['#ddd4be','#a82020','#8b6b45'], badge:'' },
  ];
  return `
    <div class="settings-section"><h3>Tema</h3>
      <div class="theme-grid">
        ${themeList.map(th => `
          <div class="theme-card ${_pendingTheme===th.id?'selected':''}" data-theme="${th.id}">
            <div class="theme-preview" style="background:${th.bg}">
              ${th.dots.map(d=>`<div class="theme-dot" style="background:${d}"></div>`).join('')}
              ${th.badge?`<span class="theme-badge" style="color:${th.dots[1]}">${th.badge}</span>`:''}
            </div>
            <span>${th.label}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="settings-section"><h3>Vurgu Rengi</h3>
      <div class="accent-grid">
        ${ACCENT_COLORS.map(ac=>`
          <div class="accent-swatch ${_pendingAccent===ac.value?'selected':''}"
               style="background:${ac.value}" data-accent="${ac.value}" title="${ac.name}">
            ${_pendingAccent===ac.value?'<span style="color:#000;font-size:11px;font-weight:900;pointer-events:none">✓</span>':''}
          </div>`).join('')}
      </div>
      <div class="s-input-row">
        <label>Özel renk</label>
        <input type="color" id="custom-accent" value="${_pendingAccent||'#c8803a'}" style="height:36px;padding:2px;cursor:pointer;border-radius:6px" />
      </div>
    </div>
    <div class="settings-section"><h3>Yazı Tipi</h3>
      <div class="s-input-row">
        <label>Font ailesi</label>
        <select id="font-family-select">
          ${FONT_FAMILIES.map(f=>`<option value="${f.value}" ${_pendingFontFamily===f.value?'selected':''}>${f.name}</option>`).join('')}
        </select>
      </div>
      <div class="s-input-row">
        <label>Boyut</label>
        <div class="font-slider-wrap">
          <input type="range" class="font-slider" id="font-size-slider" min="11" max="18" step="1" value="${_pendingFontSize}" />
          <div class="font-size-badge" id="font-size-val">${_pendingFontSize}px</div>
        </div>
        <div class="font-preview" id="font-preview-text" style="font-size:${_pendingFontSize}px;font-family:${_pendingFontFamily}">
          İlgezdi Browser — Önizleme metni (Bu değişiklik henüz kaydedilmedi)
        </div>
      </div>
    </div>
    <div id="theme-preview-box" class="theme-preview-box"></div>
    <div class="settings-section"><h3>Yeni Sekme</h3>
      <div class="s-input-row">
        <select id="new-tab-mode">
          <option value="blank" ${cfg.newTabMode==='blank'?'selected':''}>Boş sayfa</option>
          <option value="custom"${cfg.newTabMode==='custom'?'selected':''}>Özel URL</option>
        </select>
      </div>
      <div id="custom-newtab-wrap" style="${cfg.newTabMode==='custom'?'':'display:none'}">
        <div class="s-input-row"><label>Özel URL</label><input type="text" id="custom-newtab-url" value="${cfg.customNewTabUrl||''}" placeholder="https://" /></div>
      </div>
    </div>
    <div class="settings-section"><h3>Ana Sayfa</h3>
      <div class="s-input-row"><input type="text" id="homepage-input" value="${cfg.homepage||'about:blank'}" placeholder="https://" /></div>
    </div>`;
}

function renderGeneralTab(cfg) {
  return `
    <div class="settings-section"><h3>Dil</h3>
      <div class="s-input-row"><select id="lang-select">
        <option value="tr" ${!cfg.language||cfg.language==='tr'?'selected':''}>🇹🇷 Türkçe</option>
        <option value="en" ${cfg.language==='en'?'selected':''}>🇬🇧 English</option>
      </select></div>
    </div>
    <div class="settings-section"><h3>İndirme</h3>
      <div class="s-input-row"><label>İndirme klasörü</label>
        <div class="folder-row">
          <input type="text" id="download-folder" value="${cfg.downloadFolder||''}" placeholder="İndirme klasörü..." readonly />
          <button class="folder-btn" id="btn-pick-folder">📁 Seç</button>
        </div>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">Her seferinde sor</div><div class="s-toggle-sub">İndirmeden önce konum seç</div></div>
        <label class="switch"><input type="checkbox" id="cfg-ask-download" ${cfg.askDownloadLocation?'checked':''}/><span class="slider"></span></label>
      </div>
    </div>
    <div class="settings-section"><h3>Bildirimler</h3>
      <div class="s-toggle-row">
        <div class="s-toggle-label">Site bildirimleri</div>
        <label class="switch"><input type="checkbox" id="cfg-notifications" ${cfg.notifications!==false?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">VPN bildirimi</div><div class="s-toggle-sub">Bağlanınca/kesilince</div></div>
        <label class="switch"><input type="checkbox" id="cfg-vpn-notify" ${cfg.vpnNotify!==false?'checked':''}/><span class="slider"></span></label>
      </div>
    </div>
    <div class="settings-section"><h3>Önbellek & Geçmiş</h3>
      <div class="clear-grid">
        <button class="clear-btn" id="btn-clear-cache">🗑 Önbellek</button>
        <button class="clear-btn" id="btn-clear-history">📋 Geçmiş</button>
        <button class="clear-btn" id="btn-clear-cookies">🍪 Çerezler</button>
        <button class="clear-btn" id="btn-clear-all" style="border-color:var(--danger);color:var(--danger)">⚠ Tümünü</button>
      </div>
      <div id="clear-status" style="font-size:11px;color:var(--success);margin-top:8px;min-height:14px"></div>
    </div>
    <div class="settings-section"><h3>Kısayollar</h3>
      <table class="shortcut-table">
        <tr><td>Yeni Sekme</td><td><span class="kbd">Ctrl</span>+<span class="kbd">T</span></td></tr>
        <tr><td>Sekmeyi Kapat</td><td><span class="kbd">Ctrl</span>+<span class="kbd">W</span></td></tr>
        <tr><td>Adres Çubuğu</td><td><span class="kbd">Ctrl</span>+<span class="kbd">L</span></td></tr>
        <tr><td>Yenile</td><td><span class="kbd">F5</span></td></tr>
        <tr><td>Ayarlar</td><td><span class="kbd">Ctrl</span>+<span class="kbd">,</span></td></tr>
        <tr><td>Yer İmleri</td><td><span class="kbd">Ctrl</span>+<span class="kbd">B</span></td></tr>
      </table>
    </div>`;
}

function renderPrivacyTab(cfg) {
  const row = (id,lbl,sub,chk) => `
    <div class="s-toggle-row">
      <div><div class="s-toggle-label">${lbl}</div>${sub?`<div class="s-toggle-sub">${sub}</div>`:''}</div>
      <label class="switch"><input type="checkbox" id="${id}" ${chk?'checked':''}/><span class="slider"></span></label>
    </div>`;
  return `
    <div class="settings-section"><h3>Tracker & Reklam</h3>
      ${row('cfg-tracker','Tracker Engelleme','200+ tracker domain',cfg.blockTrackers!==false)}
      ${row('cfg-ads','Reklam Engelleme','Reklam sunucuları bloke',cfg.blockAds!==false)}
    </div>
    <div class="settings-section"><h3>Fingerprint & Kimlik</h3>
      ${row('cfg-fp','Fingerprint Koruması','Parmak izi maskelenir',cfg.fingerprintProtection!==false)}
      ${row('cfg-ua','User-Agent Rotasyonu','Her oturumda farklı UA',cfg.userAgentRotation!==false)}
      ${row('cfg-https-only','Yalnızca HTTPS','HTTP sitelere güvenli bağlan',cfg.httpsOnly)}
      ${row('cfg-dnt','Do Not Track','Takip etme sinyali gönder',cfg.doNotTrack)}
    </div>
    <div class="settings-section"><h3>Log</h3>
      ${row('cfg-log','Ziyaret Logları','AES-256 şifreli saklanır',cfg.logEnabled!==false)}
    </div>`;
}

function renderPasswordsTab() {
  const passwords = loadPasswords();
  const masterSet = !!localStorage.getItem('ilgezdi-master-hash');
  const unlocked  = sessionStorage.getItem('ilgezdi-pwd-unlocked') === '1';
  if (!masterSet) return `<div class="settings-section"><h3>Ana Şifre Kur</h3>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">Şifrelerinizi korumak için bir ana şifre belirleyin.<br><strong style="color:var(--warning)">Unutursanız kurtarılamaz!</strong></p>
    <div class="s-input-row"><label>Ana Şifre</label><input type="password" id="master-new" placeholder="En az 6 karakter"/></div>
    <div class="s-input-row"><label>Tekrar Gir</label><input type="password" id="master-confirm" placeholder="••••••••"/></div>
    <button class="btn-save-settings" id="btn-master-set" style="margin-top:8px">🔐 Ana Şifreyi Kaydet</button></div>`;
  if (!unlocked) return `<div class="settings-section" style="text-align:center;padding:28px 0">
    <div style="font-size:44px;margin-bottom:12px">🔒</div>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px;line-height:1.5">Şifre yöneticisi kilitli.<br>Ana şifrenizi girin.</p>
    <div class="s-input-row"><input type="password" id="master-unlock-input" placeholder="Ana şifre" style="text-align:center"/></div>
    <button class="btn-save-settings" id="btn-master-unlock" style="margin-top:8px">🔓 Kilidi Aç</button>
    <div id="unlock-error" style="color:var(--danger);font-size:11px;margin-top:8px;min-height:16px"></div></div>`;
  return `
    <div class="settings-section"><h3>Yeni Şifre Ekle</h3>
      <div class="s-input-row"><label>Site</label><input type="text" id="pwd-new-site" placeholder="google.com"/></div>
      <div class="s-input-row"><label>Kullanıcı adı</label><input type="text" id="pwd-new-user" placeholder="kullanici@email.com"/></div>
      <div class="s-input-row"><label>Şifre</label><input type="password" id="pwd-new-pass" placeholder="••••••••"/></div>
      <button class="btn-save-settings" id="btn-pwd-add" style="margin-top:4px">➕ Ekle</button>
    </div>
    <div class="settings-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0;border:none;padding:0">Kayıtlı (${passwords.length})</h3>
        <button class="pwd-btn" id="btn-lock-passwords">🔒 Kilitle</button>
      </div>
      ${passwords.length===0?'<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px">Henüz şifre kaydedilmedi</p>'
        :passwords.map((p,i)=>`<div class="pwd-entry">
          <div class="pwd-entry-info">
            <div class="pwd-site">${p.site}</div>
            <div class="pwd-user">${p.username}</div>
            <div class="pwd-pass" id="pwd-pass-${i}">••••••••</div>
          </div>
          <div class="pwd-actions">
            <button class="pwd-btn" onclick="togglePwd(${i})">👁</button>
            <button class="pwd-btn" onclick="copyPwd(${i})">📋</button>
            <button class="pwd-btn danger" onclick="deletePwd(${i})">🗑</button>
          </div></div>`).join('')}
    </div>`;
}

// ─── Şifre ────────────────────────────────────────────────────────────────────
function loadPasswords() { try { return JSON.parse(atob(localStorage.getItem('ilgezdi-passwords')||btoa('[]'))); } catch { return []; } }
function savePasswords(p) { localStorage.setItem('ilgezdi-passwords',btoa(JSON.stringify(p))); }
window.togglePwd = (i) => { const el=document.getElementById('pwd-pass-'+i); if(!el) return; const p=loadPasswords(); el.textContent=el.textContent==='••••••••'?(p[i]?.password||''):'••••••••'; };
window.copyPwd   = (i) => { navigator.clipboard.writeText(loadPasswords()[i]?.password||'').then(()=>showSettingsToast('Şifre kopyalandı!')); };
window.deletePwd = (i) => { const p=loadPasswords(); p.splice(i,1); savePasswords(p); renderSettingsTab('passwords',settingsConfig); };

function showSettingsToast(msg,type='success') {
  const el=document.createElement('div');
  el.className='settings-toast';
  el.style.cssText=`background:${type==='success'?'var(--success)':'var(--danger)'};color:var(--bg-base);`;
  el.textContent=msg; document.body.appendChild(el);
  setTimeout(()=>el.remove(),2500);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderSettingsTab(tabId, cfg) {
  const content = document.getElementById('settings-content');
  if (!content) return;
  if      (tabId==='customization') content.innerHTML = renderCustomizationTab(cfg);
  else if (tabId==='general')       content.innerHTML = renderGeneralTab(cfg);
  else if (tabId==='privacy')       content.innerHTML = renderPrivacyTab(cfg);
  else if (tabId==='passwords')     content.innerHTML = renderPasswordsTab();
  if (tabId==='customization') { bindCustomizationEvents(); updatePreviewBox(); }
  if (tabId==='general')       bindGeneralEvents();
  if (tabId==='passwords')     bindPasswordEvents();
}

// ─── Özelleştirme eventleri — pending state + anlık önizleme ─────────────────
function bindCustomizationEvents() {
  // Tema kartları — pending'i güncelle + ANLIK önizleme + accent'i tema default'una sıfırla
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      _pendingTheme  = card.dataset.theme;
      _pendingAccent = THEME_DEFAULT_ACCENTS[_pendingTheme] || '#c8803a';

      // DOM'a anlık yansıt — kullanıcı temayı gerçek zamanlı görsün
      applyThemeToDOM(_pendingTheme, _pendingAccent);

      // Tema kartı UI seçimi
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      // Accent swatch UI'ını da yeni default'a göre güncelle
      document.querySelectorAll('.accent-swatch').forEach(s => {
        const active = s.dataset.accent === _pendingAccent;
        s.classList.toggle('selected', active);
        s.innerHTML = active
          ? '<span style="color:#000;font-size:11px;font-weight:900;pointer-events:none">✓</span>'
          : '';
      });
      const picker = document.getElementById('custom-accent');
      if (picker) picker.value = _pendingAccent;

      updatePreviewBox();
      updateUnsavedBar();
    });
  });

  // Accent swatches — tıklayınca anlık önizleme
  document.querySelectorAll('.accent-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      _pendingAccent = sw.dataset.accent;
      applyThemeToDOM(_pendingTheme, _pendingAccent);

      document.querySelectorAll('.accent-swatch').forEach(s => {
        const active = s.dataset.accent === _pendingAccent;
        s.classList.toggle('selected', active);
        s.innerHTML = active
          ? '<span style="color:#000;font-size:11px;font-weight:900;pointer-events:none">✓</span>'
          : '';
      });
      const picker = document.getElementById('custom-accent');
      if (picker) picker.value = _pendingAccent;

      updatePreviewBox();
      updateUnsavedBar();
    });
  });

  // Özel renk picker — anlık önizleme
  document.getElementById('custom-accent')?.addEventListener('input', (e) => {
    _pendingAccent = e.target.value;
    applyThemeToDOM(_pendingTheme, _pendingAccent);

    document.querySelectorAll('.accent-swatch').forEach(s => { s.classList.remove('selected'); s.innerHTML = ''; });
    updatePreviewBox();
    updateUnsavedBar();
  });

  // Font boyutu — sadece preview kutusunu günceller (global font Adım 5'te)
  document.getElementById('font-size-slider')?.addEventListener('input', (e) => {
    _pendingFontSize = parseInt(e.target.value);
    const badge = document.getElementById('font-size-val');
    const prev  = document.getElementById('font-preview-text');
    if (badge) badge.textContent = _pendingFontSize + 'px';
    if (prev)  prev.style.fontSize = _pendingFontSize + 'px';
    updatePreviewBox();
    updateUnsavedBar();
  });

  document.getElementById('font-family-select')?.addEventListener('change', (e) => {
    _pendingFontFamily = e.target.value;
    const prev = document.getElementById('font-preview-text');
    if (prev) prev.style.fontFamily = _pendingFontFamily;
    updateUnsavedBar();
  });

  document.getElementById('new-tab-mode')?.addEventListener('change', (e) => {
    const w = document.getElementById('custom-newtab-wrap');
    if (w) w.style.display = e.target.value === 'custom' ? '' : 'none';
  });
}

function bindGeneralEvents() {
  document.getElementById('btn-pick-folder')?.addEventListener('click', async () => {
    const folder = await window.secureBrowser?.pickDownloadFolder?.();
    if (folder) { document.getElementById('download-folder').value=folder; settingsConfig.downloadFolder=folder; }
  });
  const st=(msg)=>{const el=document.getElementById('clear-status');if(el){el.textContent=msg;setTimeout(()=>el.textContent='',3000);}};
  document.getElementById('btn-clear-cache')?.addEventListener('click',   async()=>{await window.secureBrowser?.clearCache?.();        st('Önbellek temizlendi ✓');});
  document.getElementById('btn-clear-history')?.addEventListener('click', async()=>{await window.secureBrowser?.logs?.clearLogs?.();   st('Geçmiş temizlendi ✓');});
  document.getElementById('btn-clear-cookies')?.addEventListener('click', async()=>{await window.secureBrowser?.clearCookies?.();      st('Çerezler temizlendi ✓');});
  document.getElementById('btn-clear-all')?.addEventListener('click',     async()=>{await window.secureBrowser?.clearAll?.();         st('Tüm veriler temizlendi ✓');});
}

function bindPasswordEvents() {
  document.getElementById('btn-master-set')?.addEventListener('click',()=>{
    const p1=document.getElementById('master-new')?.value;
    const p2=document.getElementById('master-confirm')?.value;
    if(!p1||p1.length<6){showSettingsToast('En az 6 karakter girin','error');return;}
    if(p1!==p2){showSettingsToast('Şifreler eşleşmiyor','error');return;}
    localStorage.setItem('ilgezdi-master-hash',btoa('ilgezdi:'+p1));
    sessionStorage.setItem('ilgezdi-pwd-unlocked','1');
    renderSettingsTab('passwords',settingsConfig);
    showSettingsToast('Ana şifre kaydedildi!');
  });
  document.getElementById('btn-master-unlock')?.addEventListener('click',()=>{
    const inp=document.getElementById('master-unlock-input')?.value;
    const hash=localStorage.getItem('ilgezdi-master-hash');
    const err=document.getElementById('unlock-error');
    if(btoa('ilgezdi:'+inp)===hash){sessionStorage.setItem('ilgezdi-pwd-unlocked','1');renderSettingsTab('passwords',settingsConfig);}
    else if(err){err.textContent='Yanlış şifre!';setTimeout(()=>err.textContent='',2000);}
  });
  document.getElementById('master-unlock-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-master-unlock')?.click();});
  document.getElementById('btn-lock-passwords')?.addEventListener('click',()=>{sessionStorage.removeItem('ilgezdi-pwd-unlocked');renderSettingsTab('passwords',settingsConfig);});
  document.getElementById('btn-pwd-add')?.addEventListener('click',()=>{
    const site=document.getElementById('pwd-new-site')?.value.trim();
    const user=document.getElementById('pwd-new-user')?.value.trim();
    const pass=document.getElementById('pwd-new-pass')?.value;
    if(!site||!user||!pass){showSettingsToast('Tüm alanları doldurun','error');return;}
    const p=loadPasswords(); p.push({site,username:user,password:pass,createdAt:Date.now()});
    savePasswords(p);
    ['pwd-new-site','pwd-new-user','pwd-new-pass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    renderSettingsTab('passwords',settingsConfig);
    showSettingsToast('Şifre kaydedildi!');
  });
}

// ─── Panel events ─────────────────────────────────────────────────────────────
function initSettingsPanelEvents() {
  document.querySelectorAll('.settings-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.settings-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      renderSettingsTab(tab.dataset.tab,settingsConfig);
    });
  });

  // KAYDET — pending değerleri commit et, sonra API'ye yaz
  document.getElementById('btn-save-all')?.addEventListener('click', async()=>{
    commitTheme(_pendingTheme, _pendingAccent, _pendingFontSize, _pendingFontFamily);

    const finalCfg = {
      ...settingsConfig,
      theme:       _savedTheme,
      accentColor: _savedAccent,
      fontSize:    _savedFontSize,
      fontFamily:  _savedFontFamily,
      newTabMode:            document.getElementById('new-tab-mode')?.value          || settingsConfig.newTabMode,
      customNewTabUrl:       document.getElementById('custom-newtab-url')?.value     || settingsConfig.customNewTabUrl,
      homepage:              document.getElementById('homepage-input')?.value        || settingsConfig.homepage,
      language:              document.getElementById('lang-select')?.value           || settingsConfig.language,
      downloadFolder:        document.getElementById('download-folder')?.value       || settingsConfig.downloadFolder,
      askDownloadLocation:   document.getElementById('cfg-ask-download')?.checked    ?? settingsConfig.askDownloadLocation,
      notifications:         document.getElementById('cfg-notifications')?.checked   ?? true,
      vpnNotify:             document.getElementById('cfg-vpn-notify')?.checked      ?? true,
      blockTrackers:         document.getElementById('cfg-tracker')?.checked         ?? true,
      blockAds:              document.getElementById('cfg-ads')?.checked             ?? true,
      fingerprintProtection: document.getElementById('cfg-fp')?.checked              ?? true,
      userAgentRotation:     document.getElementById('cfg-ua')?.checked              ?? true,
      httpsOnly:             document.getElementById('cfg-https-only')?.checked      ?? false,
      doNotTrack:            document.getElementById('cfg-dnt')?.checked             ?? false,
      logEnabled:            document.getElementById('cfg-log')?.checked             ?? true,
    };
    await window.secureBrowser?.saveConfig(finalCfg);
    settingsConfig = finalCfg;
    window._ilgezdiNewTabMode   = finalCfg.newTabMode    || 'blank';
    window._ilgezdiCustomNewTab = finalCfg.customNewTabUrl || '';
    updateUnsavedBar();
    const btn=document.getElementById('btn-save-all');
    if(btn){btn.textContent='✓ Kaydedildi';setTimeout(()=>btn.textContent='💾 Kaydet',2000);}
    showSettingsToast('Ayarlar kaydedildi!');
  });

  // GERİ AL
  document.getElementById('btn-discard-all')?.addEventListener('click', discardPendingChanges);
  document.getElementById('btn-discard-changes')?.addEventListener('click', discardPendingChanges);

  // Panel kapat
  document.querySelector('#panel-settings [data-panel="settings"]')?.addEventListener('click',()=>window.ilgezdiCloseAllPanels?.());
}

// ─── Settings butonu ──────────────────────────────────────────────────────────
function upgradeSettingsButton() {
  const btn = document.getElementById('btn-settings');
  if (!btn) return;
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', async()=>{
    const panel = document.getElementById('panel-settings');
    if (!panel) return;
    if (panel.classList.contains('visible')) {
      window.ilgezdiCloseAllPanels?.();
    } else {
      window.ilgezdiCloseAllPanels?.();
      settingsConfig = await window.secureBrowser?.getConfig() || {};
      if (!settingsConfig.theme) settingsConfig.theme = 'otuken';

      // Kaydedilmiş değerleri yükle
      _savedTheme      = settingsConfig.theme;
      _savedAccent     = settingsConfig.accentColor || THEMES[_savedTheme]?.accent || '#c8803a';
      _savedFontSize   = settingsConfig.fontSize    || 13;
      _savedFontFamily = settingsConfig.fontFamily  || "'DM Sans', sans-serif";
      currentLang      = settingsConfig.language    || 'tr';

      // Pending'i saved ile başlat
      initPendingState();

      panel.classList.remove('hidden');
      requestAnimationFrame(()=>panel.classList.add('visible'));
      newBtn.classList.add('active');
      window.secureBrowser?.panelOpened(true);
      renderSettingsTab('customization', settingsConfig);
      initSettingsPanelEvents();
      updateUnsavedBar();
    }
  });
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown',(e)=>{
    const ctrl=e.ctrlKey||e.metaKey;
    if(!ctrl) return;
    if(e.key===',')               {e.preventDefault();document.getElementById('btn-settings')?.click();}
    if(e.shiftKey&&e.key==='V')   {e.preventDefault();document.getElementById('btn-vpn-panel')?.click();}
    if(e.shiftKey&&e.key==='L')   {e.preventDefault();document.getElementById('btn-logs')?.click();}
    if(e.key==='b'||e.key==='B')  {e.preventDefault();document.getElementById('btn-bookmarks')?.click();}
  });
}

async function initFaz4() {
  await loadSavedTheme();
  injectSettingsPanelStyles();
  injectSettingsPanelHTML();
  upgradeSettingsButton();
  initKeyboardShortcuts();
  console.log('[İlgezdi Faz4] Ayarlar hazır — önizleme modu aktif');
}


window.addEventListener('load', ()=>setTimeout(initFaz4, 700));

window.addEventListener('DOMContentLoaded', ()=>{
  console.log('[TEST B] DOMContentLoaded anında localStorage:', localStorage.getItem('ilgezdi-theme'));
});