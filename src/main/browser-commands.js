/**
 * İlgezdi — Tarayıcı komutları (saf mantık)
 * browser-commands.js
 *
 * Electron'a bağımlı değildir. main.js olayları bağlar; bu modül yalnızca
 * "hangi tuş hangi komut", "sağ tık menüsünde ne olmalı", "bir sonraki
 * yakınlaştırma adımı ne" gibi soruları yanıtlar. Davranış birim testleriyle
 * korunur (test/run.js).
 *
 * Kısayollar neden ana süreçte:
 *   Eskiden tüm kısayollar arayüz penceresinin keydown dinleyicisindeydi.
 *   Sekmeler ayrı WebContentsView olduğu için kullanıcı sayfaya tıkladığı anda
 *   Ctrl+T, Ctrl+W ve F5 dahil hiçbiri çalışmıyordu. Artık her sekmenin, önizleme
 *   görünümünün ve arayüzün before-input-event olayı commandForInput'a sorar.
 */

'use strict';

const isWebUrl = (u) => /^https?:\/\//i.test(String(u || ''));

// ─── WebRTC IP politikası ─────────────────────────────────────────────────────
// 'default' tüm ağ arayüzlerini dener; VPN açıkken bile fiziksel bağdaştırıcı
// üzerinden gelen STUN yanıtı gerçek IP'yi sayfaya verebilir. Varsayılanımız
// yalnızca varsayılan rotadaki genel arayüzü kullanır (VPN açıkken tünel), bu
// yüzden görüntülü görüşmeler çalışmaya devam eder. 'disable_non_proxied_udp'
// en katısıdır: proxy yoksa UDP tamamen kapanır ve çoğu görüşme uygulaması bozulur.
const WEBRTC_POLICIES = Object.freeze([
  'default',
  'default_public_and_private_interfaces',
  'default_public_interface_only',
  'disable_non_proxied_udp',
]);
const DEFAULT_WEBRTC_POLICY = 'default_public_interface_only';

function normalizeWebrtcPolicy(value) {
  return WEBRTC_POLICIES.includes(value) ? value : DEFAULT_WEBRTC_POLICY;
}

// ─── Klavye kısayolları ───────────────────────────────────────────────────────
// page:   sekme içeriği odaktayken de geçerli mi? Editörlerin kullandığı
//         birleşimler (Ctrl+B kalın, Ctrl+Shift+L sola hizala, Ctrl+Shift+V düz
//         metin yapıştır) yalnızca İlgezdi arayüzü odaktayken yakalanır; aksi
//         hâlde Gmail ve Docs gibi sayfalar bozulur.
// repeat: tuş basılı tutulunca tekrarlansın mı?
// anyShift: Shift basılı olsa da eşleşsin (ABD düzeninde + işareti Shift+= ile,
//         Türkçe Q düzeninde Shift+4 ile yazılır).
const SHORTCUTS = [
  { keys: ['Mod+T'],                             cmd: 'new-tab',           page: true },
  { keys: ['Mod+W', 'Mod+F4'],                   cmd: 'close-tab',         page: true, repeat: true },
  { keys: ['Mod+Shift+T'],                       cmd: 'reopen-closed-tab', page: true },
  { keys: ['Mod+Tab', 'Mod+PageDown'],           cmd: 'next-tab',          page: true, repeat: true },
  { keys: ['Mod+Shift+Tab', 'Mod+PageUp'],       cmd: 'prev-tab',          page: true, repeat: true },
  { keys: ['Mod+9'],                             cmd: 'last-tab',          page: true },
  { keys: ['F5', 'Mod+R'],                       cmd: 'reload',            page: true },
  { keys: ['Shift+F5', 'Mod+F5', 'Mod+Shift+R'], cmd: 'hard-reload',       page: true },
  { keys: ['Alt+ArrowLeft'],                     cmd: 'back',              page: true, repeat: true },
  { keys: ['Alt+ArrowRight'],                    cmd: 'forward',           page: true, repeat: true },
  { keys: ['Mod+L', 'Alt+D', 'F6'],              cmd: 'focus-address',     page: true },
  { keys: ['Mod+F'],                             cmd: 'find',              page: true },
  { keys: ['F3'],                                cmd: 'find-next',         page: true,  repeat: true },
  { keys: ['Shift+F3'],                          cmd: 'find-prev',         page: true,  repeat: true },
  { keys: ['Mod+G'],                             cmd: 'find-next',         page: false, repeat: true },
  { keys: ['Mod+Shift+G'],                       cmd: 'find-prev',         page: false, repeat: true },
  { keys: ['Mod+P'],                             cmd: 'print',             page: true },
  { keys: ['Mod+D'],                             cmd: 'bookmark-page',     page: true },
  { keys: ['Mod+=', 'Mod++', 'Mod+NumpadAdd'],   cmd: 'zoom-in',           page: true, repeat: true, anyShift: true },
  { keys: ['Mod+-', 'Mod+NumpadSubtract'],       cmd: 'zoom-out',          page: true, repeat: true, anyShift: true },
  { keys: ['Mod+0', 'Mod+Numpad0'],              cmd: 'zoom-reset',        page: true },
  { keys: ['Mod+Shift+N'],                       cmd: 'incognito',         page: true },
  { keys: ['Mod+,'],                             cmd: 'settings',          page: true },
  { keys: ['Mod+Shift+O'],                       cmd: 'toggle-bookmarks',  page: true },
  { keys: ['Mod+B'],                             cmd: 'toggle-bookmarks',  page: false },
  { keys: ['Mod+Shift+L'],                       cmd: 'logs',              page: false },
  { keys: ['Mod+Shift+V'],                       cmd: 'vpn-panel',         page: false },
  { keys: ['F11'],                               cmd: 'toggle-fullscreen', page: true },
  { keys: ['Mod+J'],                             cmd: 'downloads-page',    page: true },
  { keys: ['Mod+H'],                             cmd: 'history-page',      page: false },   // Docs: bul-değiştir
];
for (let i = 1; i <= 8; i++) SHORTCUTS.push({ keys: ['Mod+' + i], cmd: 'tab-' + i, page: true });

