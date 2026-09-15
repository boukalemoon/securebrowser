/**
 * İlgezdi — Öneri ve geri bildirim API'si (Vercel serverless, Node).
 *
 * POST /api/feedback → uygulama içi "Öneri" formu. Kayıt Nexus'un Firestore
 *   veritabanına (ilgezdi_feedback) 'yeni' durumuyla yazılır. Nexus → Pazarlama →
 *   İlgezdi → Öneriler sekmesinde durum (inceleniyor, planlandı, tamamlandı,
 *   reddedildi) ve ekip yanıtı verilir.
 *   Qrtım oturumu İSTEĞE BAĞLI: varsa hesap doğrulanır ve kişi önerisinin durumunu
 *   uygulamada izler; yoksa anonim kaydedilir (IP başına saatlik sınır).
 * GET  /api/feedback → yalnızca Qrtım oturumuyla: kişinin kendi önerileri, durumları
 *   ve ekibin yanıtı.
 *
 * Gizlilik: ziyaret edilen adresler, geçmiş, sekme ya da yer imi bilgisi GÖNDERİLMEZ
 * ve kabul edilmez. Tanılama yalnızca kullanıcı işaretlerse gelir: uygulama sürümü,
 * Electron sürümü, işletim sistemi, mimari, dil. E-posta yalnızca kişi "yanıt için
 * bana ulaşılabilir" dediyse saklanır.
 *
 * Ortak yardımcılar ve ortam değişkenleri: api/_lib/community.js
 */

'use strict';

const {
  db, clientIp, plainText, hashKey, rateSalt, rateLimited, bearerToken, verifyQrtimUser, readBody,
} = require('./_lib/community');

const COLLECTION    = 'ilgezdi_feedback';
const RL_COLLECTION = 'ilgezdi_feedback_ratelimit';
const RL_ANON_PER_HOUR = 3;
const RL_USER_PER_HOUR = 10;

const TYPES = ['hata', 'eksik', 'ozellestirme', 'elestiri', 'diger'];
const AREAS = [
  'genel', 'sekmeler', 'adres-arama', 'yer-imleri', 'gecmis-indirmeler', 'gizlilik-guvenlik',
  'reklam-engelleme', 'vpn', 'sifreler', 'ayarlar', 'yeni-sekme', 'kesfet', 'arku',
  'senkron-hesap', 'performans', 'gorunum', 'diger',
];
const STATUSES = ['yeni', 'inceleniyor', 'planlandi', 'tamamlandi', 'reddedildi'];

function diagOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    appVersion: plainText(raw.appVersion, 20),
    electron:   plainText(raw.electron, 20),
    os:         plainText(raw.os, 40),
    arch:       plainText(raw.arch, 12),
    locale:     plainText(raw.locale, 12),
  };
}

module.exports = async (req, res) => {
  try {
    const col = db().collection(COLLECTION);

    // ── Kişinin kendi önerileri (yalnızca oturumla) ──
    if (req.method === 'GET') {
      const user = await verifyQrtimUser(bearerToken(req));
      if (!user) return res.status(401).json({ error: 'unauthorized' });
      // Tek alanlı eşitlik sorgusu bileşik indeks gerektirmez; sıralama bellekte.
      const snap = await col.where('userId', '==', user.id).limit(100).get();
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 50)
        .map((x) => ({
          id: x.id,
          type: TYPES.includes(x.type) ? x.type : 'diger',
          area: AREAS.includes(x.area) ? x.area : 'genel',
          title: x.title || '',
          status: STATUSES.includes(x.status) ? x.status : 'yeni',
          reply: x.reply || '',
          createdAt: x.createdAt || 0,
          updatedAt: x.updatedAt || x.createdAt || 0,
        }));
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ items });
    }

    // ── Yeni öneri ──
    if (req.method === 'POST') {
      const { body, error } = readBody(req);
      if (error) return res.status(error === 'too_large' ? 413 : 400).json({ error });
      if (body.website) return res.status(201).json({ ok: true });   // honeypot

      const type    = TYPES.includes(body.type) ? body.type : '';
      const area    = AREAS.includes(body.area) ? body.area : 'genel';
      const title   = plainText(body.title, 120);
      const message = plainText(body.message, 4000);
      if (!type)               return res.status(400).json({ error: 'invalid_type' });
      if (title.length < 5)    return res.status(400).json({ error: 'invalid_title' });
      if (message.length < 10) return res.status(400).json({ error: 'invalid_message' });

      const token = bearerToken(req);
      let user = null;
      if (token) {
        user = await verifyQrtimUser(token);
        if (!user) return res.status(401).json({ error: 'unauthorized' });
      }

      const rlKey = user ? 'u_' + hashKey(rateSalt(), user.id) : 'ip_' + hashKey(rateSalt(), clientIp(req) || 'yok');
      if (await rateLimited(RL_COLLECTION, rlKey, user ? RL_USER_PER_HOUR : RL_ANON_PER_HOUR)) {
        res.setHeader('Retry-After', '3600');
        return res.status(429).json({ error: 'rate_limited' });
      }

      const contactOk = !!(user && body.contactOk === true);
      const now = Date.now();
      const ref = await col.add({
        type, area, title, message,
        status: 'yeni',
        source: 'app',
        userId: user ? user.id : null,
        displayName: user ? user.displayName : '',
        contactOk,
        email: contactOk ? user.email : '',
        diag: diagOf(body.diag),
        reply: '',
        createdAt: now,
        updatedAt: now,
      });
      return res.status(201).json({ ok: true, id: ref.id });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[feedback] hata:', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
};

module.exports.TYPES = TYPES;
module.exports.AREAS = AREAS;
module.exports.STATUSES = STATUSES;
