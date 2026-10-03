/**
 * Ülgen motoru — SINIFLANDIRMA · PROFİL · ÖNERİ. AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/profil.js
 *
 * Burak (03.10.2026): "kullanıcı verilerini anlayabilecek, sınıflandırabilecek
 * ve öneriler sunabilecek basit bir yapay zeka asistanı". Bu dosya üç sözü
 * ölçer: (1) sınıflandırma gerçekçi başlık/adreslerde doğru ve EMİN
 * OLMADIĞINDA tahmin etmiyor, (2) profil saklanmıyor ve izinsiz/gizli
 * pencerede çalışmıyor, (3) öneri NEDENİYLE geliyor ve hiçbir şeyi kendisi açmıyor.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const motor = require('../src/main/ulgen-motor.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  ' + d : ''}`); }
};

console.log('\n─── Sınıflandırma: site adı + başlık, kuralla');
const ORNEK = [
  ['Galatasaray 2-1 Fenerbahçe maç özeti', 'https://www.ntvspor.net/futbol/x', 'spor'],
  ['Dolar bugün ne kadar? Altın fiyatları', 'https://bigpara.hurriyet.com.tr/doviz/', 'finans'],
  ['Erkek Spor Ayakkabı Modelleri ve Fiyatları', 'https://www.trendyol.com/sr?q=ayakkabi', 'alisveris'],
  ['Gelen Kutusu (3)', 'https://mail.google.com/mail/u/0/', 'araclar'],
  ['YKS taban puanları', 'https://yokatlas.yok.gov.tr/lisans.php', 'egitim'],
  ['e-Devlet Kapısı', 'https://www.turkiye.gov.tr/', 'kamu'],
  ['python requests timeout - Stack Overflow', 'https://stackoverflow.com/q/1', 'teknoloji'],
  ['Kuru fasulye tarifi', 'https://www.nefisyemektarifleri.com/kuru-fasulye/', 'yemek'],
  ['Squid Game 2. sezon fragmanı', 'https://www.youtube.com/watch?v=1', 'eglence'],
  ['NASA yeni gezegen keşfetti', 'https://www.nasa.gov/news/x', 'bilim'],
  ['istanbul otel', 'https://www.google.com/search?q=istanbul+otel', 'arama'],
  ['Merkez Bankası faiz kararı', 'https://www.aa.com.tr/tr/ekonomi/x', 'haber'],
  ['Google Haberler', 'https://news.google.com/home', 'haber'],
  ['Booking.com: İstanbul otelleri', 'https://www.booking.com/city/tr/istanbul.html', 'seyahat'],
];
for (const [b, u, beklenen] of ORNEK) {
  const k = motor.kategoriBul(b, u);
  ol(`${beklenen.padEnd(9)} ← ${b}`, k.id === beklenen, `bulunan: ${k.id} (${k.puan})`);
}
ol('emin değilse tahmin etmez: "Karşıyaka kar yağışı" → diğer (kar/karşı tuzağı)', motor.kategoriBul('Karşıyaka kar yağışı', 'https://ornek.org/a').id === 'diger');
ol('tek başlık sözcüğü yetmez (eşik 2)', motor.kategoriBul('Yeni ders yılı', 'https://ornek.org/a').id === 'diger');
ol('ntv etiketi ntvspor\'u yakalamaz (etiket eşleşmesi alt dize değil)', motor.kategoriBul('', 'https://www.ntvspor.net/').id === 'spor');
ol('uzun son ek kısa olanı yener: yok.gov.tr eğitim, gov.tr kamu', motor.kategoriBul('', 'https://www.yok.gov.tr/').id === 'egitim'
  && motor.kategoriBul('', 'https://www.gib.gov.tr/').id === 'kamu');
ol('bozuk adres çökertmez', motor.kategoriBul('x', 'bu bir adres değil').id === 'diger');

console.log('\n─── Profil');
const GUN = 24 * 60 * 60 * 1000;
// Sabit "şimdi": yerel saatle 21:00 (akşam dilimi), sınama saat dilimine bağlı kalmasın.
const simdi = new Date(2026, 9, 3, 21, 0, 0).getTime();
const z = (gunOnce, saat, url, title) => ({ url, title, timestamp: new Date(2026, 9, 3 - gunOnce, saat, 5, 0).getTime() });
const ZIYARET = [];
for (let i = 1; i <= 12; i++) ZIYARET.push(z(i, 20, 'https://www.ntvspor.net/futbol/' + i, 'Süper Lig maç özeti ' + i));
for (let i = 8; i <= 12; i++) ZIYARET.push(z(i, 10, 'https://www.trendyol.com/x' + i, 'Kampanya ürünleri'));
for (let i = 0; i < 4; i++) ZIYARET.push(z(i, 13, 'https://www.google.com/search?q=' + i, 'arama ' + i));
ZIYARET.push(z(2, 22, 'https://ornek.org/a', 'Bir başlık'));
ZIYARET.push(z(45, 20, 'https://eski.example/', 'Eski ziyaret'));                       // pencere dışı
ZIYARET.push(z(1, 20, 'http://localhost:8765/', 'Yerel pano'));                           // yerel adres
ZIYARET.push({ url: 'ilgezdi://settings', title: 'Ayarlar', timestamp: simdi - GUN });    // iç sayfa
const p = motor.profilCikar(ZIYARET, { simdi, gun: 30 });
ol('pencere dışı, yerel ve iç sayfalar sayılmaz', p.toplam === 22, p.toplam);
ol('en büyük kategori spor', p.kategoriler[0].id === 'spor' && p.kategoriler[0].adet === 12, JSON.stringify(p.kategoriler[0]));
ol('oranlar toplamı ≈ 1', Math.abs(p.kategoriler.reduce((a, k) => a + k.oran, 0) - 1) < 0.01);
ol('sınıflanan sayısı dürüst (diğer hariç)', p.siniflanan === 21, p.siniflanan);
ol('baskın dilim akşam (≥ %40)', p.baskinDilim === 3, p.dilimler.join(','));
ol('siteler en sık önce', p.siteler[0].alan === 'ntvspor.net' && p.siteler[0].adet === 12);
ol('boş günlük: toplam 0, çökme yok', motor.profilCikar([], { simdi }).toplam === 0 && motor.profilCikar(null).toplam === 0);
ol('az veride baskın dilim söylenmez', motor.profilCikar(ZIYARET.slice(0, 5), { simdi }).baskinDilim === -1);

console.log('\n─── Öneri');
const o = motor.oneriUret(ZIYARET, { galatasaray: 4, kampanya: 1, futbol: 3 }, { simdi, gun: 30 });
const oz = o.find((x) => x.neden === 'ozledin');
ol('özlenen site: trendyol (5 kez, 8 gündür yok)', oz && oz.alan === 'trendyol.com' && oz.adet === 5 && oz.gun === 8, JSON.stringify(oz));
ol('özlenen sitenin adresi kökü (yol/sorgu taşınmaz)', oz && oz.url === 'https://www.trendyol.com/');
ol('arama motoru önerilmez', !o.some((x) => x.alan === 'google.com'));
const bs = o.find((x) => x.neden === 'bu_saat');
ol('bu saatte sık açılan: ntvspor (akşam)', bs && bs.alan === 'ntvspor.net', JSON.stringify(bs));
const ig = o.filter((x) => x.neden === 'ilgi').map((x) => x.sorgu);
ol('ilgi etiketi (≥2) arama önerisi, en sık önce; 1 kez geçen önerilmez', ig.join(',') === 'galatasaray,futbol', ig.join(','));
ol('her öneri ya aç ya ara; motor hiçbir şeyi kendisi yapmaz', o.every((x) => (x.tur === 'ac' && /^https?:\/\//.test(x.url)) || (x.tur === 'ara' && x.sorgu)));
ol('en çok 5 öneri', o.length <= 5);
ol('bugün açılmış site "özlediniz" sayılmaz', !o.some((x) => x.neden === 'ozledin' && x.alan === 'ntvspor.net'));
ol('ilgi verisi bozuksa çökmez', Array.isArray(motor.oneriUret(ZIYARET, 'bozuk', { simdi })));

console.log('\n─── Niyet');
for (const [m, tur] of [['bana ne önerirsin', 'profil'], ['profilim', 'profil'], ['ilgi alanlarım neler', 'profil'], ['recommend me something', 'profil'],
  ['geçmişte çanakkale', 'gecmis'], ['bu sayfayı özetle', 'ozet']]) {
  ol(`"${m}" → ${tur}`, motor.niyet(m).tur === tur, motor.niyet(m).tur);
}

console.log('\n─── Ana süreç ve arayüz bağları (kaynak denetimi)');
const read = (p2) => fs.readFileSync(path.join(__dirname, '..', 'src', p2), 'utf8');
const mj = read('main/main.js');
const blok = (mj.match(/case 'profil': \{[\s\S]*?\n {4}\}/) || [''])[0];
ol('profil gizli pencerede kapalı', blok.includes("if (gizli) return { ok: false, sebep: 'gizli_pencere', tur };"));
ol('profil İKİ izin ister (geçmiş + profil)', blok.includes("!ulgenIzin('ulgenHistory') || !ulgenIzin('ulgenProfile')"));
ol('ilgi etiketleri yalnız ilgi izniyle okunur', blok.includes("ulgenIzin('ulgenInterests') ? await ulgenIlgiOku() : {}"));
ol('profil diske yazılmaz (blokta yazma yok)', !/writeFile|ulgenIlgiYaz|saveConfig/.test(blok));
ol('motorda ağ yok', !/require\(['"](https?|net|electron)['"]\)|fetch\(/.test(read('main/ulgen-motor.js')));
const C = require('../src/renderer/data-catalog.js');
const it = C.BY_ID.ulgenProfile;
ol('izin: rıza, varsayılan kapalı, cihazda, geçmiş iznine bağlı', it && it.consent && it.def === false && it.dest === 'device' && it.requires === 'ulgenHistory');
ol('geçmiş izni kapanınca profil izni de kapanır', C.dependentsOf('ulgenHistory').includes('ulgenProfile'));
ol('TrendTech ürün önerisi (ulgenRecommend) hâlâ "yakında"', C.BY_ID.ulgenRecommend.soon === true);
const panel = read('renderer/ulgen-panel.js');
const pg = (panel.match(/function profilGoster[\s\S]*?\n\}/) || [''])[0];
ol('panel profil çiziminde innerHTML yok', pg && !pg.includes('innerHTML'));
ol('öneri düğmesi mevcut sekmedeAc yolundan gider', pg.includes('sekmedeAc(ac)'));
const tr = JSON.parse(read('locales/tr.json'));
ol('her kategorinin Türkçe adı var', motor.KATEGORI_ID.every((k) => tr['ulgen.kat.' + k]), motor.KATEGORI_ID.filter((k) => !tr['ulgen.kat.' + k]).join(','));
const DILLER = fs.readdirSync(path.join(__dirname, '..', 'src', 'locales')).filter((f) => f.endsWith('.json'));
const eksik = DILLER.filter((f) => { const j = JSON.parse(read('locales/' + f)); return !motor.KATEGORI_ID.every((k) => j['ulgen.kat.' + k]) || !j['data.item.ulgenProfile.desc']; });
ol(`${DILLER.length} dilde kategori adları + izin metni var`, eksik.length === 0, eksik.join(','));

console.log(`\n  SONUÇ: ${gecen} geçti · ${kalan} kaldı`);
process.exit(kalan ? 1 : 0);