// Ana süreç yalnızca bu komutları kendisi yürütür; kalanlar arayüze iletilir.
const UI_COMMANDS = Object.freeze(new Set([
  'new-tab', 'focus-address', 'find', 'find-next', 'find-prev', 'bookmark-page',
  'settings', 'toggle-bookmarks', 'logs', 'vpn-panel', 'history-page', 'downloads-page',
]));

function parseShortcut(str) {
  const m = { mod: false, alt: false, shift: false };
  let rest = String(str);
  for (;;) {
    if (rest.startsWith('Mod+') && rest.length > 4) { m.mod = true; rest = rest.slice(4); }
    else if (rest.startsWith('Alt+') && rest.length > 4) { m.alt = true; rest = rest.slice(4); }
    else if (rest.startsWith('Shift+') && rest.length > 6) { m.shift = true; rest = rest.slice(6); }
    else break;
  }
  return { ...m, name: rest };
}

const canon = (m, name) =>
  (m.mod ? 'Mod+' : '') + (m.alt ? 'Alt+' : '') + (m.shift ? 'Shift+' : '') + name;

function buildShortcutIndex(list) {
  const index = new Map();
  const put = (key, entry) => {
    if (index.has(key)) throw new Error('Yinelenen kısayol: ' + key);
    index.set(key, entry);
  };
  for (const entry of list) {
    for (const k of entry.keys) {
      const p = parseShortcut(k);
      put(canon(p, p.name), entry);
      if (entry.anyShift && !p.shift) put(canon({ ...p, shift: true }, p.name), entry);
    }
  }
  return index;
}

const SHORTCUT_INDEX = buildShortcutIndex(SHORTCUTS);

// Bir tuş basışının eşleşebileceği adlar. Sayısal tuş takımı kod adıyla,
// rakamlar ayrıca fiziksel tuş koduyla denenir (AZERTY'de Ctrl+1 '&' üretir).
function keyNames(input) {
  const names = [];
  const code = String(input.code || '');
  const key = String(input.key || '');
  if (/^Numpad(Add|Subtract|[0-9])$/.test(code)) names.push(code);
  if (key.length === 1) names.push(key.toUpperCase());
  else if (key) names.push(key);
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit && !names.includes(digit[1])) names.push(digit[1]);
  return names;
}

/**
 * before-input-event girdisini komut adına çevirir; kısayol değilse null.
 * @param {object} input  Electron Input ({ type, key, code, control, alt, shift, meta, isAutoRepeat, isComposing })
 * @param {{platform?: string, surface?: 'page'|'ui'}} opts
 */
