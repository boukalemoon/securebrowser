/**
 * İlgezdi — not defteri: kayıtlar ve saf işlemler.
 *
 * Notlar ana süreçte, ziyaret günlüğüyle aynı anahtarla şifreli bir dosyada durur
 * (main.js → writeProtectedJson). Bu modül dosyaya dokunmaz; listeyi doğrular ve
 * değiştirir, böylece test edilebilir.
 *
 * Senkrona hazır: her notun kalıcı bir kimliği ve updatedAt'i var; silinen not,
 * içeriği boşaltılmış bir iz (tombstone) olarak kalır ki silme öbür cihazlara da
 * ulaşsın. mergeNotes iki listeyi "son yazan kazanır" kuralıyla birleştirir.
 * QRtım hesabıyla uçtan uca şifreli senkron, RLS aşamasında bunun üstüne kurulur.
 */
'use strict';

const crypto = require('crypto');

const MAX_NOTES = 2000;
const MAX_TITLE = 200;
const MAX_BODY = 100000;
const MAX_URL = 2048;
const MAX_PAGE_TITLE = 300;
const MAX_CLIP = 8000;
const TOMBSTONE_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;
const ID_RE = /^[a-z0-9-]{8,40}$/;

// \n ve \t dışındaki denetim karakterleri metinden atılır.
const cleanText = (v, max) => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '').slice(0, max);
const oneLine = (v, max) => cleanText(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
const stamp = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function webUrl(u) {
  if (typeof u !== 'string' || !u || u.length > MAX_URL) return '';
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch { return ''; }
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  const createdAt = stamp(raw.createdAt) || stamp(raw.updatedAt);
  const updatedAt = Math.max(stamp(raw.updatedAt), createdAt);
  if (!updatedAt) return null;
  if (raw.deleted === true) {
    return { id: raw.id, title: '', body: '', url: '', pageTitle: '', createdAt, updatedAt, deleted: true };
  }
  const url = webUrl(raw.url);
  return {
    id: raw.id,
    title: oneLine(raw.title, MAX_TITLE),
    body: cleanText(raw.body, MAX_BODY),
    url,
    pageTitle: url ? oneLine(raw.pageTitle, MAX_PAGE_TITLE) : '',
    createdAt,
    updatedAt,
  };
}

const isLive = (n) => !n.deleted;

/** Dosyadan gelen {version, notes} ya da dizi → doğrulanmış liste (kimlik başına en yeni kayıt). */
function normalizeNotes(raw) {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.notes) ? raw.notes : [];
  const byId = new Map();
  for (const item of list) {
    const n = normalizeNote(item);
    if (!n) continue;
    const prev = byId.get(n.id);
    if (!prev || n.updatedAt > prev.updatedAt) byId.set(n.id, n);
  }
  const out = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  let live = 0;
  return out.filter((n) => !isLive(n) || ++live <= MAX_NOTES);
}

const serialize = (notes) => ({ version: 1, notes });

function newId() {
  return crypto.randomUUID();
}

function createNote(notes, input = {}, now = Date.now(), idGen = newId) {
  if (notes.filter(isLive).length >= MAX_NOTES) return { error: 'full' };
  const note = normalizeNote({
    id: idGen(),
    title: input.title,
    body: input.body,
    url: input.url,
    pageTitle: input.pageTitle,
    createdAt: now,
    updatedAt: now,
  });
  if (!note) return { error: 'invalid' };
  return { list: [note, ...notes], note };
}

const find = (notes, id) => (typeof id === 'string' ? notes.findIndex((n) => n.id === id && isLive(n)) : -1);

/** patch: title, body, url ('' bağlantıyı kaldırır), pageTitle. Değişiklik yoksa updatedAt kıpırdamaz. */
function updateNote(notes, id, patch = {}, now = Date.now()) {
  const i = find(notes, id);
  if (i < 0) return { error: 'missing' };
  const cur = notes[i];
  const next = { ...cur };
  if (typeof patch.title === 'string') next.title = patch.title;
  if (typeof patch.body === 'string') next.body = patch.body;
  if (typeof patch.url === 'string') {
    next.url = patch.url;
    next.pageTitle = typeof patch.pageTitle === 'string' ? patch.pageTitle : '';
  }
  const n = normalizeNote({ ...next, updatedAt: cur.updatedAt });
  if (!n) return { error: 'invalid' };
  const same = n.title === cur.title && n.body === cur.body && n.url === cur.url && n.pageTitle === cur.pageTitle;
  if (same) return { list: notes, note: cur, changed: false };
  n.updatedAt = Math.max(now, cur.updatedAt + 1);
  const list = notes.slice();
  list[i] = n;
  return { list, note: n, changed: true };
}

/** Silinen not iz olarak kalır; geri almak için içeriği `removed` ile döner. */
function removeNote(notes, id, now = Date.now()) {
  const i = find(notes, id);
  if (i < 0) return { error: 'missing' };
  const removed = notes[i];
  const list = notes.slice();
  list[i] = { id: removed.id, title: '', body: '', url: '', pageTitle: '', createdAt: removed.createdAt, updatedAt: Math.max(now, removed.updatedAt + 1), deleted: true };
  return { list, removed };
}

