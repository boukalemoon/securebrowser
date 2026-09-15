#!/usr/bin/env node
/**
 * İlgezdi — USOM zararlı bağlantı listesini derleyip siteyle birlikte yayınlar.
 *
 * NEDEN BURADA: USOM (T.C. Siber Güvenlik Başkanlığı) listesi 1 Haziran 2026'dan
 * beri yalnızca sayfalı bir JSON API'den alınabiliyor (~490 bin kayıt, 50 sayfa).
 * Her kullanıcının bunu kendisinin çekmesi hem yavaş hem de USOM'a gereksiz yük.
 * Liste İlgezdi sunucusunda tek dosyaya derlenir; masaüstü uygulaması yalnızca
 * bu dosyayı indirir ve eşleşmeyi yine cihazda yapar (adres kimseye gitmez).
 *
 * NASIL ÇALIŞIR
 *   • Vercel derlemesinde çalışır (vercel.json → buildCommand). Her dağıtımda ve
 *     günlük cron'un (api/cron/threat-lists.js) tetiklediği dağıtımda liste tazelenir.
 *   • Çıktı: site/lists/usom.txt.gz (satır başına bir alan adı / adres / IP) ve
 *     site/lists/usom.json (kayıt sayısı, zaman, SHA-256).
 *   • Dosyada zaman damgası yok; içerik aynıysa baytlar da aynı kalır (ETag
 *     değişmez, istemciler boşuna yeniden indirmez).
 *
 * GÜVENLİ DÜŞÜŞ: USOM'a ulaşılamazsa, sayfalar eksik gelirse ya da yeni liste
 * canlıdakinin yarısından küçükse canlı sitedeki mevcut dosya aynen korunur.
 * Bu betik site dağıtımını hiçbir koşulda başarısız yapmaz (çıkış kodu 0).
 *
 * Yerel deneme: THREAT_LISTS_OUT_DIR=<klasör> node scripts/build-threat-lists.js
 * (2026-09-15: 492.615 kayıt, 3,08 MB gz, 72 sn)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const API = 'https://siberguvenlik.gov.tr/api/address/index';
const PER_PAGE = 9999;                 // API üst sınırı
const CONCURRENCY = 4;                 // USOM'u yormadan ~1-2 dk
const PAGE_TIMEOUT_MS = 120 * 1000;
const RETRIES = 3;
const MIN_COVERAGE = 0.95;             // toplanan / totalCount
const MIN_KEEP_RATIO = 0.5;            // yeni / canlı
const MAX_ENTRY_LENGTH = 2048;
const USER_AGENT = 'IlgezdiListBuilder/1.0 (+https://www.ilgezdi.com.tr)';
const LIVE_BASE = process.env.THREAT_LISTS_LIVE_BASE || 'https://www.ilgezdi.com.tr/lists';
const OUT_DIR = process.env.THREAT_LISTS_OUT_DIR || path.join(__dirname, '..', 'site', 'lists');

const log = (...a) => console.log('[tehdit-listesi]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await sleep(3000 * attempt);
    }
  }
  throw lastErr;
}

// Sayfa numarası 1'den başlar (0 ve 1 aynı sayfayı döndürür). Kayıtlar yeniden
// eskiye sıralı; çekim sırasında eklenen kayıtlar yalnızca tekrara yol açar,
// kayıp oluşturmaz (tekrarlar aşağıda atılır).
async function fetchAllModels() {
  const first = await fetchJson(`${API}?per-page=${PER_PAGE}&page=1`);
  const pageCount = Number(first.pageCount) || 0;
  const totalCount = Number(first.totalCount) || 0;
  if (!Array.isArray(first.models) || pageCount < 1 || totalCount < 1) throw new Error('beklenmeyen yanıt biçimi');
  const pages = new Array(pageCount);
  pages[0] = first.models;
  let next = 2;
  async function worker() {
    while (next <= pageCount) {
      const p = next++;
      const j = await fetchJson(`${API}?per-page=${PER_PAGE}&page=${p}`);
      if (!Array.isArray(j.models)) throw new Error('sayfa ' + p + ' biçimi bozuk');
      pages[p - 1] = j.models;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pageCount) }, worker));
  return { totalCount, pageCount, models: pages.flat() };
}

/**
 * USOM kaydı → liste satırı (geçersizse null). Alan adı ve IPv4 olduğu gibi,
 * IPv6 köşeli parantezle (masaüstü ayrıştırıcısı adres olarak okuyabilsin), adres
 * şemasız olabilir. IPv6 ağ blokları (ip6net) tek tek eşleştirilemediği için alınmaz.
 */
