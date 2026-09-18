/**
 * İlgezdi — Profiller.
 *
 * Her profil ayrı bir veri klasörüdür ve ayrı bir süreçte çalışır: yer imleri, geçmiş,
 * şifreler, çerezler, ayarlar, QRtım oturumu ve onay kayıtları profiller arasında
 * paylaşılmaz. Varsayılan profil eski kurulumlarla aynı klasördedir (veri taşınmaz).
 *
 *   <userData>/profiles.json            profil listesi (tüm profiller okur, yazar)
 *   <userData>/Profiles/<id>/           varsayılan dışındaki profillerin verisi
 *   <temp>/ilgezdi-gizli-<rastgele>/    gizli profil: her açılışta boş, kapanınca silinir
 *
 * Profil, uygulama `--profile=<id>` ile başlatılarak seçilir; veri klasörü uygulama hazır
 * olmadan ayarlandığı için tek örnek kilidi de profil başınadır.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ID = 'default';
const MAX_PROFILES = 10;
const NAME_MAX = 40;
const COLORS = Object.freeze(['gold', 'blue', 'green', 'red', 'purple', 'cyan', 'pink', 'grey']);
const COLOR_HEX = Object.freeze({
  gold: '#d4a85a', blue: '#5b8def', green: '#4caf7a', red: '#e0625b',
  purple: '#9b7cf0', cyan: '#3fb8c9', pink: '#e06fa8', grey: '#8a93a3',
});
const PRIVATE_PREFIX = 'ilgezdi-gizli-';
const ID_RE = /^[a-z0-9]{6,24}$/;

function normalizeName(n) {
  return String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
function normalizeColor(c) { return COLORS.includes(c) ? c : 'gold'; }

/** Diskteki liste: geçersiz kayıtlar atılır; varsayılan profil her zaman ilk sırada. */
function normalizeProfiles(list) {
  const out = [{ id: DEFAULT_ID, name: '', color: 'gold', private: false }];
  const src = Array.isArray(list) ? list : [];
  const def = src.find((p) => p && p.id === DEFAULT_ID);
  if (def) { out[0].name = normalizeName(def.name); out[0].color = normalizeColor(def.color); }
  const seen = new Set([DEFAULT_ID]);
  for (const p of src) {
    if (!p || typeof p.id !== 'string' || !ID_RE.test(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: normalizeName(p.name), color: normalizeColor(p.color), private: p.private === true });
    if (out.length >= MAX_PROFILES) break;
  }
  return out;
}

function readProfiles(baseDir) {
  try { return normalizeProfiles(JSON.parse(fs.readFileSync(path.join(baseDir, 'profiles.json'), 'utf8'))); }
  catch { return normalizeProfiles([]); }
}

function writeProfiles(baseDir, list) {
  const file = path.join(baseDir, 'profiles.json');
  fs.mkdirSync(baseDir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(normalizeProfiles(list), null, 2));
  fs.renameSync(tmp, file);
}

/** Yeni profil: { list, id } ya da { error: 'name' | 'full' }. */
function createProfile(list, { name, color, private: isPrivate } = {}, makeId = () => crypto.randomBytes(6).toString('hex')) {
  const current = normalizeProfiles(list);
  const clean = normalizeName(name);
  if (!clean) return { error: 'name' };
  if (current.length >= MAX_PROFILES) return { error: 'full' };
  let id;
  do { id = makeId(); } while (!ID_RE.test(id) || current.some((p) => p.id === id));
  return { list: current.concat({ id, name: clean, color: normalizeColor(color), private: isPrivate === true }), id };
}

function updateProfile(list, id, { name, color } = {}) {
  return normalizeProfiles(list).map((p) => {
    if (p.id !== id) return p;
    const next = { ...p };
    if (name !== undefined) { const n = normalizeName(name); if (n || p.id === DEFAULT_ID) next.name = n; }
    if (color !== undefined) next.color = normalizeColor(color);
    return next;
  });
}

function removeProfile(list, id) {
  if (id === DEFAULT_ID) return normalizeProfiles(list);
  return normalizeProfiles(list).filter((p) => p.id !== id);
}

function profileDir(baseDir, id) {
  return id === DEFAULT_ID ? baseDir : path.join(baseDir, 'Profiles', id);
}

/** Komut satırındaki --profile=<id>; yoksa, geçersizse ya da listede yoksa varsayılan. */
function profileIdFromArgv(argv) {
  for (const a of Array.isArray(argv) ? argv : []) {
    const m = /^--profile=([a-z0-9]+)$/.exec(String(a));
    if (m) return m[1];
  }
  return DEFAULT_ID;
}

/**
 * Bu süreç hangi profille çalışacak: { id, dir, private, profile }.
 * Gizli profilin klasörü her açılışta yeni ve boştur.
 */
function resolveProfile(argv, baseDir, tmpDir) {
  const list = readProfiles(baseDir);
  const wanted = profileIdFromArgv(argv);
  const profile = list.find((p) => p.id === wanted) || list[0];
  if (profile.private) {
    const dir = path.join(tmpDir, PRIVATE_PREFIX + crypto.randomBytes(8).toString('hex'));
    return { id: profile.id, dir, private: true, profile };
  }
  return { id: profile.id, dir: profileDir(baseDir, profile.id), private: false, profile };
}

// Gizli profil klasörüne sahibi sürecin kimliği yazılır: aynı anda açık başka bir gizli
// profilin klasörü temizlikte silinmez.
const PID_FILE = '.ilgezdi-pid';
function markPrivateDir(dir, pid) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PID_FILE), String(pid));
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; }
}

/** Kapanmış süreçlerden kalan gizli profil klasörlerini siler (bu süreçinki ve açık olanlar hariç). */
function cleanupPrivateDirs(tmpDir, keepDir, isAlive = pidAlive) {
  let removed = 0;
  try {
    for (const name of fs.readdirSync(tmpDir)) {
      if (!name.startsWith(PRIVATE_PREFIX) || !/^[0-9a-f]{16}$/.test(name.slice(PRIVATE_PREFIX.length))) continue;
      const full = path.join(tmpDir, name);
      if (keepDir && path.resolve(full) === path.resolve(keepDir)) continue;
      let pid = 0;
      try { pid = Number(fs.readFileSync(path.join(full, PID_FILE), 'utf8')); } catch {}
      if (isAlive(pid)) continue;
      try { fs.rmSync(full, { recursive: true, force: true }); removed++; } catch {}
    }
  } catch {}
  return removed;
}

/** Profili başlatmak için komut satırı (paketli uygulamada uygulama yolu verilmez). */
function launchArgs({ isPackaged, appPath, id }) {
  const args = isPackaged ? [] : [appPath];
  if (id && id !== DEFAULT_ID) args.push('--profile=' + id);
  return args;
}

module.exports = {
  DEFAULT_ID, MAX_PROFILES, NAME_MAX, COLORS, COLOR_HEX, PRIVATE_PREFIX,
  normalizeName, normalizeProfiles, readProfiles, writeProfiles, createProfile, updateProfile, removeProfile,
  profileDir, profileIdFromArgv, resolveProfile, cleanupPrivateDirs, markPrivateDir, pidAlive, launchArgs,
};
