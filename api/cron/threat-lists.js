/**
 * İlgezdi — Günlük tehdit listesi tazeleme (Vercel Cron, Node).
 *
 * GET /api/cron/threat-lists  ← yalnızca Vercel Cron (Authorization: Bearer CRON_SECRET)
 *
 * USOM listesi site derlemesinde üretilir (scripts/build-threat-lists.js). Hobby
 * planında cron günde bir çalışır; bu uç yeni bir üretim dağıtımı başlatan derleme
 * kancasını (Deploy Hook) çağırır, derleme listeyi USOM'dan yeniden toplar.
 * Böylece dosya depolama (Blob) gerekmez ve liste sitenin CDN'inden dağıtılır.
 *
 * Gerekli ortam değişkenleri: CRON_SECRET, THREAT_LISTS_DEPLOY_HOOK
 */

'use strict';

const crypto = require('crypto');

function authorized(header, secret) {
  if (!secret) return false;
  const a = Buffer.from(String(header || ''));
  const b = Buffer.from('Bearer ' + secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ ok: false });
  }
  const hook = process.env.THREAT_LISTS_DEPLOY_HOOK || '';
  if (!/^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/[\w-]+\/[\w-]+$/.test(hook)) {
    // Kanca adresi gizlidir; yanıta ve günlüğe yazılmaz.
    console.error('[cron/threat-lists] THREAT_LISTS_DEPLOY_HOOK tanımlı değil ya da biçimi geçersiz');
    return res.status(500).json({ ok: false, error: 'yapılandırma eksik' });
  }
  try {
    const r = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(20000) });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status });
  } catch (e) {
    console.error('[cron/threat-lists] derleme kancası çağrılamadı:', e && e.name);
    return res.status(502).json({ ok: false });
  }
};
