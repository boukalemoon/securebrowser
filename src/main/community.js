/**
 * İlgezdi — Topluluk: Keşfet'teki kullanıcı yorumları ve "Öneri" sayfası.
 *
 * İstekler yalnızca İlgezdi'nin kendi sunucusuna (www.ilgezdi.com.tr/api) gider:
 * bellek içi ayrı oturum, çerez yok. QRtım erişim anahtarı arayüzden gelir, yalnızca
 * Authorization başlığında sunucuya iletilir, diske yazılmaz. Sunucu anahtarı QRtım'da
 * doğrular; yorumlar Nexus CRM'de onaylanır, öneriler orada izlenir ve yanıtlanır.
 *
 * GÖNDERİLMEYENLER: ziyaret edilen adresler, geçmiş, sekmeler, yer imleri.
 * Tanılama yalnızca kullanıcı işaretlerse: uygulama ve Electron sürümü, işletim sistemi,
 * mimari, dil.
 */

'use strict';

const os = require('os');
const { T } = require('./i18n');

const API_BASE = 'https://www.ilgezdi.com.tr/api';
const PARTITION = 'ilgezdi-community';   // "persist:" yok → bellek içi
const TIMEOUT_MS = 12000;

// Sunucudaki listelerle aynı (api/feedback.js)
const FEEDBACK_TYPES = ['hata', 'eksik', 'ozellestirme', 'elestiri', 'diger'];
const FEEDBACK_AREAS = [
  'genel', 'sekmeler', 'adres-arama', 'yer-imleri', 'gecmis-indirmeler', 'gizlilik-guvenlik',
  'reklam-engelleme', 'vpn', 'sifreler', 'ayarlar', 'yeni-sekme', 'kesfet', 'arku',
  'senkron-hesap', 'performans', 'gorunum', 'diger',
];
const FEEDBACK_STATUSES = ['yeni', 'inceleniyor', 'planlandi', 'tamamlandi', 'reddedildi'];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

// Sunucu hata kodları → kullanıcıya gösterilecek metin (ham kod gösterilmez).
// Metinler locales/*.json içinde: community.err.<kod>.
const ERRORS = Object.freeze(new Set([
  'unauthorized', 'rate_limited', 'invalid_rating', 'invalid_name', 'invalid_comment', 'invalid_type',
  'invalid_title', 'invalid_message', 'too_large', 'invalid_json', 'server_error', 'network',
]));

const fail = (code) => {
  const known = ERRORS.has(code) ? code : 'server_error';
  return { ok: false, code: known, error: T('community.err.' + known) };
};
const clean = (v, max) => (typeof v === 'string'
  ? v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max) : '');
const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9._-]{20,4096}$/.test(t);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function validateReview(p) {
  const rating = Number.isInteger(p && p.rating) && p.rating >= 1 && p.rating <= 5 ? p.rating : 0;
  const name = clean(p && p.name, 60);
  const comment = clean(p && p.comment, 1000);
  if (!validToken(p && p.token)) return { error: 'unauthorized' };
  if (!rating) return { error: 'invalid_rating' };
  if (name.length < 2) return { error: 'invalid_name' };
  if (comment.length < 10) return { error: 'invalid_comment' };
  return { value: { rating, name, comment } };
}

function validateFeedback(p) {
  const type = FEEDBACK_TYPES.includes(p && p.type) ? p.type : '';
  const area = FEEDBACK_AREAS.includes(p && p.area) ? p.area : 'genel';
  const title = clean(p && p.title, 120);
  const message = clean(p && p.message, 4000);
  const token = p && p.token ? p.token : '';
  if (!type) return { error: 'invalid_type' };
  if (title.length < 5) return { error: 'invalid_title' };
  if (message.length < 10) return { error: 'invalid_message' };
  if (token && !validToken(token)) return { error: 'unauthorized' };
  return {
    value: { type, area, title, message, contactOk: !!token && p.contactOk === true },
    token,
    includeDiag: !!(p && p.includeDiag === true),
  };
}

