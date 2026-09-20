/**
 * electron-builder "beforePack" kancası.
 *
 * Windows paketinde Windows Hello yardımcısı (IlgezdiHello.exe) bulunmalı. Burada
 * derlenir; derlenemezse paketleme DURDURULUR. Sessizce atlanırsa kullanıcıya
 * çalışmayan bir "Windows Hello ile aç" düğmesi gönderilmiş olurdu.
 *
 * mac ve Linux hedeflerinde bu adım atlanır — orada kasa kilidi yalnızca kodla
 * açılır ve extraResources zaten yalnızca win altında tanımlı.
 */

'use strict';

const buildWinHello = require('./build-win-hello');

module.exports = async function beforePack(context) {
  const hedef = context && context.electronPlatformName;
  if (hedef !== 'win32') {
    console.log('beforePack: ' + hedef + ' hedefi, Windows Hello yardımcısı gerekmiyor.');
    return;
  }
  if (process.platform !== 'win32') {
    // Windows paketi Windows dışı bir makinede üretiliyor: csc.exe yok.
    throw new Error('Windows paketi yalnızca Windows üzerinde üretilebilir (Windows Hello yardımcısı csc.exe ile derleniyor).');
  }
  buildWinHello({ zorunlu: true });
};
