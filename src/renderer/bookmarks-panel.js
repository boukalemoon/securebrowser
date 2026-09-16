'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let bmFolders       = [];
let bmItems         = [];
let bmCurrentFolder = null;
let bmSearchQuery   = '';
let _bmPanelOpen    = false;

// ─── CSS Inject ───────────────────────────────────────────────────────────────
function bmInjectStyles() {
  if (document.getElementById('ilgezdi-bm-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-bm-style';
  s.textContent = `
    /* Genişlik .side-panel'den (--panel-w = 420px = main.js PANEL_WIDTH). Eskiden
       360px'e zorlanıyordu ve sayfa ile panel arasında 60px boş şerit kalıyordu (D-03). */
    /* #panel-bookmarks'a burada position VERİLMEZ: .side-panel (main.css) paneli sağa
       sabitler (position:absolute; right:0). 0.8.0'da burada position:relative vardı;
       panel sola, sayfa görünümünün ALTINA düşüyor, sağda boş şerit kalıyordu
       (kullanıcı: "yer imleri boş geliyor, tekrar açılmıyor, site gelmiyor"). */

    .bm-import-menu {
      position:absolute; z-index:60; min-width:210px;
      background:var(--bg-elev, #15243d); border:1px solid var(--border-color);
      border-radius:10px; padding:6px; box-shadow:0 16px 40px rgba(0,0,0,.5);
    }
    .bm-im-head { font-size:10px; text-transform:uppercase; letter-spacing:.08em;
      color:var(--text-muted); padding:6px 8px 4px; }
    .bm-im-item { display:flex; align-items:center; justify-content:space-between; gap:10px;
      width:100%; padding:8px 10px; border:none; background:transparent; cursor:pointer;
      color:var(--text-main); font-size:12.5px; border-radius:7px; text-align:left; }
    .bm-im-item:hover { background:var(--bg-input); color:var(--accent); }
    .bm-im-count { font-size:10px; background:var(--bg-input); border-radius:8px;
      padding:1px 7px; color:var(--text-muted); }
    .bm-im-sep { height:1px; background:var(--border-color); margin:5px 4px; }

    .bm-search-bar { padding:10px 12px 0; flex-shrink:0; }
    .bm-search-input {
      width:100%; background:var(--bg-input);
      border:1px solid var(--border-color); border-radius:20px;
      color:var(--text-main); padding:7px 14px; font-size:12px;
      outline:none; transition:border-color .2s; box-sizing:border-box;
    }
    .bm-search-input:focus { border-color:var(--accent); }
    .bm-search-input::placeholder { color:var(--text-muted); }

    .bm-layout { display:flex; flex:1; overflow:hidden; }

    .bm-sidebar {
      width:150px; flex-shrink:0;   /* 110px'te klasör adları "Tü…", "Yer işa…" diye kesiliyordu */
      border-right:1px solid var(--border-color);
      overflow-y:auto; padding:8px 6px;
    }
    .bm-folder-item {
      display:flex; align-items:center; gap:5px;
      width:100%; padding:7px 8px; border-radius:7px;
      border:none; background:transparent;
      color:var(--text-muted); font-size:11px;
      cursor:pointer; text-align:left; transition:all .15s;
      margin-bottom:2px; position:relative;
    }
    .bm-folder-item:hover { background:var(--bg-input); color:var(--text-main); }
    .bm-folder-item.active { background:rgba(200,128,58,.12); color:var(--accent); font-weight:600; }
    .bm-folder-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bm-folder-count {
      font-size:9px; background:var(--bg-input);
      border-radius:8px; padding:1px 5px; color:var(--text-muted);
    }
    .bm-folder-item.active .bm-folder-count { background:var(--accent); color:var(--bg-base); }
    .bm-folder-del {
      position:absolute; right:4px; top:50%; transform:translateY(-50%);
      width:14px; height:14px; border-radius:50%;
      display:none; align-items:center; justify-content:center;
      font-size:9px; cursor:pointer; background:var(--danger); color:#fff;
    }
    .bm-folder-item:hover .bm-folder-del { display:flex; }
    .bm-folder-add {
      width:100%; padding:6px 8px; border-radius:7px;
      border:1px dashed var(--border-color); background:transparent;
      color:var(--text-muted); font-size:10px; cursor:pointer;
      transition:all .15s; text-align:center; margin-top:4px;
    }
    .bm-folder-add:hover { border-color:var(--accent); color:var(--accent); }

    .bm-main { flex:1; overflow-y:auto; padding:8px 10px; }

    .bm-item {
      display:flex; align-items:center; gap:8px;
      padding:8px; border-radius:8px;
      transition:background .15s; cursor:pointer;
      border:1px solid transparent;
    }
    .bm-item:hover { background:var(--bg-input); border-color:var(--border-color); }
    .bm-item-icon { width:24px; height:24px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .bm-item-icon img { width:16px; height:16px; border-radius:3px; }
    .bm-item-info { flex:1; min-width:0; }
    .bm-item-title { font-size:12px; color:var(--text-main); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bm-item-url   { font-size:10px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:1px; }
    .bm-item-actions { display:flex; gap:3px; opacity:0; transition:opacity .15s; flex-shrink:0; }
    .bm-item:hover .bm-item-actions { opacity:1; }
    .bm-action-btn {
      width:22px; height:22px; border-radius:5px; border:none;
      background:var(--bg-elevated); color:var(--text-muted);
      font-size:11px; cursor:pointer; display:flex;
      align-items:center; justify-content:center; transition:all .15s;
    }
    .bm-action-btn:hover { background:var(--accent); color:var(--bg-base); }
    .bm-action-btn.danger:hover { background:var(--danger); color:#fff; }

    .bm-section-label {
      font-size:9px; font-weight:700; text-transform:uppercase;
      letter-spacing:1.2px; color:var(--accent);
      padding:4px 0 6px; margin-bottom:4px;
      border-bottom:1px solid var(--border-color);
    }

    .bm-empty {
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      height:160px; gap:8px; color:var(--text-muted); text-align:center;
    }
    .bm-empty-icon { font-size:32px; opacity:.25; }
    .bm-empty p { font-size:11px; line-height:1.5; }

    /* Toolbar icon butonlar */
    .bm-icon-btn {
      width:24px; height:24px; border-radius:5px; border:none;
      background:var(--bg-input); color:var(--text-muted);
      font-size:13px; cursor:pointer; display:flex;
      align-items:center; justify-content:center; transition:all .15s;
    }
    .bm-icon-btn:hover { color:var(--accent); border-color:var(--accent); }

    /* Edit Modal */
    #bm-edit-modal {
      position:fixed; inset:0; z-index:9999;
    }
    .bm-modal-overlay {
      position:absolute; inset:0;
      background:rgba(0,0,0,.6);
      display:flex; align-items:center; justify-content:center;
    }
    .bm-modal {
      background:var(--bg-surface); border:1px solid var(--border-color);
      border-radius:12px; width:300px; padding:0; overflow:hidden;
      box-shadow:0 16px 48px rgba(0,0,0,.5);
    }
    .bm-modal-header {
      padding:14px 16px; border-bottom:1px solid var(--border-color);
      display:flex; align-items:center; justify-content:space-between;
    }
    .bm-modal-header h3 { font-size:13px; font-weight:600; color:var(--text-main); }
    .bm-modal-close { width:22px; height:22px; border-radius:50%; border:none; background:var(--bg-input); color:var(--text-muted); cursor:pointer; font-size:11px; }
    .bm-modal-close:hover { background:var(--danger); color:#fff; }
    .bm-modal-body { padding:14px 16px; display:flex; flex-direction:column; gap:8px; }
    .bm-modal-body label { font-size:10px; color:var(--text-muted); display:block; margin-bottom:3px; }
    .bm-modal-body input, .bm-modal-body select {
      width:100%; background:var(--bg-input); border:1px solid var(--border-color);
      border-radius:6px; color:var(--text-main); padding:7px 10px;
      font-size:12px; outline:none; box-sizing:border-box;
    }
    .bm-modal-body input:focus, .bm-modal-body select:focus { border-color:var(--accent); }
    .bm-modal-body select option { background:var(--bg-input); }
    .bm-modal-footer {
      padding:10px 16px; border-top:1px solid var(--border-color);
      display:flex; gap:8px; justify-content:flex-end;
    }
    .bm-modal-cancel { padding:7px 14px; border-radius:6px; border:1px solid var(--border-color); background:transparent; color:var(--text-muted); cursor:pointer; font-size:12px; }
    .bm-modal-save { padding:7px 16px; border-radius:6px; border:none; background:var(--accent); color:var(--bg-base); font-size:12px; font-weight:700; cursor:pointer; }

    /* Saved Toast */
    .bm-saved-toast {
      position:fixed; bottom:20px; right:20px; z-index:99999;
      padding:9px 16px; border-radius:8px; font-size:12px; font-weight:600;
      background:var(--success); color:var(--bg-base);
      box-shadow:0 4px 20px rgba(0,0,0,.4);
    }
  `;
  document.head.appendChild(s);
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function bmLoad() {
  try {
    bmFolders = JSON.parse(localStorage.getItem('ilgezdi-bm-folders') || '[]');
    bmItems   = JSON.parse(localStorage.getItem('ilgezdi-bm-items')   || '[]');
    if (bmFolders.length === 0) {
      bmFolders = [
        // Adlar oluşturulurken arayüz dilinde yazılır (kullanıcı verisi; sonradan değişmez).
        { id:'default', name:T('bookmarks.folder.default'), createdAt: Date.now() },
        { id:'work',    name:T('bookmarks.folder.work'),    createdAt: Date.now() },
        { id:'reading', name:T('bookmarks.folder.reading'), createdAt: Date.now() },
      ];
      bmSaveFolders();
    }
  } catch {}
}

function bmSaveFolders() {
  try { localStorage.setItem('ilgezdi-bm-folders', JSON.stringify(bmFolders)); } catch {}
  window.ilgezdiSync?.schedulePush();
  window.dispatchEvent(new CustomEvent('ilgezdi-bookmarks-changed'));
}
function bmSaveItems() {
  try { localStorage.setItem('ilgezdi-bm-items', JSON.stringify(bmItems)); } catch {}
  window.ilgezdiSync?.schedulePush();
  window.dispatchEvent(new CustomEvent('ilgezdi-bookmarks-changed'));
}

// Qrtım senkronizasyonu uzak yer imlerini uyguladığında paneli tazele
window.addEventListener('ilgezdi-sync-applied', () => {
  bmLoad();
  try { bmRenderFolders(); bmRenderPanel(); } catch {}
});

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
// GİZLİLİK: Eskiden google.com/s2/favicons?domain=… adresi üretiliyordu — yani
// yer imleri paneli her çizildiğinde kullanıcının TÜM yer imi alan adları
// Google'a bildiriliyordu. Gizlilik odaklı bir tarayıcıda kabul edilemez.
// Yerel yedek simge kullanılır; ileride favicon'lar gezinme sırasında sayfanın
// kendisinden alınıp yerelde önbelleklenebilir.
function bmGetFavicon(url) { return null; }
function bmGetDomain(url)  { try { return new URL(url).hostname; } catch { return url; } }
function bmGenId()         { return 'bm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

// ─── CRUD ─────────────────────────────────────────────────────────────────────
function bmAddItem(title, url, folderId) {
  // Çift kayıt önle — aynı URL zaten varsa güncelle
  const existing = bmItems.find(i => i.url === url);
  if (existing) {
    existing.title    = title || existing.title;
    existing.folderId = folderId || existing.folderId;
    bmSaveItems();
    return existing;
  }
  const item = { id:bmGenId(), folderId:folderId||'default', title:title||bmGetDomain(url), url, favicon:bmGetFavicon(url), createdAt:Date.now() };
  bmItems.unshift(item);
  bmSaveItems();
  return item;
}

function bmDeleteItem(id)                       { bmItems = bmItems.filter(i => i.id !== id); bmSaveItems(); }
function bmEditItem(id, title, url, folderId)   { const i = bmItems.find(i => i.id === id); if (!i) return; i.title=title; i.url=url; i.folderId=folderId; i.favicon=bmGetFavicon(url); bmSaveItems(); }
function bmAddFolder(name)                      { const f={id:bmGenId(),name,createdAt:Date.now()}; bmFolders.push(f); bmSaveFolders(); return f; }
function bmDeleteFolder(id) {
  if (['default','work','reading'].includes(id)) return;
  bmFolders = bmFolders.filter(f => f.id !== id);
  bmItems.forEach(i => { if (i.folderId === id) i.folderId = 'default'; });
  bmSaveFolders(); bmSaveItems();
}
function bmIsBookmarked(url) { return bmItems.some(i => i.url === url); }

// ─── Yıldız Popup ─────────────────────────────────────────────────────────────
function bmShowQuickPopup() {
  const url = document.getElementById('address-bar')?.value;
  if (!url || url === 'about:blank') return;

  bmLoad();
  const isBookmarked = bmIsBookmarked(url);
  const item         = bmItems.find(i => i.url === url);
  const title        = item?.title || bmGetDomain(url);
  const starBtn      = document.getElementById('btn-bookmark-star');
  const rect         = starBtn?.getBoundingClientRect() || { x:0, y:0 };

  const data = {
    isBookmarked, title, url,
    folderId: item?.folderId || 'default',
    folders:  bmFolders.map(f => ({ id:f.id, name:f.name })),
    itemId:   item?.id || null,
  };

  window.secureBrowser?.bookmarkPopupOpen({ x:rect.x, y:rect.y, data });

  // Önceki listener'ı temizle — çift kayıt burada oluyordu!
  window.secureBrowser?.removeAllListeners?.('bookmark-popup-result');

  window.secureBrowser?.onBookmarkPopupResult?.((result) => {
    if (result.action === 'save') {
      if (isBookmarked && item) {
        bmEditItem(item.id, result.title, url, result.folderId);
      } else {
        bmAddItem(result.title, url, result.folderId);
      }
      bmUpdateStarBtn(true);
      bmShowSavedToast();
      // Panel açıksa anlık güncelle
      if (_bmPanelOpen) { bmRenderFolders(); bmRenderPanel(); }
    } else if (result.action === 'delete') {
      if (item) bmDeleteItem(item.id);
      bmUpdateStarBtn(false);
      if (_bmPanelOpen) { bmRenderFolders(); bmRenderPanel(); }
    }
  });
}

function bmShowSavedToast() {
  const t = document.createElement('div');
  t.className = 'bm-saved-toast';
  t.textContent = T('bookmarks.addedToast');
  (document.getElementById('app') || document.body).appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function bmUpdateStarBtn(isBookmarked) {
  const btn = document.getElementById('btn-bookmark-star');
  if (!btn) return;
  btn.textContent = isBookmarked ? '★' : '☆';
  btn.title = isBookmarked ? T('bookmarks.editStar') : T('bookmarks.addStar');
  btn.style.color = isBookmarked ? 'var(--accent)' : '';
  btn.classList.toggle('bookmarked', isBookmarked);
}

function bmCheckCurrentPage() {
  const url = document.getElementById('address-bar')?.value;
  bmUpdateStarBtn(url ? bmIsBookmarked(url) : false);
}

// ─── Panel Render ─────────────────────────────────────────────────────────────
function bmGetFilteredItems() {
  let items = bmCurrentFolder ? bmItems.filter(i => i.folderId === bmCurrentFolder) : bmItems;
  if (bmSearchQuery) {
    const lang = window.ilgezdiI18n?.locale || 'tr';
    const q = bmSearchQuery.toLocaleLowerCase(lang);
    items = items.filter(i => String(i.title).toLocaleLowerCase(lang).includes(q) || i.url.toLowerCase().includes(q));
  }
  return items;
}

function bmRenderPanel() {
  const container = document.getElementById('bm-list-container');
  if (!container) return;
  const items = bmGetFilteredItems();

  if (items.length === 0) {
    container.innerHTML = `
      <div class="bm-empty">
        <div class="bm-empty-icon">☆</div>
        <p>${bmSearchQuery ? TH('bookmarks.noResults') : TH('bookmarks.emptyFolder')}<br>
        <span style="font-size:10px">${TH('bookmarks.addHint')}</span></p>
      </div>`;
    return;
  }

  // Klasöre göre grupla (tümü görünümünde)
  if (!bmCurrentFolder && !bmSearchQuery) {
    const grouped = {};
    items.forEach(item => {
      const fid = item.folderId || 'default';
      if (!grouped[fid]) grouped[fid] = [];
      grouped[fid].push(item);
    });

    container.innerHTML = Object.entries(grouped).map(([fid, fitems]) => {
      const folder = bmFolders.find(f => f.id === fid);
      if (!fitems.length) return '';
      return `
        <div class="bm-section-label">${window.ilgezdiHtml.esc(folder?.name || T('bookmarks.folder.default'))}</div>
        ${fitems.map(item => bmItemHTML(item)).join('')}
      `;
    }).join('');
  } else {
    container.innerHTML = items.map(item => bmItemHTML(item)).join('');
  }

  // Simge çözülemezse boş kalmasın (satır içi onerror CSP'ye takılıyordu)
  container.querySelectorAll('img.bm-fav').forEach(img => {
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.style.cssText = 'display:grid;place-items:center;width:18px;height:18px;border-radius:4px;background:var(--bg-input);color:var(--text-muted);font-size:10px;font-weight:700';
      span.textContent = '•';
      img.replaceWith(span);
    }, { once: true });
  });
  // Önbellekteki site simgeleri (ziyaret edilen siteler) — gelince yeniden çizilir.
  bmLoadFavicons();

  // Satır tıklaması bmInitPanelEvents'te listeye bir kez bağlanır (bmOpenUrl).

  // Aksiyonlar
  container.querySelectorAll('.bm-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.action === 'delete') {
        bmDeleteItem(id);
        bmRenderPanel();
        bmRenderFolders();
      } else if (btn.dataset.action === 'edit') {
        bmShowEditModal(id);
      }
    });
  });
}

