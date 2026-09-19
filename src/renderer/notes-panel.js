/**
 * İlgezdi — Not Defteri paneli (bitig: Göktürkçede yazıt, kitap).
 *
 * Gezinirken not almak için: ayrı kayıtlar, arama, yazarken kendiliğinden kaydetme,
 * notu açık sayfaya bağlama, sağ tık › Nota ekle ile kaynağıyla alıntı, Markdown dışa
 * aktarma, silmeyi geri alma. Notlar ana süreçte şifreli durur (src/main/notes.js); bu
 * dosya yalnızca arayüzdür. Kullanıcı metni hep textContent ya da value ile yazılır.
 *
 * Arayüz betikleri aynı genel alanı paylaşır: buradaki her ad nb ile başlar.
 */

'use strict';

function nbInjectStyles() {
  if (document.getElementById('ilgezdi-notes-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-notes-style';
  s.textContent = `
    #panel-notes { --nb-glow: color-mix(in srgb, var(--gold) 40%, transparent); --nb-rule: color-mix(in srgb, var(--copper) 55%, transparent); }
    .nb-head { position:relative; flex-shrink:0; display:flex; align-items:center; gap:12px; padding:16px 12px 14px 16px; border-bottom:1px solid var(--line); overflow:hidden;
      background:
        radial-gradient(110% 150% at 100% 0%, color-mix(in srgb, var(--copper) 16%, transparent), transparent 55%),
        linear-gradient(180deg, var(--bg-elev), color-mix(in srgb, var(--bg) 70%, var(--bg-elev))); }
    .nb-mark { flex-shrink:0; width:42px; height:42px; color:var(--gold); filter:drop-shadow(0 0 10px var(--nb-glow)); }
    .nb-mark svg { width:100%; height:100%; display:block; }
    .nb-id { min-width:0; }
    .nb-id h2 { margin:0; font-family:var(--font-display); font-size:17px; font-weight:700; letter-spacing:3px; color:var(--ink); text-transform:uppercase; white-space:nowrap; }
    .nb-rune { font-family:var(--font-rune); font-size:13px; letter-spacing:7px; color:var(--rune); opacity:.85; margin-top:2px; }
    .nb-count { display:inline-flex; align-items:center; gap:6px; margin-top:6px; padding:2px 9px; border-radius:999px; white-space:nowrap;
      border:1px solid color-mix(in srgb, var(--gold) 35%, var(--line)); background:color-mix(in srgb, var(--gold) 7%, transparent);
      font:600 10px var(--font-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--ink-soft); }
    .nb-count svg { color:var(--gold); }
    .nb-head-actions { margin-left:auto; display:flex; align-self:flex-start; gap:2px; }
    .nb-icon-btn { width:28px; height:28px; border:none; background:transparent; color:var(--ink-mute); border-radius:7px; display:grid; place-items:center; cursor:pointer; }
    .nb-icon-btn:hover { background:var(--bg-soft); color:var(--gold); }
    .nb-icon-btn.danger:hover { color:var(--danger); background:color-mix(in srgb, var(--danger) 10%, transparent); }
    .nb-icon-btn:focus-visible, .nb-btn:focus-visible, .nb-card:focus-visible, .nb-link-chip:focus-visible { outline:2px solid var(--gold); outline-offset:1px; }

    .nb-body { flex:1; min-height:0; display:flex; flex-direction:column; padding:0; overflow:hidden; position:relative; }
    .nb-view { flex:1; min-height:0; display:flex; flex-direction:column; }
    #panel-notes.nb-editing .nb-list-view, #panel-notes:not(.nb-editing) .nb-editor-view { display:none; }

    /* Liste */
    .nb-tools { flex-shrink:0; display:flex; flex-direction:column; gap:8px; padding:12px 14px 10px; }
    .nb-search { display:flex; align-items:center; gap:8px; height:36px; padding:0 10px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--ink-mute); }
    .nb-search:focus-within { border-color:var(--gold); box-shadow:0 0 0 3px color-mix(in srgb, var(--gold) 14%, transparent); }
    .nb-search input { flex:1; min-width:0; border:none; outline:none; background:transparent; color:var(--ink); font:13px var(--font-ui); }
    .nb-search input::placeholder { color:var(--ink-mute); }
    .nb-search[hidden] { display:none; }
    .nb-row { display:flex; gap:8px; }
    .nb-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 13px; border-radius:9px; cursor:pointer;
      border:1px solid var(--line); background:var(--bg-soft); color:var(--ink-soft); font:600 12.5px var(--font-ui); white-space:nowrap; }
    .nb-btn:hover { border-color:var(--gold); color:var(--gold); }
    .nb-btn.primary { flex:1; border:none; color:#1a1206; background:linear-gradient(135deg, var(--gold), var(--copper)); box-shadow:0 8px 20px -14px var(--nb-glow); }
    .nb-btn.primary:hover { filter:brightness(1.07); color:#1a1206; }
    .nb-row .nb-btn:not(.primary) { flex:1; min-width:0; }
    .nb-btn span { overflow:hidden; text-overflow:ellipsis; }
    .nb-private { display:flex; gap:8px; align-items:flex-start; margin:0; padding:8px 10px; border-radius:9px; font-size:11.5px; line-height:1.5; color:var(--ink-soft);
      background:color-mix(in srgb, var(--copper) 10%, transparent); border:1px solid color-mix(in srgb, var(--copper) 35%, var(--line)); }
    .nb-private[hidden] { display:none; }
    .nb-private svg { flex-shrink:0; margin-top:2px; color:var(--copper); }
    .nb-scroll { flex:1; min-height:0; overflow-y:auto; padding:2px 14px 14px; display:flex; flex-direction:column; gap:6px; }
    .nb-list { display:flex; flex-direction:column; gap:6px; }
    .nb-group { margin:10px 2px 2px; font:600 10px var(--font-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--ink-mute); }
    .nb-group:first-child { margin-top:2px; }
    .nb-card { display:flex; flex-direction:column; gap:4px; width:100%; min-width:0; padding:10px 12px; text-align:left; cursor:pointer; font:inherit; color:var(--ink);
      border:1px solid var(--line); border-radius:11px; background:linear-gradient(160deg, color-mix(in srgb, var(--bg-soft) 70%, transparent), color-mix(in srgb, var(--bg-elev) 45%, transparent));
      transition:border-color .15s, transform .15s, box-shadow .15s; }
    .nb-card:hover { border-color:color-mix(in srgb, var(--gold) 65%, transparent); transform:translateY(-1px); box-shadow:0 10px 22px -16px var(--nb-glow); }
    .nb-card-title { font-size:13.5px; font-weight:600; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nb-card-title.untitled { color:var(--ink-mute); font-style:italic; font-weight:500; }
    .nb-card-snippet { font-size:12px; line-height:1.5; color:var(--ink-mute); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
    .nb-card-foot { display:flex; align-items:center; gap:8px; margin-top:2px; font:500 10.5px var(--font-mono); color:var(--ink-mute); min-width:0; }
    .nb-host { display:inline-flex; align-items:center; gap:4px; min-width:0; padding:1px 7px; border-radius:999px; color:var(--gold);
      border:1px solid color-mix(in srgb, var(--gold) 35%, transparent); }
    .nb-host span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nb-host svg { flex-shrink:0; }
    .nb-empty { margin-block:auto; display:flex; flex-direction:column; align-items:center; text-align:center; padding:18px 12px; }
    .nb-empty[hidden], .nb-noresult[hidden] { display:none; }
    .nb-halo { position:relative; width:92px; height:92px; display:grid; place-items:center; margin-bottom:14px; border-radius:50%;
      background:radial-gradient(circle, color-mix(in srgb, var(--gold) 18%, transparent), transparent 68%); }
    .nb-halo::before { content:''; position:absolute; inset:-9px; border-radius:50%; border:1px dashed color-mix(in srgb, var(--gold) 30%, transparent); }
    .nb-halo .nb-mark { width:60px; height:60px; }
    .nb-empty h3 { margin:0; font-family:var(--font-display); font-size:19px; font-weight:700; letter-spacing:.5px; text-wrap:balance;
      background:linear-gradient(135deg, var(--ink), var(--gold) 70%, var(--copper)); -webkit-background-clip:text; background-clip:text; color:transparent; }
    .nb-empty p { margin:8px 0 0; max-width:36ch; font-size:12.5px; line-height:1.6; color:var(--ink-mute); text-wrap:balance; }
    .nb-noresult { margin:24px 4px; text-align:center; font-size:12.5px; color:var(--ink-mute); overflow-wrap:anywhere; }
    .nb-error { margin:18px 14px; padding:14px; border-radius:12px; border:1px dashed color-mix(in srgb, var(--danger) 45%, var(--line)); font-size:12.5px; line-height:1.55; color:var(--ink-soft); }
    .nb-error[hidden] { display:none; }
    .nb-foot { flex-shrink:0; display:flex; gap:6px; align-items:flex-start; margin:0; padding:9px 14px 11px; border-top:1px solid var(--line); font-size:10.5px; line-height:1.5; color:var(--ink-mute); }
    .nb-foot svg { flex-shrink:0; margin-top:2px; color:color-mix(in srgb, var(--gold) 70%, var(--ink-mute)); }

    /* Yazma yaprağı */
    .nb-bar { flex-shrink:0; display:flex; align-items:center; gap:4px; padding:8px 10px 8px 6px; border-bottom:1px solid var(--line); }
    .nb-back { display:inline-flex; align-items:center; gap:4px; height:28px; padding:0 8px 0 4px; border:none; border-radius:7px; background:transparent; color:var(--ink-soft); font:600 12.5px var(--font-ui); cursor:pointer; }
    .nb-back:hover { background:var(--bg-soft); color:var(--gold); }
    .nb-status { margin-left:auto; margin-right:4px; display:inline-flex; align-items:center; gap:6px; font:500 10.5px var(--font-mono); color:var(--ink-mute); white-space:nowrap; }
    .nb-status::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--success, #4ade80); }
    .nb-status.saving::before { background:var(--gold); animation:nbPulse 1s ease-in-out infinite; }
    .nb-status.failed { color:var(--danger); }
    .nb-status.failed::before { background:var(--danger); }
    .nb-sheet { flex:1; min-height:0; display:flex; flex-direction:column; margin:12px 12px 0; border-radius:12px 12px 0 0; border:1px solid var(--line); border-bottom:none;
      background:linear-gradient(180deg, color-mix(in srgb, var(--bg-elev) 85%, var(--gold) 3%), var(--bg-elev)); overflow:hidden; }
    .nb-title { flex-shrink:0; width:100%; padding:14px 14px 4px 34px; border:none; outline:none; background:transparent; color:var(--ink); font:700 18px/1.3 var(--font-body); }
    .nb-title::placeholder { color:color-mix(in srgb, var(--ink-mute) 70%, transparent); }
    .nb-link { flex-shrink:0; display:flex; align-items:center; gap:4px; min-width:0; padding:2px 12px 8px 30px; }
    .nb-link-chip { display:inline-flex; align-items:center; gap:6px; min-width:0; max-width:100%; height:26px; padding:0 10px; border-radius:999px; cursor:pointer;
      border:1px solid color-mix(in srgb, var(--gold) 40%, transparent); background:color-mix(in srgb, var(--gold) 8%, transparent); color:var(--gold); font:600 11.5px var(--font-ui); }
    .nb-link-chip:hover { background:color-mix(in srgb, var(--gold) 16%, transparent); }
    .nb-link-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nb-link-chip svg { flex-shrink:0; }
    .nb-attach { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border-radius:999px; cursor:pointer;
      border:1px dashed var(--line); background:transparent; color:var(--ink-mute); font:600 11.5px var(--font-ui); }
    .nb-attach:hover { border-color:var(--gold); color:var(--gold); }
    .nb-paper { flex:1; min-height:120px; width:100%; resize:none; border:none; outline:none; margin:0; padding:3px 14px 24px 34px;
      font:13.5px/24px var(--font-body); color:var(--ink); caret-color:var(--gold); background-color:transparent;
      background-image:
        linear-gradient(90deg, transparent 22px, var(--nb-rule) 22px, var(--nb-rule) 23px, transparent 23px),
        repeating-linear-gradient(180deg, transparent 0 23px, color-mix(in srgb, var(--line) 80%, transparent) 23px 24px);
      background-attachment:local; }
    .nb-paper::placeholder { color:color-mix(in srgb, var(--ink-mute) 70%, transparent); }
    .nb-meta { flex-shrink:0; display:flex; flex-wrap:wrap; gap:4px 12px; margin:0 12px; padding:8px 14px 10px 34px; border:1px solid var(--line); border-top:1px solid color-mix(in srgb, var(--line) 60%, transparent);
      border-radius:0 0 12px 12px; background:var(--bg-elev); font:500 10.5px var(--font-mono); color:var(--ink-mute); margin-bottom:12px; }

    .nb-toast { position:absolute; left:12px; right:12px; bottom:12px; z-index:3; display:flex; align-items:center; gap:10px; padding:9px 10px 9px 14px; border-radius:11px;
      background:var(--bg-soft); border:1px solid color-mix(in srgb, var(--gold) 40%, var(--line)); color:var(--ink); font-size:12.5px;
      box-shadow:0 14px 30px -18px #000; animation:nbIn .18s ease-out both; }
    .nb-toast[hidden] { display:none; }
    .nb-toast span { flex:1; min-width:0; }
    .nb-toast button { flex-shrink:0; height:28px; padding:0 12px; border:none; border-radius:8px; cursor:pointer; font:700 12px var(--font-ui); color:#1a1206;
      background:linear-gradient(135deg, var(--gold), var(--copper)); }
    .nb-toast button[hidden] { display:none; }

    @keyframes nbIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
    @keyframes nbPulse { 50% { opacity:.35; } }
    @media (prefers-reduced-motion: reduce) { .nb-toast, .nb-status.saving::before { animation:none; } .nb-card { transition:none; } }
    :root[data-reduce-motion] .nb-toast, :root[data-reduce-motion] .nb-status.saving::before { animation:none; }
  `;
  document.head.appendChild(s);
}

// İşaret: halka içinde tüy kalem ve mürekkep çizgisi (Ülgen tamgasıyla aynı altın dil).
const NB_MARK = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="32" cy="32" r="27" stroke-width="4"/>'
  + '<path stroke-width="3" d="M44.5 17.5c-10.5.8-18 7.6-21 19.5l-1.6 6.5 6.2-2c10.6-3.4 16.2-11.4 16.4-24z"/>'
  + '<path stroke-width="3" d="M20 45.5l12.5-12.5"/><path stroke-width="3" d="M30 46h14"/></svg>';

const NB_ICON = {
  lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  page: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
  link: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  export: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/></svg>',
  close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const NB_SAVE_DELAY = 600;
const nb = { openId: null, note: null, fresh: null, query: '', saveTimer: null, searchTimer: null, toastTimer: null, retries: 0, state: null };
const nbApi = () => window.secureBrowser && window.secureBrowser.notes;
const nbEl = (id) => document.getElementById(id);
const nbIntl = () => (window.ilgezdiI18n && window.ilgezdiI18n.intl) || 'tr-TR';

function nbNode(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function nbIcon(name) {
  const t = nbEl('nb-tpl-' + name);
  return t ? t.content.firstElementChild.cloneNode(true) : document.createTextNode('');
}

const nbDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function nbGroupOf(t) {
  const today = nbDay(Date.now());
  const days = Math.round((today - nbDay(t)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'older';
}

function nbTime(t) {
  const d = new Date(t);
  if (nbGroupOf(t) === 'today') return new Intl.DateTimeFormat(nbIntl(), { hour: '2-digit', minute: '2-digit' }).format(d);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(nbIntl(), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const nbFullTime = (t) => new Intl.DateTimeFormat(nbIntl(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t));
const nbWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// ─── Bildirim (geri al düğmesiyle) ───────────────────────────────────────────
function nbToast(text, actionText, action) {
  const box = nbEl('nb-toast');
  if (!box) return;
  clearTimeout(nb.toastTimer);
  nbEl('nb-toast-text').textContent = text;
  const btn = nbEl('nb-toast-action');
  btn.hidden = !action;
  btn.textContent = actionText || '';
  btn.onclick = action ? () => { box.hidden = true; action(); } : null;
  box.hidden = false;
  nb.toastTimer = setTimeout(() => { box.hidden = true; }, action ? 8000 : 3500);
}

const NB_ERRORS = { unreadable: 'notes.unreadable', noPage: 'notes.noPage', full: 'notes.full', saveFailed: 'notes.saveFailed', writeFailed: 'notes.exportFailed' };
const nbErrorText = (code) => T(NB_ERRORS[code] || 'notes.failed');

// ─── Liste ───────────────────────────────────────────────────────────────────
function nbCard(it) {
  const b = nbNode('button', 'nb-card');
  b.type = 'button';
  b.dataset.id = it.id;
  const title = nbNode('span', 'nb-card-title' + (it.title ? '' : ' untitled'), it.title || T('notes.untitled'));
  b.append(title);
  if (it.snippet) b.append(nbNode('span', 'nb-card-snippet', it.snippet));
  const foot = nbNode('span', 'nb-card-foot');
  const time = nbNode('time', '', nbTime(it.updatedAt));
  time.dateTime = new Date(it.updatedAt).toISOString();
  foot.append(time);
  if (it.host) {
    const host = nbNode('span', 'nb-host');
    host.append(nbIcon('link'), nbNode('span', '', it.host));
    foot.append(host);
  }
  b.append(foot);
  b.addEventListener('click', () => nbOpen(it.id, 'end'));
  return b;
}

async function nbRefresh() {
  const api = nbApi();
  if (!api) return;
  const r = await api.list(nb.query).catch(() => null);
  const err = nbEl('nb-error');
  if (!r || !r.ok) {
    // Şifreleme anahtarı açılışta birkaç yüz milisaniye sonra hazır olur.
    if (r && r.error === 'notReady' && nb.retries++ < 20) { setTimeout(nbRefresh, 300); return; }
    err.textContent = nbErrorText(r && r.error);
    err.hidden = false;
    return;
  }
  nb.retries = 0;
  err.hidden = true;
  nbEl('nb-count-text').textContent = T('notes.count', { count: r.total });
  nbEl('nb-search').hidden = r.total === 0;
  nbEl('nb-empty').hidden = r.total > 0;
  const none = nbEl('nb-noresult');
  none.hidden = !(r.total > 0 && r.items.length === 0);
  if (!none.hidden) none.textContent = T('notes.noResults', { q: nb.query.trim() });
  const box = nbEl('nb-list');
  const kids = [];
  let last = null;
  for (const it of r.items) {
    const g = nbGroupOf(it.updatedAt);
    if (g !== last) { kids.push(nbNode('h3', 'nb-group', T('notes.group.' + g))); last = g; }
    kids.push(nbCard(it));
  }
  box.replaceChildren(...kids);
}

// ─── Yazma yaprağı ───────────────────────────────────────────────────────────
function nbStatus(kind) {
  const s = nbEl('nb-status');
  if (!s) return;
  s.className = 'nb-status ' + kind;
  s.textContent = T(kind === 'saving' ? 'notes.saving' : kind === 'failed' ? 'notes.saveFailed' : 'notes.saved');
}

function nbRenderMeta() {
  const n = nb.note;
  if (!n) return;
  const words = nbWords(nbEl('nb-body').value);
  nbEl('nb-meta').textContent = T('notes.created', { date: nbFullTime(n.createdAt) }) + '  ·  ' + T('notes.words', { count: words });
}

function nbRenderLink() {
  const row = nbEl('nb-link');
  const n = nb.note;
  if (!row || !n) return;
  if (n.url) {
    const chip = nbNode('button', 'nb-link-chip');
    chip.type = 'button';
    chip.title = T('notes.openLink') + ' · ' + n.url;
    let host = '';
    try { host = new URL(n.url).hostname.replace(/^www\./, ''); } catch {}
    chip.append(nbIcon('link'), nbNode('span', '', n.pageTitle && n.pageTitle !== n.url ? n.pageTitle : host));
    chip.addEventListener('click', () => nbApi().openUrl(n.url));
    const off = nbNode('button', 'nb-icon-btn');
    off.type = 'button';
    off.title = T('notes.unlink');
    off.setAttribute('aria-label', T('notes.unlink'));
    off.append(nbIcon('close'));
    off.addEventListener('click', async () => {
      await nbFlush();
      const r = await nbApi().update(n.id, { url: '' });
      if (r && r.ok) { nb.note = r.note; nbRenderLink(); }
    });
    row.replaceChildren(chip, off);
  } else {
    const add = nbNode('button', 'nb-attach');
    add.type = 'button';
    add.append(nbIcon('link'), nbNode('span', '', T('notes.attach')));
    add.addEventListener('click', async () => {
      await nbFlush();
      const r = await nbApi().attachPage(n.id);
      if (r && r.ok) { nb.note = r.note; nbRenderLink(); } else nbToast(nbErrorText(r && r.error));
    });
    row.replaceChildren(add);
  }
}

function nbScheduleSave() {
  if (!nb.openId) return;
  nbStatus('saving');
  clearTimeout(nb.saveTimer);
  nb.saveTimer = setTimeout(nbSaveNow, NB_SAVE_DELAY);
}

async function nbSaveNow() {
  clearTimeout(nb.saveTimer);
  nb.saveTimer = null;
  const id = nb.openId;
  if (!id) return true;
  const r = await nbApi().update(id, { title: nbEl('nb-title').value, body: nbEl('nb-body').value }).catch(() => null);
  if (nb.openId === id) {
    nbStatus(r && r.ok ? 'saved' : 'failed');
    if (r && r.ok && r.note) nb.note = r.note;
  }
  return !!(r && r.ok);
}

const nbFlush = () => (nb.saveTimer ? nbSaveNow() : Promise.resolve(true));

async function nbOpen(id, focus) {
  await nbFlush();
  const r = await nbApi().get(id).catch(() => null);
  if (!r || !r.ok) { nbToast(nbErrorText(r && r.error)); return nbShowList(); }
  nb.openId = id;
  nb.note = r.note;
  const title = nbEl('nb-title');
  const body = nbEl('nb-body');
  title.value = r.note.title;
  body.value = r.note.body;
  nbRenderLink();
  nbRenderMeta();
  nbStatus('saved');
  nbEl('panel-notes').classList.add('nb-editing');
  if (focus === 'title') title.focus();
  else if (focus === 'end') {
    body.focus();
    body.setSelectionRange(body.value.length, body.value.length);
    body.scrollTop = body.scrollHeight;
  }
}

// Yeni açılıp hiç yazılmadan bırakılan not iz bırakmadan kalkar.
async function nbDropIfUntouched() {
  const f = nb.fresh;
  nb.fresh = null;
  if (!f || f.id !== nb.openId) return false;
  if (nbEl('nb-body').value.trim() || nbEl('nb-title').value.trim() !== f.title.trim()) return false;
  clearTimeout(nb.saveTimer);
  nb.saveTimer = null;
  await nbApi().remove(f.id).catch(() => null);
  return true;
}

async function nbShowList() {
  if (!(await nbDropIfUntouched())) await nbFlush();
  nb.openId = null;
  nb.note = null;
  nbEl('panel-notes').classList.remove('nb-editing');
  await nbRefresh();
}

async function nbCreate(withPage) {
  await nbFlush();
  const r = await nbApi().create(withPage ? { withPage: true } : {}).catch(() => null);
  if (!r || !r.ok) { nbToast(nbErrorText(r && r.error)); return; }
  nb.fresh = { id: r.note.id, title: r.note.title };
  await nbOpen(r.note.id, withPage ? 'end' : 'title');
}

async function nbDelete() {
  const id = nb.openId;
  if (!id) return;
  nb.fresh = null;
  await nbSaveNow();
  const r = await nbApi().remove(id).catch(() => null);
  if (!r || !r.ok) { nbToast(nbErrorText(r && r.error)); return; }
  nb.openId = null;
  await nbShowList();
  nbToast(T('notes.deleted'), T('notes.undo'), async () => {
    const x = await nbApi().restore(id).catch(() => null);
    if (x && x.ok) nbRefresh(); else nbToast(nbErrorText(x && x.error));
  });
}

async function nbExport(id) {
  await nbFlush();
  const r = await nbApi().exportMd(id).catch(() => null);
  if (r && r.ok) nbToast(id ? T('notes.exportedOne') : T('notes.exported', { count: r.count }));
  else if (!r || r.error !== 'canceled') nbToast(nbErrorText(r && r.error));
}

// Sağ tık › Nota ekle: yaprak açıksa o nota, değilse kaynağa bağlı yeni bir nota.
async function nbOnClip() {
  const panel = nbEl('panel-notes');
  if (!panel.classList.contains('visible')) window.ilgezdiTogglePanel?.('notes', nbEl('btn-notes'));
  await nbFlush();
  const target = panel.classList.contains('nb-editing') ? nb.openId : null;
  const r = await nbApi().addClip(target).catch(() => null);
  if (!r || !r.ok) { nbToast(nbErrorText(r && r.error)); return; }
  nb.fresh = null;
  await nbOpen(r.note.id, 'end');
  nbToast(T('notes.clipped'));
}

function nbBuildPanel() {
  const panel = nbEl('panel-notes');
  if (!panel) return;
  panel.innerHTML = `
    <template id="nb-tpl-link">${NB_ICON.link}</template>
    <template id="nb-tpl-close">${NB_ICON.close}</template>
    <div class="nb-head">
      <div class="nb-mark">${NB_MARK}</div>
      <div class="nb-id">
        <h2 id="nb-heading">${TH('notes.title')}</h2>
        <div class="nb-rune" aria-hidden="true">𐰋𐰃𐱅𐰃𐰏</div>
        <div class="nb-count">${NB_ICON.lock}<span id="nb-count-text"></span></div>
      </div>
      <div class="nb-head-actions">
        <button type="button" class="nb-icon-btn" id="nb-export-all" title="${TH('notes.exportAll')}" aria-label="${TH('notes.exportAll')}">${NB_ICON.export}</button>
        <button type="button" class="panel-close" data-panel="notes" aria-label="${TH('common.closePanel')}">✕</button>
      </div>
    </div>
    <div class="panel-body nb-body" aria-labelledby="nb-heading">
      <div class="nb-view nb-list-view">
        <div class="nb-tools">
          <p class="nb-private" id="nb-private" hidden>${NB_ICON.lock}<span>${TH('notes.private')}</span></p>
          <div class="nb-row">
            <button type="button" class="nb-btn primary" id="nb-new">${NB_ICON.plus}<span>${TH('notes.new')}</span></button>
            <button type="button" class="nb-btn" id="nb-from-page" title="${TH('notes.fromPageHint')}">${NB_ICON.page}<span>${TH('notes.fromPage')}</span></button>
          </div>
          <label class="nb-search" id="nb-search" hidden>${NB_ICON.search}
            <input type="search" id="nb-search-input" maxlength="200" placeholder="${TH('notes.search')}" aria-label="${TH('notes.search')}" />
          </label>
        </div>
        <div class="nb-error" id="nb-error" role="alert" hidden></div>
        <div class="nb-scroll">
          <div class="nb-empty" id="nb-empty" hidden>
            <div class="nb-halo"><div class="nb-mark">${NB_MARK}</div></div>
            <h3>${TH('notes.emptyTitle')}</h3>
            <p>${TH('notes.emptyBody')}</p>
          </div>
          <p class="nb-noresult" id="nb-noresult" hidden></p>
          <div id="nb-list" class="nb-list"></div>
        </div>
        <p class="nb-foot">${NB_ICON.lock}<span>${TH('notes.foot')}</span></p>
      </div>
      <div class="nb-view nb-editor-view">
        <div class="nb-bar">
          <button type="button" class="nb-back" id="nb-back">${NB_ICON.back}<span>${TH('notes.back')}</span></button>
          <span class="nb-status saved" id="nb-status" role="status"></span>
          <button type="button" class="nb-icon-btn" id="nb-export" title="${TH('notes.export')}" aria-label="${TH('notes.export')}">${NB_ICON.export}</button>
          <button type="button" class="nb-icon-btn danger" id="nb-delete" title="${TH('notes.delete')}" aria-label="${TH('notes.delete')}">${NB_ICON.trash}</button>
        </div>
        <div class="nb-sheet">
          <input type="text" class="nb-title" id="nb-title" maxlength="200" placeholder="${TH('notes.titlePh')}" aria-label="${TH('notes.titlePh')}" />
          <div class="nb-link" id="nb-link"></div>
          <textarea class="nb-paper" id="nb-body" maxlength="100000" spellcheck="true" placeholder="${TH('notes.bodyPh')}" aria-label="${TH('notes.bodyPh')}"></textarea>
        </div>
        <div class="nb-meta" id="nb-meta"></div>
      </div>
      <div class="nb-toast" id="nb-toast" role="status" hidden><span id="nb-toast-text"></span><button type="button" id="nb-toast-action" hidden></button></div>
    </div>
  `;

  panel.querySelector('[data-panel="notes"]')?.addEventListener('click', () => window.ilgezdiCloseAllPanels?.());
  nbEl('nb-new').addEventListener('click', () => nbCreate(false));
  nbEl('nb-from-page').addEventListener('click', () => nbCreate(true));
  nbEl('nb-export-all').addEventListener('click', () => nbExport(null));
  nbEl('nb-export').addEventListener('click', () => nbExport(nb.openId));
  nbEl('nb-delete').addEventListener('click', nbDelete);
  nbEl('nb-back').addEventListener('click', nbShowList);
  nbEl('nb-search-input').addEventListener('input', (e) => {
    nb.query = e.target.value;
    clearTimeout(nb.searchTimer);
    nb.searchTimer = setTimeout(nbRefresh, 150);
  });
  const title = nbEl('nb-title');
  const body = nbEl('nb-body');
  title.addEventListener('input', nbScheduleSave);
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); body.focus(); }
  });
  body.addEventListener('input', () => { nbScheduleSave(); nbRenderMeta(); });

  // Panel başka bir yoldan kapanınca (başka panel, ✕, Esc) bekleyen yazı kaydedilir.
  new MutationObserver(() => {
    if (!panel.classList.contains('visible') && nb.openId) {
      nbDropIfUntouched().then((dropped) => {
        if (dropped) { nb.openId = null; nb.note = null; panel.classList.remove('nb-editing'); } else nbFlush();
      });
    }
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
}

async function initNotesPanel() {
  const api = nbApi();
  const btn = nbEl('btn-notes');
  if (!api || !btn) return;
  nbInjectStyles();
  nbBuildPanel();
  nb.state = await api.state().catch(() => null);
  // Gizli pencerede not defteri yok (ana süreç de reddeder).
  if (!nb.state || !nb.state.allowed) { btn.hidden = true; return; }
  nbEl('nb-private').hidden = !nb.state.private;
  btn.addEventListener('click', () => {
    window.ilgezdiTogglePanel?.('notes', btn, () => { if (!nb.openId) nbRefresh(); });
  });
  api.onClip(nbOnClip);
  nbRefresh();
}

window.addEventListener('load', () => setTimeout(initNotesPanel, 500));
