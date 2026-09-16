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
  { name:'Bakır',      value:'#d4a85a' },
  { name:'Parlak Altın', value:'#f0c674' },
  { name:'Tunç',       value:'#c87f4a' },
  { name:'Terracotta', value:'#b85c3a' },
  { name:'Gök Mavisi', value:'#8aa6c8' },
  { name:'Yeşil',      value:'#68d391' },
  { name:'Mor',        value:'#9f7aea' },
  { name:'Kırmızı',    value:'#fc8181' },
];

const FONT_FAMILIES = [
  { name:"Inter (Varsayılan)", value:"'Inter', sans-serif" },
  { name:"Cinzel (Runik)",     value:"'Cinzel', serif" },
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
    .settings-tab { display:flex; flex-direction:column; align-items:center; gap:3px; min-width:0; padding:8px 2px 7px; font-size:10px; font-weight:600; color:var(--text-muted); cursor:pointer; border:none; border-bottom:2px solid transparent; background:none; white-space:nowrap; transition:all .15s; }
    .settings-tab-icon { font-size:14px; line-height:1; }
    .settings-tab-label { max-width:100%; overflow:hidden; text-overflow:ellipsis; }
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
    <div class="panel-header"><h2>⚙ Ayarlar</h2><button class="panel-close" data-panel="settings">✕</button></div>
    <div class="settings-tabs" role="tablist" aria-label="Ayar bölümleri">
      <button class="settings-tab active" data-tab="customization" role="tab" aria-selected="true"><span class="settings-tab-icon" aria-hidden="true">🎨</span><span class="settings-tab-label">Özelleştir</span></button>
      <button class="settings-tab" data-tab="account" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">👤</span><span class="settings-tab-label">Hesap</span></button>
      <button class="settings-tab" data-tab="general" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">⚙</span><span class="settings-tab-label">Genel</span></button>
      <button class="settings-tab" data-tab="privacy" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">🛡</span><span class="settings-tab-label">Gizlilik</span></button>
      <button class="settings-tab" data-tab="passwords" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">🔑</span><span class="settings-tab-label">Şifreler</span></button>
      <button class="settings-tab" data-tab="diag" role="tab" aria-selected="false"><span class="settings-tab-icon" aria-hidden="true">🩺</span><span class="settings-tab-label">Tanılama</span></button>
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
  'cfg-threat':        ['threatProtection', 'checked'],
  'cfg-tracker':       ['blockTrackers', 'checked'],
  'cfg-ads':           ['blockAds', 'checked'],
  'cfg-3pc':           ['blockThirdPartyCookies', 'checked'],
  'cfg-fp':            ['fingerprintProtection', 'checked'],
  'cfg-https-only':    ['httpsOnly', 'checked'],
  'cfg-dnt':           ['doNotTrack', 'checked'],
  'cfg-webrtc':        ['webrtcPolicy', 'value'],
  'cfg-secure-dns':    ['secureDns', 'value'],
  'cfg-log':           ['logEnabled', 'checked'],
  'cfg-pw-offer':      ['offerToSavePasswords', 'checked'],
  'cfg-page-zoom':     ['defaultPageZoom', 'value'],
  'cfg-min-font':      ['minimumFontSize', 'value'],
  'cfg-reduce-motion': ['reduceMotion', 'checked'],
  'cfg-high-contrast': ['highContrast', 'checked'],
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
    language:               c.language === 'en' ? 'en' : 'tr',
    downloadFolder:         c.downloadFolder || '',
    askDownloadLocation:    !!c.askDownloadLocation,
    notifications:          c.notifications !== false,
    vpnNotify:              c.vpnNotify !== false,
    threatProtection:       c.threatProtection !== false,
    blockTrackers:          c.blockTrackers !== false,
    blockAds:               c.blockAds !== false,
    blockThirdPartyCookies: c.blockThirdPartyCookies !== false,
    fingerprintProtection:  c.fingerprintProtection !== false,
    httpsOnly:              !!c.httpsOnly,
    doNotTrack:             !!c.doNotTrack,
    webrtcPolicy:           c.webrtcPolicy || 'default_public_interface_only',
    secureDns:              c.secureDns || 'automatic',
    logEnabled:             c.logEnabled !== false,
    offerToSavePasswords:   c.offerToSavePasswords !== false,
    defaultPageZoom:        PAGE_ZOOMS_UI.includes(Number(c.defaultPageZoom)) ? String(Number(c.defaultPageZoom)) : '1',
    minimumFontSize:        MIN_FONTS_UI.some(([v]) => v === Number(c.minimumFontSize)) ? String(Number(c.minimumFontSize)) : '0',
    reduceMotion:           c.reduceMotion === true,
    highContrast:           c.highContrast === true,
  };
}

