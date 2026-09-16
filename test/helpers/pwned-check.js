// Sızmış şifre denetimi (asenkron): sahte "range" yanıtlarıyla. Sonuç JSON olarak yazılır.
'use strict';

const path = require('path');
const P = require(path.join(__dirname, '..', '..', 'src', 'main', 'pwned-check.js'));

const leakedPw = 'password';                       // 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8
const otherPw = 'Ortak-Sifre-2026';
const failPw = 'baglanti-kopacak-sifre';
const strongPw = 'Xq7#vT2m!Lp9-Rz4';
const hLeaked = P.passwordHash(leakedPw);
const hFail = P.passwordHash(failPw);
const requested = [];

const fetchRange = async (prefix) => {
  requested.push(prefix);
  if (prefix === hFail.slice(0, 5)) throw new Error('ağ hatası');
  const lines = ['0000000000000000000000000000000000A:0'];          // dolgu
  if (prefix === hLeaked.slice(0, 5)) lines.push(hLeaked.slice(5) + ':52372427');
  lines.push('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3', 'bozuk satır', '');
  return lines.join('\r\n');
};

(async () => {
  const r = await P.checkPwnedPasswords([
    { id: 'a', url: 'https://a.com/', username: 'ali', password: leakedPw },
    { id: 'b', url: 'https://b.com/', username: 'ali', password: leakedPw },
    { id: 'c', url: 'https://c.com/', username: 'veli', password: otherPw },
    { id: 'd', url: 'https://d.com/', username: 'can', password: failPw },
    { id: 'e', url: 'https://e.com/', username: 'can', password: strongPw },
    { id: 'f', url: 'https://f.com/', username: 'bos', password: '' },
  ], fetchRange);
  process.stdout.write(JSON.stringify({ r, requested, json: JSON.stringify(r) }));
})();
