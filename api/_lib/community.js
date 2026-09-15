/**
 * İlgezdi web sitesi — topluluk API'leri (yorumlar, öneriler) için ortak yardımcılar.
 *
 * Alt çizgiyle başlayan klasör Vercel'de ayrı bir sunucu fonksiyonu olarak yayınlanmaz.
 *
 * Veri Nexus'un Firestore veritabanında; erişim yalnızca Firebase Admin SDK ile
 * (service account). Public'in Firestore'a doğrudan erişimi yoktur (kurallar owner-only).
 *
 * Qrtım hesabı Supabase Auth'ta. Uygulamadan gelen erişim anahtarı burada Qrtım'ın
 * /auth/v1/user uç noktasına sorularak doğrulanır; anahtarın kendisi saklanmaz.
 * Anon anahtar uygulamada zaten açıktır (herkese açık proje anahtarı): yetki vermez,
 * yalnızca projeyi tanıtır.
 *
 * Ortam değişkenleri (Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT = <service account JSON'unun tamamı>
 *   RATE_LIMIT_SALT          = <rastgele uzun metin>  (isteğe bağlı ama önerilir)
 *   QRTIM_SUPABASE_URL / QRTIM_SUPABASE_ANON_KEY  (isteğe bağlı; varsayılan Qrtım projesi)
 */

'use strict';

const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const DATABASE_ID = 'ai-studio-01b23ae1-726c-4e78-8f1b-3f0cefc7a2eb';
const QRTIM_URL = process.env.QRTIM_SUPABASE_URL || 'https://kfpnsxoxfrxepxezatsr.supabase.co';
const QRTIM_ANON_KEY = process.env.QRTIM_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcG5zeG94ZnJ4ZXB4ZXphdHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MjQ0NDUsImV4cCI6MjA4NTIwMDQ0NX0.HN7nKw5gO1cuN9fSmrRO72cgIgqNSUfLsY2L3FOhHDg';
const VERIFY_TIMEOUT_MS = 6000;

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

function clientIp(req) {
  const h = req.headers || {};
  return String(h['x-forwarded-for'] || h['x-real-ip'] || h['x-vercel-forwarded-for'] || '')
    .split(',')[0].trim();
}

// HTML etiketlerini ve kontrol karakterlerini sök: metinler sitede ve Nexus'ta
// gösteriliyor. Gösterim tarafı da kaçışlamalı; bu, ikinci savunma hattı.
function plainText(s, max) {
  return String(s == null ? '' : s).replace(/[<>]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max);
}

function hashKey(salt, value) {
  return crypto.createHash('sha256').update(String(salt) + '|' + String(value)).digest('hex').slice(0, 32);
}

function rateSalt() {
  return process.env.RATE_LIMIT_SALT || 'ilgezdi-reviews';
}

/** true → saatlik sınır aşıldı. Sayaç dokümanı saatlik anahtarla tutulur. */
async function rateLimited(collectionName, key, maxPerHour) {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const ref = db().collection(collectionName).doc(key + '_' + hour.replace(/[^0-9]/g, ''));
  return db().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const count = snap.exists ? Number(snap.data().count) || 0 : 0;
    if (count >= maxPerHour) return true;
    t.set(ref, {
      count: count + 1,
      hour,
      // Firestore TTL politikası bu alana bağlanırsa eski sayaçlar otomatik silinir.
      expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return false;
  });
}

function bearerToken(req) {
  const m = String((req.headers || {}).authorization || '').match(/^Bearer ([A-Za-z0-9._-]{20,4096})$/);
  return m ? m[1] : '';
}

/** Qrtım erişim anahtarını doğrular → { id, email, displayName } ya da null. */
async function verifyQrtimUser(token) {
  if (!token) return null;
  try {
    const r = await fetch(QRTIM_URL + '/auth/v1/user', {
      headers: { apikey: QRTIM_ANON_KEY, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || typeof u.id !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(u.id)) return null;
    return {
      id: u.id,
      email: typeof u.email === 'string' ? u.email.slice(0, 200) : '',
      displayName: plainText(u.user_metadata && u.user_metadata.display_name, 60),
    };
  } catch {
    return null;
  }
}

/** İstek gövdesi: { body } ya da { error }. */
function readBody(req, maxBytes = 32 * 1024) {
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > maxBytes) return { error: 'too_large' };
    try { body = JSON.parse(body); } catch { return { error: 'invalid_json' }; }
  }
  return { body: body && typeof body === 'object' ? body : {} };
}

module.exports = {
  db, clientIp, plainText, hashKey, rateSalt, rateLimited, bearerToken, verifyQrtimUser, readBody,
  DATABASE_ID, QRTIM_URL,
};
