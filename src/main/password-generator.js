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

module.exports = { generatePassword, CLASSES, ALPHABET, DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH };
