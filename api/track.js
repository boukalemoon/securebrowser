/**
 * İlgezdi web sitesi — Analitik olay toplama (Vercel serverless, Node).
 *
 * POST /api/track  → { type: 'pageview'|'click', vid, area?, path?, ref? }
 * Olaylar Nexus'un Firestore veritabanına (ilgezdi_events) Firebase Admin ile
 * yazılır. Nexus → Pazarlama → İlgezdi paneli bunları görselleştirir.
 */

'use strict';

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const DATABASE_ID = 'ai-studio-01b23ae1-726c-4e78-8f1b-3f0cefc7a2eb';

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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).end(); }
    }
    body = body || {};

    const type = body.type === 'click' ? 'click' : body.type === 'pageview' ? 'pageview' : null;
    if (!type) return res.status(400).end();

    const now = new Date();
    await db().collection('ilgezdi_events').add({
      type,
      vid:  String(body.vid  || 'anon').slice(0, 64),
      area: String(body.area || '').slice(0, 60),
      path: String(body.path || '').slice(0, 200),
      ref:  String(body.ref  || '').slice(0, 200),
      ts:   Date.now(),
      day:  now.toISOString().slice(0, 10),
    });
    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
};
