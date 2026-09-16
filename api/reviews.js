/**
 * İlgezdi web sitesi — Yorum API'si (Vercel serverless, Node).
 *
 * GET  /api/reviews  → onaylanmış yorumlar + özet (sayı, ort. puan)
 *      Authorization: Bearer <QRtım erişim anahtarı> ile ayrıca { mine }: kişinin
 *      uygulamadan yazdığı yorum ve onay durumu (önbelleğe alınmaz).
 * POST /api/reviews  → yeni yorum (status: 'pending') — moderasyon Nexus CRM'de
 *      • Web sitesi formu: anonim; IP başına saatlik sınır (değişmedi).
 *      • İlgezdi uygulaması (Keşfet): QRtım hesabı ZORUNLU, anahtar sunucuda doğrulanır.
 *        Hesap başına tek yorum: yeniden gönderilen yorum öncekinin yerine geçer ve
 *        yayındaysa bile yeniden onaya düşer. Nexus'ta "Uygulama · QRtım" olarak görünür.
 *
 * Yorumlar Nexus'un Firestore veritabanında (ilgezdi_reviews) tutulur; ortak
 * yardımcılar ve ortam değişkenleri için bkz. api/_lib/community.js.
 *
 * Denetim düzeltmeleri (O-14):
 *   • Hata yanıtı iç hata mesajını (`detail`) halka açık döndürüyordu — kaldırıldı.
 *   • GET tüm onaylı yorumları çekip bellekte 60'a kırpıyordu; koleksiyon
 *     büyüdükçe okuma maliyeti doğrusal artıyordu. İndeksli sorgu + limit.
 *   • POST'ta honeypot dışında koruma yoktu: her istek Firestore'a yazıyordu
 *     (spam + fatura). IP başına saatlik sınır eklendi; IP'nin kendisi değil
 *     tuzlanmış özeti saklanır.
 */

'use strict';

const {
  db, clientIp, plainText, hashKey, rateSalt, rateLimited, bearerToken, verifyQrtimUser, readBody,
} = require('./_lib/community');

const COLLECTION    = 'ilgezdi_reviews';
const RL_COLLECTION = 'ilgezdi_review_ratelimit';
const RL_MAX_PER_HOUR     = 3;   // site formu, IP başına
const RL_APP_MAX_PER_HOUR = 6;   // uygulama, hesap başına (düzenlemeler dahil)
const STATUSES = ['pending', 'approved', 'rejected'];

// Uygulama yorumlarının belge kimliği hesaptan türetilir (tek yorum); kimliğin kendisi görünmez.
const appDocId = (userId) => 'app_' + hashKey('ilgezdi-review-user', userId).slice(0, 24);

async function loadApproved(col) {
  try {
    // Bileşik indeks gerekir: status (==) + createdAt (desc).
    const snap = await col.where('status', '==', 'approved').orderBy('createdAt', 'desc').limit(60).get();
    return snap.docs.map((d) => d.data());
  } catch (e) {
    // FAILED_PRECONDITION (9): indeks henüz oluşturulmamış. Siteyi bozmamak için
    // eski (indekssiz) yola düş; Firestore hata mesajı indeks oluşturma bağlantısını
    // içerir — Vercel günlüğünden tek tıkla kurulabilir.
    if (e && e.code === 9) {
      console.warn('[reviews] Bileşik indeks eksik, indekssiz sorguya düşülüyor:', e.message);
      const snap = await col.where('status', '==', 'approved').get();
      return snap.docs.map((d) => d.data())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 60);
    }
    throw e;
  }
}

function parseRating(v) {
  const n = v != null ? parseInt(v, 10) : NaN;
  return n >= 1 && n <= 5 ? n : null;
}

