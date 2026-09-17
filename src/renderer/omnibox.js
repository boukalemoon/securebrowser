/**
 * İlgezdi — adres çubuğu önerileri (saf sıralama mantığı).
 *
 * Kaynak YALNIZCA cihazdaki veriler: şifreli ziyaret günlüğü ve yer imleri. Yazdığınız
 * harfler hiçbir sunucuya gitmez (Chrome ve Edge yazarken her tuşu arama sağlayıcısına
 * gönderir; İlgezdi göndermez). Gizli pencerede geçmiş önerisi hiç gösterilmez.
 *
 * Sıralama: eşleşmenin yeri (alan adının başı > içinde > başlık > adres), yer imi önceliği,
 * ne kadar yeni ziyaret edildiği ve kaç kez ziyaret edildiği. Aynı adres bir kez listelenir.
 */

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ilgezdiOmnibox = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const DAY = 86400000;

  /** Karşılaştırma için adres: şema, "www." ve sondaki "/" atılır. */
  function normalizeUrl(url) {
    return String(url || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
  }
  function hostOf(url) {
    try { return new URL(String(url)).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return normalizeUrl(url).split('/')[0]; }
  }

  /** Yazılan metin bir adres mi (nokta var, boşluk yok) — "ara" satırı buna göre eklenir. */
  function looksLikeUrl(text) {
    const t = String(text || '').trim();
    if (!t || /\s/.test(t)) return false;
    if (/^https?:\/\//i.test(t) || /^localhost(:\d+)?(\/|$)/i.test(t)) return true;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/|$)/i.test(t);
  }

  function matchScore(query, host, title, url) {
    const q = query;
    if (host.startsWith(q)) return 60;
    if (host.includes(q)) return 35;
    const t = title.toLowerCase();
    if (t.startsWith(q)) return 30;
    if (t.includes(q)) return 18;
    if (url.includes(q)) return 10;
    return 0;
  }

  /**
   * @param {object} p
   * @param {string} p.query yazılan metin
   * @param {Array<{url: string, title?: string, timestamp?: number}>} [p.history] ziyaret günlüğü (yeniden eskiye)
   * @param {Array<{url: string, title?: string}>} [p.bookmarks]
   * @param {number} [p.limit]
   * @param {number} [p.now]
   * @returns {Array<{url: string, title: string, host: string, kind: 'history'|'bookmark'}>}
   */
  function rankSuggestions({ query, history = [], bookmarks = [], limit = 8, now = Date.now() } = {}) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const visits = new Map();      // normalize edilmiş adres → ziyaret sayısı
    for (const h of history) {
      const key = normalizeUrl(h && h.url);
      if (key) visits.set(key, (visits.get(key) || 0) + 1);
    }

    const best = new Map();
    const consider = (item, kind) => {
      const url = String((item && item.url) || '');
      if (!/^https?:\/\//i.test(url)) return;
      const key = normalizeUrl(url);
      if (!key) return;
      const host = hostOf(url);
      const title = String((item && item.title) || '');
      const base = matchScore(q, host, title, key);
      if (!base) return;
      let score = base + (kind === 'bookmark' ? 14 : 0);
      if (kind === 'history') {
        const ageDays = Math.max(0, (now - (Number(item.timestamp) || 0)) / DAY);
        score += Math.max(0, 20 - ageDays * 2);                       // yeni ziyaret
        score += Math.min(20, ((visits.get(key) || 1) - 1) * 4);      // sık ziyaret
        if (key === host) score += 6;                                  // alan adının kendisi
      }
      const prev = best.get(key);
      if (!prev || score > prev.score) {
        best.set(key, { url, title: title || host, host, kind, score, timestamp: Number(item.timestamp) || 0 });
      }
    };

    for (const b of bookmarks) consider(b, 'bookmark');
    for (const h of history) consider(h, 'history');

    return [...best.values()]
      .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp || a.url.length - b.url.length)
      .slice(0, Math.max(0, limit))
      .map(({ url, title, host, kind }) => ({ url, title, host, kind }));
  }

  return { rankSuggestions, looksLikeUrl, normalizeUrl, hostOf };
});