// ─── Site simgeleri ───────────────────────────────────────────────────────────
// Yer iminin kendi simgesi (tarayıcıdan içe aktarılırken gelir) ya da ana süreçteki
// önbellek (ziyaret edilen sitelerin simgeleri, favicon-cache.js). Arayüz hiçbir
// siteye doğrudan simge isteği atmaz; yalnızca data:image adresleri gösterilir.
const bmFavicons = new Map();   // alan adı → data:image URL
let bmFaviconsAt = 0;
function bmHost(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function bmFaviconFor(item) {
  const own = String((item && item.favicon) || '');
  if (/^data:image\//.test(own)) return own;
  return bmFavicons.get(bmHost(item && item.url)) || '';
}
// Önbellekteki simgeleri toplu çeker (en fazla dakikada bir); yeni simge gelirse
// çubuk ve açık panel yeniden çizilir.
async function bmLoadFavicons() {
  if (Date.now() - bmFaviconsAt < 60000) return;
  bmFaviconsAt = Date.now();
  try {
    const map = await window.secureBrowser?.favicons?.lookup?.(bmItems.map((i) => i.url));
    let added = 0;
    for (const [host, dataUrl] of Object.entries(map || {})) {
      if (/^data:image\//.test(dataUrl) && bmFavicons.get(host) !== dataUrl) { bmFavicons.set(host, dataUrl); added++; }
    }
    if (added) {
      bmRenderBar();
      if (_bmPanelOpen) { try { bmRenderPanel(); } catch {} }
    }
  } catch {}
}

function bmItemHTML(item) {
  // GÜVENLİK (denetim Y-04): başlık, URL ve favicon dış kaynaklı — içe aktarılan
  // yer imi dosyası ya da sayfanın kendi <title>'ı. Hepsi kaçışlanır. Simge yalnızca
  // data:image olabilir; eski kayıtlardaki uzak simge adresleri (Google s2 dahil)
  // yüklenmez — arayüzden siteye istek gitmesin.
  const H = window.ilgezdiHtml;
  const fav = H.safeUrl(bmFaviconFor(item), { allowData: true });
  const domain = bmGetDomain(item.url).replace(/^www\./, '');
  const icon = fav
    ? `<img class="bm-fav" src="${H.esc(fav)}" alt="">`
    : `<span aria-hidden="true" style="display:grid;place-items:center;width:18px;height:18px;border-radius:4px;color:#fff;font-size:10px;font-weight:700;background:${bmChipColor(domain)}">${H.esc((domain[0] || '•').toLocaleUpperCase(window.ilgezdiI18n?.locale || 'tr'))}</span>`;
  return `
    <div class="bm-item" data-id="${H.esc(item.id)}" data-url="${H.esc(item.url)}" tabindex="0" role="link" title="${H.esc(item.title || domain)}">
      <div class="bm-item-icon">
        ${icon}
      </div>
      <div class="bm-item-info" data-url="${H.esc(item.url)}">
        <div class="bm-item-title">${H.esc(item.title)}</div>
        <div class="bm-item-url">${H.esc(bmGetDomain(item.url))}</div>
      </div>
      <div class="bm-item-actions">
        <button class="bm-action-btn" data-action="edit" data-id="${H.esc(item.id)}" title="${TH('bookmarks.edit')}" aria-label="${TH('bookmarks.edit')}">✎</button>
        <button class="bm-action-btn danger" data-action="delete" data-id="${H.esc(item.id)}" title="${TH('bookmarks.delete')}" aria-label="${TH('bookmarks.delete')}">✕</button>
      </div>
    </div>`;
}

function bmRenderFolders() {
  const list = document.getElementById('bm-folder-list');
  if (!list) return;

  list.innerHTML = `
    <button class="bm-folder-item ${!bmCurrentFolder ? 'active' : ''}" data-id="">
      <span class="bm-folder-name">${TH('bookmarks.all')}</span>
      <span class="bm-folder-count">${bmItems.length}</span>
    </button>
    ${bmFolders.map(f => {
      const count = bmItems.filter(i => i.folderId === f.id).length;
      // Boş hazır klasörler (Genel, İş, Okuma) listede gösterilmez: içe aktarılmış yer
      // imleri olan kullanıcı en üstteki bu klasörlere tıklayıp listeyi boş sanıyordu.
      // Seçiliyse ya da içine yer imi eklenince görünür.
      if (!count && ['default','work','reading'].includes(f.id) && bmCurrentFolder !== f.id) return '';
      const fname = window.ilgezdiHtml.esc(f.name);
      return `
        <button class="bm-folder-item ${bmCurrentFolder === f.id ? 'active' : ''}" data-id="${window.ilgezdiHtml.esc(f.id)}" title="${fname} (${count})">
          <span class="bm-folder-name">${fname}</span>
          <span class="bm-folder-count">${count}</span>
          ${!['default','work','reading'].includes(f.id) ? `<span class="bm-folder-del" data-fid="${f.id}">✕</span>` : ''}
        </button>`;
    }).join('')}
    <button class="bm-folder-add" id="btn-bm-add-folder">${TH('bookmarks.addFolder')}</button>
  `;

  list.querySelectorAll('.bm-folder-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('bm-folder-del')) return;
      bmCurrentFolder = btn.dataset.id || null;
      bmRenderFolders(); bmRenderPanel();
    });
  });

  list.querySelectorAll('.bm-folder-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(T('bookmarks.confirmDeleteFolder'))) {
        bmDeleteFolder(btn.dataset.fid);
        if (bmCurrentFolder === btn.dataset.fid) bmCurrentFolder = null;
        bmRenderFolders(); bmRenderPanel();
      }
    });
  });

  document.getElementById('btn-bm-add-folder')?.addEventListener('click', () => {
    const name = prompt(T('bookmarks.folderNamePrompt'));
    if (name?.trim()) { bmAddFolder(name.trim()); bmRenderFolders(); }
  });
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function bmShowEditModal(id) {
  const item = bmItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('bm-edit-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'bm-edit-modal';
  modal.innerHTML = `
    <div class="bm-modal-overlay">
      <div class="bm-modal">
        <div class="bm-modal-header">
          <h3>${TH('bookmarks.editTitle')}</h3>
          <button class="bm-modal-close" aria-label="${TH('common.close')}">✕</button>
        </div>
        <div class="bm-modal-body">
          <div><label>${TH('bookmarks.fieldTitle')}</label><input type="text" id="bm-edit-title" value="${window.ilgezdiHtml.esc(item.title)}" /></div>
          <div><label>${TH('bookmarks.fieldUrl')}</label><input type="text" id="bm-edit-url" value="${window.ilgezdiHtml.esc(item.url)}" /></div>
          <div><label>${TH('bookmarks.fieldFolder')}</label>
            <select id="bm-edit-folder">
              ${bmFolders.map(f => `<option value="${f.id}" ${f.id===item.folderId?'selected':''}>${window.ilgezdiHtml.esc(f.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="bm-modal-footer">
          <button class="bm-modal-cancel">${TH('bookmarks.cancel')}</button>
          <button class="bm-modal-save">${TH('bookmarks.save')}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('.bm-modal-close')?.addEventListener('click',  () => modal.remove());
  modal.querySelector('.bm-modal-cancel')?.addEventListener('click', () => modal.remove());
  modal.querySelector('.bm-modal-overlay')?.addEventListener('click', (e) => { if (e.target === modal.querySelector('.bm-modal-overlay')) modal.remove(); });
  modal.querySelector('.bm-modal-save')?.addEventListener('click', () => {
    const title    = document.getElementById('bm-edit-title')?.value.trim();
    const url      = document.getElementById('bm-edit-url')?.value.trim();
    const folderId = document.getElementById('bm-edit-folder')?.value;
    if (!title || !url) return;
    bmEditItem(id, title, url, folderId);
    modal.remove();
    bmRenderPanel(); bmRenderFolders();
  });
}

// ─── Import / Export ──────────────────────────────────────────────────────────
function bmExportHTML() {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p>',
  ];
  bmFolders.forEach(folder => {
    const fi = bmItems.filter(i => i.folderId === folder.id);
    if (!fi.length) return;
    lines.push(`  <DT><H3>${window.ilgezdiHtml.esc(folder.name)}</H3><DL><p>`);
    // Dışa aktarılan dosya başka bir tarayıcıda açılır — kaçışsız başlık orada
    // betik çalıştırabilir. Yalnızca http(s) bağlantılar yazılır.
    fi.forEach(item => {
      const href = window.ilgezdiHtml.safeUrl(item.url);
      if (href) lines.push(`    <DT><A HREF="${window.ilgezdiHtml.esc(href)}">${window.ilgezdiHtml.esc(item.title)}</A>`);
    });
    lines.push('  </DL><p>');
  });
  lines.push('</DL><p>');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([lines.join('\n')], { type:'text/html' })),
    download: 'ilgezdi-bookmarks.html'
  });
  a.click();
}