function commandForInput(input, { platform = process.platform, surface = 'page' } = {}) {
  if (!input || input.type !== 'keyDown' || input.isComposing) return null;
  const mac = platform === 'darwin';

  // Windows ve Linux'ta AltGr, Ctrl+Alt olarak gelir. Türkçe klavyede @, €, {, [
  // gibi karakterler bununla yazılır; bu birleşimde hiçbir kısayol yakalanmaz.
  if (!mac && input.control && input.alt) return null;

  const m = { mod: mac ? !!input.meta : !!input.control, alt: !!input.alt, shift: !!input.shift };
  if (mac && input.control) {
    // macOS'ta Ctrl birleşimleri metin düzenleme içindir; yalnızca Ctrl+Tab sekme değiştirir.
    if (input.key !== 'Tab' || input.meta) return null;
    m.mod = true;
  }

  for (const name of keyNames(input)) {
    const hit = SHORTCUT_INDEX.get(canon(m, name));
    if (!hit) continue;
    if (surface === 'page' && !hit.page) return null;
    if (input.isAutoRepeat && !hit.repeat) return null;
    return hit.cmd;
  }
  return null;
}

// ─── Sağ tık menüsü ───────────────────────────────────────────────────────────
function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/**
 * Electron 'context-menu' parametrelerinden menü modeli üretir. Eylemleri
 * main.js yürütür; model yalnızca ne gösterileceğini söyler.
 *
 * Sayfa denetimli her adres (bağlantı, resim) burada şemaya göre süzülür:
 * yalnızca http(s) açılır. Resim kaydetmede ayrıca data:image kabul edilir.
 *
 * @param {object} p    context-menu params
 * @param {{canGoBack?: boolean, canGoForward?: boolean, incognito?: boolean,
 *          surface?: 'page'|'ui', platform?: string}} ctx
 * @returns {Array<{type:'separator'}|{id:string,label:string,enabled:boolean,arg?:any}>}
 */