module.exports = async (req, res) => {
  try {
    const col = db().collection(COLLECTION);

    // ── Onaylı yorumları listele + özet (+ oturumla: kişinin kendi yorumu) ──
    if (req.method === 'GET') {
      const items = (await loadApproved(col)).map((x) => ({
        name: x.name, rating: x.rating || null,
        comment: x.comment, createdAt: x.createdAt || 0,
        verified: x.source === 'app',
      }));
      const ratings = items.map((i) => i.rating).filter((r) => r >= 1 && r <= 5);
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

      const token = bearerToken(req);
      if (token) {
        const user = await verifyQrtimUser(token);
        if (!user) return res.status(401).json({ error: 'unauthorized' });
        const snap = await col.doc(appDocId(user.id)).get();
        const m = snap.exists ? snap.data() : null;
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).json({
          items, count: items.length, avgRating: avg,
          displayName: user.displayName,
          mine: m ? {
            name: m.name, rating: m.rating || null, comment: m.comment,
            status: STATUSES.includes(m.status) ? m.status : 'pending',
            updatedAt: m.updatedAt || m.createdAt || 0,
          } : null,
        });
      }

      // Kısa cache: Nexus'ta onaylanan yorum sitede hızlı yayınlansın.
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
      return res.status(200).json({ items, count: items.length, avgRating: avg });
    }

    // ── Yeni yorum (pending) ──
    if (req.method === 'POST') {
      const { body, error } = readBody(req, 16 * 1024);
      if (error) return res.status(error === 'too_large' ? 413 : 400).json({ error });

      // Honeypot: gizli 'website' alanı botlar tarafından doldurulur → sessizce yut
      if (body.website) return res.status(201).json({ ok: true });

      const name    = plainText(body.name, 60);
      const comment = plainText(body.comment, 1000);
      const rating  = parseRating(body.rating);
      const token   = bearerToken(req);

      // Uygulamadan gelen yorum: QRtım hesabı zorunlu.
      if (token || body.source === 'app') {
        const user = await verifyQrtimUser(token);
        if (!user) return res.status(401).json({ error: 'unauthorized' });
        if (!rating) return res.status(400).json({ error: 'invalid_rating' });
        const shownName = name || user.displayName;
        if (shownName.length < 2) return res.status(400).json({ error: 'invalid_name' });
        if (comment.length < 10) return res.status(400).json({ error: 'invalid_comment' });

        if (await rateLimited(RL_COLLECTION, 'app_' + hashKey(rateSalt(), user.id), RL_APP_MAX_PER_HOUR)) {
          res.setHeader('Retry-After', '3600');
          return res.status(429).json({ error: 'rate_limited' });
        }

        const ref  = col.doc(appDocId(user.id));
        const prev = await ref.get();
        const now  = Date.now();
        await ref.set({
          name: shownName, comment, rating,
          status: 'pending',
          source: 'app',
          userId: user.id,
          email: user.email,           // yalnızca Nexus'ta (owner) görünür; sitede yayınlanmaz
          appVersion: plainText(body.appVersion, 20),
          edited: prev.exists,
          createdAt: prev.exists ? (prev.data().createdAt || now) : now,
          updatedAt: now,
        });
        return res.status(prev.exists ? 200 : 201).json({ ok: true, updated: prev.exists, status: 'pending' });
      }

      // Web sitesi formu (anonim)
      if (name.length < 1)    return res.status(400).json({ error: 'invalid_name' });
      if (comment.length < 3) return res.status(400).json({ error: 'invalid_comment' });

      const ip = clientIp(req);
      if (ip && await rateLimited(RL_COLLECTION, hashKey(rateSalt(), ip), RL_MAX_PER_HOUR)) {
        res.setHeader('Retry-After', '3600');
        return res.status(429).json({ error: 'rate_limited' });
      }

      await col.add({ name, comment, rating, status: 'pending', createdAt: Date.now() });
      return res.status(201).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    // İç hata ayrıntısı istemciye SIZDIRILMAZ; Vercel günlüğüne yazılır.
    console.error('[reviews] hata:', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
};

module.exports.appDocId = appDocId;
