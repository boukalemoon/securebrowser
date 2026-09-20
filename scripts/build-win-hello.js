/**
 * İlgezdi — Windows Hello yardımcısını derler (build/win-hello/IlgezdiHello.exe)
 *
 * .NET Framework'ün csc.exe'si Windows'ta hazır gelir; ayrıca bir araç zinciri,
 * node-gyp ya da MSVC kurulumu gerekmez. WinRT tipleri System32\WinMetadata
 * altındaki .winmd dosyalarından referanslanır.
 *
 * Windows dışı bir makinede çalıştırılırsa sessizce atlar — mac ve Linux
 * paketlerinde bu yardımcı zaten yoktur (orada kilit yalnızca kodla açılır).
 *
 * electron-builder bunu "beforePack" ile çağırır (package.json › build.beforePack).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'build', 'win-hello', 'IlgezdiHello.cs');
const OUT = path.join(ROOT, 'build', 'win-hello', 'IlgezdiHello.exe');

const WINMD = 'C:\\Windows\\System32\\WinMetadata';
const REFS = [
  'Windows.Security.winmd',      // UserConsentVerifier
  'Windows.Foundation.winmd',    // IAsyncOperation
];
// csc.exe ile aynı klasörde bulunur (Microsoft.NET\Framework64\v4.0.30319).
const FRAMEWORK_REFS = [
  'System.Runtime.dll',                  // .winmd tiplerinin cephesi
];

function csc() {
  for (const dir of ['Framework64', 'Framework']) {
    for (const ver of ['v4.0.30319']) {
      const p = path.join('C:\\Windows\\Microsoft.NET', dir, ver, 'csc.exe');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function buildWinHello({ zorunlu = false } = {}) {
  if (process.platform !== 'win32') {
    console.log('Windows Hello yardımcısı: Windows dışı platform, atlandı.');
    return null;
  }
  const compiler = csc();
  if (!compiler) {
    const msg = 'csc.exe bulunamadı (.NET Framework 4.x kurulu değil)';
    if (zorunlu) throw new Error(msg);
    console.warn('Windows Hello yardımcısı derlenemedi: ' + msg);
    return null;
  }
  const eksik = REFS.filter((r) => !fs.existsSync(path.join(WINMD, r)));
  if (eksik.length) {
    const msg = 'WinMetadata eksik: ' + eksik.join(', ');
    if (zorunlu) throw new Error(msg);
    console.warn('Windows Hello yardımcısı derlenemedi: ' + msg);
    return null;
  }

  const args = [
    '/nologo', '/target:exe', '/platform:anycpu', '/optimize+',
    // Konsol penceresi açılmasın diye winexe DEĞİL exe kullanılıyor ve çağıran
    // taraf windowsHide veriyor; winexe'de Hello penceresi sahipsiz kalabiliyor.
    '/out:' + OUT,
    // WinRT köprüsü + System.Runtime cephesi: .winmd içindeki tipler bunlar
    // olmadan çözülemiyor (CS0012).
    ...FRAMEWORK_REFS.map((r) => '/reference:' + path.join(path.dirname(compiler), r)),
    ...REFS.map((r) => '/reference:' + path.join(WINMD, r)),
    SRC,
  ];
  execFileSync(compiler, args, { stdio: 'inherit', windowsHide: true });
  const boyut = fs.statSync(OUT).size;
  console.log('Windows Hello yardımcısı derlendi: ' + path.relative(ROOT, OUT) + ' (' + boyut + ' bayt)');
  return OUT;
}

if (require.main === module) {
  // Elle çalıştırıldığında hata gizlenmez.
  buildWinHello({ zorunlu: process.platform === 'win32' });
}

module.exports = buildWinHello;
module.exports.default = buildWinHello;