// Ana süreçteki listelerle aynı (browser-commands.js → normalizePageZoom / normalizeMinFontSize).
const PAGE_ZOOMS_UI = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const MIN_FONTS_UI = [[0, 'Kapalı'], [10, '10 px'], [12, '12 px'], [14, '14 px'], [16, '16 px'], [18, '18 px'], [20, '20 px'], [24, '24 px']];

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
  updateUnsavedBar();
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
    { id:'otuken', label:'Ötüken Kayalıkları', bg:'#0e1a2e', dots:['#1c2e4a','#d4a85a','#8aa6c8'], badge:'Ana' },
    { id:'hibrit',  label:'Hibrit Altın',       bg:'#0a1422', dots:['#1a2c4a','#f0c674','#88a4d0'], badge:'' },
    { id:'umay',    label:'Umay Ana Işığı',      bg:'#f5ecd9', dots:['#ebe0c5','#b8893a','#a45a30'], badge:'' },
    { id:'kagan',   label:'Kağan Otağı',         bg:'#f0e0c4', dots:['#e6d2ae','#b85c3a','#8a3f25'], badge:'' },
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
        <input type="color" id="custom-accent" value="${_pendingAccent||'#d4a85a'}" style="height:36px;padding:2px;cursor:pointer;border-radius:6px" />
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
    <div class="settings-section"><h3>Erişilebilirlik</h3>
      <div class="s-input-row">
        <label for="cfg-page-zoom">Sayfa yakınlaştırması (varsayılan)</label>
        <select id="cfg-page-zoom">
          ${PAGE_ZOOMS_UI.map((z) => `<option value="${z}" ${String(cfg.defaultPageZoom) === String(z) ? 'selected' : ''}>%${Math.round(z * 100)}</option>`).join('')}
        </select>
      </div>
      <p class="s-hint">Siteler bu oranda açılır. Bir sitede Ctrl ile yakınlaştırırsanız o site için ayrıca hatırlanır; Ctrl+0 bu orana döndürür.</p>
      <div class="s-input-row">
        <label for="cfg-min-font">En küçük yazı boyutu</label>
        <select id="cfg-min-font">
          ${MIN_FONTS_UI.map(([v, t]) => `<option value="${v}" ${String(cfg.minimumFontSize) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <p class="s-hint">Sayfalardaki küçük yazılar bu boyutun altına inmez. Yeni açılan sekmelerde geçerli olur.</p>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">Hareketi azalt</div><div class="s-toggle-sub">İlgezdi arayüzündeki geçiş ve animasyonlar kapanır; yükleme halkası yavaş döner. İşletim sisteminde animasyonlar kapalıysa geçişler zaten kısalır.</div></div>
        <label class="switch"><input type="checkbox" id="cfg-reduce-motion" ${cfg.reduceMotion ? 'checked' : ''}/><span class="slider"></span></label>
      </div>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">Yüksek karşıtlık</div><div class="s-toggle-sub">Arayüzde soluk yazılar ve çizgiler koyulaşır, odak çerçevesi kalınlaşır. İşletim sistemi daha fazla karşıtlık isterse kendiliğinden uygulanır.</div></div>
        <label class="switch"><input type="checkbox" id="cfg-high-contrast" ${cfg.highContrast ? 'checked' : ''}/><span class="slider"></span></label>
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
    <div class="settings-section"><h3>Arama Motoru</h3>
      <div class="s-input-row">
        <select id="search-engine">
          <option value="duckduckgo" ${cfg.searchEngine==='duckduckgo'?'selected':''}>DuckDuckGo (gizlilik)</option>
          <option value="google"     ${cfg.searchEngine==='google'?'selected':''}>Google</option>
          <option value="bing"       ${cfg.searchEngine==='bing'?'selected':''}>Bing</option>
          <option value="yandex"     ${cfg.searchEngine==='yandex'?'selected':''}>Yandex</option>
          <option value="yahoo"      ${cfg.searchEngine==='yahoo'?'selected':''}>Yahoo</option>
          <option value="brave"      ${cfg.searchEngine==='brave'?'selected':''}>Brave Search</option>
          <option value="ecosia"     ${cfg.searchEngine==='ecosia'?'selected':''}>Ecosia</option>
          <option value="startpage"  ${cfg.searchEngine==='startpage'?'selected':''}>Startpage</option>
        </select>
      </div>
      <p class="s-hint">Adres çubuğuna yazdığınız kelimeler bu motorda aranır.</p>
    </div>
    <div class="settings-section"><h3>Başlangıçta</h3>
      <div class="s-input-row">
        <label for="cfg-startup-mode">İlgezdi açıldığında</label>
        <select id="cfg-startup-mode">
          <option value="homepage" ${(cfg.startupMode||'homepage')==='homepage'?'selected':''}>Ana sayfayı aç</option>
          <option value="restore"  ${cfg.startupMode==='restore'?'selected':''}>Kaldığım yerden devam et</option>
        </select>
      </div>
      <p class="s-hint">Kaldığım yerden devam et: açık sekmeler (sabitlenenler dahil) geri/ileri geçmişleriyle geri gelir. Liste ziyaret günlüğüyle aynı anahtarla şifreli saklanır; gizli pencere sekmeleri kaydedilmez.</p>
    </div>
    <div class="settings-section"><h3>Ana Sayfa</h3>
      <div class="s-input-row"><input type="text" id="homepage-input" value="${cfg.homepage && cfg.homepage!=='about:blank' ? cfg.homepage : ''}" placeholder="https://... (boş bırakılırsa İlgezdi başlangıç sayfası)" /></div>
      <p class="s-hint">Uygulama açıldığında ve Ana Sayfa düğmesine basınca bu adres açılır.</p>
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
      <p class="s-hint" style="margin-top:0">Odak sayfadayken de çalışır. Ctrl+B, Ctrl+H, Ctrl+Shift+L ve Ctrl+Shift+V yalnızca İlgezdi arayüzü odaktayken çalışır; sayfalarda kalın yazı, bul-değiştir, hizalama ve düz metin yapıştırma için kullanılırlar.</p>
      <table class="shortcut-table">
        <tr><td>Yeni sekme</td><td><span class="kbd">Ctrl</span>+<span class="kbd">T</span></td></tr>
        <tr><td>Sekmeyi kapat</td><td><span class="kbd">Ctrl</span>+<span class="kbd">W</span></td></tr>
        <tr><td>Kapatılan sekmeyi yeniden aç</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">T</span></td></tr>
        <tr><td>Sonraki / önceki sekme</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Tab</span> · <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">Tab</span></td></tr>
        <tr><td>1.–8. sekme / son sekme</td><td><span class="kbd">Ctrl</span>+<span class="kbd">1</span>…<span class="kbd">8</span> · <span class="kbd">Ctrl</span>+<span class="kbd">9</span></td></tr>
        <tr><td>Adres çubuğu</td><td><span class="kbd">Ctrl</span>+<span class="kbd">L</span> · <span class="kbd">Alt</span>+<span class="kbd">D</span> · <span class="kbd">F6</span></td></tr>
        <tr><td>Yenile / önbelleği atlayarak yenile</td><td><span class="kbd">F5</span> · <span class="kbd">Ctrl</span>+<span class="kbd">F5</span></td></tr>
        <tr><td>Geri / ileri</td><td><span class="kbd">Alt</span>+<span class="kbd">←</span> · <span class="kbd">Alt</span>+<span class="kbd">→</span></td></tr>
        <tr><td>Sayfada bul / sonraki eşleşme</td><td><span class="kbd">Ctrl</span>+<span class="kbd">F</span> · <span class="kbd">F3</span></td></tr>
        <tr><td>Yakınlaştır / uzaklaştır / sıfırla</td><td><span class="kbd">Ctrl</span>+<span class="kbd">+</span> · <span class="kbd">Ctrl</span>+<span class="kbd">-</span> · <span class="kbd">Ctrl</span>+<span class="kbd">0</span></td></tr>
        <tr><td>Yazdır</td><td><span class="kbd">Ctrl</span>+<span class="kbd">P</span></td></tr>
        <tr><td>Tam ekran</td><td><span class="kbd">F11</span></td></tr>
        <tr><td>Yer imine ekle</td><td><span class="kbd">Ctrl</span>+<span class="kbd">D</span></td></tr>
        <tr><td>Yer imleri paneli</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">O</span> · <span class="kbd">Ctrl</span>+<span class="kbd">B</span></td></tr>
        <tr><td>Gizli pencere</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">N</span></td></tr>
        <tr><td>Ayarlar</td><td><span class="kbd">Ctrl</span>+<span class="kbd">,</span></td></tr>
        <tr><td>Ziyaret günlüğü</td><td><span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">L</span></td></tr>
        <tr><td>Geçmiş / İndirilenler</td><td><span class="kbd">Ctrl</span>+<span class="kbd">H</span> · <span class="kbd">Ctrl</span>+<span class="kbd">J</span></td></tr>
      </table>
    </div>
    <div class="settings-section"><h3>Uygulama Güncellemesi</h3>
      <div class="s-input-row" style="align-items:center;justify-content:space-between;display:flex;gap:10px">
        <div>
          <div class="s-toggle-label">İlgezdi sürümü</div>
          <div class="s-toggle-sub" id="app-version-text">—</div>
        </div>
        <button class="folder-btn" id="btn-check-updates">↻ Güncellemeleri denetle</button>
      </div>
      <div id="update-check-status" style="font-size:11.5px;color:var(--text-muted);margin-top:8px;min-height:15px"></div>
    </div>`;
}

// Değerler ana süreçte ayrıca doğrulanır (site-safety.js → normalizeSecureDns).
const SECURE_DNS_CHOICES = [
  ['automatic',  'Otomatik (önerilir)'],
  ['cloudflare', 'Cloudflare (1.1.1.1)'],
  ['quad9',      'Quad9 (9.9.9.9)'],
  ['adguard',    'AdGuard DNS'],
  ['google',     'Google Public DNS'],
  ['off',        'Kapalı'],
];

// Değerler ana süreçte ayrıca doğrulanır (browser-commands.js → normalizeWebrtcPolicy).
const WEBRTC_OPTIONS = [
  ['default_public_interface_only',         'Yalnızca varsayılan genel arayüz (önerilir)'],
  ['default_public_and_private_interfaces', 'Varsayılan genel ve özel arayüzler'],
  ['default',                               'Tüm arayüzler (en uyumlu, IP sızabilir)'],
  ['disable_non_proxied_udp',               'Proxy dışı UDP kapalı (en katı)'],
];

function renderPrivacyTab(cfg) {
  const row = (id,lbl,sub,chk) => `
    <div class="s-toggle-row">
      <div><div class="s-toggle-label">${lbl}</div>${sub?`<div class="s-toggle-sub">${sub}</div>`:''}</div>
      <label class="switch"><input type="checkbox" id="${id}" ${chk?'checked':''}/><span class="slider"></span></label>
    </div>`;
  return `
    <div class="settings-section"><h3>Zararlı Site Koruması</h3>
      ${row('cfg-threat','Tehlikeli siteleri engelle','Kimlik avı ve zararlı yazılım adresleri açık tehdit listeleriyle cihazınızda denetlenir. Ziyaret ettiğiniz adresler Google dahil hiçbir sunucuya gönderilmez.',cfg.threatProtection!==false)}
      <div id="threat-status" aria-live="polite"><p class="s-hint" style="margin-top:0">Yükleniyor…</p></div>
      <button class="clear-btn" id="btn-threat-update" style="margin-top:8px">Listeleri şimdi güncelle</button>
      <p class="s-hint">Liste indirilirken liste sunucusu yalnızca IP adresinizi görür (VPN açıksa VPN adresini). Bir site hatalı engellenirse uyarı sayfasından o oturum için devam edebilirsiniz.</p>
    </div>
    <div class="settings-section"><h3>Tracker & Reklam</h3>
      ${row('cfg-tracker','İzleyici Engelleme','Bilinen izleyici alan adlarına istekler engellenir',cfg.blockTrackers!==false)}
      ${row('cfg-ads','Reklam Engelleme','Reklam sunucuları bloke',cfg.blockAds!==false)}
      ${row('cfg-3pc','Üçüncü Taraf Çerezleri Engelle','Başka sitelerin sizi siteler arasında çerezle izlemesini engeller. Sorun çıkan sitede kilit simgesinden izin verebilirsiniz.',cfg.blockThirdPartyCookies!==false)}
    </div>
    <div class="settings-section"><h3>Fingerprint & Kimlik</h3>
      ${row('cfg-fp','IP Başlıklarını Gizle','Proxy/IP başlıkları (X-Forwarded-For, Via) gönderilmez',cfg.fingerprintProtection!==false)}
      ${row('cfg-https-only','Yalnızca HTTPS','HTTP sitelere güvenli bağlan',cfg.httpsOnly)}
      ${row('cfg-dnt','Do Not Track','Takip etme sinyali gönder',cfg.doNotTrack)}
    </div>
    <div class="settings-section"><h3>WebRTC IP Koruması</h3>
      <div class="s-input-row">
        <label for="cfg-webrtc">Görüntülü görüşme ve eşler arası bağlantılarda kullanılacak ağ arayüzü</label>
        <select id="cfg-webrtc">
          ${WEBRTC_OPTIONS.map(([v, t]) => `<option value="${v}" ${(cfg.webrtcPolicy || 'default_public_interface_only') === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <p class="s-hint">VPN açıkken sitelerin WebRTC üzerinden gerçek IP adresinizi görmesini engeller. En katı seçenek bazı görüntülü görüşme sitelerini bozabilir.</p>
    </div>
    <div class="settings-section"><h3>Güvenli DNS</h3>
      <div class="s-input-row">
        <label for="cfg-secure-dns">Alan adı sorgularını şifrele (DNS-over-HTTPS)</label>
        <select id="cfg-secure-dns">
          ${SECURE_DNS_CHOICES.map(([v, t]) => `<option value="${v}" ${(cfg.secureDns || 'automatic') === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <p class="s-hint">Belirli bir sağlayıcı seçerseniz kurum içi ağlardaki adresler çözümlenemeyebilir; öyle bir durumda Otomatik seçin.</p>
    </div>
    <div class="settings-section"><h3>Site İzinleri</h3>
      <div id="site-perm-list"><p class="s-hint" style="margin-top:0">Yükleniyor…</p></div>
      <button class="clear-btn" id="btn-site-perm-reset" style="margin-top:8px">Tüm site izinlerini sıfırla</button>
    </div>
    <div class="settings-section"><h3>Log</h3>
      ${row('cfg-log','Ziyaret Logları','AES-256 şifreli saklanır',cfg.logEnabled!==false)}
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
    <div class="settings-section"><h3>Kaydetme ve Doldurma</h3>
      <div class="s-toggle-row">
        <div><div class="s-toggle-label">Şifre kaydetmeyi öner</div><div class="s-toggle-sub">Bir sitede giriş yapınca şifreyi kasaya kaydetmeyi sorar. Kayıtlı hesap, giriş alanına tıklayınca açılan menüden seçilerek doldurulur; sayfa açılınca kendiliğinden doldurulmaz.</div></div>
        <label class="switch"><input type="checkbox" id="cfg-pw-offer" ${cfg.offerToSavePasswords!==false?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="s-toggle-label" style="margin-top:10px">Asla kaydedilmeyecek siteler</div>
      <div id="pw-never-list"><p class="s-hint" style="margin-top:0">Yükleniyor…</p></div>
    </div>
    <div class="settings-section">
      <h3>Kasa Koruması</h3>
      <div id="pwd-protection-note" class="s-hint" style="margin-top:0">Denetleniyor…</div>
    </div>
    <div class="settings-section"><h3>Diğer Tarayıcıdan İçe Aktar</h3>
      <p class="s-hint" style="margin-top:0">Chrome/Edge/Brave kayıtlı şifrelerinizi ya da tarayıcıdan dışa aktardığınız CSV dosyasını güvenli kasaya aktarın.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="pwd-btn" id="btn-pwd-import-browser">⬇ Tarayıcıdan</button>
        <button class="pwd-btn" id="btn-pwd-import-csv">📄 CSV'den</button>
      </div>
    </div>
    <div class="settings-section"><h3>Yeni Şifre Ekle</h3>
      <div class="s-input-row"><label>Site</label><input type="text" id="pwd-new-site" placeholder="google.com"/></div>
      <div class="s-input-row"><label>Kullanıcı adı</label><input type="text" id="pwd-new-user" placeholder="kullanici@email.com"/></div>
      <div class="s-input-row"><label>Şifre</label><input type="password" id="pwd-new-pass" placeholder="••••••••"/></div>
      <button class="btn-save-settings" id="btn-pwd-add" style="margin-top:4px">➕ Ekle</button>
    </div>
    <div class="settings-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0;border:none;padding:0">Kayıtlı (<span id="pwd-count">…</span>)</h3>
      </div>
      <div id="pwd-list-container"><p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px">Yükleniyor…</p></div>
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

async function populatePwdList() {
  const box = document.getElementById('pwd-list-container');
  if (!box) return;
  await migrateOldPasswords();
  const list = await window.secureBrowser?.passwords?.list() || [];
  const cnt = document.getElementById('pwd-count'); if (cnt) cnt.textContent = list.length;
  if (!list.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px">Henüz şifre yok. Diğer tarayıcınızdan içe aktarabilirsiniz.</p>';
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
        <button class="pwd-btn" data-act="reveal" data-id="${v.id}">👁</button>
        <button class="pwd-btn" data-act="copy" data-id="${v.id}">📋</button>
        <button class="pwd-btn danger" data-act="del" data-id="${v.id}">🗑</button>
      </div></div>`;
  }).join('');
  box.querySelectorAll('.pwd-btn[data-act]').forEach(b => b.addEventListener('click', onPwdAction));
}

async function onPwdAction(e) {
  const btn = e.currentTarget, id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
  const pw = window.secureBrowser?.passwords;
  if (act === 'reveal') {
    const cell = document.querySelector(`.pwd-pass[data-pass="${id}"]`); if (!cell) return;
    cell.textContent = cell.textContent === '••••••••' ? (await pw.reveal(id)) : '••••••••';
  } else if (act === 'copy') {
    navigator.clipboard.writeText(await pw.reveal(id)).then(()=>showSettingsToast('Şifre kopyalandı!'));
  } else if (act === 'del') {
    if (!confirm('Bu şifre silinsin mi?')) return;
    await pw.delete(id); populatePwdList();
  }
}

async function pwImportFromBrowser() {
  const pw = window.secureBrowser?.passwords;
  const found = await pw?.importDetect() || [];
  if (!found.length) { showSettingsToast('Kurulu tarayıcı bulunamadı','error'); return; }
  // Basit seçim: tek tarayıcı varsa doğrudan, çoklu ise ilkini sor
  const pick = found.length === 1 ? found[0] : (found.find(f => confirm(`${f.name} şifrelerini içe aktar?`)) || null);
  if (!pick) return;
  showSettingsToast(`${pick.name} içe aktarılıyor…`);
  const r = await pw.importBrowser(pick.id);
  if (!r) return;
  // Hata mesajı ana süreçten kullanıcıya yönelik metin olarak gelir (ham kod değil).
  if (r.ok === false) { showSettingsToast(r.error || 'İçe aktarma başarısız', 'error'); return; }
  let msg = `${r.imported} şifre içe aktarıldı`;
  if (r.appBound) msg += ` · ${r.appBound} kayıt tarayıcının ek koruması nedeniyle alınamadı; bunlar için CSV ile içe aktarın`;
  if (r.failed)   msg += ` · ${r.failed} kayıt çözülemedi`;
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
  else if (tabId==='privacy')       content.innerHTML = renderPrivacyTab(cfg);
  else if (tabId==='passwords')     content.innerHTML = renderPasswordsTab(cfg);
  else if (tabId==='diag')          content.innerHTML = window.ilgezdiDiagPanel?.render?.()
                                      || '<p class="s-hint">Tanılama modülü yüklenemedi.</p>';
  if (tabId==='customization') { bindCustomizationEvents(); updatePreviewBox(); }
  if (tabId==='account')       bindAccountEvents();
  if (tabId==='general')       bindGeneralEvents();
  if (tabId==='privacy')       bindPrivacyEvents();
  if (tabId==='passwords')     bindPasswordEvents();
  if (tabId==='diag')          window.ilgezdiDiagPanel?.bind?.();
}

// ─── Hesap sekmesi (QRtım / e-posta girişi) ───────────────────────────────────
function renderAccountTab() {
  return `
    <div class="settings-section">
      <h3>👤 Hesap</h3>
      <div class="account-card" id="account-info" style="padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface);margin-bottom:14px;font-size:13px;color:var(--text-secondary)">
        Yükleniyor…
      </div>
      <div class="account-actions" id="account-actions" style="display:flex;gap:8px;flex-wrap:wrap"></div>
      <p style="font-size:11.5px;color:var(--text-muted);margin-top:12px;line-height:1.5">
        QRtım hesabınızla giriş yaparak yer imlerinizi ve ayarlarınızı senkronlayın.
        E-posta ile giriş / kayıt ya da QR kod ile giriş desteklenir.
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
    const name = session.displayName || session.email || 'Kullanıcı';
    info.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--copper));display:grid;place-items:center;color:#0e1a2e;font-weight:800;font-size:18px">${(name[0]||'K').toUpperCase()}</div>
        <div>
          <div style="color:var(--text-primary);font-weight:600">${name}</div>
          <div style="color:var(--text-muted);font-size:12px">${session.email || ''} · ${session.plan || 'free'} · ${session.loginMethod || ''}</div>
        </div>
      </div>`;
    actions.innerHTML = `<button class="btn-ghost" id="acc-logout">Çıkış Yap</button>`;
    document.getElementById('acc-logout')?.addEventListener('click', async () => {
      // Panel kapatılmaz; çıkış 'ilgezdi-auth-changed' ile bu sekmeyi yeniler.
      await window.ilgezdiAuth?.logout?.();
    });
  } else {
    info.innerHTML = `<span style="color:var(--text-muted)">Henüz giriş yapılmadı.</span>`;
    actions.innerHTML = `<button class="btn-primary" id="acc-open">Giriş Yap / Kayıt Ol</button>`;
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

// ─── Gizlilik sekmesi: site izinleri listesi ──────────────────────────────────
async function populateSitePermissions() {
  const box = document.getElementById('site-perm-list');
  if (!box) return;
  const H = window.ilgezdiHtml;
  let list = [];
  try { list = (await window.secureBrowser?.site?.listPermissions?.()) || []; } catch {}
  if (!list.length) {
    box.innerHTML = '<p class="s-hint" style="margin-top:0">Henüz bir site için izin kararı verilmedi.</p>';
    return;
  }
  box.innerHTML = list.map((p, i) => `
    <div class="s-toggle-row">
      <div><div class="s-toggle-label">${H.esc(p.origin.replace(/^https?:\/\//, ''))}</div>
      <div class="s-toggle-sub">${H.esc(p.label)} · ${p.decision === 'allow' ? 'İzin verildi' : 'Engellendi'}</div></div>
      <button class="folder-btn" data-perm-index="${i}">Kaldır</button>
    </div>`).join('');
  box.querySelectorAll('[data-perm-index]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = list[Number(btn.dataset.permIndex)];
      const r = await window.secureBrowser?.site?.setPermission?.(p.origin, p.permission, 'ask');
      if (r && r.ok === false) showSettingsToast(r.error || 'Kaldırılamadı', 'error');
      populateSitePermissions();
    });
  });
}

