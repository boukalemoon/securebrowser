/**
 * İlgezdi — Kenar çubuğunda web paneli (saf yardımcılar; testli).
 *
 * Kullanıcı sık kullandığı siteleri (mesajlaşma, müzik, not) kenar çubuğuna ekler; site
 * sağdaki panelde açılır ve kapatılınca arka planda açık kalır. Liste config.json'da
 * (webPanels) yalnızca ana süreç tarafından yazılır; adresler burada doğrulanır.
 */

'use strict';

const MAX_PANELS = 12;
const HEADER_HEIGHT = 44;      // panel başlığı (arayüz çizer); site görünümü bunun altında
const TITLE_MAX = 60;

function parseWebUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || u.username || u.password) return null;
    u.hash = '';
    return u;
  } catch { return null; }
}

/** Kullanıcının yazdığı adres: şema yoksa https eklenir. Geçersizse null. */
function normalizePanelUrl(input) {
  const text = String(input || '').trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : 'https://' + text;
  const u = parseWebUrl(withScheme);
  if (!u || !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
  return u.toString();
}

function titleFor(url) {
  const u = parseWebUrl(url);
  return u ? u.hostname.replace(/^www\./, '').slice(0, TITLE_MAX) : '';
}

// Aynı site iki kez eklenmez: kök adres (şema + alan adı + yol) karşılaştırılır.
function sameSite(a, b) {
  const x = parseWebUrl(a);
  const y = parseWebUrl(b);
  if (!x || !y) return false;
  const key = (u) => u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '');
  return key(x) === key(y);
}

/** Diskten okunan liste: geçersiz kayıtlar atılır, en çok MAX_PANELS. */
function normalizePanels(list) {
  const out = [];
  const ids = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p.id !== 'string' || !/^p[0-9a-z]{1,16}$/.test(p.id) || ids.has(p.id)) continue;
    const u = parseWebUrl(p.url);
    if (!u) continue;
    ids.add(p.id);
    out.push({ id: p.id, url: u.toString(), title: String(p.title || titleFor(u.toString())).slice(0, TITLE_MAX) });
    if (out.length >= MAX_PANELS) break;
  }
  return out;
}

/** Ekler; { list, id } ya da { error: 'invalid' | 'full' }. Aynı site varsa onun kimliği. */
function addPanel(list, input, makeId) {
  const url = normalizePanelUrl(input);
  if (!url) return { error: 'invalid' };
  const current = normalizePanels(list);
  const existing = current.find((p) => sameSite(p.url, url));
  if (existing) return { list: current, id: existing.id, existed: true };
  if (current.length >= MAX_PANELS) return { error: 'full' };
  let id;
  do { id = 'p' + makeId(); } while (current.some((p) => p.id === id));
  return { list: current.concat({ id, url, title: titleFor(url) }), id };
}

function removePanel(list, id) {
  return normalizePanels(list).filter((p) => p.id !== id);
}

module.exports = { MAX_PANELS, HEADER_HEIGHT, normalizePanelUrl, normalizePanels, addPanel, removePanel, titleFor, sameSite };
