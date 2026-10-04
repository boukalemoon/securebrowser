/**
 * Ülgen — YAYIN ÖNCESİ DENETİM bulguları (04.10.2026). AĞA ÇIKMAZ, Electron İSTEMEZ.
 *
 * Çalıştır:  node test/ulgen-yayin.js
 *
 * Her madde, denetimde ÖLÇÜLEN ya da kodda doğrulanan bir açığın geri gelmemesi içindir:
 *   1) Görev sayfasında betik çağrıları zaman sınırsızdı → araştırma kalıcı "meşgul" kalabiliyordu.
 *   2) IPv4-eşlemeli IPv6 ve 100.64/10 yerel ağ yasağını aşıyordu (ölçüldü: ok:true).
 *   3) Görünmez görev sayfası indirme işleyicisine bağlanıyor, eşzamanlı onay kutusu açabiliyordu.
 *   4) Çeviri paketi 1,5 sn'de "bitti" sayılıyordu; ilerleme ve bitiş kayboluyordu.
 *   5) Görev kanalı: uzun yoklama sürerken kapanan izin / açılan gizli pencere yok sayılıyordu.
 *   6) İlgi sayacı: "constructor" prototip işlevini sayaca ekliyordu (ölçüldü).
 */
'use strict';

const fs = require('fs');
const path = require('path');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  ' + d : ''}`); }
};
const oku = (p) => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
const mj = oku('main/main.js');
const gorevFn = (mj.match(/async function ulgenGorevSayfasi[\s\S]*?\n\}\n/) || [''])[0];