function buildContextMenuModel(p = {}, ctx = {}) {
  const items = [];
  const sep = () => {
    if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' });
  };
  const add = (id, label, extra = {}) => items.push({ id, label, ...extra });

  const flags = p.editFlags || {};
  const link = isWebUrl(p.linkURL) ? String(p.linkURL) : '';
  const src = String(p.srcURL || '');
  const webSrc = isWebUrl(src) ? src : '';
  const selection = String(p.selectionText || '').slice(0, 1000);
  const hasSelection = selection.trim().length > 0;
  const surface = ctx.surface === 'ui' ? 'ui' : 'page';

  if (p.isEditable) {
    if (p.misspelledWord) {
      const suggestions = (p.dictionarySuggestions || []).slice(0, 5);
      if (suggestions.length) suggestions.forEach((s) => add('replace-misspelling', s, { arg: s }));
      else add('no-suggestions', 'Öneri yok', { enabled: false });
      add('add-to-dictionary', 'Sözlüğe ekle', { arg: p.misspelledWord });
      sep();
    }
    add('undo', 'Geri al', { enabled: !!flags.canUndo });
    add('redo', 'Yinele', { enabled: !!flags.canRedo });
    sep();
    add('cut', 'Kes', { enabled: !!flags.canCut });
    add('copy', 'Kopyala', { enabled: !!flags.canCopy });
    add('paste', 'Yapıştır', { enabled: !!flags.canPaste });
    add('paste-plain', 'Düz metin olarak yapıştır', { enabled: !!flags.canPaste });
    add('select-all', 'Tümünü seç', { enabled: flags.canSelectAll !== false });
    if (surface === 'page' && hasSelection) {
      sep();
      add('search-selection', '“' + clip(selection, 24) + '” için ara', { arg: selection });
    }
    return finalizeMenu(items, ctx.platform);
  }

  // Arayüzün kendisinde (adres çubuğu dışı) yalnızca seçili metni kopyalamak anlamlı.
  if (surface === 'ui') {
    if (hasSelection) add('copy', 'Kopyala');
    return finalizeMenu(items, ctx.platform);
  }

  if (link) {
    add('open-link-tab', 'Bağlantıyı yeni sekmede aç', { arg: link });
    if (!ctx.incognito) add('open-link-incognito', 'Bağlantıyı gizli pencerede aç', { arg: link });
    add('glance-link', 'Bağlantıyı önizlemede aç', { arg: link });
    sep();
    add('save-link', 'Bağlantıyı farklı kaydet…', { arg: link });
    add('copy-text', 'Bağlantı adresini kopyala', { arg: link });
  } else if (/^mailto:/i.test(String(p.linkURL || ''))) {
    const address = String(p.linkURL).replace(/^mailto:/i, '').split('?')[0];
    if (address) add('copy-text', 'E-posta adresini kopyala', { arg: decodeURIComponentSafe(address) });
  }

  const isImage = p.mediaType === 'image';
  const isAv = p.mediaType === 'video' || p.mediaType === 'audio';
  if (isImage && (webSrc || /^data:image\//i.test(src))) {
    sep();
    if (webSrc) add('open-tab', 'Resmi yeni sekmede aç', { arg: webSrc });
    add('save-media', 'Resmi farklı kaydet…', { arg: src });
    add('copy-image', 'Resmi kopyala', { arg: { x: Number(p.x) || 0, y: Number(p.y) || 0 } });
    if (webSrc) add('copy-text', 'Resim adresini kopyala', { arg: webSrc });
  } else if (isAv && webSrc) {
    const video = p.mediaType === 'video';
    sep();
    add('open-tab', video ? 'Videoyu yeni sekmede aç' : 'Sesi yeni sekmede aç', { arg: webSrc });
    add('copy-text', video ? 'Video adresini kopyala' : 'Ses adresini kopyala', { arg: webSrc });
  }

  if (hasSelection) {
    sep();
    add('copy', 'Kopyala');
    add('search-selection', '“' + clip(selection, 24) + '” için ara', { arg: selection });
  }

  // Sayfa öğeleri yalnızca boş alana tıklanınca. javascript: ya da file: gibi
  // açılmasına izin verilmeyen bağlantılarda menü boş kalır (hiç açılmaz).
  if (!p.linkURL && !hasSelection && !isImage && !isAv) {
    add('back', 'Geri', { enabled: !!ctx.canGoBack });
    add('forward', 'İleri', { enabled: !!ctx.canGoForward });
    add('reload', 'Yeniden yükle');
    sep();
    add('print', 'Yazdır…');
    if (isWebUrl(p.pageURL)) add('view-source', 'Sayfa kaynağını görüntüle', { arg: 'view-source:' + p.pageURL });
  }

  return finalizeMenu(items, ctx.platform);
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function finalizeMenu(items, platform = process.platform) {
  while (items.length && items[items.length - 1].type === 'separator') items.pop();
  while (items.length && items[0].type === 'separator') items.shift();
  // Windows ve Linux menülerinde tek & bir erişim tuşu işaretidir ve görünmez;
  // sayfa metninden gelen & karakteri && ile yazılmalı.
  const escapeAmp = platform !== 'darwin';
  return items.map((it) => (it.type ? it : {
    ...it,
    label: escapeAmp ? String(it.label).replace(/&/g, '&&') : String(it.label),
    enabled: it.enabled !== false,
  }));
}

// ─── Yakınlaştırma ────────────────────────────────────────────────────────────
// Chrome'un adımları. Değer site (alan adı) başına hatırlanır.
const ZOOM_STEPS = Object.freeze([0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]);
const ZOOM_MIN = ZOOM_STEPS[0];
const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const ZOOM_STORE_MAX = 500;

/** direction: 1 büyüt, -1 küçült, 0 sıfırla */
function nextZoomFactor(current, direction) {
  if (!direction) return 1;
  const cur = Number(current) > 0 ? Number(current) : 1;
  if (direction > 0) return ZOOM_STEPS.find((z) => z > cur + 0.001) ?? ZOOM_MAX;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < cur - 0.001) return ZOOM_STEPS[i];
  return ZOOM_MIN;
}

function zoomKeyForUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : '';
  } catch { return ''; }
}

/**
 * Site başına yakınlaştırma deposu. config.json'da değil ayrı dosyada tutulur:
 * ayarlar paneli kaydederken tüm yapılandırmayı geri yazıyor ve panel açıkken
 * yapılan bir yakınlaştırmayı eski değerle ezerdi.
 * @param {{read: () => object, write: (obj: object) => void, delayMs?: number}} io
 */