/** Geri al: silinen notu kendi kimliği ve oluşturulma zamanıyla geri getirir. */
function restoreNote(notes, snapshot, now = Date.now()) {
  const snap = normalizeNote({ ...(snapshot || {}), deleted: false });
  if (!snap) return { error: 'invalid' };
  const i = notes.findIndex((n) => n.id === snap.id);
  if (i >= 0 && isLive(notes[i])) return { list: notes, note: notes[i] };
  if (i < 0 && notes.filter(isLive).length >= MAX_NOTES) return { error: 'full' };
  const note = { ...snap, updatedAt: Math.max(now, i >= 0 ? notes[i].updatedAt + 1 : 0) };
  const list = notes.slice();
  if (i >= 0) list[i] = note; else list.unshift(note);
  return { list, note };
}

/** Seçilen metin alıntı olarak: her satır "> " ile, sonda kaynak satırı. */
function clipBlock(clip = {}) {
  const text = cleanText(clip.text, MAX_CLIP).trim();
  if (!text) return '';
  const url = webUrl(clip.url);
  const title = oneLine(clip.title, MAX_PAGE_TITLE);
  const quote = text.split('\n').map((l) => ('> ' + l).trimEnd()).join('\n');
  const source = url ? '\n> — ' + (title && title !== url ? title + ' (' + url + ')' : url) : '';
  return quote + source;
}

/** Açık not varsa sonuna ekler; yoksa kaynağa bağlı yeni bir not açar. */
function addClip(notes, id, clip = {}, now = Date.now(), idGen = newId) {
  const block = clipBlock(clip);
  if (!block) return { error: 'empty' };
  const i = find(notes, id);
  if (i >= 0) {
    const body = notes[i].body.replace(/\s+$/, '');
    return updateNote(notes, id, { body: (body ? body + '\n\n' : '') + block + '\n' }, now);
  }
  const url = webUrl(clip.url);
  return createNote(notes, { title: url ? clip.title : '', body: block + '\n', url, pageTitle: clip.title }, now, idGen);
}

// Önizlemede alıntıların kaynak satırı ("> — Başlık (adres)") yer kaplamasın; arama onları da bulur.
function snippetOf(body, needle) {
  const flat = body.split('\n').filter((l) => !l.startsWith('> — ')).join('\n').replace(/^> ?/gm, '').replace(/\s+/g, ' ').trim();
  if (!needle) return flat.slice(0, 160);
  const at = flat.toLocaleLowerCase('tr').indexOf(needle);
  if (at < 50) return flat.slice(0, 160);
  return '…' + flat.slice(at - 40, at + 120);
}

/**
 * Canlı notların özeti, en son değişen önce. Arama: her sözcük başlıkta, metinde,
 * sayfa başlığında ya da sitede geçmeli (Türkçe büyük/küçük harf kuralıyla).
 */
function listNotes(notes, query = '') {
  const words = oneLine(query, 200).toLocaleLowerCase('tr').split(' ').filter(Boolean);
  const out = [];
  for (const n of notes) {
    if (!isLive(n)) continue;
    const host = hostOf(n.url);
    if (words.length) {
      const hay = (n.title + '\n' + n.body + '\n' + n.pageTitle + '\n' + host).toLocaleLowerCase('tr');
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.push({
      id: n.id,
      title: n.title,
      snippet: snippetOf(n.body, words[0] && !n.title.toLocaleLowerCase('tr').includes(words[0]) ? words[0] : ''),
      url: n.url,
      host,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 90 günden eski izler atılır (o süre içinde her cihaz silmeyi görmüş olur). */
function pruneTombstones(notes, now = Date.now()) {
  return notes.filter((n) => isLive(n) || now - n.updatedAt < TOMBSTONE_DAYS * DAY);
}

/** İki cihazın listesi: kimlik başına son yazan kazanır; eşitlikte silme kazanır. */
function mergeNotes(local, remote) {
  const byId = new Map(normalizeNotes(local).map((n) => [n.id, n]));
  for (const r of normalizeNotes(remote)) {
    const l = byId.get(r.id);
    if (!l || r.updatedAt > l.updatedAt || (r.updatedAt === l.updatedAt && r.deleted && !l.deleted)) byId.set(r.id, r);
  }
  return normalizeNotes([...byId.values()]);
}

// ─── Markdown dışa aktarma (Obsidian gibi uygulamalar ön bilgiyi özellik olarak okur) ───
function toMarkdown(note, untitled = 'Not') {
  const title = note.title || untitled;
  const lines = ['---', 'title: ' + JSON.stringify(title), 'created: ' + new Date(note.createdAt).toISOString(), 'updated: ' + new Date(note.updatedAt).toISOString()];
  if (note.url) lines.push('source: ' + JSON.stringify(note.url));
  lines.push('---', '', '# ' + title, '');
  if (note.body.trim()) lines.push(note.body.replace(/\s+$/, ''), '');
  return lines.join('\n');
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Windows, macOS ve Linux'ta geçerli dosya adı (uzantısız). */
function safeFileName(name, fallback = 'not') {
  let s = oneLine(name, 200).replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '');
  if (!s) s = fallback;
  if (RESERVED.test(s)) s = '_' + s;
  return s;
}

/** Aynı klasörde çakışmayan adlar: "Ad", "Ad (2)", "Ad (3)"… (büyük/küçük harf duyarsız). */
function uniqueNames(names) {
  const used = new Set();
  return names.map((base) => {
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = base + ' (' + k + ')';
    used.add(name.toLowerCase());
    return name;
  });
}

module.exports = {
  MAX_NOTES, MAX_TITLE, MAX_BODY, MAX_CLIP, TOMBSTONE_DAYS,
  normalizeNote, normalizeNotes, serialize, createNote, updateNote, removeNote, restoreNote,
  clipBlock, addClip, listNotes, pruneTombstones, mergeNotes, toMarkdown, safeFileName, uniqueNames, hostOf, webUrl,
};
