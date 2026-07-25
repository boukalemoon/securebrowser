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
    #panel-bookmarks { width:360px; position:relative; }

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
      width:110px; flex-shrink:0;
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
        { id:'default', name:'⭐ Genel',        createdAt: Date.now() },
        { id:'work',    name:'💼 İş',           createdAt: Date.now() },
        { id:'reading', name:'📚 Okuma',        createdAt: Date.now() },
      ];
      bmSaveFolders();
    }
  } catch {}
}

function bmSaveFolders() {
  try { localStorage.setItem('ilgezdi-bm-folders', JSON.stringify(bmFolders)); } catch {}
  window.ilgezdiSync?.schedulePush();
}
function bmSaveItems() {
  try { localStorage.setItem('ilgezdi-bm-items', JSON.stringify(bmItems)); } catch {}
  window.ilgezdiSync?.schedulePush();
}

// Qrtım senkronizasyonu uzak yer imlerini uyguladığında paneli tazele
window.addEventListener('ilgezdi-sync-applied', () => {
  bmLoad();
  try { bmRenderFolders(); bmRenderPanel(); } catch {}
});

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
function bmGetFavicon(url) { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`; } catch { return null; } }
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
  t.textContent = '★ Sık kullanılanlara eklendi';
  (document.getElementById('app') || document.body).appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function bmUpdateStarBtn(isBookmarked) {
  const btn = document.getElementById('btn-bookmark-star');
  if (!btn) return;
  btn.textContent = isBookmarked ? '★' : '☆';
  btn.title = isBookmarked ? 'Sık kullanılanları düzenle' : 'Sık kullanılanlara ekle';
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
    const q = bmSearchQuery.toLowerCase();
    items = items.filter(i => i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q));
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
        <p>${bmSearchQuery ? 'Sonuç bulunamadı' : 'Bu klasörde yer imi yok'}<br>
        <span style="font-size:10px">Adres çubuğundaki ☆ ile ekleyin</span></p>
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
        <div class="bm-section-label">${folder?.name || '⭐ Genel'}</div>
        ${fitems.map(item => bmItemHTML(item)).join('')}
      `;
    }).join('');
  } else {
    container.innerHTML = items.map(item => bmItemHTML(item)).join('');
  }

  // Navigasyon click
  container.querySelectorAll('.bm-item-info').forEach(el => {
    el.addEventListener('click', () => window.secureBrowser?.navigate(el.dataset.url));
  });

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

function bmItemHTML(item) {
  return `
    <div class="bm-item" data-id="${item.id}">
      <div class="bm-item-icon">
        ${item.favicon
          ? `<img src="${item.favicon}" onerror="this.outerHTML='<span style=\\"font-size:14px\\">🌐</span>'">`
          : '<span style="font-size:14px">🌐</span>'}
      </div>
      <div class="bm-item-info" data-url="${item.url}">
        <div class="bm-item-title">${item.title}</div>
        <div class="bm-item-url">${bmGetDomain(item.url)}</div>
      </div>
      <div class="bm-item-actions">
        <button class="bm-action-btn" data-action="edit" data-id="${item.id}" title="Düzenle">✎</button>
        <button class="bm-action-btn danger" data-action="delete" data-id="${item.id}" title="Sil">✕</button>
      </div>
    </div>`;
}

