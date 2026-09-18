/**
 * İlgezdi — Onay kayıtları (Veri ve Gizlilik).
 *
 * Kullanıcının bir veri iznini ne zaman, nereden, hangi sürümde ve hangi cihazda açıp
 * kapattığını kaydeder. Amaç ispat: kullanıcı "kapatmıştım, açılmış" dediğinde de,
 * "iznim olmadan açıldı" dediğinde de kayıt kararı gösterir.
 *
 * Biçim: userData/consent-log.jsonl — her satır bir kayıt. Her kayıt bir öncekinin
 * özetini (prev) taşır ve kendi özeti (hash) bu alanlarla birlikte hesaplanır; aradan
 * bir satır silinir ya da değiştirilirse zincir kopar ve doğrulama bunu gösterir.
 *
 * Kayıtta kişisel veri yoktur: yalnızca ayarın kimliği, eski ve yeni değer, kaynak,
 * sürüm ve bu kuruluma özgü rastgele bir cihaz kimliği. Kayıtlar "Ayarları sıfırla" ya da
 * "kapatınca geçmişi sil" ile silinmez.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FORMAT = 1;
const GENESIS = '0'.repeat(64);
const SOURCES = Object.freeze(['data-center', 'settings', 'sync', 'reset', 'first-run', 'diag-dialog', 'ulgen', 'migration']);

// Anahtar sırası sabit JSON: aynı kayıt her zaman aynı özeti verir.
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

function entryHash(entry) {
  const { hash, ...rest } = entry;
  return crypto.createHash('sha256').update(stableStringify(rest)).digest('hex');
}

function normalizeSource(s) { return SOURCES.includes(s) ? s : 'settings'; }

/** Satırları okur ve zinciri doğrular. Bozuk satır ilk kopukluk olarak raporlanır. */
function verifyLines(lines) {
  let prev = GENESIS;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { return { ok: false, count, brokenAt: i }; }
    if (!e || e.seq !== i || e.prev !== prev || entryHash(e) !== e.hash) return { ok: false, count, brokenAt: i };
    prev = e.hash;
    count++;
  }
  return { ok: true, count, brokenAt: null, head: prev };
}

function createConsentLog({ userDataPath, appVersion }) {
  const file = path.join(userDataPath, 'consent-log.jsonl');
  const deviceFile = path.join(userDataPath, 'consent-device.json');

  function readLines() {
    try { return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()); } catch { return []; }
  }

  let device = null;
  function deviceId() {
    if (device) return device;
    try {
      const d = JSON.parse(fs.readFileSync(deviceFile, 'utf8'));
      if (d && /^[0-9a-f]{32}$/.test(d.id)) return (device = d.id);
    } catch {}
    device = crypto.randomBytes(16).toString('hex');
    try { fs.mkdirSync(userDataPath, { recursive: true }); fs.writeFileSync(deviceFile, JSON.stringify({ id: device })); } catch {}
    return device;
  }

  // Zincirin ucu bellekte tutulur; dosya yalnızca açılışta bir kez okunur.
  let head = null;
  function tip() {
    if (head) return head;
    const lines = readLines();
    let prev = GENESIS;
    let seq = 0;
    if (lines.length) {
      try { const last = JSON.parse(lines[lines.length - 1]); prev = last.hash || GENESIS; } catch {}
      seq = lines.length;
    }
    head = { prev, seq };
    return head;
  }

  function append(fields) {
    const t = tip();
    const entry = {
      v: FORMAT,
      seq: t.seq,
      at: new Date().toISOString(),
      app: String(appVersion || ''),
      device: deviceId(),
      ...fields,
      prev: t.prev,
    };
    entry.hash = entryHash(entry);
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    head = { prev: entry.hash, seq: t.seq + 1 };
    return entry;
  }

  /** Değişiklikleri yazar: changes = [{ id, from, to }]. */
  function recordChanges(changes, source) {
    const out = [];
    for (const c of changes || []) {
      if (!c || typeof c.id !== 'string') continue;
      out.push(append({ type: 'change', id: c.id, from: c.from, to: c.to, source: normalizeSource(source) }));
    }
    return out;
  }

  /** Kayıt boşsa başlangıç durumunu bir kez yazar (varsayılanların ispatı). */
  function ensureBaseline(values, source = 'first-run') {
    if (tip().seq > 0) return null;
    return append({ type: 'baseline', values: { ...values }, source: normalizeSource(source) });
  }

  /** En yeni kayıtlar önce. before: bu sıra numarasından eskiler. */
  function list({ limit = 30, before = null } = {}) {
    const lines = readLines();
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      let e;
      try { e = JSON.parse(lines[i]); } catch { continue; }
      if (before !== null && !(e.seq < before)) continue;
      out.push(e);
    }
    return { entries: out, total: lines.length };
  }

  function verify() { return verifyLines(readLines()); }

  function exportData() {
    const lines = readLines();
    const entries = [];
    for (const l of lines) { try { entries.push(JSON.parse(l)); } catch { entries.push({ unreadable: l.slice(0, 200) }); } }
    return { format: 'ilgezdi-consent-log', version: FORMAT, exportedAt: new Date().toISOString(), device: deviceId(), app: String(appVersion || ''), verify: verifyLines(lines), entries };
  }

  return { recordChanges, ensureBaseline, list, verify, exportData, deviceId, file };
}

module.exports = { createConsentLog, verifyLines, entryHash, stableStringify, GENESIS, SOURCES };