function toLine(m) {
  const type = String((m && m.type) || '');
  if (!['domain', 'url', 'ip', 'ip6'].includes(type)) return null;
  let s = String(m.url || '').trim();
  if (!s || s.length > MAX_ENTRY_LENGTH || /\s/.test(s) || /[\x00-\x1f\x7f]/.test(s)) return null;
  if (type !== 'url') s = s.toLowerCase().replace(/\.$/, '');
  if (type === 'ip6') return /^\[?[0-9a-f:.]+\]?$/.test(s) ? (s.startsWith('[') ? s : '[' + s + ']') : null;
  if (type === 'domain' && !/^[a-z0-9._-]+\.[a-z0-9-]{2,}$/.test(s)) return null;
  return s;
}

async function fetchLive(name) {
  try {
    const res = await fetch(`${LIVE_BASE}/${name}`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function keepLive(reason) {
  log('USOM listesi güncellenmedi:', reason);
  const [gz, meta] = await Promise.all([fetchLive('usom.txt.gz'), fetchLive('usom.json')]);
  if (gz && meta && gz[0] === 0x1f && gz[1] === 0x8b) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'usom.txt.gz'), gz);
    fs.writeFileSync(path.join(OUT_DIR, 'usom.json'), meta);
    log('canlı sitedeki mevcut liste korundu');
  } else {
    log('UYARI: canlı sitede de liste yok; bu dağıtımda USOM listesi yayınlanmayacak');
  }
}

async function main() {
  const t0 = Date.now();
  let result;
  try {
    result = await fetchAllModels();
  } catch (e) {
    return keepLive('USOM API hatası: ' + ((e && e.message) || e));
  }
  const { totalCount, pageCount, models } = result;
  if (models.length < totalCount * MIN_COVERAGE) {
    return keepLive(`eksik sayfalama (${models.length} / ${totalCount})`);
  }
  const lines = [...new Set(models.map(toLine).filter(Boolean))].sort();
  let liveCount = 0;
  const liveMeta = await fetchLive('usom.json');
  try { liveCount = liveMeta ? Number(JSON.parse(liveMeta.toString('utf8')).count) || 0 : 0; } catch {}
  if (liveCount && lines.length < liveCount * MIN_KEEP_RATIO) {
    return keepLive(`yeni liste beklenenden küçük (${lines.length} / canlı ${liveCount})`);
  }

  const text = [
    '# İlgezdi — USOM zararlı bağlantılar listesi',
    '# Kaynak: T.C. Siber Güvenlik Başkanlığı (USOM), https://www.usom.gov.tr',
    '# Biçim: satır başına bir alan adı, adres ya da IP. Eşleşme İlgezdi uygulamasında cihazda yapılır.',
    ...lines,
    '',
  ].join('\n');
  const gz = zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
  const meta = {
    source: 'usom',
    count: lines.length,
    usomTotal: totalCount,
    pages: pageCount,
    generatedAt: new Date().toISOString(),
    bytes: gz.length,
    sha256: crypto.createHash('sha256').update(gz).digest('hex'),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'usom.txt.gz'), gz);
  fs.writeFileSync(path.join(OUT_DIR, 'usom.json'), JSON.stringify(meta, null, 2) + '\n');
  log(`USOM: ${lines.length} kayıt (${totalCount} ham), ${(gz.length / 1048576).toFixed(2)} MB gz, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
}

if (require.main === module) {
  main().catch((e) => {
    // Beklenmeyen hata da site dağıtımını durdurmaz.
    log('beklenmeyen hata:', (e && e.stack) || e);
  }).finally(() => { process.exitCode = 0; });
}

module.exports = { toLine, MIN_KEEP_RATIO, MIN_COVERAGE };