function diagnostics(app) {
  return {
    appVersion: app.getVersion(),
    electron: process.versions.electron || '',
    os: `${os.platform()} ${os.release()}`.slice(0, 40),
    arch: os.arch(),
    locale: app.getLocale(),
  };
}

function setupCommunity({ ipcMain, session, app, apiBase }) {
  const base = apiBase || API_BASE;

  async function call(method, path, { token = '', body } = {}) {
    let res;
    try {
      res = await session.fromPartition(PARTITION).fetch(base + path, {
        method,
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return fail('network');
    }
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const code = data && typeof data.error === 'string' && ERRORS.has(data.error) ? data.error
        : (res.status === 401 ? 'unauthorized' : res.status === 429 ? 'rate_limited' : 'server_error');
      return fail(code);
    }
    return { ok: true, data: data && typeof data === 'object' ? data : {} };
  }

  const reviewItem = (x) => ({
    name: clean(x && x.name, 60),
    rating: Number.isInteger(x && x.rating) && x.rating >= 1 && x.rating <= 5 ? x.rating : 0,
    comment: clean(x && x.comment, 1000),
    createdAt: num(x && x.createdAt),
    verified: !!(x && x.verified === true),
  });

  ipcMain.handle('community-reviews', async (_e, token) => {
    const r = await call('GET', '/reviews', { token: validToken(token) ? token : '' });
    if (!r.ok) return r;
    const d = r.data;
    const m = d.mine && typeof d.mine === 'object' ? d.mine : null;
    return {
      ok: true,
      items: (Array.isArray(d.items) ? d.items : []).slice(0, 12).map(reviewItem),
      count: num(d.count),
      avgRating: typeof d.avgRating === 'number' && d.avgRating >= 1 && d.avgRating <= 5 ? d.avgRating : null,
      displayName: clean(d.displayName, 60),
      mine: m ? { ...reviewItem(m), status: REVIEW_STATUSES.includes(m.status) ? m.status : 'pending', updatedAt: num(m.updatedAt) } : null,
    };
  });

  ipcMain.handle('community-review-send', async (_e, payload) => {
    const v = validateReview(payload);
    if (v.error) return fail(v.error);
    const r = await call('POST', '/reviews', {
      token: payload.token,
      body: { ...v.value, source: 'app', appVersion: app.getVersion() },
    });
    return r.ok ? { ok: true, updated: r.data.updated === true } : r;
  });

  ipcMain.handle('community-feedback-send', async (_e, payload) => {
    const v = validateFeedback(payload);
    if (v.error) return fail(v.error);
    const r = await call('POST', '/feedback', {
      token: v.token,
      body: { ...v.value, diag: v.includeDiag ? diagnostics(app) : null },
    });
    return r.ok ? { ok: true, id: clean(r.data.id, 64) } : r;
  });

  ipcMain.handle('community-feedback-mine', async (_e, token) => {
    if (!validToken(token)) return fail('unauthorized');
    const r = await call('GET', '/feedback', { token });
    if (!r.ok) return r;
    const items = (Array.isArray(r.data.items) ? r.data.items : []).slice(0, 50).map((x) => ({
      id: clean(x && x.id, 64),
      type: FEEDBACK_TYPES.includes(x && x.type) ? x.type : 'diger',
      area: FEEDBACK_AREAS.includes(x && x.area) ? x.area : 'genel',
      title: clean(x && x.title, 120),
      status: FEEDBACK_STATUSES.includes(x && x.status) ? x.status : 'yeni',
      reply: clean(x && x.reply, 2000),
      createdAt: num(x && x.createdAt),
      updatedAt: num(x && x.updatedAt),
    }));
    return { ok: true, items };
  });
}

module.exports = {
  setupCommunity, validateReview, validateFeedback,
  FEEDBACK_TYPES, FEEDBACK_AREAS, FEEDBACK_STATUSES, ERRORS, API_BASE, PARTITION,
};
