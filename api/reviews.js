/**
 * İlgezdi web sitesi — Yorum API'si (Vercel serverless, Node).
 *
 * GET  /api/reviews  → onaylanmış yorumlar + özet (sayı, ort. puan)
 * POST /api/reviews  → yeni yorum (status: 'pending') — moderasyon Nexus CRM'de
 *
 * Yorumlar Nexus'un Firestore veritabanında (ilgezdi_reviews) tutulur.
 * Buraya erişim yalnızca Firebase Admin SDK ile (service account) yapılır;
 * public'in Firestore'a doğrudan erişimi yoktur (kurallar owner-only).
 *
 * Gerekli ortam değişkeni (Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT = <service account JSON'unun tamamı>
 */

'use strict';

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const DATABASE_ID = 'ai-studio-01b23ae1-726c-4e78-8f1b-3f0cefc7a2eb';
const COLLECTION  = 'ilgezdi_reviews';

let _db = null;
function db() {
  if (_db) return _db;
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT tanımlı değil');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  _db = getFirestore(DATABASE_ID);
  return _db;
}

module.exports = async (req, res) => {
  try {
    const col = db().collection(COLLECTION);

    // ── Onaylı yorumları listele + özet ──
    if (req.method === 'GET') {
      const snap = await col.where('status', '==', 'approved').get();
      const items = snap.docs
        .map((d) => {
          const x = d.data();
          return {
            name: x.name, rating: x.rating || null,
            comment: x.comment, createdAt: x.createdAt || 0,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 60);
      const ratings = items.map((i) => i.rating).filter((r) => r >= 1 && r <= 5);
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({ items, count: items.length, avgRating: avg });
    }

    // ── Yeni yorum (pending) ──
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_json' }); }
      }
      body = body || {};

      // Honeypot: gizli 'website' alanı botlar tarafından doldurulur → sessizce yut
      if (body.website) return res.status(201).json({ ok: true });

      const name = String(body.name || '').trim();
      const comment = String(body.comment || '').trim();
      let rating = body.rating != null ? parseInt(body.rating, 10) : null;
      if (!(rating >= 1 && rating <= 5)) rating = null;

      if (name.length < 1 || name.length > 60)     return res.status(400).json({ error: 'invalid_name' });
      if (comment.length < 3 || comment.length > 1000) return res.status(400).json({ error: 'invalid_comment' });

      await col.add({ name, comment, rating, status: 'pending', createdAt: Date.now() });
      return res.status(201).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e.message || e) });
  }
};