function createZoomStore({ read, write, delayMs = 400 } = {}) {
  let data = null;
  let timer = null;

  const load = () => {
    if (data) return data;
    data = new Map();
    let raw = {};
    try { raw = read ? read() : {}; } catch { raw = {}; }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [host, value] of Object.entries(raw)) {
        const n = Number(value);
        if (host && host.length <= 253 && Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX && Math.abs(n - 1) > 0.001) {
          data.set(host, n);
        }
      }
    }
    return data;
  };

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    try { if (write) write(Object.fromEntries(load())); } catch {}
  };

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, delayMs);
    if (timer.unref) timer.unref();
  };

  return {
    get(host) { return (host && load().get(host)) || 1; },
    set(host, factor) {
      if (!host) return;
      const map = load();
      const n = Number(factor);
      map.delete(host);   // en son kullanılan sona geçsin, taşmada en eskisi düşsün
      if (Number.isFinite(n) && Math.abs(n - 1) > 0.001 && n >= ZOOM_MIN && n <= ZOOM_MAX) map.set(host, n);
      while (map.size > ZOOM_STORE_MAX) map.delete(map.keys().next().value);
      schedule();
    },
    size() { return load().size; },
    pending() { return !!timer; },
    flush,
  };
}

// ─── Kapatılan sekmeler ───────────────────────────────────────────────────────
// Yığın yalnızca bellekte durur (pencere kapanınca gider). Gizli pencerenin
// yığını kendi durum nesnesindedir ve pencereyle birlikte silinir.
const CLOSED_TABS_MAX = 25;
const HISTORY_MAX = 50;

/** Gezinme geçmişini yeniden yüklenebilir web girdilerine indirger. */
function snapshotHistory(entries, activeIndex) {
  if (!Array.isArray(entries)) return { entries: null, index: undefined };
  let kept = [];
  let index;
  entries.forEach((e, i) => {
    if (!e || !isWebUrl(e.url)) return;
    if (i === activeIndex) index = kept.length;
    kept.push(e);
  });
  if (!kept.length) return { entries: null, index: undefined };
  if (index === undefined) index = kept.length - 1;
  if (kept.length > HISTORY_MAX) {
    const drop = kept.length - HISTORY_MAX;
    kept = kept.slice(drop);
    index = Math.max(0, index - drop);
  }
  return { entries: kept, index };
}

function pushClosedTab(stack, entry) {
  if (!Array.isArray(stack) || !entry || !isWebUrl(entry.url)) return false;
  stack.push({
    url: String(entry.url),
    title: String(entry.title || ''),
    entries: entry.entries || null,
    index: entry.index,
  });
  while (stack.length > CLOSED_TABS_MAX) stack.shift();
  return true;
}

// ─── Sekme düzeni ─────────────────────────────────────────────────────────────
// Sabitlenmiş sekmeler her zaman soldadır; taşıma ve sabitleme bu sınırı korur.

/** tabId'yi toIndex'e taşır; sabitli sekme sabitli grupta, diğeri dışında kalır. */
function moveTabId(ids, pinnedSet, tabId, toIndex) {
  const from = ids.indexOf(tabId);
  if (from < 0) return ids.slice();
  const rest = ids.filter((id) => id !== tabId);
  const pinnedCount = rest.filter((id) => pinnedSet.has(id)).length;
  let to = Number.isInteger(toIndex) ? toIndex : from;
  to = Math.max(0, Math.min(to, rest.length));
  to = pinnedSet.has(tabId) ? Math.min(to, pinnedCount) : Math.max(to, pinnedCount);
  rest.splice(to, 0, tabId);
  return rest;
}

/** Sabitleme değişince sekme grup sınırına gider (pinnedSet yeni durumu içerir). */
function orderAfterPin(ids, pinnedSet, tabId) {
  const rest = ids.filter((id) => id !== tabId);
  const pinnedCount = rest.filter((id) => pinnedSet.has(id)).length;
  rest.splice(pinnedCount, 0, tabId);
  return rest;
}

// Sekme sağ tık menüsündeki ve arayüzün çağırabildiği işlemler (IPC beyaz listesi).
const TAB_ACTIONS = Object.freeze(new Set([
  'new-tab-right', 'reload', 'duplicate', 'pin', 'unpin', 'mute', 'unmute', 'toggle-mute',
  'move', 'close', 'close-others', 'close-right', 'reopen-closed',
]));

