/**
 * İlgezdi — güçlü şifre oluşturucu (saf mantık, Electron'a bağımlı değil).
 *
 * İşletim sisteminin kriptografik rastgele kaynağı (crypto.randomInt) kullanılır.
 * Karıştırılabilen karakterler (l, I, 1, O, 0) yok: şifre bir gün elle yazılabilir.
 * Simgeler çoğu sitenin kabul ettiği küçük bir kümeden; & yok (Windows menü etiketinde
 * erişim tuşu işaretidir). Her karakter türünden en az biri bulunur.
 *
 * 20 karakter, 69 simgelik alfabe: yaklaşık 122 bit.
 */

'use strict';

const crypto = require('crypto');

const CLASSES = Object.freeze([
  'abcdefghijkmnopqrstuvwxyz',
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  '23456789',
  '-_.!@#$%*+=?',
]);
const ALPHABET = CLASSES.join('');
const DEFAULT_LENGTH = 20;
const MIN_LENGTH = 12;
const MAX_LENGTH = 64;

function generatePassword({ length = DEFAULT_LENGTH, randomInt = crypto.randomInt } = {}) {
  const n = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.floor(Number(length)) || DEFAULT_LENGTH));
  const pick = (set) => set[randomInt(set.length)];
  const chars = CLASSES.map(pick);
  while (chars.length < n) chars.push(pick(ALPHABET));
  // Zorunlu türler başta kalmasın: Fisher–Yates karıştırma.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// ─── Şifre denetimi (yalnızca bu bilgisayarda) ──────────────────────────────
// Zayıf ve birden çok hesapta kullanılan şifreler bulunur. Şifreler hiçbir sunucuya
// gönderilmez; sızıntı listesi denetimi yapılmaz. Arayüze şifre değil yalnızca sonuç gider.
const COMMON_PASSWORDS = new Set([
  '123456', '123456789', '12345678', '12345', '1234567', '1234567890', '111111', '000000', '123123', '654321',
  '121212', '112233', 'qwerty', 'qwerty123', 'qwertyuiop', 'asdfgh', 'asdf1234', 'password', 'password1', 'passw0rd',
  'admin', 'admin123', 'root', 'iloveyou', 'welcome', 'letmein', 'monkey', 'dragon', 'football', 'abc123',
  '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'sifre', 'şifre', 'parola', 'galatasaray', 'fenerbahce', 'fenerbahçe',
  'besiktas', 'beşiktaş', 'trabzonspor', 'istanbul', 'ankara', 'izmir', 'turkiye', 'türkiye', 'ataturk', 'atatürk',
  'mustafa', 'ahmet', 'mehmet', 'ayse', 'ayşe', 'fatma', 'sevgilim', 'askim', 'aşkım', 'canim', 'canım', 'bjk', 'gs', 'fb',
]);
const SEQUENCES = ['01234567890', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function isWeakPassword(password) {
  const p = String(password || '');
  if (p.length < 8) return true;
  const lower = p.toLocaleLowerCase('tr');
  // Yaygın şifre, sonuna rakam ya da simge eklenmiş hâli (galatasaray1905, sifre123!) dahil.
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(lower.replace(/[\d\W_]+$/u, ''))) return true;
  if (/^(.)\1+$/u.test(p)) return true;
  if (SEQUENCES.some((seq) => seq.includes(lower))) return true;
  const classes = [/[a-zçğıöşü]/u, /[A-ZÇĞİÖŞÜ]/u, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(p)).length;
  return p.length < 12 && classes < 3;
}

/** entries: [{ id, url, username, password }] → sonuç (şifreler yok). */
function auditPasswords(entries) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e.password === 'string' && e.password) : [];
  const counts = new Map();
  for (const e of list) counts.set(e.password, (counts.get(e.password) || 0) + 1);
  const items = list.map((e) => ({
    id: e.id, url: e.url, username: e.username || '',
    weak: isWeakPassword(e.password),
    reuseCount: counts.get(e.password) > 1 ? counts.get(e.password) : 0,
  })).filter((it) => it.weak || it.reuseCount);
  return {
    total: list.length,
    weakCount: items.filter((it) => it.weak).length,
    reusedCount: items.filter((it) => it.reuseCount).length,
    items: items.sort((a, b) => (b.reuseCount - a.reuseCount) || (Number(b.weak) - Number(a.weak)) || String(a.url).localeCompare(String(b.url))),
  };
}

module.exports = { generatePassword, isWeakPassword, auditPasswords, CLASSES, ALPHABET, DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH };
