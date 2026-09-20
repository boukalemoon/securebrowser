'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let settingsConfig  = {};
let currentLang     = 'tr';

// Kaydedilmiş (gerçek) değerler
let _savedTheme      = 'otuken';
let _savedAccent     = '#d4a85a';
let _savedFontSize   = 13;
let _savedFontFamily = "'Inter', sans-serif";

// Panel içinde seçilen (henüz kaydedilmemiş) değerler
let _pendingTheme      = null;
let _pendingAccent     = null;
let _pendingFontSize   = null;
let _pendingFontFamily = null;

// NOT: Değerler primitives.css'teki Claude Design token'larıyla BİREBİR eşleşir.
// bg=--bg · surface=--bg-soft · tab=--bg-elev · input=--bg-soft · textMain=--ink
// textMuted=--ink-mute · accent=--gold · border=--line
const THEMES = {
  otuken: { bg:'#0e1a2e', surface:'#1c2e4a', tab:'#15243d', input:'#1c2e4a', textMain:'#e8d9b8', textMuted:'#6f7a92', accent:'#d4a85a', border:'#2a3e5e', success:'#68d391', danger:'#fc8181', warning:'#f6ad55' },
  hibrit:  { bg:'#0a1422', surface:'#1a2c4a', tab:'#122038', input:'#1a2c4a', textMain:'#f0d088', textMuted:'#6a7898', accent:'#f0c674', border:'#2a4068', success:'#68d391', danger:'#fc8181', warning:'#f6ad55' },
  umay:    { bg:'#f5ecd9', surface:'#ebe0c5', tab:'#fbf5e6', input:'#ebe0c5', textMain:'#1a2640', textMuted:'#8a8472', accent:'#b8893a', border:'#d8c9a4', success:'#276749', danger:'#c53030', warning:'#b45309' },
  kagan:   { bg:'#f0e0c4', surface:'#e6d2ae', tab:'#f7e9d0', input:'#e6d2ae', textMain:'#3a1f12', textMuted:'#8a6a4a', accent:'#b85c3a', border:'#c89a6a', success:'#276749', danger:'#7b1818', warning:'#854d0e' },
};

const ACCENT_COLORS = [
  { key:'settings.accent.copper',     value:'#d4a85a' },
  { key:'settings.accent.brightGold', value:'#f0c674' },
  { key:'settings.accent.bronze',     value:'#c87f4a' },
  { key:'settings.accent.terracotta', value:'#b85c3a' },
  { key:'settings.accent.skyBlue',    value:'#8aa6c8' },
  { key:'settings.accent.green',      value:'#68d391' },
  { key:'settings.accent.purple',     value:'#9f7aea' },
  { key:'settings.accent.red',        value:'#fc8181' },
];

const FONT_FAMILIES = [
  { key:"settings.font.interDefault", value:"'Inter', sans-serif" },
  { key:"settings.font.cinzel",       value:"'Cinzel', serif" },
  { name:"System UI",          value:"system-ui, sans-serif" },
  { name:"Segoe UI",           value:"'Segoe UI', sans-serif" },
  { name:"Georgia",            value:"Georgia, serif" },
];

// ─── Gerçek tema uygulama (sadece Kaydet'te çağrılır) ─────────────────────────
// YENİ MİMARİ: Tüm renkleri inline style olarak yazmak yerine
// <html data-theme="..."> attribute'unu set ediyoruz. Tema renkleri
// styles/tokens/primitives.css içindeki [data-theme="..."] blokları
// (Claude Design token'ları) tarafından otomatik uygulanır.
//
// Custom accent ise tema default'undan farklı bir renk seçtiyse inline yazılır,
// aynı default'u seçtiyse inline temizlenir (CSS'deki tema default'u devreye girer).

// Her temanın "dokunulmamış" vurgu rengi = o temanın --gold token'ı.
// Kullanıcı bunu seçtiğinde inline override YAZILMAZ → primitives.css devreye girer.
const THEME_DEFAULT_ACCENTS = {
  otuken: '#d4a85a',
  hibrit: '#f0c674',
  umay:   '#b8893a',
  kagan:  '#b85c3a',
};

// Tasarım öncesi (eski) vurgu varsayılanları — kayıtlı config'de bunlardan biri
// varsa "özel renk" değil, sadece eski default sayılır ve temizlenir.
const LEGACY_DEFAULT_ACCENTS = ['#c8803a', '#d4a935', '#2868a8', '#b02828', '#3182ce', '#a82020'];

// Tema + accent'i sadece DOM'a yansıtır. localStorage'a yazmaz, _savedXxx'lere
// dokunmaz. Önizleme ve commit'in ortak yardımcısı.
function applyThemeToDOM(themeName, accentColor) {
  const root = document.documentElement;
  root.setAttribute('data-theme', themeName);

  const themeDefault = THEME_DEFAULT_ACCENTS[themeName] || '#d4a85a';
  // Component'lar vurgu için --gold/--gold-bright/--copper kullanıyor (--accent değil),
  // bu yüzden özel renk seçildiğinde ASIL bunları override ediyoruz.
  const goldVars = ['--gold', '--gold-bright', '--copper', '--accent'];
  if (accentColor && accentColor !== themeDefault) {
    goldVars.forEach(v => root.style.setProperty(v, accentColor));
    root.style.setProperty('--accent-glow',   accentColor + '2e');
    root.style.setProperty('--accent-border', accentColor + '80');
  } else {
    goldVars.forEach(v => root.style.removeProperty(v));
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-border');
  }
}

// Kullanıcı "Kaydet"e basınca çağrılır. State'i + localStorage'ı + DOM'u günceller.
function commitTheme(themeName, accentColor, fontSize, fontFamily) {
  _savedTheme      = themeName || 'otuken';
  _savedFontSize   = parseInt(fontSize) || 13;
  _savedFontFamily = fontFamily || "'Inter', sans-serif";

  const themeDefault = THEME_DEFAULT_ACCENTS[_savedTheme] || '#d4a85a';
  _savedAccent = (accentColor && accentColor !== themeDefault) ? accentColor : themeDefault;

  // Eski body.theme-* class'larını temizle (eski sistem kalıntısı)
  document.body.className = document.body.className.replace(/theme-\S+/g, '').trim();

  // DOM'a yansıt — yardımcı fonksiyon kullanıyoruz
  applyThemeToDOM(_savedTheme, _savedAccent);

  // Font
  document.documentElement.style.setProperty('--font-size-base', _savedFontSize + 'px');
  document.body.style.fontFamily = _savedFontFamily;

 // config.json'a kaydet (Electron fs ile diske senkron yazılır — kayıp olmaz)
window.secureBrowser?.saveConfig({
  theme:       _savedTheme,
  accentColor: _savedAccent,
  fontSize:    _savedFontSize,
  fontFamily:  _savedFontFamily,
}).then(() => {
  console.log('[İlgezdi/Theme] kaydedildi:', { theme: _savedTheme, accent: _savedAccent });
  window.ilgezdiSync?.schedulePush();
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

    // Tasarım öncesi kayıtlı vurgu rengi varsa "özel renk" sayma → null bırak ki
    // yeni tema --gold token'ı devreye girsin (birebir tasarım görünümü).
    let accent = cfg?.accentColor || null;
    if (accent && LEGACY_DEFAULT_ACCENTS.includes(accent.toLowerCase())) accent = null;

    const fontSize   = cfg?.fontSize    || 13;
    // Eski 'DM Sans' varsayılanı artık import edilmiyor → Inter'e migrate et.
    let fontFamily = cfg?.fontFamily || "'Inter', sans-serif";
    if (/DM Sans/i.test(fontFamily)) fontFamily = "'Inter', sans-serif";

    commitTheme(theme, accent, fontSize, fontFamily);
    applyAccessibility(cfg);
  } catch (e) {
    console.warn('[İlgezdi/Theme] yükleme hatası:', e);
    commitTheme('otuken', null, 13, "'Inter', sans-serif");
  }
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
function injectSettingsPanelStyles() {
  if (document.getElementById('ilgezdi-settings-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-settings-style';
  s.textContent = `
    /* Genişlik .side-panel'den (--panel-w = 420px, main.js PANEL_WIDTH ile aynı) gelir — D-03 */
    /* İkon üstte, ad altta, eşit sütunlar: 6 sekme 420 px panele sığar. Yan yana
       metinle 434 px tutuyordu, "Tanılama" sağda kesiliyordu (kullanıcı bildirdi). */
    .settings-tabs { display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:2px; background:var(--bg-surface); border-bottom:1px solid var(--border-color); padding:0 8px; flex-shrink:0; }
    /* Uzun dillerde (fr "Mots de passe") çok sözcüklü ad iki satıra iner; tek uzun sözcük
       ("Confidentialité") fitSettingsTabLabels ile biraz küçülür, en son çare üç nokta. */
    .settings-tab { display:flex; flex-direction:column; align-items:center; gap:3px; min-width:0; padding:8px 2px 7px; font-size:10px; font-weight:600; color:var(--text-muted); cursor:pointer; border:none; border-bottom:2px solid transparent; background:none; white-space:nowrap; transition:all .15s; }
    .settings-tab-icon { font-size:14px; line-height:1; }
    .settings-tab-label { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:normal; line-height:1.15; text-align:center; }
    .settings-tab:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; border-radius:4px; }
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
    <div class="panel-header"><h2>${TH('settings.title')}</h2><button class="panel-close" data-panel="settings" aria-label="${TH('common.closePanel')}">✕</button></div>
    <div class="settings-tabs" role="tablist" aria-label="${TH('settings.tabsLabel')}">
      <button class="settings-tab active" data-tab="customization" role="tab" aria-selected="true"><span class="settings-tab-icon" aria-hidden="true">🎨</span><span class="settings-tab-label">${TH('settings.tab.customization')}</span></button>
      <button class="settings-tab" data-tab="account" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">👤</span><span class="settings-tab-label">${TH('settings.tab.account')}</span></button>
      <button class="settings-tab" data-tab="general" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">⚙</span><span class="settings-tab-label">${TH('settings.tab.general')}</span></button>
      <button class="settings-tab" data-tab="privacy" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">🛡</span><span class="settings-tab-label">${TH('settings.tab.privacy')}</span></button>
      <button class="settings-tab" data-tab="passwords" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">🔑</span><span class="settings-tab-label">${TH('settings.tab.passwords')}</span></button>
      <button class="settings-tab" data-tab="diag" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">🩺</span><span class="settings-tab-label">${TH('settings.tab.diag')}</span></button>
    </div>
    <div class="settings-unsaved-bar" id="settings-unsaved-bar">
      <span>${TH('settings.unsaved')}</span>
      <button class="settings-unsaved-discard" id="btn-discard-changes">${TH('settings.undo')}</button>
    </div>
    <div class="settings-content" id="settings-content"></div>
    <div class="settings-footer">
      <button class="btn-discard-settings" id="btn-discard-all" style="display:none">${TH('settings.undoAll')}</button>
      <button class="btn-save-settings" id="btn-save-all">${TH('settings.save')}</button>
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

// ─── Form alanları (Özelleştir, Genel, Gizlilik) ─────────────────────────────
// Sekmeler tek tek çizilir. Kaydet eskiden değerleri o an EKRANDAKİ sekmeden okuyordu:
// başka sekmedeki kutu DOM'da olmadığı için `?.checked ?? false` varsayılana düşüyordu.
// Ör. Gizlilik'te "Yalnızca HTTPS" açılıp başka sekmede Kaydet'e basılınca false
// kaydediliyordu (kullanıcı: "ayarlarım kayıt olmuyor"). Artık her değişiklik
// _formCfg'ye yazılır; sekmeler buradan çizilir, Kaydet buradan kaydeder.
const SETTINGS_FIELDS = {
  'new-tab-mode':      ['newTabMode', 'value'],
  'custom-newtab-url': ['customNewTabUrl', 'value'],
  'search-engine':     ['searchEngine', 'value'],
  'cfg-startup-mode':  ['startupMode', 'value'],
  'homepage-input':    ['homepage', 'value'],
  'lang-select':       ['language', 'value'],
  'cfg-ask-download':  ['askDownloadLocation', 'checked'],
  'cfg-notifications': ['notifications', 'checked'],
  'cfg-vpn-notify':    ['vpnNotify', 'checked'],
  'cfg-pw-offer':      ['offerToSavePasswords', 'checked'],
  'cfg-page-zoom':     ['defaultPageZoom', 'value'],
  'cfg-min-font':      ['minimumFontSize', 'value'],
  'cfg-reduce-motion': ['reduceMotion', 'checked'],
  'cfg-high-contrast': ['highContrast', 'checked'],
  'cfg-vertical-tabs': ['verticalTabs', 'checked'],
  'cfg-block-autoplay': ['blockAutoplay', 'checked'],
  'cfg-clear-site-exit': ['clearSiteDataOnExit', 'checked'],
  'cfg-clear-history-exit': ['clearHistoryOnExit', 'checked'],
  'cfg-hw-accel':      ['hardwareAcceleration', 'checked'],
  'cfg-warn-close':    ['warnOnCloseTabs', 'checked'],
  'cfg-tab-sleep':     ['tabSleepMinutes', 'value'],
};
let _formBase = {};
let _formCfg  = {};

// Kayıtlı yapılandırmadan formun göstereceği değerler (sekmelerin varsayılanlarıyla aynı).
function formValuesFrom(cfg) {
  const c = cfg || {};
  return {
    newTabMode:             c.newTabMode === 'custom' ? 'custom' : 'blank',
    customNewTabUrl:        c.customNewTabUrl || '',
    searchEngine:           c.searchEngine || 'duckduckgo',
    startupMode:            c.startupMode === 'restore' ? 'restore' : 'homepage',
    homepage:               c.homepage && c.homepage !== 'about:blank' ? c.homepage : '',
    language:               (window.ilgezdiI18n?.languages || []).some((l) => l.code === c.language) ? c.language : 'auto',
    downloadFolder:         c.downloadFolder || '',
    askDownloadLocation:    !!c.askDownloadLocation,
    notifications:          c.notifications !== false,
    vpnNotify:              c.vpnNotify !== false,
    offerToSavePasswords:   c.offerToSavePasswords !== false,
    defaultPageZoom:        PAGE_ZOOMS_UI.includes(Number(c.defaultPageZoom)) ? String(Number(c.defaultPageZoom)) : '1',
    minimumFontSize:        MIN_FONTS_UI.some(([v]) => v === Number(c.minimumFontSize)) ? String(Number(c.minimumFontSize)) : '0',
    reduceMotion:           c.reduceMotion === true,
    highContrast:           c.highContrast === true,
    verticalTabs:           c.verticalTabs === true,
    blockAutoplay:          c.blockAutoplay !== false,
    clearSiteDataOnExit:    c.clearSiteDataOnExit === true,
    clearHistoryOnExit:     c.clearHistoryOnExit === true,
    hardwareAcceleration:   c.hardwareAcceleration !== false,
    warnOnCloseTabs:        c.warnOnCloseTabs === true,
    tabSleepMinutes:        TAB_SLEEP_UI.some(([v]) => v === Number(c.tabSleepMinutes)) && c.tabSleepMinutes !== null && c.tabSleepMinutes !== '' ? String(Number(c.tabSleepMinutes)) : '120',
  };
}

// Ana süreçteki listeyle aynı (browser-commands.js → normalizeTabSleepMinutes).
const TAB_SLEEP_UI = [[0, 'settings.off'], [15, 'settings.tabSleep.15'], [30, 'settings.tabSleep.30'], [60, 'settings.tabSleep.60'], [120, 'settings.tabSleep.120']];

// Ana süreçteki listelerle aynı (browser-commands.js → normalizePageZoom / normalizeMinFontSize).
const PAGE_ZOOMS_UI = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const MIN_FONTS_UI = [[0, null], [10, '10 px'], [12, '12 px'], [14, '14 px'], [16, '16 px'], [18, '18 px'], [20, '20 px'], [24, '24 px']];

// Erişilebilirlik (Ayarlar › Özelleştir): arayüzde hareketi azalt ve yüksek karşıtlık.
function applyAccessibility(cfg) {
  const root = document.documentElement;
  root.toggleAttribute('data-reduce-motion', !!cfg && cfg.reduceMotion === true);
  if (cfg && cfg.highContrast === true) root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
}

function initFormState(cfg) {
  _formBase = formValuesFrom(cfg);
  _formCfg  = { ..._formBase };
}

function formHasChanges() {
  return Object.keys(_formBase).some((k) => _formCfg[k] !== _formBase[k]);
}

// Form alanı değişince (hangi sekmede olursa olsun) bekleyen değere yazılır.
function onSettingsFieldChange(e) {
  const field = SETTINGS_FIELDS[e.target?.id];
  if (!field) return;
  const [key, prop] = field;
  _formCfg[key] = prop === 'checked' ? !!e.target.checked : String(e.target.value ?? '');
  if (key === 'hardwareAcceleration' || key === 'language') updateRelaunchRow();
  updateUnsavedBar();
}

// Donanım hızlandırma bu oturumda açık mı başladı (ana süreç bildirir); form değeri
// bundan farklıysa "Kaydet ve yeniden başlat" gösterilir.
let _runtimeHwAccel = null;
let _runtimeLanguage = null;
function updateRelaunchRow() {
  const row = document.getElementById('relaunch-row');
  if (row && _runtimeHwAccel !== null) row.hidden = (_formCfg.hardwareAcceleration !== false) === _runtimeHwAccel;
  const langRow = document.getElementById('lang-relaunch-row');
  if (langRow && _runtimeLanguage !== null) langRow.hidden = String(_formCfg.language || 'auto') === _runtimeLanguage;
}

function hasPendingChanges() {
  return (
    _pendingTheme      !== _savedTheme      ||
    _pendingAccent     !== _savedAccent     ||
    _pendingFontSize   !== _savedFontSize   ||
    _pendingFontFamily !== _savedFontFamily ||
    formHasChanges()
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
  document.documentElement.style.setProperty('--font-size-base', _savedFontSize + 'px');
  document.body.style.fontFamily = _savedFontFamily;

  _formCfg = { ..._formBase };
  updateUnsavedBar();
  selectSettingsTab(document.querySelector('.settings-tab.active')?.dataset.tab || 'customization');
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
      <span class="preview-label">${TH('settings.preview.background')}</span>
      <span class="preview-value">${th.bg}</span>
    </div>
    <div class="preview-row">
      <div class="preview-swatch" style="background:${acc}"></div>
      <span class="preview-label">${TH('settings.preview.accent')}</span>
      <span class="preview-value">${acc}</span>
    </div>
    <div class="preview-row">
      <div class="preview-swatch" style="background:${th.textMain}"></div>
      <span class="preview-label">${TH('settings.preview.text')}</span>
      <span class="preview-value" style="font-size:${_pendingFontSize}px">Aa — ${_pendingFontSize}px</span>
    </div>`;
}

// ─── Tab HTML ─────────────────────────────────────────────────────────────────
function renderCustomizationTab(cfg) {
  const themeList = [
    { id:'otuken', bg:'#0e1a2e', dots:['#1c2e4a','#d4a85a','#8aa6c8'], badge:true },
    { id:'hibrit', bg:'#0a1422', dots:['#1a2c4a','#f0c674','#88a4d0'], badge:false },
    { id:'umay',   bg:'#f5ecd9', dots:['#ebe0c5','#b8893a','#a45a30'], badge:false },
    { id:'kagan',  bg:'#f0e0c4', dots:['#e6d2ae','#b85c3a','#8a3f25'], badge:false },
  ];
  return `
    <div class="settings-section"><h3>${TH('settings.theme.title')}</h3>
      <div class="theme-grid">
        ${themeList.map(th => `
          <div class="theme-card ${_pendingTheme===th.id?'selected':''}" data-theme="${th.id}">
            <div class="theme-preview" style="background:${th.bg}">
              ${th.dots.map(d=>`<div class="theme-dot" style="background:${d}"></div>`).join('')}
              ${th.badge?`<span class="theme-badge" style="color:${th.dots[1]}">${TH('settings.theme.mainBadge')}</span>`:''}
            </div>
            <span>${TH('settings.theme.' + th.id)}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.accent.title')}</h3>
      <div class="accent-grid">
        ${ACCENT_COLORS.map(ac=>`
          <div class="accent-swatch ${_pendingAccent===ac.value?'selected':''}"
               style="background:${ac.value}" data-accent="${ac.value}" title="${TH(ac.key)}">
            ${_pendingAccent===ac.value?'<span style="color:#000;font-size:11px;font-weight:900;pointer-events:none">✓</span>':''}
          </div>`).join('')}
      </div>
      <div class="s-input-row">
        <label>${TH('settings.accent.custom')}</label>
        <input type="color" id="custom-accent" value="${_pendingAccent||'#d4a85a'}" style="height:36px;padding:2px;cursor:pointer;border-radius:6px" />
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.font.title')}</h3>
      <div class="s-input-row">
        <label>${TH('settings.font.family')}</label>
        <select id="font-family-select">
          ${FONT_FAMILIES.map(f=>`<option value="${f.value}" ${_pendingFontFamily===f.value?'selected':''}>${f.key ? TH(f.key) : f.name}</option>`).join('')}
        </select>
      </div>
      <div class="s-input-row">
        <label>${TH('settings.font.size')}</label>
        <div class="font-slider-wrap">
          <input type="range" class="font-slider" id="font-size-slider" min="11" max="18" step="1" value="${_pendingFontSize}" />
          <div class="font-size-badge" id="font-size-val">${_pendingFontSize}px</div>
        </div>
        <div class="font-preview" id="font-preview-text" style="font-size:${_pendingFontSize}px;font-family:${_pendingFontFamily}">
          ${TH('settings.font.preview')}
        </div>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.tabs.title')}</h3>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.tabs.vertical')}</div><div class="s-toggle-sub">${TH('settings.tabs.verticalHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-vertical-tabs" ${cfg.verticalTabs === true ? 'checked' : ''}/><span class="slider"></span></label>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.a11y.title')}</h3>
      <div class="s-input-row">
        <label for="cfg-page-zoom">${TH('settings.a11y.pageZoom')}</label>
        <select id="cfg-page-zoom">
          ${PAGE_ZOOMS_UI.map((z) => `<option value="${z}" ${String(cfg.defaultPageZoom) === String(z) ? 'selected' : ''}>%${Math.round(z * 100)}</option>`).join('')}
        </select>
      </div>
      <p class="s-hint">${TH('settings.a11y.pageZoomHint')}</p>
      <div class="s-input-row">
        <label for="cfg-min-font">${TH('settings.a11y.minFont')}</label>
        <select id="cfg-min-font">
          ${MIN_FONTS_UI.map(([v, t]) => `<option value="${v}" ${String(cfg.minimumFontSize) === String(v) ? 'selected' : ''}>${t === null ? TH('settings.off') : t}</option>`).join('')}
        </select>
      </div>
      <p class="s-hint">${TH('settings.a11y.minFontHint')}</p>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.a11y.reduceMotion')}</div><div class="s-toggle-sub">${TH('settings.a11y.reduceMotionHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-reduce-motion" ${cfg.reduceMotion ? 'checked' : ''}/><span class="slider"></span></label>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.a11y.highContrast')}</div><div class="s-toggle-sub">${TH('settings.a11y.highContrastHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-high-contrast" ${cfg.highContrast ? 'checked' : ''}/><span class="slider"></span></label>
      </div>
    </div>
    <div id="theme-preview-box" class="theme-preview-box"></div>
    <div class="settings-section"><h3>${TH('settings.newTab.title')}</h3>
      <div class="s-input-row">
        <select id="new-tab-mode">
          <option value="blank" ${cfg.newTabMode==='blank'?'selected':''}>${TH('settings.newTab.blank')}</option>
          <option value="custom"${cfg.newTabMode==='custom'?'selected':''}>${TH('settings.newTab.custom')}</option>
        </select>
      </div>
      <div id="custom-newtab-wrap" style="${cfg.newTabMode==='custom'?'':'display:none'}">
        <div class="s-input-row"><label>${TH('settings.newTab.custom')}</label><input type="text" id="custom-newtab-url" value="${cfg.customNewTabUrl||''}" placeholder="https://" /></div>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.search.title')}</h3>
      <div class="s-input-row">
        <select id="search-engine">
          <option value="duckduckgo" ${cfg.searchEngine==='duckduckgo'?'selected':''}>${TH('settings.search.duckduckgo')}</option>
          <option value="google"     ${cfg.searchEngine==='google'?'selected':''}>Google</option>
          <option value="bing"       ${cfg.searchEngine==='bing'?'selected':''}>Bing</option>
          <option value="yandex"     ${cfg.searchEngine==='yandex'?'selected':''}>Yandex</option>
          <option value="yahoo"      ${cfg.searchEngine==='yahoo'?'selected':''}>Yahoo</option>
          <option value="brave"      ${cfg.searchEngine==='brave'?'selected':''}>Brave Search</option>
          <option value="ecosia"     ${cfg.searchEngine==='ecosia'?'selected':''}>Ecosia</option>
          <option value="startpage"  ${cfg.searchEngine==='startpage'?'selected':''}>Startpage</option>
        </select>
      </div>
      <p class="s-hint">${TH('settings.search.hint')}</p>
    </div>
    <div class="settings-section"><h3>${TH('settings.startup.title')}</h3>
      <div class="s-input-row">
        <label for="cfg-startup-mode">${TH('settings.startup.label')}</label>
        <select id="cfg-startup-mode">
          <option value="homepage" ${(cfg.startupMode||'homepage')==='homepage'?'selected':''}>${TH('settings.startup.homepage')}</option>
          <option value="restore"  ${cfg.startupMode==='restore'?'selected':''}>${TH('settings.startup.restore')}</option>
        </select>
      </div>
      <p class="s-hint">${TH('settings.startup.hint')}</p>
    </div>
    <div class="settings-section"><h3>${TH('settings.homepage.title')}</h3>
      <div class="s-input-row"><input type="text" id="homepage-input" value="${cfg.homepage && cfg.homepage!=='about:blank' ? cfg.homepage : ''}" placeholder="${TH('settings.homepage.placeholder')}" /></div>
      <p class="s-hint">${TH('settings.homepage.hint')}</p>
    </div>`;
}

function renderGeneralTab(cfg) {
  return `
    <div class="settings-section"><h3>${TH('settings.defaultBrowser.title')}</h3>
      <div class="s-input-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div class="s-toggle-label">${TH('settings.defaultBrowser.question')}</div>
          <div class="s-toggle-sub" id="default-browser-status" aria-live="polite">${TH('settings.defaultBrowser.checking')}</div>
        </div>
        <button class="folder-btn" id="btn-default-browser" hidden>${TH('settings.defaultBrowser.make')}</button>
      </div>
      <p class="s-hint">${TH('settings.defaultBrowser.hint')}</p>
    </div>
    <div class="settings-section"><h3>${TH('settings.language.title')}</h3>
      <div class="s-input-row"><label for="lang-select">${TH('settings.language.label')}</label><select id="lang-select">
        <option value="auto" ${(cfg.language || 'auto') === 'auto' ? 'selected' : ''}>${TH('settings.language.auto')}</option>
        ${(window.ilgezdiI18n?.languages || []).map((l) => `<option value="${l.code}" lang="${l.code}" ${cfg.language === l.code ? 'selected' : ''}>${window.ilgezdiI18n.TH('settings.language.option', { name: l.name })}</option>`).join('')}
      </select></div>
      <div id="lang-relaunch-row" hidden>
        <div class="s-input-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <span class="s-hint" style="margin:0">${TH('settings.language.relaunchHint')}</span>
          <button class="folder-btn" id="btn-lang-relaunch">${TH('settings.relaunch.button')}</button>
        </div>
      </div>
      <p class="s-hint">${TH('settings.language.hint')}</p>
    </div>
    <div class="settings-section"><h3>${TH('settings.download.title')}</h3>
      <div class="s-input-row"><label>${TH('settings.download.folder')}</label>
        <div class="folder-row">
          <input type="text" id="download-folder" value="${window.ilgezdiHtml.esc(cfg.downloadFolder||'')}" placeholder="${TH('settings.download.folderPlaceholder')}" readonly />
          <button class="folder-btn" id="btn-pick-folder">${TH('settings.download.pick')}</button>
        </div>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.download.ask')}</div><div class="s-toggle-sub">${TH('settings.download.askHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-ask-download" ${cfg.askDownloadLocation?'checked':''}/><span class="slider"></span></label>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.notifications.title')}</h3>
      <div class="s-toggle-row">
        <div class="s-toggle-label">${TH('settings.notifications.site')}</div>
        <label class="switch"><input type="checkbox" id="cfg-notifications" ${cfg.notifications!==false?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.notifications.vpn')}</div><div class="s-toggle-sub">${TH('settings.notifications.vpnHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-vpn-notify" ${cfg.vpnNotify!==false?'checked':''}/><span class="slider"></span></label>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.media.title')}</h3>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.media.autoplay')}</div><div class="s-toggle-sub">${TH('settings.media.autoplayHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-block-autoplay" ${cfg.blockAutoplay!==false?'checked':''}/><span class="slider"></span></label>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.clear.title')}</h3>
      <div class="clear-grid">
        <button class="clear-btn" id="btn-clear-cache">${TH('settings.clear.cache')}</button>
        <button class="clear-btn" id="btn-clear-history">${TH('settings.clear.history')}</button>
        <button class="clear-btn" id="btn-clear-cookies">${TH('settings.clear.cookies')}</button>
        <button class="clear-btn" id="btn-clear-all" style="border-color:var(--danger);color:var(--danger)">${TH('settings.clear.all')}</button>
      </div>
      <div id="clear-status" style="font-size:11px;color:var(--success);margin-top:8px;min-height:14px"></div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.clear.siteDataOnExit')}</div><div class="s-toggle-sub">${TH('settings.clear.siteDataOnExitHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-clear-site-exit" ${cfg.clearSiteDataOnExit===true?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.clear.historyOnExit')}</div><div class="s-toggle-sub">${TH('settings.clear.historyOnExitHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-clear-history-exit" ${cfg.clearHistoryOnExit===true?'checked':''}/><span class="slider"></span></label>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.shortcuts.title')}</h3>
      <p class="s-hint" style="margin-top:0">${TH('settings.shortcuts.hint')}</p>
      <table class="shortcut-table">
        <tr><td>${TH('settings.shortcut.newTab')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">T</span></td></tr>
        <tr><td>${TH('settings.shortcut.closeTab')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">W</span></td></tr>
        <tr><td>${TH('settings.shortcut.reopenTab')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">T</span></td></tr>
        <tr><td>${TH('settings.shortcut.nextPrevTab')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Tab</span> · <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">Tab</span></td></tr>
        <tr><td>${TH('settings.shortcut.tabN')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">1</span>…<span class="kbd">8</span> · <span class="kbd">Ctrl</span>+<span class="kbd">9</span></td></tr>
        <tr><td>${TH('settings.shortcut.address')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">L</span> · <span class="kbd">Alt</span>+<span class="kbd">D</span> · <span class="kbd">F6</span></td></tr>
        <tr><td>${TH('settings.shortcut.reload')}</td><td><span class="kbd">F5</span> · <span class="kbd">Ctrl</span>+<span class="kbd">F5</span></td></tr>
        <tr><td>${TH('settings.shortcut.backForward')}</td><td><span class="kbd">Alt</span>+<span class="kbd">←</span> · <span class="kbd">Alt</span>+<span class="kbd">→</span></td></tr>
        <tr><td>${TH('settings.shortcut.find')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">F</span> · <span class="kbd">F3</span></td></tr>
        <tr><td>${TH('settings.shortcut.zoom')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">+</span> · <span class="kbd">Ctrl</span>+<span class="kbd">-</span> · <span class="kbd">Ctrl</span>+<span class="kbd">0</span></td></tr>
        <tr><td>${TH('settings.shortcut.print')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">P</span></td></tr>
        <tr><td>${TH('settings.shortcut.fullscreen')}</td><td><span class="kbd">F11</span></td></tr>
        <tr><td>${TH('settings.shortcut.bookmark')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">D</span></td></tr>
        <tr><td>${TH('settings.shortcut.bookmarksPanel')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">O</span> · <span class="kbd">Ctrl</span>+<span class="kbd">B</span></td></tr>
        <tr><td>${TH('settings.shortcut.incognito')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">N</span></td></tr>
        <tr><td>${TH('settings.shortcut.settings')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">,</span></td></tr>
        <tr><td>${TH('settings.shortcut.logs')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">L</span></td></tr>
        <tr><td>${TH('settings.shortcut.historyDownloads')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">H</span> · <span class="kbd">Ctrl</span>+<span class="kbd">J</span></td></tr>
        <tr><td>${TH('settings.shortcut.reader')}</td><td><span class="kbd">F9</span></td></tr>
        <tr><td>${TH('settings.shortcut.tabSearch')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">A</span></td></tr>
        <tr><td>${TH('settings.shortcut.devtools')}</td><td><span class="kbd">F12</span> · <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">I</span></td></tr>
        <tr><td>${TH('settings.shortcut.screenshot')}</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">S</span></td></tr>
      </table>
    </div>
    <div class="settings-section"><h3>${TH('settings.update.title')}</h3>
      <div class="s-input-row" style="align-items:center;justify-content:space-between;display:flex;gap:10px">
        <div>
          <div class="s-toggle-label">${TH('settings.update.version')}</div>
          <div class="s-toggle-sub" id="app-version-text">—</div>
        </div>
        <button class="folder-btn" id="btn-check-updates">${TH('settings.update.check')}</button>
      </div>
      <div id="update-check-status" style="font-size:11.5px;color:var(--text-muted);margin-top:8px;min-height:15px"></div>
    </div>
    <div class="settings-section"><h3>${TH('settings.system.title')}</h3>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.system.hwAccel')}</div><div class="s-toggle-sub">${TH('settings.system.hwAccelHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-hw-accel" ${cfg.hardwareAcceleration!==false?'checked':''}/><span class="slider"></span></label>
      </div>
      <div id="relaunch-row" hidden>
        <div class="s-input-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <span class="s-hint" style="margin:0">${TH('settings.system.relaunchHint')}</span>
          <button class="folder-btn" id="btn-relaunch">${TH('settings.relaunch.button')}</button>
        </div>
      </div>
      <div class="s-input-row">
        <label for="cfg-tab-sleep">${TH('settings.system.tabSleep')}</label>
        <select id="cfg-tab-sleep">
          ${TAB_SLEEP_UI.map(([v, key]) => `<option value="${v}" ${String(cfg.tabSleepMinutes ?? '120') === String(v) ? 'selected' : ''}>${TH(key)}</option>`).join('')}
        </select>
        <p class="s-hint">${TH('settings.system.tabSleepHint')}</p>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.system.warnClose')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-warn-close" ${cfg.warnOnCloseTabs===true?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="s-input-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div><div class="s-toggle-label">${TH('settings.system.reset')}</div><div class="s-toggle-sub">${TH('settings.system.resetHint')}</div></div>
        <button class="clear-btn" id="btn-reset-settings">${TH('settings.system.resetButton')}</button>
      </div>
    </div>`;
}

// Gizlilik ayarlarının tek yeri Veri ve Gizlilik sayfasıdır (Burak, 20 Eyl 2026:
// "gizlilik ayarlarını tek yere odaklayalım diğerini kaldıralım"). Aynı anahtarlar
// iki menüde durduğu için hangisinin geçerli olduğu karışıyordu. Sekme yerinde
// kalır ki Ayarlar'da gizliliği arayan kullanıcı doğru yere gitsin.
function renderPrivacyTab() {
  return `
    <div class="settings-section"><h3>${TH('data.title')}</h3>
      <p class="s-hint" style="margin-top:0">${TH('data.settingsHint')}</p>
      <p class="s-hint">${TH('data.settingsMoved')}</p>
      <button class="clear-btn" id="btn-open-data-center" style="margin-top:8px">${TH('data.open')}</button>
    </div>`;
}

function renderPasswordsTab(cfg = {}) {
  // NOT: Buradaki eski "ana şifre" ekranı KALDIRILDI. İki nedenle:
  //   1) Şifre btoa() ile saklanıyordu — bu bir özet değil, geri çevrilebilir
  //      Base64; localStorage'ı okuyan biri parolayı düz metin elde ediyordu.
  //   2) Kasa o şifreyle şifrelenmiyordu. Kilit yalnızca bu paneli gizliyordu;
  //      pw-list / pw-reveal IPC'leri kilitten habersizdi, yani koruma yoktu.
  // Kasa gerçekte safeStorage (Windows DPAPI / macOS Keychain / Linux Secret
  // Service) ile korunuyor — Chrome, Edge, Brave ve Opera'nın modeli de bu.
  // Durum kullanıcıya #pwd-protection-note içinde dürüstçe bildirilir.
  return `
    <div class="settings-section"><h3>${TH('settings.pw.saveFill')}</h3>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">${TH('settings.pw.offer')}</div><div class="s-toggle-sub">${TH('settings.pw.offerHint')}</div></div>
        <label class="switch"><input type="checkbox" id="cfg-pw-offer" ${cfg.offerToSavePasswords!==false?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="s-toggle-label" style="margin-top:10px">${TH('settings.pw.neverSites')}</div>
      <div id="pw-never-list"><p class="s-hint" style="margin-top:0">${TH('common.loading')}</p></div>
    </div>
    <div class="settings-section">
      <h3>${TH('settings.pw.protection')}</h3>
      <div id="pwd-protection-note" class="s-hint" style="margin-top:0">${TH('settings.defaultBrowser.checking')}</div>
    </div>
    <div class="settings-section">
      <h3>${TH('settings.pw.gate.title')}</h3>
      <p class="s-hint" style="margin-top:0">${TH('settings.pw.gate.hint')}</p>
      <div id="pw-gate-box"><p class="s-hint">${TH('common.loading')}</p></div>
    </div>
    <div class="settings-section"><h3>${TH('settings.pw.import')}</h3>
      <p class="s-hint" style="margin-top:0">${TH('settings.pw.importHint')}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="pwd-btn" id="btn-pwd-import-browser">${TH('settings.pw.importBrowser')}</button>
        <button class="pwd-btn" id="btn-pwd-import-csv">${TH('settings.pw.importCsv')}</button>
      </div>
    </div>
    <div class="settings-section"><h3>${TH('settings.pw.audit')}</h3>
      <div class="s-input-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div><div class="s-toggle-label">${TH('settings.pw.auditLabel')}</div><div class="s-toggle-sub">${TH('settings.pw.auditHint')}</div></div>
        <button class="folder-btn" id="btn-pw-audit">${TH('settings.pw.auditButton')}</button>
      </div>
      <div id="pw-audit-result" aria-live="polite"></div>
      <div class="s-input-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px">
        <div><div class="s-toggle-label">${TH('settings.pw.pwnedLabel')}</div><div class="s-toggle-sub">${TH('settings.pw.pwnedHint')}</div></div>
        <button class="folder-btn" id="btn-pw-pwned">${TH('settings.pw.pwnedButton')}</button>
      </div>
      <div id="pw-pwned-result" aria-live="polite"></div>
    </div>
    <div class="settings-section"><h3>${TH('settings.pw.add')}</h3>
      <div class="s-input-row"><label>${TH('settings.pw.site')}</label><input type="text" id="pwd-new-site" placeholder="${TH('common.exampleDomain')}"/></div>
      <div class="s-input-row"><label>${TH('settings.pw.username')}</label><input type="text" id="pwd-new-user" placeholder="${TH('settings.pw.usernamePlaceholder')}"/></div>
      <div class="s-input-row"><label for="pwd-new-pass">${TH('settings.pw.password')}</label>
        <div class="folder-row">
          <input type="password" id="pwd-new-pass" placeholder="••••••••" autocomplete="new-password"/>
          <button type="button" class="folder-btn" id="btn-pwd-generate" title="${TH('settings.pw.generateTitle')}">${TH('settings.pw.generate')}</button>
        </div>
      </div>
      <button class="btn-save-settings" id="btn-pwd-add" style="margin-top:4px">${TH('settings.pw.addButton')}</button>
    </div>
    <div class="settings-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0;border:none;padding:0" id="pwd-count-title">${TH('settings.pw.saved', {}, { count: '<span id="pwd-count">…</span>' })}</h3>
      </div>
      <div id="pwd-list-container"><p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px">${TH('common.loading')}</p></div>
    </div>`;
}

// ── Güvenli kasa (main süreç, safeStorage) yardımcıları ──
function _pwEsc(s){ return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

let _pwMigrated = false;
async function migrateOldPasswords() {
  if (_pwMigrated) return; _pwMigrated = true;
  try {
    const raw = localStorage.getItem('ilgezdi-passwords');
    if (!raw) return;
    const old = JSON.parse(atob(raw)) || [];
    for (const p of old) {
      const url = p.site || p.url, password = p.password;
      if (url && password) await window.secureBrowser?.passwords?.add({ url, username: p.username || '', password });
    }
    localStorage.removeItem('ilgezdi-passwords'); // güvensiz base64 kopyayı KALDIR
  } catch {}
}

// ── Kasa kilidi: şifreleri görüntülemeden önce doğrulama ─────────────────────
// Doğrulama ANA SÜREÇTE yapılır; burası yalnızca form. Kod ağa çıkmaz, QRtım
// hesabı ya da internet gerekmez (bkz. main/vault-gate.js).
let _pwGateTimer = null;

function pwGateApi() { return window.secureBrowser?.passwords?.gate; }

function _pwSure(ms) {
  const sn = Math.max(0, Math.ceil(ms / 1000));
  return sn >= 60 ? T('settings.pw.gate.minutes', { count: Math.ceil(sn / 60) }) : T('settings.pw.gate.seconds', { count: sn });
}

async function renderPwGate() {
  const box = document.getElementById('pw-gate-box');
  if (_pwGateTimer) { clearInterval(_pwGateTimer); _pwGateTimer = null; }
  if (!box) return;
  const g = pwGateApi();
  if (!g) { box.innerHTML = `<p class="s-hint">${TH('settings.pw.gate.unavailable')}</p>`; return; }
  const d = await g.status().catch(() => null);
  if (!d) { box.innerHTML = `<p class="s-hint">${TH('settings.pw.gate.unavailable')}</p>`; return; }

  if (!d.kurulu) {
    box.innerHTML = `
      <div class="s-input-row"><label for="pw-gate-new">${TH('settings.pw.gate.newCode')}</label>
        <input type="password" id="pw-gate-new" autocomplete="new-password" placeholder="••••••"/></div>
      <div class="s-input-row"><label for="pw-gate-new2">${TH('settings.pw.gate.repeatCode')}</label>
        <input type="password" id="pw-gate-new2" autocomplete="new-password" placeholder="••••••"/></div>
      <p class="s-hint" style="color:var(--warning, #e0a040)">${TH('settings.pw.gate.noRecovery')}</p>
      <button class="btn-save-settings" id="pw-gate-setup">${TH('settings.pw.gate.setupButton')}</button>
      <p class="s-hint" id="pw-gate-msg" aria-live="polite"></p>`;
    document.getElementById('pw-gate-setup').addEventListener('click', async () => {
      const a = document.getElementById('pw-gate-new').value;
      const b = document.getElementById('pw-gate-new2').value;
      const msg = document.getElementById('pw-gate-msg');
      if (a !== b) { msg.textContent = T('settings.pw.gate.mismatch'); return; }
      const r = await g.setup(a);
      if (r && r.ok) { showSettingsToast(T('settings.pw.gate.ready'), 'success'); renderPwGate(); }
      else msg.textContent = r && r.kod === 'cok_kisa' ? T('settings.pw.gate.tooShort', { count: r.minUzunluk }) : T('settings.pw.gate.failed');
    });
    return;
  }

  if (!d.acik) {
    const bekliyor = d.beklemeMs > 0;
    box.innerHTML = `
      <p class="s-hint" style="margin-top:0">🔒 ${bekliyor ? TH('settings.pw.gate.waiting', { time: _pwSure(d.beklemeMs) }) : TH('settings.pw.gate.locked')}</p>
      <div class="s-input-row"><label for="pw-gate-code">${TH('settings.pw.gate.code')}</label>
        <input type="password" id="pw-gate-code" autocomplete="current-password" placeholder="••••••" ${bekliyor ? 'disabled' : ''}/></div>
      <button class="btn-save-settings" id="pw-gate-unlock" ${bekliyor ? 'disabled' : ''}>${TH('settings.pw.gate.unlockButton')}</button>
      <p class="s-hint" id="pw-gate-msg" aria-live="polite"></p>`;
    const dene = async () => {
      const input = document.getElementById('pw-gate-code');
      const msg = document.getElementById('pw-gate-msg');
      const r = await g.unlock(input.value);
      input.value = '';
      if (r && r.ok) { showSettingsToast(T('settings.pw.gate.unlocked'), 'success'); renderPwGate(); populatePwdList(); return; }
      if (r && r.kod === 'bekle') { renderPwGate(); return; }
      msg.textContent = r && r.beklemeMs > 0
        ? T('settings.pw.gate.wrongWait', { time: _pwSure(r.beklemeMs) })
        : T('settings.pw.gate.wrong');
      if (r && r.beklemeMs > 0) renderPwGate();
    };
    document.getElementById('pw-gate-unlock').addEventListener('click', dene);
    document.getElementById('pw-gate-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') dene(); });
    if (bekliyor) _pwGateTimer = setInterval(() => { if (document.getElementById('pw-gate-box')) renderPwGate(); else clearInterval(_pwGateTimer); }, 5000);
    return;
  }

  box.innerHTML = `
    <p class="s-hint" style="margin-top:0;color:var(--success)">🔓 ${TH('settings.pw.gate.open', { time: _pwSure(d.kalanMs) })}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="pwd-btn" id="pw-gate-lock">${TH('settings.pw.gate.lockNow')}</button>
      <button class="pwd-btn" id="pw-gate-change-t">${TH('settings.pw.gate.change')}</button>
      <button class="pwd-btn danger" id="pw-gate-remove-t">${TH('settings.pw.gate.remove')}</button>
    </div>
    <div id="pw-gate-sub" hidden></div>
    <p class="s-hint" id="pw-gate-msg" aria-live="polite"></p>`;
  document.getElementById('pw-gate-lock').addEventListener('click', async () => {
    await g.lock(); showSettingsToast(T('settings.pw.gate.lockedNow')); renderPwGate(); populatePwdList();
  });
  const sub = document.getElementById('pw-gate-sub');
  const msg = document.getElementById('pw-gate-msg');
  document.getElementById('pw-gate-change-t').addEventListener('click', () => {
    sub.hidden = false;
    sub.innerHTML = `
      <div class="s-input-row"><label for="pw-gate-old">${TH('settings.pw.gate.oldCode')}</label><input type="password" id="pw-gate-old" autocomplete="current-password"/></div>
      <div class="s-input-row"><label for="pw-gate-fresh">${TH('settings.pw.gate.newCode')}</label><input type="password" id="pw-gate-fresh" autocomplete="new-password"/></div>
      <button class="btn-save-settings" id="pw-gate-change-go">${TH('settings.pw.gate.changeButton')}</button>`;
    document.getElementById('pw-gate-change-go').addEventListener('click', async () => {
      const r = await g.change(document.getElementById('pw-gate-old').value, document.getElementById('pw-gate-fresh').value);
      if (r && r.ok) { showSettingsToast(T('settings.pw.gate.changed'), 'success'); renderPwGate(); return; }
      msg.textContent = r && r.kod === 'cok_kisa' ? T('settings.pw.gate.tooShort', { count: r.minUzunluk }) : T('settings.pw.gate.wrong');
    });
  });
  document.getElementById('pw-gate-remove-t').addEventListener('click', () => {
    sub.hidden = false;
    sub.innerHTML = `
      <p class="s-hint">${TH('settings.pw.gate.removeHint')}</p>
      <div class="s-input-row"><label for="pw-gate-rm">${TH('settings.pw.gate.code')}</label><input type="password" id="pw-gate-rm" autocomplete="current-password"/></div>
      <button class="clear-btn" id="pw-gate-remove-go">${TH('settings.pw.gate.removeButton')}</button>`;
    document.getElementById('pw-gate-remove-go').addEventListener('click', async () => {
      const r = await g.remove(document.getElementById('pw-gate-rm').value);
      if (r && r.ok) { showSettingsToast(T('settings.pw.gate.removed')); renderPwGate(); return; }
      msg.textContent = T('settings.pw.gate.wrong');
    });
  });
  // Süre dolduğunda kart kendiliğinden "kilitli" hâline geçsin.
  _pwGateTimer = setInterval(() => {
    if (!document.getElementById('pw-gate-box')) { clearInterval(_pwGateTimer); _pwGateTimer = null; return; }
    renderPwGate();
  }, 15000);
}

// Kilit kapalıyken göz/kopyala düğmesine basılırsa kullanıcıyı kilit kartına götür.
function pwGateUyar() {
  showSettingsToast(T('settings.pw.gate.unlockFirst'), 'error');
  renderPwGate().then(() => {
    const box = document.getElementById('pw-gate-box');
    box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    document.getElementById('pw-gate-code')?.focus();
  });
}

async function populatePwdList() {
  const box = document.getElementById('pwd-list-container');
  if (!box) return;
  await migrateOldPasswords();
  const list = await window.secureBrowser?.passwords?.list() || [];
  const cnt = document.getElementById('pwd-count'); if (cnt) cnt.textContent = list.length;
  if (!list.length) {
    box.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px">${TH('settings.pw.empty')}</p>`;
    return;
  }
  box.innerHTML = list.map(v => {
    let host = v.url; try { host = new URL(v.url).hostname.replace(/^www\./,''); } catch {}
    return `<div class="pwd-entry" data-id="${v.id}">
      <div class="pwd-entry-info">
        <div class="pwd-site">${_pwEsc(host)}</div>
        <div class="pwd-user">${_pwEsc(v.username||'—')}</div>
        <div class="pwd-pass" data-pass="${v.id}">••••••••</div>
      </div>
      <div class="pwd-actions">
        <button class="pwd-btn" data-act="reveal" data-id="${v.id}" title="${TH('settings.pw.reveal')}" aria-label="${TH('settings.pw.reveal')}">👁</button>
        <button class="pwd-btn" data-act="copy" data-id="${v.id}" title="${TH('settings.pw.copy')}" aria-label="${TH('settings.pw.copy')}">📋</button>
        <button class="pwd-btn danger" data-act="del" data-id="${v.id}" title="${TH('settings.pw.delete')}" aria-label="${TH('settings.pw.delete')}">🗑</button>
      </div></div>`;
  }).join('');
  box.querySelectorAll('.pwd-btn[data-act]').forEach(b => b.addEventListener('click', onPwdAction));
}

// Şifre denetimi sonucu: kayıtlar ve nedenleri (şifreler arayüze gelmez). "Siteyi aç" şifreyi
// değiştirmek için sitenin kökünü yeni sekmede açar.
async function runPasswordAudit() {
  const box = document.getElementById('pw-audit-result');
  if (!box) return;
  box.innerHTML = `<p class="s-hint">${TH('pwAudit.checking')}</p>`;
  let r = null;
  try { r = await window.secureBrowser?.passwords?.audit?.(); } catch {}
  if (!r) { box.innerHTML = `<p class="s-hint">${TH('pwAudit.failed')}</p>`; return; }
  if (!r.total) { box.innerHTML = `<p class="s-hint">${TH('pwAudit.emptyVault')}</p>`; return; }
  if (!r.items.length) { box.innerHTML = `<p class="s-hint" style="color:var(--success)">${TH('pwAudit.clean', { count: r.total })}</p>`; return; }
  const parts = [];
  if (r.weakCount) parts.push(T('pwAudit.weakCount', { count: r.weakCount }));
  if (r.reusedCount) parts.push(T('pwAudit.reusedCount', { count: r.reusedCount }));
  box.innerHTML = `<p class="s-hint" style="color:var(--warning, #e0a040)">${TH('pwAudit.summary', { count: r.total, parts: parts.join(', ') })}</p>`
    + r.items.map((it) => {
      let host = it.url; try { host = new URL(it.url).hostname.replace(/^www\./, ''); } catch {}
      const reasons = [it.weak ? T('pwAudit.weak') : '', it.reuseCount ? T('pwAudit.reused', { count: it.reuseCount }) : ''].filter(Boolean).join(' · ');
      return `<div class="pwd-entry"><div class="pwd-entry-info"><div class="pwd-site">${_pwEsc(host)}</div><div class="pwd-user">${_pwEsc(it.username || '—')} · ${_pwEsc(reasons)}</div></div>
        <div class="pwd-actions"><button class="pwd-btn" data-audit-open="${_pwEsc(it.url)}">${TH('pwAudit.openSite')}</button></div></div>`;
    }).join('');
  box.querySelectorAll('[data-audit-open]').forEach((b) => b.addEventListener('click', () => {
    const url = b.getAttribute('data-audit-open');
    if (/^https?:\/\//i.test(url)) window.secureBrowser?.newTab?.(url);
  }));
}

// Have I Been Pwned: kasadaki şifreler sızıntı listesinde aranır (ayrıntı: main/pwned-check.js).
async function runPwnedCheck() {
  const box = document.getElementById('pw-pwned-result');
  const btn = document.getElementById('btn-pw-pwned');
  if (!box || !btn || btn.disabled) return;
  btn.disabled = true;
  box.innerHTML = `<p class="s-hint">${TH('pwned.searching')}</p>`;
  let r = null;
  try { r = await window.secureBrowser?.passwords?.pwnedCheck?.(); } catch {}
  btn.disabled = false;
  if (!r || r.ok === false) { box.innerHTML = `<p class="s-hint" style="color:var(--danger)">${TH('pwned.failed')}</p>`; return; }
  if (!r.total) { box.innerHTML = `<p class="s-hint">${TH('pwAudit.emptyVault')}</p>`; return; }
  if (!r.checked) { box.innerHTML = `<p class="s-hint" style="color:var(--danger)">${TH('pwned.unreachable')}</p>`; return; }
  const missed = r.total - r.checked;
  const missedNote = missed ? ' ' + T('pwned.missed', { count: missed }) : '';
  if (!r.leaked.length) {
    box.innerHTML = `<p class="s-hint" style="color:var(--success)">${TH('pwned.clean', { count: r.checked })}${_pwEsc(missedNote)}</p>`;
    return;
  }
  box.innerHTML = `<p class="s-hint" style="color:var(--danger)">${TH('pwned.leaked', { checked: r.checked, count: r.leaked.length })}${_pwEsc(missedNote)}</p>`
    + r.leaked.map((it) => {
      let host = it.url; try { host = new URL(it.url).hostname.replace(/^www\./, ''); } catch {}
      return `<div class="pwd-entry"><div class="pwd-entry-info"><div class="pwd-site">${_pwEsc(host)}</div><div class="pwd-user">${_pwEsc(it.username || '—')} · ${TH('pwned.seen', { count: Number(it.count) })}</div></div>
        <div class="pwd-actions"><button class="pwd-btn" data-audit-open="${_pwEsc(it.url)}">${TH('pwAudit.openSite')}</button></div></div>`;
    }).join('');
  box.querySelectorAll('[data-audit-open]').forEach((b) => b.addEventListener('click', () => {
    const url = b.getAttribute('data-audit-open');
    if (/^https?:\/\//i.test(url)) window.secureBrowser?.newTab?.(url);
  }));
}

function pwGizle(cell) {
  if (!cell) return;
  if (cell._pwGizle) { clearTimeout(cell._pwGizle); cell._pwGizle = null; }
  cell.textContent = '••••••••';
}

async function onPwdAction(e) {
  const btn = e.currentTarget, id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
  const pw = window.secureBrowser?.passwords;
  if (act === 'reveal') {
    const cell = document.querySelector(`.pwd-pass[data-pass="${id}"]`); if (!cell) return;
    if (cell.textContent !== '••••••••') { pwGizle(cell); return; }
    const r = await pw.reveal(id);
    if (!r || r.ok === false) { if (r && r.kod === 'kilitli') pwGateUyar(); return; }
    cell.textContent = r.sifre;
    // Ekran açık bırakılırsa şifre kendiliğinden gizlenir.
    cell._pwGizle = setTimeout(() => pwGizle(cell), r.gizleMs || 20000);
  } else if (act === 'copy') {
    // Şifre arayüze GELMEZ: ana süreç panoya yazar ve süre sonunda siler.
    const r = await pw.copy(id);
    if (!r || r.ok === false) {
      if (r && r.kod === 'kilitli') pwGateUyar();
      else showSettingsToast(T('settings.pw.copyFailed'), 'error');
      return;
    }
    showSettingsToast(T('settings.pw.copiedCleared', { time: _pwSure(r.temizleMs || 30000) }), 'success');
  } else if (act === 'del') {
    if (!confirm(T('settings.pw.confirmDelete'))) return;
    await pw.delete(id); populatePwdList();
  }
}

async function pwImportFromBrowser() {
  const pw = window.secureBrowser?.passwords;
  const found = await pw?.importDetect() || [];
  if (!found.length) { showSettingsToast(T('settings.pw.noBrowser'),'error'); return; }
  // Basit seçim: tek tarayıcı varsa doğrudan, çoklu ise ilkini sor
  const pick = found.length === 1 ? found[0] : (found.find(f => confirm(T('settings.pw.importConfirm', { name: f.name }))) || null);
  if (!pick) return;
  showSettingsToast(T('settings.pw.importing', { name: pick.name }));
  const r = await pw.importBrowser(pick.id);
  if (!r) return;
  // Hata mesajı ana süreçten kullanıcıya yönelik metin olarak gelir (ham kod değil).
  if (r.ok === false) { showSettingsToast(r.error || T('settings.pw.importFailed'), 'error'); return; }
  let msg = T('settings.pw.imported', { count: r.imported });
  if (r.appBound) msg += ' · ' + T('settings.pw.appBound', { count: r.appBound });
  if (r.failed)   msg += ' · ' + T('settings.pw.importUndecrypted', { count: r.failed });
  showSettingsToast(msg, r.imported ? 'success' : 'error');
  if (r.imported) populatePwdList();
}

// ─── Şifre ────────────────────────────────────────────────────────────────────
// (Eski güvensiz localStorage şifre saklama kaldırıldı — artık main süreç
//  safeStorage kasası kullanılır: window.secureBrowser.passwords.*)

function showSettingsToast(msg,type='success') {
  const el=document.createElement('div');
  el.className='settings-toast';
  el.style.cssText=`background:${type==='success'?'var(--success)':'var(--danger)'};color:var(--bg-base);`;
  el.textContent=msg; document.body.appendChild(el);
  // Uzun açıklamalar (ör. içe aktarma nedeni) okunabilsin: süre metin uzunluğuna göre.
  setTimeout(()=>el.remove(), Math.min(9000, Math.max(2500, String(msg).length * 55)));
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderSettingsTab(tabId, cfg) {
  const content = document.getElementById('settings-content');
  if (!content) return;
  if      (tabId==='customization') content.innerHTML = renderCustomizationTab(cfg);
  else if (tabId==='account')       content.innerHTML = renderAccountTab();
  else if (tabId==='general')       content.innerHTML = renderGeneralTab(cfg);
  else if (tabId==='privacy')       content.innerHTML = renderPrivacyTab();
  else if (tabId==='passwords')     content.innerHTML = renderPasswordsTab(cfg);
  else if (tabId==='diag')          content.innerHTML = window.ilgezdiDiagPanel?.render?.()
                                      || `<p class="s-hint">${TH('settings.diag.loadFailed')}</p>`;
  if (tabId==='customization') { bindCustomizationEvents(); updatePreviewBox(); }
  if (tabId==='account')       bindAccountEvents();
  if (tabId==='general')       bindGeneralEvents();
  if (tabId==='privacy')       document.getElementById('btn-open-data-center')?.addEventListener('click', () => window.ilgezdiDataCenter?.open());
  if (tabId==='passwords')     bindPasswordEvents();
  if (tabId==='diag')          window.ilgezdiDiagPanel?.bind?.();
}

// ─── Hesap sekmesi (QRtım / e-posta girişi) ───────────────────────────────────
function renderAccountTab() {
  return `
    <div class="settings-section">
      <h3>${TH('settings.account.title')}</h3>
      <div class="account-card" id="account-info" style="padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface);margin-bottom:14px;font-size:13px;color:var(--text-secondary)">
        ${TH('common.loading')}
      </div>
      <div class="account-actions" id="account-actions" style="display:flex;gap:8px;flex-wrap:wrap"></div>
      <p style="font-size:11.5px;color:var(--text-muted);margin-top:12px;line-height:1.5">
        ${TH('settings.account.hint')}
      </p>
    </div>`;
}

async function bindAccountEvents() {
  const info    = document.getElementById('account-info');
  const actions = document.getElementById('account-actions');
  if (!info || !actions) return;

  let session = null;
  try { session = await window.ilgezdiAuth?.getSession?.(); } catch {}

  if (session && (session.userId || session.email)) {
    const E = window.ilgezdiHtml.esc;
    const name = session.displayName || session.email || T('settings.account.user');
    info.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--copper));display:grid;place-items:center;color:#0e1a2e;font-weight:800;font-size:18px">${E((name[0]||'K').toUpperCase())}</div>
        <div>
          <div style="color:var(--text-primary);font-weight:600">${E(name)}</div>
          <div style="color:var(--text-muted);font-size:12px">${E(session.email || '')} · ${E(session.plan || 'free')} · ${E(session.loginMethod || '')}</div>
        </div>
      </div>`;
    actions.innerHTML = `<button class="btn-ghost" id="acc-logout">${TH('settings.account.logout')}</button>`;
    document.getElementById('acc-logout')?.addEventListener('click', async () => {
      // Panel kapatılmaz; çıkış 'ilgezdi-auth-changed' ile bu sekmeyi yeniler.
      await window.ilgezdiAuth?.logout?.();
    });
  } else {
    info.innerHTML = `<span style="color:var(--text-muted)">${TH('settings.account.notLoggedIn')}</span>`;
    actions.innerHTML = `<button class="btn-primary" id="acc-open">${TH('settings.account.loginRegister')}</button>`;
    document.getElementById('acc-open')?.addEventListener('click', () => {
      // Ayarlar açık kalır: giriş penceresi üstte açılır, kapanınca Hesap sekmesine
      // dönülür. Eskiden önce tüm paneller kapatılıyordu (kullanıcı bildirdi).
      window.ilgezdiAuth?.open?.();
    });
  }
}

// ─── Özelleştirme eventleri — pending state + anlık önizleme ─────────────────
function bindCustomizationEvents() {
  // Tema kartları — pending'i güncelle + ANLIK önizleme + accent'i tema default'una sıfırla
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      _pendingTheme  = card.dataset.theme;
      _pendingAccent = THEME_DEFAULT_ACCENTS[_pendingTheme] || '#d4a85a';

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

  // Font boyutu — canlı önizleme (--font-size-base'i anında uygula)
  document.getElementById('font-size-slider')?.addEventListener('input', (e) => {
    _pendingFontSize = parseInt(e.target.value);
    const badge = document.getElementById('font-size-val');
    const prev  = document.getElementById('font-preview-text');
    if (badge) badge.textContent = _pendingFontSize + 'px';
    if (prev)  prev.style.fontSize = _pendingFontSize + 'px';
    document.documentElement.style.setProperty('--font-size-base', _pendingFontSize + 'px');
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

// Varsayılan tarayıcı durumu: Windows'ta kullanıcının seçtiği uygulamanın kimliği (ProgId)
// okunur; bilinen tarayıcılar adıyla gösterilir.
const BROWSER_PROGIDS = [
  [/^ChromeHTML/i, 'Google Chrome'], [/^MSEdgeHTM/i, 'Microsoft Edge'], [/^BraveHTML/i, 'Brave'],
  [/^FirefoxURL/i, 'Firefox'], [/^Opera(GX)?Stable/i, 'Opera'], [/^VivaldiHTM/i, 'Vivaldi'], [/^YandexHTML/i, 'Yandex Browser'],
];
async function populateDefaultBrowser() {
  const el = document.getElementById('default-browser-status');
  const btn = document.getElementById('btn-default-browser');
  if (!el) return;
  let st = null;
  try { st = await window.secureBrowser?.defaultBrowser?.status?.(); } catch {}
  if (!el.isConnected) return;
  el.style.color = '';
  if (!st) { el.textContent = T('settings.defaultBrowser.unreadable'); return; }
  if (st.isDefault) {
    el.textContent = T('settings.defaultBrowser.yes');
    el.style.color = 'var(--success)';
    if (btn) btn.hidden = true;
    return;
  }
  const name = (BROWSER_PROGIDS.find(([re]) => re.test(st.current || '')) || [])[1];
  el.textContent = name ? T('settings.defaultBrowser.noNamed', { name }) : T('settings.defaultBrowser.no');
  if (st.platform === 'win32' && !st.packaged) el.textContent += T('settings.defaultBrowser.devCopy');
  if (btn) btn.hidden = false;
}

function bindGeneralEvents() {
  populateDefaultBrowser();
  window.secureBrowser?.runtimeInfo?.().then((info) => {
    _runtimeHwAccel = info ? info.hardwareAcceleration !== false : null;
    _runtimeLanguage = info && typeof info.language === 'string' ? info.language : null;
    updateRelaunchRow();
  }).catch(() => {});
  document.querySelectorAll('#btn-relaunch, #btn-lang-relaunch').forEach((b) => b.addEventListener('click', async () => {
    await saveAllSettings();
    window.secureBrowser?.relaunch?.();
  }));
  document.getElementById('btn-reset-settings')?.addEventListener('click', resetAllSettings);
  document.getElementById('btn-default-browser')?.addEventListener('click', async () => {
    let r = null;
    try { r = await window.secureBrowser?.defaultBrowser?.set?.(); } catch {}
    // Windows'ta Ayarlar açılır; kullanıcı İlgezdi'ye dönünce durum yeniden okunur.
    if (r?.openedSettings) window.addEventListener('focus', () => populateDefaultBrowser(), { once: true });
    else populateDefaultBrowser();
  });
  document.getElementById('btn-pick-folder')?.addEventListener('click', async () => {
    const folder = await window.secureBrowser?.pickDownloadFolder?.();
    if (folder) { document.getElementById('download-folder').value=folder; _formCfg.downloadFolder=folder; updateUnsavedBar(); }
  });
  const st=(msg)=>{const el=document.getElementById('clear-status');if(el){el.textContent=msg;setTimeout(()=>el.textContent='',3000);}};
  // Sonucu kontrol et — başarısız ya da iptal edilmiş işlemi "temizlendi" diye bildirmeyelim.
  const report = (r, okMsg) => {
    if (r?.canceled)      st(T('settings.clear.canceled'));
    else if (r?.success)   st(okMsg);
    else                   st(T('settings.clear.failed', { error: r?.error || T('settings.clear.unknownError') }));
  };
  document.getElementById('btn-clear-cache')?.addEventListener('click',   async()=>{report(await window.secureBrowser?.clearCache?.(),   T('settings.clear.cacheDone'));});
  document.getElementById('btn-clear-cookies')?.addEventListener('click', async()=>{report(await window.secureBrowser?.clearCookies?.(), T('settings.clear.cookiesDone'));});
  document.getElementById('btn-clear-all')?.addEventListener('click',     async()=>{report(await window.secureBrowser?.clearAll?.(),     T('settings.clear.allDone'));});
  document.getElementById('btn-clear-history')?.addEventListener('click', async()=>{await window.secureBrowser?.logs?.clearLogs?.();     st(T('settings.clear.historyDone'));});

  // ── Uygulama güncellemesi ────────────────────────────────────────────────────
  const up = window.secureBrowser?.updater;
  const verEl = document.getElementById('app-version-text');
  if (up && verEl) up.currentVersion().then(v => { verEl.textContent = T('settings.update.versionText', { version: v || '—' }); }).catch(()=>{});
  document.getElementById('btn-check-updates')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const us = document.getElementById('update-check-status');
    if (!up) { if (us) us.textContent = T('settings.update.unavailable'); return; }
    btn.disabled = true; const old = btn.textContent; btn.textContent = T('pwAudit.checking');
    if (us) { us.style.color = 'var(--text-muted)'; us.textContent = T('settings.update.serverCheck'); }
    const r = await up.check();
    btn.disabled = false; btn.textContent = old;
    if (!us) return;
    if (r?.reason === 'dev')      us.textContent = T('settings.update.dev');
    else if (r?.ok === false)     { us.style.color = 'var(--danger)'; us.textContent = T('settings.update.checkFailed', { reason: r.reason || T('settings.clear.unknownError') }); }
    else if (r?.version)          { us.style.color = 'var(--success)'; us.textContent = T('settings.update.found', { version: r.version }); }
    else                          { us.style.color = 'var(--success)'; us.textContent = T('settings.update.latest'); }
  });
}

// Eski sahte ana şifre düzeneğinin diskte bıraktığı izleri temizler.
// 'ilgezdi-master-hash' Base64 olduğu için kullanıcının parolasını GERİ
// ÇEVRİLEBİLİR biçimde tutuyordu — bu yüzden sadece kullanmayı bırakmak yetmez,
// kaydın kendisi silinmelidir.
function purgeLegacyMasterPassword() {
  try {
    localStorage.removeItem('ilgezdi-master-hash');
    sessionStorage.removeItem('ilgezdi-pwd-unlocked');
  } catch {}
}

// Kasanın gerçek koruma durumunu ana süreçten sorup dürüstçe bildirir.
async function showVaultProtectionState() {
  const el = document.getElementById('pwd-protection-note');
  if (!el) return;
  let available = false;
  try { available = await window.secureBrowser?.passwords?.encryptionAvailable?.(); } catch {}

  const osName = navigator.userAgent.includes('Mac')   ? T('settings.vault.osMac')
               : navigator.userAgent.includes('Linux') ? T('settings.vault.osLinux')
               :                                         T('settings.vault.osWindows');
  if (available) {
    el.innerHTML = `<span style="color:var(--success)">${TH('settings.vault.encrypted')}</span> ${TH('settings.vault.encryptedBody', { os: osName })}`;
  } else {
    el.innerHTML = `<span style="color:var(--danger)">${TH('settings.vault.unavailable')}</span> ${TH('settings.vault.unavailableBody')}`;
  }
}

// "Bu sitede asla" denen siteler (liste ana süreçte; arayüz ayar kaydıyla değiştiremez).
async function populatePwNeverList() {
  const box = document.getElementById('pw-never-list');
  if (!box) return;
  let list = [];
  try { list = (await window.secureBrowser?.passwords?.neverList?.()) || []; } catch {}
  if (!box.isConnected) return;
  box.replaceChildren();
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 's-hint';
    p.style.marginTop = '0';
    p.textContent = T('settings.pw.neverEmpty');
    box.append(p);
    return;
  }
  for (const origin of list) {
    const row = document.createElement('div');
    row.className = 's-toggle-row';
    const label = document.createElement('div');
    label.className = 's-toggle-label';
    label.textContent = String(origin).replace(/^https?:\/\//, '');
    const btn = document.createElement('button');
    btn.className = 'folder-btn';
    btn.textContent = T('settings.sitePerms.remove');
    btn.addEventListener('click', async () => {
      await window.secureBrowser?.passwords?.neverRemove?.(origin);
      populatePwNeverList();
    });
    row.append(label, btn);
    box.append(row);
  }
}

function bindPasswordEvents() {
  purgeLegacyMasterPassword();
  showVaultProtectionState();
  populatePwNeverList();
  document.getElementById('btn-pwd-add')?.addEventListener('click',async ()=>{
    const site=document.getElementById('pwd-new-site')?.value.trim();
    const user=document.getElementById('pwd-new-user')?.value.trim();
    const pass=document.getElementById('pwd-new-pass')?.value;
    if(!site||!pass){showSettingsToast(T('settings.pw.required'),'error');return;}
    // Ana süreç reddedebilir (geçersiz adres, okunamayan kasa) — sonucu kontrol et.
    const addRes = await window.secureBrowser?.passwords?.add({ url: site, username: user, password: pass });
    if (addRes && addRes.ok === false) { showSettingsToast(addRes.error || T('settings.pw.addFailed'), 'error'); return; }
    ['pwd-new-site','pwd-new-user','pwd-new-pass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const passEl=document.getElementById('pwd-new-pass'); if(passEl) passEl.type='password';
    showSettingsToast(T('settings.pw.added'));
    populatePwdList();
  });
  document.getElementById('btn-pw-audit')?.addEventListener('click', runPasswordAudit);
  document.getElementById('btn-pw-pwned')?.addEventListener('click', runPwnedCheck);
  // Oluşturulan şifre görünür yazılır: kullanıcı siteye yapıştırmadan önce görebilsin.
  document.getElementById('btn-pwd-generate')?.addEventListener('click', async ()=>{
    const pw = await window.secureBrowser?.passwords?.generate?.();
    const passEl = document.getElementById('pwd-new-pass');
    if (typeof pw !== 'string' || !passEl) return;
    passEl.type = 'text';
    passEl.value = pw;
    passEl.focus();
    passEl.select();
  });
  document.getElementById('btn-pwd-import-browser')?.addEventListener('click', pwImportFromBrowser);
  document.getElementById('btn-pwd-import-csv')?.addEventListener('click', async ()=>{
    const r = await window.secureBrowser?.passwords?.importCsv();
    if (!r || r.canceled) return;
    if (r.ok === false) { showSettingsToast(r.error || T('settings.pw.importFailed'), 'error'); return; }
    showSettingsToast(r.imported ? T('settings.pw.imported', { count: r.imported }) : T('settings.pw.noNew'));
    if (r.imported) populatePwdList();
  });
  // Listeyi güvenli kasadan doldur. (Eskiden bir sessionStorage "kilit" bayrağına
  // bağlıydı; bayrak kaldırıldığı için artık koşulsuz yüklenir. Liste maskeli
  // gelir — tam parola yalnızca ayrı bir "göster" isteğiyle alınır.)
  populatePwdList();
  renderPwGate();
}

// Sekme adı sütuna sığmıyorsa (tek uzun sözcük) yazıyı 8 px'e kadar küçült. Panel gizliyken
// genişlik 0 olduğundan ResizeObserver panel görünür olunca yeniden ölçer.
function fitSettingsTabLabels() {
  // scrollWidth tam sayıya yuvarlanır; yarım piksellik taşma da üç nokta gösterir.
  const overflows = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.05;
  };
  document.querySelectorAll('.settings-tab-label').forEach((el) => {
    el.style.fontSize = '';
    if (!el.clientWidth) return;
    let size = parseFloat(getComputedStyle(el).fontSize) || 10;
    while (overflows(el) && size > 8) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  });
}

// ─── Panel events ─────────────────────────────────────────────────────────────
// Sekmeyi seç: vurgu, aria-selected ve içerik birlikte (panel her açılışta da çağırır;
// eskiden içerik Özelleştir'e dönerken vurgu önceki sekmede kalıyordu).
function selectSettingsTab(tabId) {
  document.querySelectorAll('.settings-tab').forEach((t) => {
    const on = t.dataset.tab === tabId;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (!Object.keys(_formBase).length) initFormState(settingsConfig);
  // Kaydedilmemiş değişiklikler sekme değişince kaybolmasın: sekme bekleyen değerlerle çizilir.
  renderSettingsTab(tabId, _formCfg);
}

// Panel HTML'i bir kez eklenir (initFaz4); olaylar da bir kez bağlanmalı. Eskiden
// her açılışta yeniden bağlanıyordu: N. açılışta Kaydet N kez kaydediyordu.
let _settingsEventsBound = false;
function initSettingsPanelEvents() {
  if (_settingsEventsBound) return;
  _settingsEventsBound = true;
  const content = document.getElementById('settings-content');
  content?.addEventListener('change', onSettingsFieldChange);
  content?.addEventListener('input', onSettingsFieldChange);
  document.querySelectorAll('.settings-tab').forEach(tab=>{
    tab.addEventListener('click',()=>selectSettingsTab(tab.dataset.tab));
  });
  const tabsEl = document.querySelector('.settings-tabs');
  if (tabsEl && typeof ResizeObserver === 'function') new ResizeObserver(() => fitSettingsTabLabels()).observe(tabsEl);
  // Kiril alt kümesi gibi yazı tipleri ilk kullanımda yüklenir; yüklenince genişlik değişir.
  document.fonts?.addEventListener?.('loadingdone', () => fitSettingsTabLabels());

  // Giriş/çıkış sonrası Hesap sekmesi açıksa yerinde yenilenir (panel kapanmaz).
  window.addEventListener('ilgezdi-auth-changed', () => {
    const panel = document.getElementById('panel-settings');
    const active = document.querySelector('.settings-tab.active')?.dataset.tab;
    if (panel?.classList.contains('visible') && active === 'account') bindAccountEvents();
  });

  // KAYDET — pending değerleri commit et, sonra API'ye yaz
  document.getElementById('btn-save-all')?.addEventListener('click', () => saveAllSettings());

  // GERİ AL
  document.getElementById('btn-discard-all')?.addEventListener('click', discardPendingChanges);
  document.getElementById('btn-discard-changes')?.addEventListener('click', discardPendingChanges);

  // Panel kapat
  document.querySelector('#panel-settings [data-panel="settings"]')?.addEventListener('click',()=>window.ilgezdiCloseAllPanels?.());
}

async function saveAllSettings() {
    commitTheme(_pendingTheme, _pendingAccent, _pendingFontSize, _pendingFontFamily);

    // Değerler ekrandaki sekmeden değil _formCfg'den (bkz. SETTINGS_FIELDS).
    const finalCfg = {
      ...settingsConfig,
      ..._formCfg,
      // Boş ana sayfa = İlgezdi başlangıç sayfası
      homepage:        String(_formCfg.homepage || '').trim(),
      customNewTabUrl: String(_formCfg.customNewTabUrl || '').trim(),
      downloadFolder:  _formCfg.downloadFolder || settingsConfig.downloadFolder,
      theme:       _savedTheme,
      accentColor: _savedAccent,
      fontSize:    _savedFontSize,
      fontFamily:  _savedFontFamily,
    };
    await window.secureBrowser?.saveConfig(finalCfg);
    window.ilgezdiSync?.schedulePush();
    // Veri ve Gizlilik sayfası açıksa yeni değerleri gösterir.
    window.dispatchEvent(new CustomEvent('ilgezdi-settings-saved'));
    settingsConfig = finalCfg;
    applyAccessibility(finalCfg);
    initFormState(finalCfg);
    window._ilgezdiNewTabMode   = finalCfg.newTabMode    || 'blank';
    window._ilgezdiCustomNewTab = finalCfg.customNewTabUrl || '';
    updateUnsavedBar();
    const btn=document.getElementById('btn-save-all');
    if(btn){btn.textContent=T('settings.saved');setTimeout(()=>btn.textContent=T('settings.save'),2000);}
    showSettingsToast(T('settings.savedToast'));
}

// Ayarlar › Genel › Sistem › Ayarları sıfırla. Onayı ana süreç alır; arayüzdeki kopyalar
// (tema, engelleyici istisnaları, form) yeni yapılandırmadan yeniden yüklenir.
async function resetAllSettings() {
  let r = null;
  try { r = await window.secureBrowser?.resetSettings?.(); } catch {}
  if (!r || r.canceled) return;
  if (r.ok === false) { showSettingsToast(r.error || T('settings.resetFailed'), 'error'); return; }
  try { localStorage.removeItem('ilgezdi-whitelist'); localStorage.removeItem('ilgezdi-block-level'); } catch {}
  if (typeof blockerLoad === 'function') blockerLoad();
  await loadSavedTheme();
  loadSettingsState(r.config || await window.secureBrowser?.getConfig() || {});
  window._ilgezdiNewTabMode   = settingsConfig.newTabMode || 'blank';
  window._ilgezdiCustomNewTab = settingsConfig.customNewTabUrl || '';
  window.ilgezdiSync?.schedulePush();
  selectSettingsTab('general');
  updateUnsavedBar();
  showSettingsToast(T('settings.resetDone'));
}

// ─── Settings butonu ──────────────────────────────────────────────────────────
// Başka yerden Ayarlar'ı belirli bir sekmede açar (ör. şifre menüsündeki "Şifreleri yönet…").
let _nextSettingsTab = null;
window.ilgezdiOpenSettings = (tab) => {
  if (document.getElementById('panel-settings')?.classList.contains('visible')) {
    selectSettingsTab(tab);
    return;
  }
  _nextSettingsTab = tab;
  document.getElementById('btn-settings')?.click();
};

// Kaydedilmiş yapılandırmadan panelin durumunu kurar (açılışta ve sıfırlamadan sonra).
function loadSettingsState(cfg) {
  settingsConfig = cfg || {};
  if (!settingsConfig.theme) settingsConfig.theme = 'otuken';

  // Kaydedilmiş değerleri yükle
  _savedTheme      = settingsConfig.theme;
  _savedAccent     = settingsConfig.accentColor || THEMES[_savedTheme]?.accent || '#d4a85a';
  if (_savedAccent && LEGACY_DEFAULT_ACCENTS.includes(_savedAccent.toLowerCase()))
    _savedAccent = THEME_DEFAULT_ACCENTS[_savedTheme] || '#d4a85a';
  _savedFontSize   = settingsConfig.fontSize    || 13;
  _savedFontFamily = settingsConfig.fontFamily  || "'Inter', sans-serif";
  if (/DM Sans/i.test(_savedFontFamily)) _savedFontFamily = "'Inter', sans-serif";
  currentLang      = settingsConfig.language    || 'tr';

  // Pending'i saved ile başlat
  initPendingState();
  initFormState(settingsConfig);
}

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
      loadSettingsState(await window.secureBrowser?.getConfig() || {});

      panel.classList.remove('hidden');
      requestAnimationFrame(()=>panel.classList.add('visible'));
      newBtn.classList.add('active');
      window.secureBrowser?.panelOpened(true);
      initSettingsPanelEvents();
      const nextTab = _nextSettingsTab;
      _nextSettingsTab = null;
      if (nextTab) selectSettingsTab(nextTab);
      else selectSettingsTab('customization');
      updateUnsavedBar();
    }
  });
}

// Kısayollar (Ctrl+, · Ctrl+B · Ctrl+Shift+L · Ctrl+Shift+V) ana süreçte yakalanır
// ve app.js'e 'browser-command' olarak gelir. Buradaki keydown dinleyicisi odak
// sayfadayken çalışmıyordu.

async function initFaz4() {
  await loadSavedTheme();
  injectSettingsPanelStyles();
  injectSettingsPanelHTML();
  upgradeSettingsButton();
  console.log('[İlgezdi Faz4] Ayarlar hazır — önizleme modu aktif');
}


window.addEventListener('load', ()=>setTimeout(initFaz4, 700));
