/**
 * İlgezdi — yayınlanan kurulum dosyaları için SHA-256 özet listesi
 *
 * Neden: kurulum dosyalarımız imzalı değil (kod imzalama sertifikası şimdilik
 * alınmadı). İmza yokken kullanıcının indirdiği dosyanın bizim ürettiğimiz dosya
 * olduğunu doğrulayabilmesinin ücretsiz yolu, özetin ayrı bir yerde yayınlanması.
 *
 * Çıktı: dist/SHA256SUMS-<platform>.txt — sha256sum/shasum ve Windows'un
 * CertUtil çıktısıyla karşılaştırılabilecek standart biçimde:
 *     <64 haneli özet>  <dosya adı>
 *
 * Üç platform işi aynı yayına paralel yüklediği için dosya adı platforma göre
 * ayrılır; aynı adlı dosyalar birbirinin üzerine yazardı.
 *
 * Kullanım: node scripts/write-checksums.js <platform>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UZANTILAR = ['.exe', '.dmg', '.zip', '.AppImage', '.deb'];

function ozetle(dosya) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(dosya));
  return h.digest('hex');
}

function main() {
  const platform = (process.argv[2] || process.platform).replace(/[^a-z0-9-]/gi, '');
  const dist = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(dist)) { console.log('dist/ yok, özet üretilmedi.'); return; }

  const dosyalar = fs.readdirSync(dist)
    .filter((f) => UZANTILAR.some((u) => f.toLowerCase().endsWith(u.toLowerCase())))
    .filter((f) => fs.statSync(path.join(dist, f)).isFile())
    .sort();

  if (!dosyalar.length) { console.log('dist/ içinde kurulum dosyası yok, özet üretilmedi.'); return; }

  const satirlar = dosyalar.map((f) => ozetle(path.join(dist, f)) + '  ' + f);
  const cikti = path.join(dist, 'SHA256SUMS-' + platform + '.txt');
  fs.writeFileSync(cikti, satirlar.join('\n') + '\n', 'utf8');
  console.log('SHA-256 özetleri yazıldı: ' + path.basename(cikti));
  for (const s of satirlar) console.log('  ' + s);
}

if (require.main === module) main();

module.exports = { ozetle, UZANTILAR };