console.log('\n─── 1) Görev sayfası kalıcı "meşgul" kalamaz');
const ham = (gorevFn.match(/executeJavaScriptInIsolatedWorld\(GOREV_WORLD_ID/g) || []).length;
const sarili = (gorevFn.match(/sinirli\(wc\.executeJavaScriptInIsolatedWorld\(GOREV_WORLD_ID/g) || []).length;
ol('görev sayfasındaki HER betik çağrısı zaman sınırlı', ham === 3 && sarili === 3, `${sarili}/${ham}`);
ol('betik sınırı tanımlı (10 sn)', /const GOREV_BETIK_SINIRI_MS = 10 \* 1000;/.test(mj));
ol('üst süre bekçisi işi her koşulda bırakır', /const bekci = setTimeout\(/.test(gorevFn) && /clearTimeout\(bekci\)/.test(gorevFn));
ol('"meşgul" bayrağını yalnız sahibi indirir', /const birak = \(\) => \{ if \(gorevSayac === benim\) gorevCalisiyor = false; \}/.test(gorevFn)
   && !/^\s*gorevCalisiyor = false;/m.test(gorevFn));
ol('takılan sayfa çöküş işleyicisine düşürülmez (adres tanılamaya yazılmasın)', !/forcefullyCrashRenderer\(\)/.test(gorevFn));
ol('arama kipi takılınca dürüst sebep: zaman_asimi', /if \(takildi && !bag\) return \{ ok: false, sebep: 'zaman_asimi' \}/.test(gorevFn));

console.log('\n─── 2) Yerel ağ yasağı');
const G = require('../src/main/gorev-sayfa.js');
for (const u of ['http://[::ffff:127.0.0.1]:8765/', 'http://[::ffff:192.168.1.1]/', 'http://[::ffff:7f00:1]/', 'http://[::7f00:1]/',
                 'http://100.64.0.1/', 'http://100.127.255.255/', 'http://127.0.0.1/', 'http://[::1]/']) {
  ol(`${u} → yerel_adres`, G.gecerliGorevAdresi(u).sebep === 'yerel_adres', JSON.stringify(G.gecerliGorevAdresi(u)));
}
for (const u of ['https://tr.wikipedia.org/wiki/Bilim', 'http://8.8.8.8/', 'http://100.128.0.1/', 'http://[2606:4700::6810:84e5]/']) {
  ol(`${u} → geçer (aşırı yasak yok)`, G.gecerliGorevAdresi(u).ok === true);
}
ol('bağlanılan IP de denetlenir (adı dış, IP\'si yerel: 192.168.1.1.nip.io)', /onResponseStarted\(\(d\) => \{\s*if \(d\.ip && gorevSayfa\.yerelAdresMi\(d\.ip\)\)/.test(gorevFn));
ol('IP denetimi IPv4-eşlemeli yanıtı da yakalar', G.yerelAdresMi('::ffff:10.0.0.5') && G.yerelAdresMi('192.168.0.10') && !G.yerelAdresMi('142.250.185.78'));
ol('çıkarım sonrası engel yeniden denetlenir', (gorevFn.match(/if \(engellendi\)/g) || []).length >= 3);

console.log('\n─── 3) Görünmez sayfa indirme işleyicisine bağlanmaz');
ol('oturum configureSession\'dan ÖNCE "kurulmuş" işaretlenir', /configuredSessions\.add\(wc\.session\);\s*configureSession\(wc\.session, true\)/.test(gorevFn));
ol('görev oturumunda her indirme reddedilir', /wc\.session\.on\('will-download', \(e\) => e\.preventDefault\(\)\)/.test(gorevFn));

console.log('\n─── 4) Çeviri paketi olaylarla biter');
const pnl = oku('renderer/ulgen-panel.js');
ol('"iniyor" dönüşünde dinleyici bırakılmaz', /if \(r && r\.durum === 'iniyor' && typeof birak === 'function'\) return;/.test(pnl));
ol('"indi" olayı özeti yeniden ister, "hata" olayı hata yazar', /d\.durum === 'indi'\) sonlandir\(\{ ok: true/.test(pnl) && /d\.durum === 'hata'\) sonlandir\(\{ ok: false/.test(pnl));
ol('üst süre var (asılı kalmaz)', /ust = setTimeout\(\(\) => sonlandir\(/.test(pnl));
ol('meşgulken yazılan soru silinmez', /if \(ulgen\.mesgul\) \{ g\.classList\.add\('ulgen-bekliyor'\)/.test(pnl));

console.log('\n─── 5) Görev kanalı: iş alındıktan sonra yeniden denetim');
const gr = oku('main/ulgen-gorev.js');
ol('izin/gizli pencere/jeton iş alındıktan SONRA yeniden denetlenir', /if \(!is_\) continue;[\s\S]{0,600}if \(durdur \|\| !izinVar\(\) \|\| gizliAcik\(\) \|\| !jeton\) continue;/.test(gr));
ol('yeniden eşleşmede döngü sürer (durdur geri alınır)', /if \(calisiyor\) \{ durdur = false; return; \}/.test(gr));

console.log('\n─── 6) İlgi sayacı prototip anahtarlarına dayanıklı');
const M = require('../src/main/ulgen-motor.js');
let d = M.ilgiEkle({}, ['constructor', 'toString', '__proto__', 'borsa']);
d = M.ilgiEkle(d, ['constructor', 'constructor']);
ol('"constructor" sayı olarak sayılır', d.constructor === 3, JSON.stringify(d));
ol('"toString" ve "__proto__" kendi anahtarı, sayı', d.toString === 1 && Object.prototype.hasOwnProperty.call(d, '__proto__') && d['__proto__'] === 1);
ol('diskte önceden bozulmuş (sayı olmayan) değer atılır', JSON.stringify(M.ilgiEkle({ x: 'function Object() {}11', y: 2 }, [])) === '{"y":2}');
ol('öneriler bozulmaz', M.oneriUret([], { constructor: 4, borsa: 3 }).map((o) => o.sorgu).join(',') === 'constructor,borsa');

console.log(`\n  SONUÇ: ${gecen} geçti · ${kalan} kaldı`);
process.exit(kalan ? 1 : 0);