function bindPrivacyEvents() {
  populateSitePermissions();
  populateThreatStatus();
  document.getElementById('btn-site-perm-reset')?.addEventListener('click', async () => {
    const r = await window.secureBrowser?.site?.resetPermissions?.();
    if (r?.ok) showSettingsToast('Tüm site izinleri sıfırlandı');
    populateSitePermissions();
  });
  document.getElementById('btn-threat-update')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const old = btn.textContent;
    const before = _lastThreatStatus;
    btn.disabled = true;
    btn.textContent = 'Denetleniyor…';
    let st = null;
    try { st = await window.secureBrowser?.threats?.updateNow?.(); } catch {}
    btn.disabled = false;
    btn.textContent = old;
    renderThreatStatus(st);
    if (!st) return;
    const fmt = new Intl.NumberFormat('tr-TR');
    const changed = !before || st.sources.some((s) => {
      const b = before.sources.find((x) => x.id === s.id);
      return !b || b.updatedAt !== s.updatedAt || b.lastError !== s.lastError;
    });
    if (!st.enabled) showSettingsToast('Koruma kapalıyken listeler güncellenmez');
    else if (st.sources.some((s) => s.lastError)) showSettingsToast('Bazı listeler indirilemedi; ayrıntı aşağıda');
    else if (!changed) showSettingsToast('Listeler birkaç dakika önce denetlendi, güncel');
    else showSettingsToast('Listeler denetlendi: ' + st.sources.map((s) => fmt.format(s.entries)).join(' + ') + ' kayıt');
  });
}

// Zararlı site koruması durumu: kaynak başına kayıt sayısı, son denetim ve hata.
// DOM textContent ile kurulur (hata metni ağdan gelebilir).
let _lastThreatStatus = null;
async function populateThreatStatus() {
  subscribeThreatStatus();
  let st = null;
  try { st = await window.secureBrowser?.threats?.status?.(); } catch {}
  renderThreatStatus(st);
}

// Ana süreç liste durumu değişince haber verir (güncelleme başladı, bir liste bitti);
// Gizlilik sekmesi açıksa kutu yerinde yenilenir. Eskiden yalnızca sekme açılırken
// bir kez çiziliyordu. Abonelik bir kez kurulur.
let _threatStatusSubscribed = false;
function subscribeThreatStatus() {
  if (_threatStatusSubscribed) return;
  _threatStatusSubscribed = true;
  window.secureBrowser?.threats?.onStatus?.((st) => {
    if (document.getElementById('threat-status')) renderThreatStatus(st);
  });
}

function renderThreatStatus(st) {
  const box = document.getElementById('threat-status');
  if (!box) return;
  box.replaceChildren();
  const line = (cls, text, color) => {
    const d = document.createElement('div');
    d.className = cls;
    if (color) d.style.color = color;
    d.textContent = text;
    return d;
  };
  if (!st) { box.appendChild(line('s-hint', 'Koruma durumu alınamadı.', 'var(--danger)')); return; }
  const fmt = new Intl.NumberFormat('tr-TR');
  for (const s of st.sources || []) {
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border-color)';
    item.appendChild(line('s-toggle-label', s.name));
    const when = s.updatedAt ? new Date(s.updatedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    item.appendChild(line('s-toggle-sub', s.entries
      ? `${fmt.format(s.entries)} kayıt · son denetim ${when}${s.stale ? ' · güncel değil' : ''}${st.updating ? ' · denetleniyor…' : ''}`
      : (st.updating ? 'Liste indiriliyor…' : 'Liste henüz indirilmedi')));
    if (s.covers) item.appendChild(line('s-toggle-sub', s.covers + (s.license ? ' · lisans ' + s.license : '')));
    if (s.lastError) item.appendChild(line('s-toggle-sub', 'Son deneme başarısız: ' + s.lastError, 'var(--danger)'));
    box.appendChild(item);
  }
  if (st.blockedPages || st.blockedResources) {
    box.appendChild(line('s-hint', `Bu açılışta ${fmt.format(st.blockedPages)} sayfa ve ${fmt.format(st.blockedResources)} kaynak engellendi.`));
  }
}