function buildTabMenuModel({ index, count, pinned, muted, canReopen, platform } = {}) {
  const items = [
    { id: 'new-tab-right', label: 'Sağa yeni sekme' },
    { type: 'separator' },
    { id: 'reload', label: 'Yeniden yükle' },
    { id: 'duplicate', label: 'Çoğalt' },
    { id: pinned ? 'unpin' : 'pin', label: pinned ? 'Sabitlemeyi kaldır' : 'Sabitle' },
    { id: muted ? 'unmute' : 'mute', label: muted ? 'Sekmenin sesini aç' : 'Sekmeyi sessize al' },
    { type: 'separator' },
    { id: 'close', label: 'Kapat' },
    { id: 'close-others', label: 'Diğer sekmeleri kapat', enabled: count > 1 },
    { id: 'close-right', label: 'Sağdaki sekmeleri kapat', enabled: index < count - 1 },
    { type: 'separator' },
    { id: 'reopen-closed', label: 'Kapatılan sekmeyi yeniden aç', enabled: !!canReopen },
  ];
  return finalizeMenu(items, platform);
}

// ─── Başlangıç ve oturum ──────────────────────────────────────────────────────
const STARTUP_MODES = Object.freeze(['homepage', 'restore']);
const normalizeStartupMode = (v) => (STARTUP_MODES.includes(v) ? v : 'homepage');

const SESSION_VERSION = 1;
const SESSION_TABS_MAX = 100;

/**
 * Kaydedilecek oturum. Yalnızca web sekmeleri; gezinme girdilerinden yalnızca
 * adres ve başlık tutulur (pageState form içerikleri taşıyabilir, diske yazılmaz).
 * @param {Array<{url, title, pinned, entries, index}>} tabs  pencere sırasıyla
 * @param {number} activeIndex
 */
function serializeSession(tabs, activeIndex) {
  const out = [];
  let active = 0;
  (Array.isArray(tabs) ? tabs : []).forEach((t, i) => {
    if (!t || !isWebUrl(t.url) || out.length >= SESSION_TABS_MAX) return;
    const snap = snapshotHistory(t.entries, t.index);
    if (i === activeIndex) active = out.length;
    out.push({
      url: String(t.url),
      title: String(t.title || '').slice(0, 300),
      pinned: !!t.pinned,
      entries: snap.entries ? snap.entries.map((e) => ({ url: String(e.url), title: String(e.title || '').slice(0, 300) })) : null,
      index: snap.entries ? snap.index : undefined,
    });
  });
  return { version: SESSION_VERSION, savedAt: Date.now(), activeIndex: out.length ? active : 0, tabs: out };
}

/** Diskten okunan oturumu doğrular; kullanılabilir sekme yoksa null. */
function parseSession(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== SESSION_VERSION || !Array.isArray(raw.tabs)) return null;
  const tabs = [];
  let activeIndex = 0;
  raw.tabs.forEach((t, i) => {
    if (!t || !isWebUrl(t.url) || tabs.length >= SESSION_TABS_MAX) return;
    const entries = Array.isArray(t.entries)
      ? t.entries.filter((e) => e && isWebUrl(e.url)).slice(-50).map((e) => ({ url: String(e.url), title: String(e.title || '').slice(0, 300) }))
      : [];
    let index = Number.isInteger(t.index) ? t.index : entries.length - 1;
    if (index < 0 || index >= entries.length) index = entries.length - 1;
    if (i === raw.activeIndex) activeIndex = tabs.length;
    tabs.push({
      url: String(t.url),
      title: String(t.title || '').slice(0, 300),
      pinned: t.pinned === true,
      entries: entries.length ? entries : null,
      index: entries.length ? index : undefined,
    });
  });
  if (!tabs.length) return null;
  // Sabitli sekmeler her zaman önde (bozuk ya da elle düzenlenmiş dosyaya karşı).
  const ordered = [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
  return { activeIndex: ordered.indexOf(tabs[activeIndex]), tabs: ordered };
}

module.exports = {
  TAB_ACTIONS,
  moveTabId,
  orderAfterPin,
  buildTabMenuModel,
  STARTUP_MODES,
  normalizeStartupMode,
  serializeSession,
  parseSession,
  WEBRTC_POLICIES,
  DEFAULT_WEBRTC_POLICY,
  normalizeWebrtcPolicy,
  SHORTCUTS,
  UI_COMMANDS,
  commandForInput,
  buildContextMenuModel,
  ZOOM_STEPS,
  nextZoomFactor,
  zoomKeyForUrl,
  createZoomStore,
  CLOSED_TABS_MAX,
  snapshotHistory,
  pushClosedTab,
  isWebUrl,
  _internals: { parseShortcut, buildShortcutIndex, keyNames, clip },
};
