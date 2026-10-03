/**
 * Ziyaret günlüğü — biçim seçimi ve "bozuk" dosya kurtarma. AĞA ÇIKMAZ, Electron İSTEMEZ.
 *
 * Çalıştır:  node test/gunluk.js
 *
 * ⛔ NEDEN VAR (04.10.2026, Burak'ın makinesinde ÖLÇÜLDÜ): günlük iki kez "bozuk" sayılıp
 * kenara alındı (23.09 ve 04.10), geçmiş boş başladı. İki dosyanın da ilk baytı 0x7b ('{')
 * idi: yükleyici ilk bayta bakıp şifreli dosyayı "şifresiz JSON" sanıyordu. Rastgele IV'nin
 * ilk baytı her kayıtta 2/256 olasılıkla '[' ya da '{' olur.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SecureLogManager } = require('../src/main/secure-log-manager.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  ' + d : ''}`); }
};

function yonetici(dizin, anahtar) {
  const lm = new SecureLogManager(dizin);
  lm.key = anahtar; lm.canEncrypt = !!anahtar;
  return lm;
}
// İlk baytı istenen değerde olan şifreli paket (IV rastgele; uygun olanı gelene kadar dene).
function paketIlkBayt(lm, veri, bayt) {
  for (let i = 0; i < 20000; i++) { const b = lm._encrypt(veri); if (b[0] === bayt) return b; }
  throw new Error('üretilemedi');
}

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'ilg-gunluk-'));
const anahtar = crypto.randomBytes(32);
const VERI = [{ id: 'a', url: 'https://a.example/', timestamp: 3 }, { id: 'b', url: 'https://b.example/', timestamp: 2 }];

console.log('\n─── Biçim seçimi: ilk bayt değil, GCM etiketi karar verir');
for (const [bayt, ad] of [[0x7b, '{'], [0x5b, '[']]) {
  const lm = yonetici(dizin, anahtar);
  fs.writeFileSync(lm.logsPath, paketIlkBayt(lm, VERI, bayt));
  lm._loadLogs();
  ol(`IV '${ad}' ile başlayan şifreli günlük açılır (eskiden "bozuk" sayılırdı)`, lm.logs.length === 2 && !lm.yuklemeOlaylari.length,
     JSON.stringify(lm.yuklemeOlaylari));
}
{
  const lm = yonetici(dizin, anahtar);
  fs.writeFileSync(lm.logsPath, JSON.stringify(VERI));
  lm._loadLogs();
  ol('eski ŞİFRESİZ JSON günlük hâlâ okunur (geçiş yolu)', lm.logs.length === 2);
}
{
  const yabanci = yonetici(dizin, crypto.randomBytes(32));
  const lm = yonetici(dizin, anahtar);
  fs.writeFileSync(lm.logsPath, yabanci._encrypt(VERI));
  for (const f of fs.readdirSync(dizin)) if (f.includes('.bozuk-')) fs.rmSync(path.join(dizin, f));
  lm._loadLogs();
  const bozuk = fs.readdirSync(dizin).filter((f) => f.includes('.bozuk-'));
  ol('GERÇEKTEN açılamayan (başka anahtar) günlük kenara alınır, silinmez', lm.logs.length === 0 && bozuk.length === 1);
  ol('olay kaydı yalnız tür/sebep/bayt taşır — adres ya da içerik YOK',
     lm.yuklemeOlaylari.length === 1 && lm.yuklemeOlaylari[0].tur === 'gunluk_acilamadi'
     && !JSON.stringify(lm.yuklemeOlaylari).includes('example'), JSON.stringify(lm.yuklemeOlaylari));
  for (const f of bozuk) fs.rmSync(path.join(dizin, f));
}

console.log('\n─── Kurtarma: kenara alınmış günlük bugünkü anahtarla açılır, birleşir');
{
  const lm = yonetici(dizin, anahtar);
  const ESKI = [{ id: 'eski1', url: 'https://eski.example/1', timestamp: 1 }, { id: 'b', url: 'https://b.example/', timestamp: 2 }];
  fs.writeFileSync(lm.logsPath + '.bozuk-1790138869514', paketIlkBayt(lm, ESKI, 0x7b));
  fs.writeFileSync(lm.logsPath + '.bozuk-1791066355484', yonetici(dizin, crypto.randomBytes(32))._encrypt(ESKI));   // açılamaz
  fs.writeFileSync(lm.logsPath, lm._encrypt([{ id: 'yeni', url: 'https://yeni.example/', timestamp: 9 }, { id: 'b', url: 'https://b.example/', timestamp: 2 }]));
  lm._loadLogs();
  const eklenen = lm._bozuklariKurtar();
  ol('açılabilen dosyadaki YENİ kayıt eklendi, aynı kimlik ikinci kez eklenmedi', eklenen === 1 && lm.logs.map((l) => l.id).join(',') === 'yeni,b,eski1',
     lm.logs.map((l) => l.id).join(','));
  const ad = fs.readdirSync(dizin);
  ol('kurtarılan dosya silinmez, ".kurtarildi-" olarak kalır', ad.includes('ilgezdi-logs.enc.kurtarildi-1790138869514'));
  ol('açılamayan dosyaya dokunulmaz (".bozuk-" olarak durur)', ad.includes('ilgezdi-logs.enc.bozuk-1791066355484'));
  ol('kurtarılan geçmiş diske yazıldı (yeniden açılınca 3 kayıt)', (() => { const x = yonetici(dizin, anahtar); x._loadLogs(); return x.logs.length === 3; })());
  ol('olaylar: bir kurtarıldı, bir kurtarılamadı', lm.yuklemeOlaylari.map((o) => o.tur).sort().join(',') === 'gunluk_kurtarilamadi,gunluk_kurtarildi');
  const ikinci = yonetici(dizin, anahtar); ikinci._loadLogs();
  ol('ikinci açılışta kurtarılmış dosya yeniden işlenmez (yalnız açılamayan yeniden denenir)',
     ikinci._bozuklariKurtar() === 0 && !ikinci.yuklemeOlaylari.some((o) => o.tur === 'gunluk_kurtarildi') && ikinci.logs.length === 3);
}
fs.rmSync(dizin, { recursive: true, force: true });

console.log(`\n  SONUÇ: ${gecen} geçti · ${kalan} kaldı`);
process.exit(kalan ? 1 : 0);