function bindGeneralEvents() {
  document.getElementById('btn-pick-folder')?.addEventListener('click', async () => {
    const folder = await window.secureBrowser?.pickDownloadFolder?.();
    if (folder) { document.getElementById('download-folder').value=folder; _formCfg.downloadFolder=folder; updateUnsavedBar(); }
  });
  const st=(msg)=>{const el=document.getElementById('clear-status');if(el){el.textContent=msg;setTimeout(()=>el.textContent='',3000);}};
  // Sonucu kontrol et — başarısız ya da iptal edilmiş işlemi "temizlendi" diye bildirmeyelim.
  const report = (r, okMsg) => {
    if (r?.canceled)      st('İşlem iptal edildi');
    else if (r?.success)   st(okMsg);
    else                   st('Temizlenemedi: ' + (r?.error || 'bilinmeyen hata'));
  };
  document.getElementById('btn-clear-cache')?.addEventListener('click',   async()=>{report(await window.secureBrowser?.clearCache?.(),   'Önbellek temizlendi ✓');});
  document.getElementById('btn-clear-cookies')?.addEventListener('click', async()=>{report(await window.secureBrowser?.clearCookies?.(), 'Çerezler temizlendi ✓');});
  document.getElementById('btn-clear-all')?.addEventListener('click',     async()=>{report(await window.secureBrowser?.clearAll?.(),     'Tüm tarama verileri temizlendi ✓');});
  document.getElementById('btn-clear-history')?.addEventListener('click', async()=>{await window.secureBrowser?.logs?.clearLogs?.();     st('Geçmiş temizlendi ✓');});

  // ── Uygulama güncellemesi ────────────────────────────────────────────────────
  const up = window.secureBrowser?.updater;
  const verEl = document.getElementById('app-version-text');
  if (up && verEl) up.currentVersion().then(v => { verEl.textContent = v ? `Sürüm ${v}` : 'Sürüm —'; }).catch(()=>{});
  document.getElementById('btn-check-updates')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const us = document.getElementById('update-check-status');
    if (!up) { if (us) us.textContent = 'Güncelleme modülü kullanılamıyor.'; return; }
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Denetleniyor…';
    if (us) { us.style.color = 'var(--text-muted)'; us.textContent = 'Sunucu denetleniyor…'; }
    const r = await up.check();
    btn.disabled = false; btn.textContent = old;
    if (!us) return;
    if (r?.reason === 'dev')      us.textContent = 'Geliştirme modunda güncelleme denetlenmez.';
    else if (r?.ok === false)     { us.style.color = 'var(--danger)'; us.textContent = 'Denetlenemedi: ' + (r.reason || 'bilinmeyen hata'); }
    else if (r?.version)          { us.style.color = 'var(--success)'; us.textContent = `Yeni sürüm bulundu: ${r.version} — bildirim şeridinden güncelleyin.`; }
    else                          { us.style.color = 'var(--success)'; us.textContent = 'En güncel sürümü kullanıyorsunuz ✓'; }
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

  const osName = navigator.userAgent.includes('Mac')   ? 'macOS Anahtar Zinciri'
               : navigator.userAgent.includes('Linux') ? 'sistem anahtar kasası'
               :                                         'Windows DPAPI';
  if (available) {
    el.innerHTML = `<span style="color:var(--success)">🔐 Kasa şifreli.</span> Parolalar diskte
      ${osName} ile, işletim sistemi hesabınıza bağlı olarak şifrelenir. Chrome, Edge ve
      Brave de aynı modeli kullanır. Bilgisayarınızda oturumunuz açıkken bu hesapla çalışan
      programlar kasaya erişebilir — bu yüzden cihaz parolanızı güçlü tutun.`;
  } else {
    el.innerHTML = `<span style="color:var(--danger)">⚠ Kasa şifrelenemiyor.</span> İşletim
      sisteminin anahtar kasası bu makinede kullanılamıyor, bu yüzden parolalar
      <strong>kaydedilmez</strong>. Linux kullanıyorsanız bir anahtar kasası
      (gnome-keyring / kwallet) kurmanız gerekir.`;
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
    p.textContent = 'Yok. Kaydetme önerisinde "Bu sitede asla" denen siteler burada listelenir.';
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
    btn.textContent = 'Kaldır';
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
    if(!site||!pass){showSettingsToast('Site ve şifre zorunlu','error');return;}
    // Ana süreç reddedebilir (geçersiz adres, okunamayan kasa) — sonucu kontrol et.
    const addRes = await window.secureBrowser?.passwords?.add({ url: site, username: user, password: pass });
    if (addRes && addRes.ok === false) { showSettingsToast(addRes.error || 'Şifre kaydedilemedi', 'error'); return; }
    ['pwd-new-site','pwd-new-user','pwd-new-pass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    showSettingsToast('Şifre güvenli kasaya kaydedildi!');
    populatePwdList();
  });
  document.getElementById('btn-pwd-import-browser')?.addEventListener('click', pwImportFromBrowser);
  document.getElementById('btn-pwd-import-csv')?.addEventListener('click', async ()=>{
    const r = await window.secureBrowser?.passwords?.importCsv();
    if (!r || r.canceled) return;
    if (r.ok === false) { showSettingsToast(r.error || 'İçe aktarma başarısız', 'error'); return; }
    showSettingsToast(r.imported ? `${r.imported} şifre içe aktarıldı` : 'Yeni şifre bulunamadı — hepsi zaten kasada olabilir');
    if (r.imported) populatePwdList();
  });
  // Listeyi güvenli kasadan doldur. (Eskiden bir sessionStorage "kilit" bayrağına
  // bağlıydı; bayrak kaldırıldığı için artık koşulsuz yüklenir. Liste maskeli
  // gelir — tam parola yalnızca ayrı bir "göster" isteğiyle alınır.)
  populatePwdList();
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

  // Giriş/çıkış sonrası Hesap sekmesi açıksa yerinde yenilenir (panel kapanmaz).
  window.addEventListener('ilgezdi-auth-changed', () => {
    const panel = document.getElementById('panel-settings');
    const active = document.querySelector('.settings-tab.active')?.dataset.tab;
    if (panel?.classList.contains('visible') && active === 'account') bindAccountEvents();
  });

  // KAYDET — pending değerleri commit et, sonra API'ye yaz
  document.getElementById('btn-save-all')?.addEventListener('click', async()=>{
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
    settingsConfig = finalCfg;
    applyAccessibility(finalCfg);
    initFormState(finalCfg);
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
