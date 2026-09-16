// Okuma modu resim indirme (asenkron): sahte fetch ile sınırlar. Sonuç JSON olarak yazılır.
'use strict';

const path = require('path');
const RD = require(path.join(__dirname, '..', '..', 'src', 'main', 'reader.js'));

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const big = Buffer.alloc(6 * 1024 * 1024, 0);
png.copy(big);
const requested = [];
const fakeFetch = async (u) => {
  requested.push(u);
  return {
    ok: !u.includes('404'),
    headers: { get: (h) => (h === 'content-type' ? 'image/png' : (h === 'content-length' && u.includes('declared') ? String(50 * 1024 * 1024) : null)) },
    arrayBuffer: async () => (u.includes('big') ? big : u.includes('html') ? Buffer.from('<html>') : png),
  };
};

(async () => {
  const m = await RD.fetchReaderImages([
    'https://a.com/ok.png', 'https://a.com/404.png', 'https://a.com/big.png', 'https://a.com/declared.png',
    'https://a.com/html.png', 'javascript:x', 'file:///C:/x.png',
  ], fakeFetch);
  // Toplam sınır: 3 MB'lık 12 resimden en çok 10'u (30 MB) sığar.
  const three = Buffer.alloc(3 * 1024 * 1024, 0);
  png.copy(three);
  const many = Array.from({ length: 12 }, (_, i) => `https://b.com/${i}.png`);
  const m2 = await RD.fetchReaderImages(many, async () => ({ ok: true, headers: { get: () => null }, arrayBuffer: async () => three }), { concurrency: 1 });
  process.stdout.write(JSON.stringify({ kept: [...m.keys()], requested, totalKept: m2.size }));
})();
