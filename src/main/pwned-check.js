/**
 * İlgezdi — sızmış şifre denetimi (Have I Been Pwned, Pwned Passwords).
 *
 * k-anonimlik: şifrenin SHA-1 özetinin yalnızca ilk 5 onaltılık karakteri gönderilir
 * (GET api.pwnedpasswords.com/range/<ön ek>). Sunucu bu ön ekle başlayan yüzlerce özetin
 * geri kalanını ve kaç sızıntıda görüldüğünü döndürür; karşılaştırma bilgisayarda yapılır.
 * Şifre ve tam özet dışarı çıkmaz, sunucu eşleşme olup olmadığını öğrenmez. "Add-Padding"
 * başlığıyla yanıt sahte (sayısı 0) satırlarla doldurulur: yanıt boyutu da bilgi vermez.
 *
 * Yalnızca kullanıcı "Sızıntı listesinde ara" düğmesine basınca çalışır; kendiliğinden
 * hiçbir istek atılmaz. Ağ çağrısı dışarıdan verilir (fetchRange), modül saf kalır.
 */

'use strict';

const crypto = require('crypto');

const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

function passwordHash(password) {
  return crypto.createHash('sha1').update(String(password), 'utf8').digest('hex').toUpperCase();
}

/** "SUFFIX:COUNT" satırları → Map(suffix → count). Dolgu (0) ve bozuk satırlar atlanır. */
function parseRange(text) {
  const out = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^([0-9A-F]{35}):(\d{1,12})$/i.exec(line.trim());
    if (!m) continue;
    const count = Number(m[2]);
    if (count > 0) out.set(m[1].toUpperCase(), count);
  }
  return out;
}

/**
 * entries: [{ id, url, username, password }]; fetchRange(prefix) → yanıt metni (hata fırlatabilir).
 * Aynı ön eke tek istek atılır. Sonuçta şifre ve özet yok.
 */
async function checkPwnedPasswords(entries, fetchRange, { concurrency = 4 } = {}) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e.password === 'string' && e.password);
  const hashes = list.map((e) => passwordHash(e.password));
  const prefixes = [...new Set(hashes.map((h) => h.slice(0, 5)))];
  const ranges = new Map();
  let failed = 0;
  const queue = prefixes.slice();
  async function worker() {
    while (queue.length) {
      const prefix = queue.shift();
      try {
        ranges.set(prefix, parseRange(await fetchRange(prefix)));
      } catch (e) {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  const leaked = [];
  let checked = 0;
  list.forEach((e, i) => {
    const range = ranges.get(hashes[i].slice(0, 5));
    if (!range) return;
    checked++;
    const count = range.get(hashes[i].slice(5)) || 0;
    if (count) leaked.push({ id: e.id, url: e.url, username: e.username || '', count });
  });
  leaked.sort((a, b) => b.count - a.count);
  return { total: list.length, checked, failedRequests: failed, requests: prefixes.length, leaked };
}

module.exports = { PWNED_RANGE_URL, passwordHash, parseRange, checkPwnedPasswords };