function bmImportHTML(html) {
  const doc   = new DOMParser().parseFromString(html, 'text/html');
  const links = doc.querySelectorAll('a[href]');
  let n = 0;
  links.forEach(a => {
    const url = a.getAttribute('href');
    if (!url || !url.startsWith('http')) return;
    if (bmItems.some(i => i.url === url)) return;
    bmAddItem(a.textContent.trim() || bmGetDomain(url), url, 'default');
    n++;
  });
  bmRenderPanel(); bmRenderFolders();
  return n;
}

// ─── İçe Aktarma (diğer tarayıcılardan) ───────────────────────────────────────
// Gelen [{title,url,folder}] listesini İlgezdi yer imlerine birleştirir:
// kaynak klasör adlarını korur, URL bazında yinelenenleri atlar, senkronlar.
function bmMergeImported(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  const existing    = new Set(bmItems.map(i => i.url));
  const folderByName = new Map(bmFolders.map(f => [f.name, f.id]));
  let added = 0;
  let iconsFilled = 0;
  const byUrl = new Map(bmItems.map(i => [i.url, i]));
  // Simge yalnızca doğrulanmış data:image olarak kabul edilir (ana süreç tarayıcının
  // yerel simge önbelleğinden okur; uzak adres saklanmaz).
  const validIcon = (s) => typeof s === 'string' && /^data:image\/(png|x-icon|gif|jpeg|webp|svg\+xml);base64,/.test(s) ? s : null;
  items.forEach(it => {
    if (!it || !it.url || !/^https?:\/\//i.test(it.url)) return;
    if (existing.has(it.url)) {
      // Yeniden içe aktarmada simgesi eksik yer imlerini tamamla
      const cur = byUrl.get(it.url);
      const icon = validIcon(it.favicon);
      if (cur && icon && !validIcon(cur.favicon)) { cur.favicon = icon; iconsFilled++; }
      return;
    }
    const fname = (it.folder || T('bookmarks.folder.imported')).trim() || T('bookmarks.folder.imported');
    let fid = folderByName.get(fname);
    if (!fid) {
      const f = { id: bmGenId(), name: fname, createdAt: Date.now() };
      bmFolders.push(f); folderByName.set(fname, f.id); fid = f.id;
    }
    bmItems.push({
      id: bmGenId(), folderId: fid,
      title: it.title || bmGetDomain(it.url), url: it.url,
      favicon: validIcon(it.favicon), createdAt: Date.now(),
    });
    existing.add(it.url);
    added++;
  });
  if (added || iconsFilled) { bmSaveFolders(); bmSaveItems(); bmRenderFolders(); bmRenderPanel(); }
  return added;
}

// Mevcut yer imlerine simge: kurulu tarayıcıların yerel simge önbelleğinden (ağ
// isteği yok). Daha önce içe aktarılmış ama simgesiz gelmiş yer imleri için.
async function bmImportFavicons() {
  const missing = bmItems.filter((i) => !/^data:image\//.test(String(i.favicon || ''))).map((i) => i.url);
  if (!missing.length) { alert(T('bookmarks.iconsAll')); return; }
  try {
    const res = await window.secureBrowser?.bookmarks?.importFavicons?.(missing);
    const map = (res && res.favicons) || {};
    let filled = 0;
    for (const item of bmItems) {
      const icon = map[item.url];
      if (typeof icon === 'string' && /^data:image\/(png|x-icon|gif|jpeg|webp|svg\+xml);base64,/.test(icon) && !/^data:image\//.test(String(item.favicon || ''))) {
        item.favicon = icon;
        filled++;
      }
    }
    if (filled) { bmSaveItems(); bmRenderPanel(); }
    alert(filled ? T('bookmarks.iconsAdded', { count: filled }) : T('bookmarks.iconsNone'));
  } catch (e) {
    alert(T('bookmarks.iconsFailed', { error: e?.message || e }));
  }
}

async function bmRunImport(source) {
  if (source === '__icons__') return bmImportFavicons();
  try {
    const res = source === '__file__'
      ? await window.secureBrowser?.bookmarks?.importFile()
      : await window.secureBrowser?.bookmarks?.importBrowser(source);
    const items = res?.items || [];
    if (!items.length) { alert(T('bookmarks.importNone')); return; }
    const added = bmMergeImported(items);
    alert(added > 0 ? T('bookmarks.imported', { count: added }) : T('bookmarks.importNoNew'));
  } catch (e) {
    alert(T('bookmarks.importFailed', { error: e?.message || e }));
  }
}

async function bmShowImportMenu() {
  document.getElementById('bm-import-menu')?.remove();
  let detected = [];
  try { detected = await window.secureBrowser?.bookmarks?.detect() || []; } catch {}

  const menu = document.createElement('div');
  menu.id = 'bm-import-menu';
  menu.className = 'bm-import-menu';
  const rows = [];
  if (detected.length) {
    rows.push(`<div class="bm-im-head">${TH('bookmarks.fromBrowsers')}</div>`);
    detected.forEach(b => rows.push(
      `<button class="bm-im-item" data-src="${b.id}"><span>${window.ilgezdiHtml.esc(b.name)}</span><span class="bm-im-count">${Number(b.count) || 0}</span></button>`
    ));
  } else {
    rows.push(`<div class="bm-im-head">${TH('bookmarks.noBrowsers')}</div>`);
  }
  rows.push(`<div class="bm-im-sep"></div>`);
  rows.push(`<button class="bm-im-item" data-src="__file__"><span>${TH('bookmarks.fromFile')}</span></button>`);
  if (detected.length) {
    rows.push(`<div class="bm-im-sep"></div>`);
    rows.push(`<button class="bm-im-item" data-src="__icons__" title="${TH('bookmarks.iconsTitle')}"><span>${TH('bookmarks.iconsFromBrowsers')}</span></button>`);
  }
  menu.innerHTML = rows.join('');

  const btn = document.getElementById('btn-bm-import');
  const panel = document.getElementById('panel-bookmarks');
  (panel || document.body).appendChild(menu);
  if (btn) {
    const r = btn.getBoundingClientRect();
    const pr = (panel || document.body).getBoundingClientRect();
    menu.style.top  = (r.bottom - pr.top + 4) + 'px';
    menu.style.right = (pr.right - r.right) + 'px';
  }

  menu.querySelectorAll('.bm-im-item').forEach(el => {
    el.addEventListener('click', () => {
      const src = el.getAttribute('data-src');
      menu.remove();
      bmRunImport(src);
    });
  });
  // Dışına tıklayınca kapat
  setTimeout(() => {
    const close = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== btn) { menu.remove(); document.removeEventListener('click', close, true); }
    };
    document.addEventListener('click', close, true);
  }, 0);
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────
function bmInjectPanelHTML() {
  const panel = document.getElementById('panel-bookmarks');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-header">
      <h2>${TH('bookmarks.title')}</h2>
      <div style="display:flex;gap:5px;align-items:center">
        <button class="bm-icon-btn" id="btn-bm-export" title="${TH('bookmarks.export')}" aria-label="${TH('bookmarks.export')}">⬆</button>
        <button class="bm-icon-btn" id="btn-bm-import" title="${TH('bookmarks.import')}" aria-label="${TH('bookmarks.import')}">⬇</button>
        <button class="panel-close" data-panel="bookmarks" aria-label="${TH('common.closePanel')}">✕</button>
      </div>
    </div>
    <div class="bm-search-bar">
      <input type="text" class="bm-search-input" id="bm-search" placeholder="${TH('bookmarks.search')}" value="${window.ilgezdiHtml.esc(bmSearchQuery)}" />
    </div>
    <div class="bm-layout">
      <div class="bm-sidebar"><div id="bm-folder-list"></div></div>
      <div class="bm-main"><div id="bm-list-container"></div></div>
    </div>
  `;
}

// ─── Panel Events ─────────────────────────────────────────────────────────────
function bmInitPanelEvents() {
  document.getElementById('bm-search')?.addEventListener('input', (e) => {
    bmSearchQuery = e.target.value.trim();
    bmRenderPanel();
  });
  document.getElementById('btn-bm-export')?.addEventListener('click', bmExportHTML);
  document.getElementById('btn-bm-import')?.addEventListener('click', bmShowImportMenu);
  document.querySelector('[data-panel="bookmarks"].panel-close')?.addEventListener('click', () => {
    window.ilgezdiCloseAllPanels?.();
  });

  // Satırın tamamı tıklanır (eskiden yalnızca başlık alanı): tık ya da Enter → bu sekmede
  // açılır ve panel kapanır ki sayfa görünsün; orta tık ve Ctrl+tık → arka planda yeni
  // sekme, Ctrl+Shift+tık ya da Shift+tık → önde yeni sekme; panel açık kalır. Liste her
  // açılışta yeniden kurulduğu için dinleyiciler birikmez. Liste kaydırılabilir: orta tuş
  // otomatik kaydırmayı başlatmasın.
  const list = document.getElementById('bm-list-container');
  const rowUrl = (e) => {
    if (e.target.closest?.('.bm-item-actions')) return '';
    const row = e.target.closest?.('.bm-item');
    return row ? window.ilgezdiHtml.safeUrl(row.dataset.url) : '';
  };
  list?.addEventListener('click', (e) => {
    const url = rowUrl(e);
    if (url) bmOpenUrl(url, bmOpenMode(e, false));
  });
  list?.addEventListener('auxclick', (e) => {
    const url = e.button === 1 ? rowUrl(e) : '';
    if (url) { e.preventDefault(); bmOpenUrl(url, bmOpenMode(e, true)); }
  });
  list?.addEventListener('mousedown', (e) => { if (e.button === 1 && rowUrl(e)) e.preventDefault(); });
  list?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList?.contains('bm-item')) return;
    const url = window.ilgezdiHtml.safeUrl(e.target.dataset.url);
    if (url) { e.preventDefault(); bmOpenUrl(url, bmOpenMode(e, false)); }
  });
}

// 'current' bu sekmede · 'background' arka planda yeni sekme · 'foreground' önde yeni sekme
function bmOpenMode(e, middle) {
  if (middle || e.ctrlKey || e.metaKey) return e.shiftKey ? 'foreground' : 'background';
  return e.shiftKey ? 'foreground' : 'current';
}

function bmOpenUrl(url, mode) {
  const sb = window.secureBrowser;
  if (mode === 'background' || mode === 'foreground') { sb?.newTab?.(url, { background: mode === 'background' }); return; }
  window.ilgezdiCloseAllPanels?.();
  _bmPanelOpen = false;
  sb?.navigate?.(url);
}

// ─── Panel Aç ─────────────────────────────────────────────────────────────────
function bmOpenPanel() {
  bmLoad();
  bmInjectPanelHTML();
  bmInitPanelEvents();
  bmRenderFolders();
  bmRenderPanel();
  bmCheckCurrentPage();
  _bmPanelOpen = true;
}

// ─── Sık kullanılanlar çubuğu ─────────────────────────────────────────────────
// Adres çubuğunun altındaki şerit. index.html'de vardı ama hiçbir kod doldurmuyordu
// (kullanıcı bildirdi: "sık kullanılanlar bölümü gelmiyor"). Tarayıcılardan içe
// aktarılan "Yer İmi Çubuğu" klasörü (bookmark-import.js bu adı verir) ya da
// "Sık Kullanılanlar Çubuğu" adlı klasör gösterilir; yoksa "⭐ Genel".
// Tarayıcılar farklı adlar veriyor: Brave/Chrome "Yer işaretleri çubuğu", Edge "Sık
// kullanılanlar çubuğu", Firefox "Yer imleri araç çubuğu", İngilizce "Bookmarks bar".
// Kullanıcının Brave'den aktardığı çubuk ilk sürümde tanınmamıştı (tekil ad aranıyordu).
// Diğer dillerdeki tarayıcıların çubuk klasörü adları (içe aktarılan klasör o dilde gelir).
const BM_BAR_FOLDER_EN = ['bookmarks bar', 'favorites bar', 'favourites bar', 'bookmarks toolbar',
  'lesezeichenleiste', 'favoritenleiste', 'lesezeichen-symbolleiste', 'barre de favoris', 'barre des favoris', 'barre personnelle'];

function bmIsBarFolderName(name) {
  const n = String(name || '').replace(/^[^\p{L}]+/u, '').trim().toLocaleLowerCase('tr');
  return /(^|\s)çubuğu$/.test(n) || BM_BAR_FOLDER_EN.includes(n);
}

function bmBarFolderId() {
  const bar = bmFolders.find((f) => bmIsBarFolderName(f.name));
  return bar ? bar.id : 'default';
}

// Alan adından sabit bir renk: aynı site her açılışta aynı renkte (dış favicon yok).
function bmChipColor(domain) {
  let h = 0;
  for (const ch of String(domain)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${h} 45% 40%)`;
}

function bmRenderBar() {
  const box = document.getElementById('bookmarks-bar-items');
  if (!box) return;
  const H = window.ilgezdiHtml;
  const folderId = bmBarFolderId();
  const items = bmItems.filter((i) => (i.folderId || 'default') === folderId && H.safeUrl(i.url));
  box.replaceChildren();
  if (!items.length) {
    const hint = document.createElement('span');
    hint.className = 'bookmark-bar-hint';
    hint.textContent = T('bookmarks.barEmpty');
    box.appendChild(hint);
  }
  for (const item of items) {
    const domain = bmGetDomain(item.url).replace(/^www\./, '');
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bookmark-chip';
    chip.dataset.url = item.url;
    chip.title = (item.title || domain) + '\n' + item.url;
    const fav = document.createElement('span');
    fav.className = 'chip-favicon';
    fav.setAttribute('aria-hidden', 'true');
    const letter = () => { fav.textContent = (domain[0] || '•').toLocaleUpperCase(window.ilgezdiI18n?.locale || 'tr'); fav.style.background = bmChipColor(domain); };
    const iconSrc = bmFaviconFor(item);
    if (iconSrc) {
      const img = document.createElement('img');
      img.src = iconSrc;
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => { img.remove(); fav.classList.remove('has-img'); letter(); }, { once: true });
      fav.classList.add('has-img');
      fav.appendChild(img);
    } else {
      letter();
    }
    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = item.title || domain;
    chip.append(fav, label);
    box.appendChild(chip);
  }
  bmLoadFavicons();
  // Çubukta yalnızca çubuk klasörü var; diğer klasörler (içe aktarılan alt klasörler
  // dahil) Yer İmleri panelinde. Onu açan düğme bağlantı kutusunun DIŞINDA, çubuğun
  // sağ ucunda: bağlantılar sığmadığında da görünür kalır (ilk sürümde 28 bağlantıda
  // ekranın dışına taşıyordu). Bağlantılardan sonra geldiği için Tab sırası da sonda.
  const barEl = document.getElementById('bookmarks-bar');
  let all = document.getElementById('bookmarks-bar-all');
  if (!all && barEl) {
    all = document.createElement('button');
    all.type = 'button';
    all.id = 'bookmarks-bar-all';
    all.className = 'bookmark-chip bookmark-chip-all';
    all.addEventListener('click', () => document.getElementById('btn-bookmarks')?.click());
    // Yalnızca simge (kullanıcı: yazılı düğme çubukta sırıtıyordu); sayı ipucunda.
    // SVG DOM düğümleriyle kurulur (HTML metni ayrıştırılmaz).
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
    for (const d of ['M4 6.5A1.5 1.5 0 0 1 5.5 5H9l2 2h7.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z', 'M8.5 12.5h7M8.5 15.5h4.5']) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    all.appendChild(svg);
    barEl.appendChild(all);
  }
  if (all) {
    all.classList.toggle('hidden', !(bmItems.length > items.length));
    all.title = T('bookmarks.allTitle', { count: bmItems.length });
    all.setAttribute('aria-label', all.title);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function bmInit() {
  bmLoad();
  bmInjectStyles();
  const sb = window.secureBrowser;

  // Sık kullanılanlar çubuğu: tık → bu sekmede, Ctrl/Shift+tık ya da orta tık → yeni sekme.
  const bar = document.getElementById('bookmarks-bar-items');
  const chipUrl = (e) => {
    const chip = e.target.closest?.('.bookmark-chip');
    return chip ? window.ilgezdiHtml.safeUrl(chip.dataset.url) : '';
  };
  bar?.addEventListener('click', (e) => {
    if (e.target.closest?.('.bookmark-chip-all')) { document.getElementById('btn-bookmarks')?.click(); return; }
    const url = chipUrl(e);
    if (!url) return;
    // Ctrl+tık arka planda, Ctrl+Shift+tık ya da Shift+tık önde yeni sekme (Chrome gibi).
    if (e.ctrlKey || e.metaKey) sb?.newTab?.(url, { background: !e.shiftKey });
    else if (e.shiftKey) sb?.newTab?.(url);
    else sb?.navigate?.(url);
  });
  bar?.addEventListener('auxclick', (e) => {
    const url = e.button === 1 ? chipUrl(e) : '';
    if (url) { e.preventDefault(); sb?.newTab?.(url, { background: true }); }
  });
  // Yer imi değişince (panel, ☆ açılır penceresi, senkron, başka pencere) çubuk yenilenir.
  window.addEventListener('ilgezdi-bookmarks-changed', bmRenderBar);
  // Senkron yer imlerini localStorage'a yazar; bellekteki liste de yenilenmeli (eskiden
  // çubuk eski bellekten yeniden çiziliyor, açık panel hiç yenilenmiyordu).
  window.addEventListener('ilgezdi-sync-applied', () => {
    bmLoad();
    bmRenderBar();
    if (_bmPanelOpen) { bmRenderFolders(); bmRenderPanel(); }
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'ilgezdi-bm-items' || e.key === 'ilgezdi-bm-folders') { bmLoad(); bmRenderBar(); }
  });
  bmRenderBar();

  sb?.onActiveUrl?.((url) => setTimeout(() => bmCheckCurrentPage(), 100));

  // Yıldız butonu
  document.addEventListener('click', (e) => {
    if (e.target?.id === 'btn-bookmark-star' || e.target?.closest('#btn-bookmark-star')) {
      bmShowQuickPopup();
    }
  });

  // Panel butonu
  document.getElementById('btn-bookmarks')?.addEventListener('click', () => {
    const panel = document.getElementById('panel-bookmarks');
    if (!panel) return;
    if (panel.classList.contains('visible')) {
      window.ilgezdiCloseAllPanels?.();
      _bmPanelOpen = false;
    } else {
      window.ilgezdiCloseAllPanels?.();
      panel.classList.remove('hidden');
      requestAnimationFrame(() => panel.classList.add('visible'));
      document.getElementById('btn-bookmarks')?.classList.add('active');
      sb?.panelOpened(true);
      bmOpenPanel();
    }
  });

  console.log('[İlgezdi] Faz 5 Bookmarks hazır');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bmInit);
} else {
  bmInit();
}