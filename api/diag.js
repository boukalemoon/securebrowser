/**
 * İlgezdi — Tanılama / hata raporu toplama (Vercel serverless, Node).
 *
 * POST /api/diag   ← masaüstü uygulamasından gelen kimliksiz hata raporu
 *
 * TASARIM NOTLARI
 *
 * 1) TEKİLLEŞTİRME ÖNCE GELİR. Bir çökme döngüsü saniyede onlarca rapor
 *    üretebilir. Her rapor ayrı doküman olsaydı tek bozuk kurulum Firestore
 *    kotasını ve faturayı patlatırdı. Bu yüzden doküman kimliği BELİRLEYİCİDİR:
 *        sha256(installId + gün + reason + hata imzası)
 *    Aynı hata aynı dokümana düşer ve `count` artar. 500 çökme = 1 doküman.
 *
 * 2) SUNUCU DA TEMİZLER. İstemci kimliksizleştiriyor (diagnostics.js), ama
 *    istemciye güvenilmez: kurcalanmış ya da eski bir sürüm ham veri
 *    gönderebilir. Burada alan alan beyaz liste uygulanır ve boy sınırlanır.
 *
 * 3) KİMLİK YOK. IP saklanmaz (analitikten farklı olarak — burada coğrafi
 *    kırılıma ihtiyaç yok ve hata raporu kişiye bağlanmamalı). Yalnızca
 *    kurulumun kendi ürettiği, sıfırlanabilir installId tutulur.
 *
 * Gerekli ortam değişkeni: FIREBASE_SERVICE_ACCOUNT
 */

'use strict';

const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const DATABASE_ID = 'ai-studio-01b23ae1-726c-4e78-8f1b-3f0cefc7a2eb';
const COLLECTION  = 'ilgezdi_diagnostics';

const MAX_BODY_BYTES  = 256 * 1024;  // 256 KB
const MAX_BREADCRUMBS = 120;
const MAX_MSG         = 500;

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

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const bool = (v) => v === true;

/** İstemciden gelen zarfı beyaz listeyle yeniden inşa et. */
function cleanEnv(e) {
  e = e || {};
  return {
    version:    str(e.version, 24),
    installId:  str(e.installId, 64),
    platform:   str(e.platform, 16),
    arch:       str(e.arch, 16),
    osRelease:  str(e.osRelease, 40),
    electron:   str(e.electron, 24),
    chrome:     str(e.chrome, 24),
    node:       str(e.node, 24),
    locale:     str(e.locale, 16),
    packaged:   bool(e.packaged),
    uptimeSec:  num(e.uptimeSec),
    totalMemMb: num(e.totalMemMb),
    freeMemMb:  num(e.freeMemMb),
    counters: {
      error: num(e.counters && e.counters.error),
      warn:  num(e.counters && e.counters.warn),
      fatal: num(e.counters && e.counters.fatal),
      crash: num(e.counters && e.counters.crash),
    },
  };
}

function cleanFeatures(f) {
  f = f || {};
  return {
    vpnEnabled:     bool(f.vpnEnabled),
    blockLevel:     str(f.blockLevel, 12),
    whitelistCount: num(f.whitelistCount),
    httpsOnly:      bool(f.httpsOnly),
    doNotTrack:     bool(f.doNotTrack),
    logEnabled:     bool(f.logEnabled),
    theme:          str(f.theme, 16),
    searchEngine:   str(f.searchEngine, 16),
    hasHomepage:    bool(f.hasHomepage),
  };
}

const ALLOWED_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);

function cleanBreadcrumbs(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-MAX_BREADCRUMBS).map((b) => {
    b = b || {};
    const out = {
      ts:    str(b.ts, 32),
      level: ALLOWED_LEVELS.has(b.level) ? b.level : 'info',
      cat:   str(b.cat, 24),
      msg:   str(b.msg, MAX_MSG),
    };
    if (b.data && typeof b.data === 'object') {
      const d = {};
      let n = 0;
      for (const [k, v] of Object.entries(b.data)) {
        if (n++ >= 12) break;
        d[str(k, 24)] = typeof v === 'number' || typeof v === 'boolean' ? v : str(v, 400);
      }
      out.data = d;
    }
    return out;
  });
}

/**
 * Hata imzası: aynı hatayı aynı dokümana toplamak için. Yığın izindeki
 * satır/kolon numaraları sürüm arasında kayabildiği için yalnızca en anlamlı
 * hata mesajı + kategori kullanılır.
 */
function errorSignature(breadcrumbs, reason) {
  const worst = [...breadcrumbs].reverse().find((b) => b.level === 'fatal' || b.level === 'error');
  if (!worst) return reason;
  return worst.cat + '|' + worst.msg.slice(0, 160);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) return res.status(413).json({ error: 'too_large' });
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_json' }); }
    }
    body = body || {};

    const env = cleanEnv(body.env);
    if (!env.installId || !env.version) return res.status(400).json({ error: 'invalid_envelope' });

    const reason      = str(body.reason, 40) || 'unknown';
    const breadcrumbs = cleanBreadcrumbs(body.breadcrumbs);
    const userNote    = str(body.userNote, 1000);
    const day         = new Date().toISOString().slice(0, 10);
    const signature   = errorSignature(breadcrumbs, reason);

    // Belirleyici kimlik → aynı hata tek dokümanda toplanır.
    const docId = crypto.createHash('sha256')
      .update(env.installId + '|' + day + '|' + reason + '|' + signature)
      .digest('hex')
      .slice(0, 40);

    const ref = db().collection(COLLECTION).doc(docId);

    const payload = {
      day,
      reason,
      signature,
      version:   env.version,
      platform:  env.platform,
      installId: env.installId,
      env,
      features:  cleanFeatures(body.features),
      breadcrumbs,                          // en son gönderimin izleri
      ...(userNote ? { userNote } : {}),
      lastSeen:  FieldValue.serverTimestamp(),
    };

    // firstSeen YALNIZCA oluşturmada yazılmalı. `set(..., {merge:true})` ile
    // yazılsaydı her tekrarda güncellenir ve lastSeen'in kopyasına dönüşürdü.
    // Bu yüzden önce create(), varsa update().
    try {
      await ref.create({ ...payload, count: 1, status: 'new', firstSeen: FieldValue.serverTimestamp() });
    } catch (err) {
      // ALREADY_EXISTS (gRPC kodu 6) → aynı hata tekrar geldi
      if (err && (err.code === 6 || /already exists/i.test(String(err.message)))) {
        await ref.update({ ...payload, count: FieldValue.increment(1) });
      } else {
        throw err;
      }
    }

    return res.status(202).json({ ok: true });
  } catch (e) {
    // İç hata mesajını istemciye SIZDIRMA (api/reviews.js'teki hatayı tekrarlamayalım).
    console.error('[diag] hata:', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
};
