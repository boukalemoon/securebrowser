/**
 * İlgezdi — Sekme grupları (saf yardımcılar; Electron'a bağlı değil, testli).
 *
 * Bir grubun sekmeleri şeritte her zaman yan yanadır. Sabitlenmiş sekmeler gruba girmez
 * (Chrome'daki gibi). Grup bilgisi: { id, title, color, collapsed }. Sekme sırası
 * pencere durumundaki Map sırasıdır; bu dosyadaki işlevler yeni kimlik sırası döndürür.
 */

'use strict';

// Açık ve koyu temada okunur renkler (Chrome'un grup renkleriyle aynı küme).
const GROUP_COLORS = Object.freeze({
  grey: '#8a93a3', blue: '#5b8def', red: '#e0625b', yellow: '#e3b341',
  green: '#4caf7a', pink: '#e06fa8', purple: '#9b7cf0', cyan: '#3fb8c9',
});
const COLOR_IDS = Object.freeze(Object.keys(GROUP_COLORS));
const TITLE_MAX = 60;

function normalizeColor(c) { return COLOR_IDS.includes(c) ? c : 'grey'; }
function normalizeTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TITLE_MAX); }

/** En az kullanılan renk (eşitlikte listedeki sıra). Yeni grup her seferinde farklı renk alır. */
function nextColor(groups) {
  const used = new Map(COLOR_IDS.map((c) => [c, 0]));
  for (const g of groups || []) if (used.has(g.color)) used.set(g.color, used.get(g.color) + 1);
  let best = COLOR_IDS[1];
  let min = Infinity;
  for (const c of COLOR_IDS.slice(1).concat(COLOR_IDS[0])) {
    if (used.get(c) < min) { min = used.get(c); best = c; }
  }
  return best;
}

/**
 * Grupların sekmelerini bir araya toplar: her grup, ilk sekmesinin yerinde bitişik durur.
 * groupOf: id → grupId (ya da yok). Sabitli sekmeler gruba alınmaz.
 */
function contiguous(ids, groupOf) {
  const out = [];
  const placed = new Set();
  for (const id of ids) {
    if (placed.has(id)) continue;
    const g = groupOf(id);
    if (!g) { out.push(id); placed.add(id); continue; }
    for (const other of ids) {
      if (!placed.has(other) && groupOf(other) === g) { out.push(other); placed.add(other); }
    }
  }
  return out;
}

/** tabId'yi gruba ekler: sekme grubun son sekmesinin hemen sağına taşınır. */
function placeInGroup(ids, groupOf, tabId, groupId) {
  const rest = ids.filter((id) => id !== tabId);
  let last = -1;
  rest.forEach((id, i) => { if (groupOf(id) === groupId) last = i; });
  if (last < 0) return ids.slice();
  rest.splice(last + 1, 0, tabId);
  return rest;
}

/**
 * Taşıma sonrası grup üyeliği (Chrome davranışı): iki komşusu aynı gruptaysa sekme o
 * gruba girer; kendi grubundan hiçbir sekmeye komşu değilse gruptan çıkar.
 * Döner: yeni grupId ya da null.
 */
function groupAfterMove(ids, groupOf, tabId) {
  const i = ids.indexOf(tabId);
  if (i < 0) return groupOf(tabId) || null;
  const left = i > 0 ? groupOf(ids[i - 1]) : null;
  const right = i < ids.length - 1 ? groupOf(ids[i + 1]) : null;
  if (left && left === right) return left;
  const own = groupOf(tabId);
  if (own && (left === own || right === own)) return own;
  return null;
}

/** Oturum kaydı için gruplar: yalnızca en az bir sekmesi olanlar, sırayla. */
function serializeGroups(groups, usedIds) {
  const out = [];
  const index = new Map();
  for (const g of groups || []) {
    if (!usedIds.has(g.id)) continue;
    index.set(g.id, out.length);
    out.push({ title: normalizeTitle(g.title), color: normalizeColor(g.color), collapsed: g.collapsed === true });
  }
  return { list: out, index };
}

function parseGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((g) => ({
    title: normalizeTitle(g && g.title),
    color: normalizeColor(g && g.color),
    collapsed: !!(g && g.collapsed === true),
  }));
}

module.exports = {
  GROUP_COLORS, COLOR_IDS, TITLE_MAX, normalizeColor, normalizeTitle, nextColor,
  contiguous, placeInGroup, groupAfterMove, serializeGroups, parseGroups,
};