function bmRenderFolders() {
  const list = document.getElementById('bm-folder-list');
  if (!list) return;

  list.innerHTML = `
    <button class="bm-folder-item ${!bmCurrentFolder ? 'active' : ''}" data-id="">
      <span class="bm-folder-name">📚 Tümü</span>
      <span class="bm-folder-count">${bmItems.length}</span>
    </button>
    ${bmFolders.map(f => {
      const count = bmItems.filter(i => i.folderId === f.id).length;
      return `
        <button class="bm-folder-item ${bmCurrentFolder === f.id ? 'active' : ''}" data-id="${f.id}">
          <span class="bm-folder-name">${f.name}</span>
          <span class="bm-folder-count">${count}</span>
          ${!['default','work','reading'].includes(f.id) ? `<span class="bm-folder-del" data-fid="${f.id}">✕</span>` : ''}
        </button>`;
    }).join('')}
    <button class="bm-folder-add" id="btn-bm-add-folder">+ Klasör</button>
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
      if (confirm('Klasörü sil? Yer imleri Genel\'e taşınır.')) {
        bmDeleteFolder(btn.dataset.fid);
        if (bmCurrentFolder === btn.dataset.fid) bmCurrentFolder = null;
        bmRenderFolders(); bmRenderPanel();
      }
    });
  });

  document.getElementById('btn-bm-add-folder')?.addEventListener('click', () => {
    const name = prompt('Klasör adı:');
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
          <h3>✎ Yer İmini Düzenle</h3>
          <button class="bm-modal-close">✕</button>
        </div>
        <div class="bm-modal-body">
          <div><label>Başlık</label><input type="text" id="bm-edit-title" value="${item.title.replace(/"/g,'&quot;')}" /></div>
          <div><label>URL</label><input type="text" id="bm-edit-url" value="${item.url.replace(/"/g,'&quot;')}" /></div>
          <div><label>Klasör</label>
            <select id="bm-edit-folder">
              ${bmFolders.map(f => `<option value="${f.id}" ${f.id===item.folderId?'selected':''}>${f.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="bm-modal-footer">
          <button class="bm-modal-cancel">İptal</button>
          <button class="bm-modal-save">💾 Kaydet</button>
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
    lines.push(`  <DT><H3>${folder.name}</H3><DL><p>`);
    fi.forEach(item => lines.push(`    <DT><A HREF="${item.url}">${item.title}</A>`));
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
  items.forEach(it => {
    if (!it || !it.url || !/^https?:\/\//i.test(it.url) || existing.has(it.url)) return;
    const fname = (it.folder || 'İçe Aktarılan').trim() || 'İçe Aktarılan';
    let fid = folderByName.get(fname);
    if (!fid) {
      const f = { id: bmGenId(), name: fname, createdAt: Date.now() };
      bmFolders.push(f); folderByName.set(fname, f.id); fid = f.id;
    }
    bmItems.push({
      id: bmGenId(), folderId: fid,
      title: it.title || bmGetDomain(it.url), url: it.url,
      favicon: bmGetFavicon(it.url), createdAt: Date.now(),
    });
    existing.add(it.url);
    added++;
  });
  if (added) { bmSaveFolders(); bmSaveItems(); bmRenderFolders(); bmRenderPanel(); }
  return added;
}

async function bmRunImport(source) {
  try {
    const res = source === '__file__'
      ? await window.secureBrowser?.bookmarks?.importFile()
      : await window.secureBrowser?.bookmarks?.importBrowser(source);
    const items = res?.items || [];
    if (!items.length) { alert('İçe aktarılacak yer imi bulunamadı.'); return; }
    const added = bmMergeImported(items);
    alert(added > 0
      ? `${added} yer imi içe aktarıldı.`
      : 'Tüm yer imleri zaten mevcuttu (yeni ekleme olmadı).');
  } catch (e) {
    alert('İçe aktarma başarısız: ' + (e?.message || e));
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
    rows.push(`<div class="bm-im-head">Kurulu tarayıcılardan</div>`);
    detected.forEach(b => rows.push(
      `<button class="bm-im-item" data-src="${b.id}"><span>${b.name}</span><span class="bm-im-count">${b.count}</span></button>`
    ));
  } else {
    rows.push(`<div class="bm-im-head">Kurulu tarayıcı bulunamadı</div>`);
  }
  rows.push(`<div class="bm-im-sep"></div>`);
  rows.push(`<button class="bm-im-item" data-src="__file__"><span>📄 HTML dosyasından…</span></button>`);
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
      <h2>★ Yer İmleri</h2>
      <div style="display:flex;gap:5px;align-items:center">
        <button class="bm-icon-btn" id="btn-bm-export" title="Dışa Aktar">⬆</button>
        <button class="bm-icon-btn" id="btn-bm-import" title="Diğer tarayıcılardan içe aktar">⬇</button>
        <button class="panel-close" data-panel="bookmarks">✕</button>
      </div>
    </div>
    <div class="bm-search-bar">
      <input type="text" class="bm-search-input" id="bm-search" placeholder="🔍 Yer imi ara..." value="${bmSearchQuery}" />
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

// ─── Init ─────────────────────────────────────────────────────────────────────
function bmInit() {
  bmLoad();
  bmInjectStyles();
  const sb = window.secureBrowser;

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