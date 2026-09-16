/**
 * İlgezdi — Şifre Yöneticisi (ana süreç)
 *
 * • Kasa: parolalar diskte safeStorage (Windows DPAPI / macOS Keychain /
 *   Linux keyring) ile ŞİFRELİ tutulur (userData/passwords.enc). Düz metin yok.
 *   Chrome, Edge, Brave ve Opera'nın modeli budur: kasa işletim sistemi
 *   hesabına bağlıdır.
 * • İçe aktarma: Chrome/Edge/Brave/Vivaldi'nin kayıtlı parolalarını çözer:
 *     - "Local State" → os_crypt.encrypted_key → DPAPI ile AES-256 anahtarı
 *     - "Login Data" (SQLite, sql.js ile okunur) → her parola AES-256-GCM (v10/v11)
 *       ya da eski DPAPI formatıyla çözülür.
 *     - v20 (Chrome 127+ "app-bound encryption") yalnızca tarayıcının kendi
 *       yükseltilmiş servisi tarafından çözülebilir; bu kayıtlar sayılır ve
 *       kullanıcı CSV yoluna yönlendirilir (sessizce 0 dönmek yerine).
 *   DPAPI çözme, native modül olmadan Windows'un ProtectedData API'siyle
 *   (PowerShell) yapılır — yalnızca mevcut Windows kullanıcısı için çalışır.
 * • Senkron YOK: parolalar yalnızca cihazda kalır.
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { dialog } = require('electron');
const osCrypto = require('./os-crypto');
const { auditPasswords } = require('./password-generator');
const { log: diag } = require('./diagnostics');

let VAULT_PATH = null;
let vault = [];            // [{ id, url, username, password, createdAt, source }]
let vaultLoadError = null; // null | 'encryption_unavailable' | 'decrypt_failed'
// İşletim sistemi anahtar kasası eşzamansız (os-crypto.js): loadVault belirler; kasayı
// kullanan her IPC işleyicisi önce vaultReady'yi bekler.
let encryptionOk = false;
let vaultReady = Promise.resolve();
let saveChain = Promise.resolve();

// Kullanıcıya gösterilecek mesajlar — IPC'den ham hata kodu sızdırmak yerine.
const MESSAGES = {
  not_found:              'Tarayıcı profili bulunamadı.',
  key_decrypt_failed:     'Tarayıcının şifreleme anahtarı çözülemedi. Tarayıcıyı kapatıp yeniden deneyin.',
  read_failed:            'Kayıtlı parolalar okunamadı. Tarayıcıyı kapatıp yeniden deneyin.',
  app_bound_encryption:   'Bu tarayıcı parolalarını ek bir korumayla (Chrome 127+ "app-bound encryption") şifreliyor; ' +
                          'bunları doğrudan okuyamayız. Tarayıcının Ayarlar → Şifreler bölümünden "Dışa aktar" ile CSV ' +
                          'dosyası alıp "CSV\'den" seçeneğiyle içe aktarın.',
  encryption_unavailable: 'İşletim sisteminin anahtar kasası kullanılamıyor; parolalar güvenli saklanamaz.',
  vault_unreadable:       'Kayıtlı şifre kasası okunamadı. Veri kaybını önlemek için kasaya yazma durduruldu; ' +
                          'kasanın bir kopyası "passwords.enc.bozuk-*" adıyla saklandı.',
  invalid_input:          'Site adresi ve şifre zorunludur.',
};
const fail = (code, extra) => ({ ok: false, imported: 0, code, error: MESSAGES[code] || code, ...(extra || {}) });

// ─── DPAPI (native modülsüz, PowerShell ProtectedData) ────────────────────────
// base64 girer, çözülmüş Buffer döner. CurrentUser kapsamı.
function dpapiUnprotect(b64) {
  const script =
    "Add-Type -AssemblyName System.Security;" +
    "$b=[Convert]::FromBase64String($env:ILG_DP);" +
    "$d=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');" +
    "[Convert]::ToBase64String($d)";
  const out = execFileSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, env: { ...process.env, ILG_DP: b64 }, maxBuffer: 8 * 1024 * 1024 });
  return Buffer.from(out.trim(), 'base64');
}

/**
 * Çok sayıda DPAPI blob'unu TEK PowerShell sürecinde çözer.
 *
 * Eskiden eski formattaki her parola için ayrı, SENKRON bir PowerShell süreci
 * başlatılıyordu. 200 eski kayıt = 200 süreç × 100–300 ms, hepsi ana süreci
 * bloklayarak → uygulama dakikalarca donuyor, kullanıcı çöktüğünü sanıyordu
 * (denetim O-12). Veri stdin'den JSON olarak girer (komut satırında sır yok).
 *
 * @param {string[]} b64List
 * @returns {(Buffer|null)[]} aynı sırayla; çözülemeyenler null
 */
function dpapiUnprotectMany(b64List) {
  if (!b64List.length) return [];
  const script =
    "Add-Type -AssemblyName System.Security;" +
    "$in = [Console]::In.ReadToEnd() | ConvertFrom-Json;" +
    "$out = New-Object System.Collections.Generic.List[string];" +
    "foreach ($b in @($in)) {" +
    "  try {" +
    "    $d = [System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($b), $null, 'CurrentUser');" +
    "    $out.Add([Convert]::ToBase64String($d))" +
    "  } catch { $out.Add('') }" +
    "};" +
    "ConvertTo-Json -Compress -InputObject @($out.ToArray())";
  const raw = execFileSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      input: JSON.stringify(b64List), encoding: 'utf8', windowsHide: true,
      maxBuffer: 64 * 1024 * 1024, timeout: 120000,
    });
  let arr = JSON.parse(String(raw).trim() || '[]');
  if (!Array.isArray(arr)) arr = [arr];
  return b64List.map((_, i) => (arr[i] ? Buffer.from(arr[i], 'base64') : null));
}

// ─── Kasa şifreleme ───────────────────────────────────────────────────────────

async function tryDecryptVaultFile(p) {
  const { text, reencrypt } = await osCrypto.decryptBuffer(fs.readFileSync(p));
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? { entries: parsed, reencrypt } : null;
}

async function loadVault() {
  vault = [];
  vaultLoadError = null;
  encryptionOk = await osCrypto.isAvailable();
  if (!fs.existsSync(VAULT_PATH)) return;

  if (!encryptionOk) {
    vaultLoadError = 'encryption_unavailable';
    diag.warn('passwords', 'Kasa var ama işletim sistemi şifrelemesi kullanılamıyor');
    return;
  }

  try {
    const r = await tryDecryptVaultFile(VAULT_PATH);
    if (!r) throw new Error('kasa biçimi geçersiz');
    vault = r.entries;
    // İşletim sistemi anahtarı yenilendiyse kasa yeni anahtarla yeniden yazılır.
    if (r.reencrypt) await saveVault();
    return;
  } catch (e) {
    diag.error('passwords', 'Kasa çözülemedi', { reason: e.message });
  }

  // ÖNEMLİ (denetim O-02): Eskiden burada `catch { vault = [] }` vardı. Bozuk ya da
  // geçici olarak çözülemeyen (ör. Linux'ta henüz açılmamış anahtar kasası) bir
  // kasa sessizce boş sayılıyor, ilk kayıt işlemi de eski dosyanın üzerine BOŞ
  // kasa yazıyordu → kullanıcının TÜM parolaları geri dönüşsüz gidiyordu.
  try { fs.copyFileSync(VAULT_PATH, VAULT_PATH + '.bozuk-' + Date.now()); } catch {}

  // Son sağlam yedekten kurtarmayı dene.
  const bak = VAULT_PATH + '.bak';
  if (fs.existsSync(bak)) {
    try {
      const r = await tryDecryptVaultFile(bak);
      if (r) {
        vault = r.entries;
        diag.warn('passwords', 'Kasa yedekten kurtarıldı', { count: r.entries.length });
        return;
      }
    } catch {}
  }

  // Kurtarılamadı → yazmayı durdur (mevcut dosyanın üzerine boş kasa yazılmasın).
  vaultLoadError = 'decrypt_failed';
}

// Kayıtlar sıraya alınır: şifreleme artık eşzamansız, art arda iki kayıt aynı geçici
// dosyaya yazıp birbirini ezmesin. Her kayıt o anki kasanın tamamını yazar.
function saveVault() {
  const run = async () => {
    if (!encryptionOk) return false;
    if (vaultLoadError === 'decrypt_failed') return false; // okunamayan kasayı EZME
    const blob = await osCrypto.encryptText(JSON.stringify(vault));
    const tmp = VAULT_PATH + '.tmp';
    fs.writeFileSync(tmp, blob, { mode: 0o600 });
    // Son sağlam kasayı yedekle, sonra atomik olarak değiştir.
    try { if (fs.existsSync(VAULT_PATH)) fs.copyFileSync(VAULT_PATH, VAULT_PATH + '.bak'); } catch {}
    fs.renameSync(tmp, VAULT_PATH);
    return true;
  };
  saveChain = saveChain.then(run, run);
  return saveChain;
}

function writeGuard() {
  if (vaultLoadError === 'decrypt_failed') return fail('vault_unreadable');
  if (!encryptionOk) return fail('encryption_unavailable');
  return null;
}

function genId() { return 'pw_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'); }

/**
 * Kullanıcı "google.com" yazabilir (arayüzdeki örnek de bu). Şemasız adres
 * `new URL()` ile ayrıştırılamadığı için eskiden elle eklenen parolalar HİÇBİR
 * ZAMAN otomatik doldurulmuyordu. Şema yoksa https varsayılır.
 */
function normalizeSiteUrl(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin + (u.pathname && u.pathname !== '/' ? u.pathname : '/');
  } catch {
    return '';
  }
}

// ─── Chromium kaynakları ──────────────────────────────────────────────────────
function chromiumProfiles() {
  const HOME = os.homedir();
  const LOCAL = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
  const dirs = process.platform === 'win32' ? [
    { id: 'chrome',  name: 'Google Chrome',  base: path.join(LOCAL, 'Google', 'Chrome', 'User Data') },
    { id: 'edge',    name: 'Microsoft Edge', base: path.join(LOCAL, 'Microsoft', 'Edge', 'User Data') },
    { id: 'brave',   name: 'Brave',          base: path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data') },
    { id: 'vivaldi', name: 'Vivaldi',        base: path.join(LOCAL, 'Vivaldi', 'User Data') },
  ] : [];
  return dirs.map(d => ({
    ...d,
    localState: path.join(d.base, 'Local State'),
    loginData:  path.join(d.base, 'Default', 'Login Data'),
  }));
}

function detectSources() {
  return chromiumProfiles()
    .filter(p => { try { return fs.existsSync(p.localState) && fs.existsSync(p.loginData); } catch { return false; } })
    .map(p => ({ id: p.id, name: p.name }));
}

// ─── Parola çözme ─────────────────────────────────────────────────────────────

/** Blob'un şifreleme biçimi: 'aes' (v10/v11) | 'app-bound' (v20) | 'dpapi' (eski) | 'empty' */
function blobKind(blob) {
  if (!blob || !blob.length) return 'empty';
  const prefix = blob.slice(0, 3).toString('latin1');
  if (prefix === 'v10' || prefix === 'v11') return 'aes';
  if (prefix === 'v20') return 'app-bound';
  return 'dpapi';
}

function decryptAesGcm(blob, aesKey) {
  const nonce = blob.slice(3, 15);
  const tag   = blob.slice(blob.length - 16);
  const ct    = blob.slice(15, blob.length - 16);
  const dec   = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');
}

/** Tekil çözme (geriye dönük uyumluluk + test). v20 için '' döner. */
function decryptPassword(blob, aesKey) {
  const kind = blobKind(blob);
  if (kind === 'empty' || kind === 'app-bound') return '';
  if (kind === 'aes') return decryptAesGcm(blob, aesKey);
  try { return dpapiUnprotect(blob.toString('base64')).toString('utf8'); } catch { return ''; }
}

async function importFromBrowser(id) {
  const guard = writeGuard();
  if (guard) return guard;

  const prof = chromiumProfiles().find(p => p.id === id);
  if (!prof || !fs.existsSync(prof.localState) || !fs.existsSync(prof.loginData)) {
    return fail('not_found');
  }

  // 1) AES anahtarını çöz
  let aesKey;
  try {
    const ls = JSON.parse(fs.readFileSync(prof.localState, 'utf8'));
    let encKey = Buffer.from(ls.os_crypt.encrypted_key, 'base64');
    if (encKey.slice(0, 5).toString('latin1') === 'DPAPI') encKey = encKey.slice(5);
    aesKey = dpapiUnprotect(encKey.toString('base64'));
  } catch (e) {
    diag.warn('passwords', 'Tarayıcı anahtarı çözülemedi', { source: id, reason: e.message });
    return fail('key_decrypt_failed');
  }

  // 2) Login Data SQLite'ı geçici kopyadan oku (tarayıcı açıkken kilidi aşmak için)
  const tmp = path.join(os.tmpdir(), `ilg-logins-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.db`);
  let rows = [];
  try {
    fs.copyFileSync(prof.loginData, tmp);
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(tmp));
    const r = db.exec('SELECT origin_url, username_value, password_value FROM logins');
    db.close();
    if (r.length) rows = r[0].values;
  } catch (e) {
    diag.warn('passwords', 'Login Data okunamadı', { source: id, reason: e.message });
    return fail('read_failed');
  } finally {
    // Kopya şifreli parola blob'larını içerir — hemen sil.
    try { fs.unlinkSync(tmp); } catch {}
  }

  // 3) Çöz + kasaya birleştir (url+username bazında dedupe)
  const existing = new Set(vault.map(v => v.url + ' ' + v.username));
  let imported = 0;
  let appBound = 0;
  let failed = 0;
  const legacy = [];

  const add = (url, username, password) => {
    const key = url + ' ' + (username || '');
    if (!password || existing.has(key)) return;
    vault.push({ id: genId(), url, username: username || '', password, createdAt: Date.now(), source: id });
    existing.add(key);
    imported++;
  };

  for (const [url, username, pwBlob] of rows) {
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const blob = Buffer.from(pwBlob || []);
    const kind = blobKind(blob);
    if (kind === 'empty') continue;
    if (kind === 'app-bound') { appBound++; continue; }
    if (kind === 'aes') {
      try { add(url, username, decryptAesGcm(blob, aesKey)); } catch { failed++; }
      continue;
    }
    legacy.push({ url, username, blob });
  }

  if (legacy.length) {
    try {
      const dec = dpapiUnprotectMany(legacy.map(l => l.blob.toString('base64')));
      legacy.forEach((l, i) => {
        if (dec[i] && dec[i].length) add(l.url, l.username, dec[i].toString('utf8'));
        else failed++;
      });
    } catch (e) {
      failed += legacy.length;
      diag.warn('passwords', 'Eski DPAPI kayıtları çözülemedi', { count: legacy.length, reason: e.message });
    }
  }

  if (imported) await saveVault();
  diag.info('passwords', 'Tarayıcıdan içe aktarma', { source: id, total: rows.length, imported, appBound, failed });

  // Hiçbiri alınamadı ve sebep app-bound şifreleme → sessizce "0" deme, nedenini söyle.
  if (imported === 0 && appBound > 0) {
    return fail('app_bound_encryption', { appBound, failed, total: rows.length });
  }
  return { ok: true, imported, appBound, failed, total: rows.length };
}

// ─── Dışa aktarılan CSV'den içe aktarma (evrensel) ────────────────────────────
function parseCsvPasswords(text) {
  // Chrome/Edge/Firefox CSV başlıkları: name,url,username,password (sıra değişebilir)
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const parseLine = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const iU = header.indexOf('url');
  const iN = header.indexOf('username');
  const iP = header.indexOf('password');
  if (iU < 0 || iP < 0) return [];
  return lines.slice(1).map(parseLine).map(c => ({
    url: (c[iU] || '').trim(), username: (c[iN] || '').trim(), password: c[iP] || '',
  })).filter(e => e.url && e.password);
}

async function importFromCsv(win) {
  const guard = writeGuard();
  if (guard) return guard;

  const r = await dialog.showOpenDialog(win, {
    title: 'Şifre CSV dosyası seçin (tarayıcıdan dışa aktarılan)',
    filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: true, imported: 0, canceled: true };
  let entries;
  try { entries = parseCsvPasswords(fs.readFileSync(r.filePaths[0], 'utf8')); }
  catch { return fail('read_failed'); }
  const existing = new Set(vault.map(v => v.url + ' ' + v.username));
  let imported = 0;
  for (const e of entries) {
    const url = normalizeSiteUrl(e.url);
    if (!url) continue;
    const key = url + ' ' + e.username;
    if (existing.has(key)) continue;
    vault.push({ id: genId(), url, username: e.username, password: e.password, createdAt: Date.now(), source: 'csv' });
    existing.add(key); imported++;
  }
  if (imported) await saveVault();
  diag.info('passwords', 'CSV içe aktarma', { total: entries.length, imported });
  return { ok: true, imported };
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
function setupPasswordManager(ipcMain, options) {
  VAULT_PATH = path.join(options.userDataPath, 'passwords.enc');
  vaultReady = loadVault().catch((e) => { diag.error('passwords', 'Kasa yüklenemedi', { reason: e.message }); });

  // Listeleme: parolalar MASKELİ döner (güvenlik); tam parola ayrı istekle.
  ipcMain.handle('pw-list', async () => {
    await vaultReady;
    return vault.map(v => ({ id: v.id, url: v.url, username: v.username, source: v.source, createdAt: v.createdAt }));
  });
  ipcMain.handle('pw-reveal', async (e, id) => {
    await vaultReady;
    return vault.find(v => v.id === id)?.password || '';
  });

  ipcMain.handle('pw-add', async (e, { url, username, password } = {}) => {
    await vaultReady;
    const guard = writeGuard();
    if (guard) return guard;
    const normalized = normalizeSiteUrl(url);
    if (!normalized || !password) return fail('invalid_input');
    vault.push({ id: genId(), url: normalized, username: username || '', password, createdAt: Date.now(), source: 'manual' });
    await saveVault();
    return { ok: true };
  });

  ipcMain.handle('pw-update', async (e, { id, url, username, password } = {}) => {
    await vaultReady;
    const guard = writeGuard();
    if (guard) return guard;
    const v = vault.find(x => x.id === id); if (!v) return { ok: false };
    if (url != null) {
      const normalized = normalizeSiteUrl(url);
      if (!normalized) return fail('invalid_input');
      v.url = normalized;
    }
    if (username != null) v.username = username;
    if (password) v.password = password;
    await saveVault();
    return { ok: true };
  });

  ipcMain.handle('pw-delete', async (e, id) => {
    await vaultReady;
    const guard = writeGuard();
    if (guard) return guard;
    vault = vault.filter(v => v.id !== id);
    await saveVault();
    return { ok: true };
  });

  ipcMain.handle('pw-count', async () => { await vaultReady; return vault.length; });
  // Şifre denetimi yerelde yapılır; arayüze yalnızca hangi kaydın zayıf/tekrar olduğu gider.
  ipcMain.handle('pw-audit', async () => { await vaultReady; return auditPasswords(vault); });
  ipcMain.handle('pw-encryption-available', async () => { await vaultReady; return encryptionOk && vaultLoadError !== 'decrypt_failed'; });

  ipcMain.handle('pw-import-detect',  () => detectSources());
  ipcMain.handle('pw-import-browser', async (e, id) => { await vaultReady; return importFromBrowser(id); });
  ipcMain.handle('pw-import-csv',     async () => { await vaultReady; return importFromCsv(options.getMainWindow()); });

  // Arayüz için yalnızca KULLANICI ADLARI döner. Eskiden bu kanal herhangi bir
  // origin için düz metin parolaları arayüze veriyordu; otomatik doldurma zaten
  // ana süreçte getForOrigin'i doğrudan çağırıyor, arayüzün parolaya ihtiyacı yok.
  ipcMain.handle('pw-for-origin', async (e, origin) => {
    await vaultReady;
    return getForOrigin(origin).map(({ id, username }) => ({ id, username }));
  });
}

/**
 * Otomatik doldurma için bir sayfaya ait kimlikler (ana süreçten doğrudan çağrılır).
 *
 * Kurallar (denetim Y-11):
 *   • hostname (www. hariç) VE port eşleşmeli — farklı port farklı origin'dir
 *     (ör. :8443 yönetim paneli ile ana site aynı kimliği paylaşmamalı)
 *   • HTTPS için kaydedilmiş kimlik HTTP sayfasına ASLA doldurulmaz. Aksi halde
 *     ağda araya giren biri (açık Wi-Fi, sahte DNS) düz HTTP üzerinden sahte bir
 *     giriş formu sunar ve parola kullanıcı hiçbir şeye dokunmadan forma yazılır.
 */
function getForOrigin(pageUrl) {
  let page;
  try { page = new URL(pageUrl); } catch { return []; }
  if (page.protocol !== 'https:' && page.protocol !== 'http:') return [];
  const host = page.hostname.replace(/^www\./, '');

  return vault
    .filter(v => {
      let saved;
      try { saved = new URL(v.url); } catch { return false; }
      if (saved.hostname.replace(/^www\./, '') !== host) return false;
      if ((saved.port || '') !== (page.port || '')) return false;
      if (saved.protocol === 'https:' && page.protocol !== 'https:') return false;
      return true;
    })
    .map(v => ({ id: v.id, username: v.username, password: v.password }));
}

/**
 * Sayfada gönderilen giriş bilgisini kasayla karşılaştırır (kaydetme önerisi için).
 * Karşılaştırma getForOrigin kurallarıyla yapılır (alan adı + port, https→http yok).
 *   { action: 'same' }         aynı kullanıcı adı ve parola zaten kayıtlı → öneri yok
 *   { action: 'update', id }   aynı kullanıcı adı, farklı parola → "güncellensin mi?"
 *   { action: 'new' }          → "kaydedilsin mi?"
 */
function classifyCapture(pageUrl, username, password) {
  const user = String(username || '');
  const sameUser = getForOrigin(pageUrl).filter((c) => (c.username || '') === user);
  if (sameUser.some((c) => c.password === password)) return { action: 'same' };
  if (sameUser.length) return { action: 'update', id: sameUser[0].id };
  return { action: 'new' };
}

/** Kasaya yazılabiliyor mu (işletim sistemi şifrelemesi var, kasa okunabildi). */
function canSavePasswords() {
  return !writeGuard();
}

/**
 * Kullanıcının "Kaydet"/"Güncelle" dediği giriş bilgisini kasaya yazar. Adres sayfanın
 * kökü (origin) olarak saklanır: aynı sitenin başka giriş sayfasında da doldurulabilir.
 */
async function saveCapturedCredential({ url, username, password, action, existingId } = {}) {
  await vaultReady;
  const guard = writeGuard();
  if (guard) return guard;
  let origin = '';
  try { origin = new URL(url).origin; } catch {}
  const normalized = normalizeSiteUrl(origin);
  if (!normalized || !password) return fail('invalid_input');
  if (action === 'update') {
    const v = vault.find((x) => x.id === existingId);
    if (v) {
      v.password = password;
      v.updatedAt = Date.now();
      await saveVault();
      return { ok: true, action: 'updated' };
    }
  }
  vault.push({ id: genId(), url: normalized, username: String(username || ''), password, createdAt: Date.now(), source: 'saved' });
  await saveVault();
  return { ok: true, action: 'added' };
}

module.exports = {
  setupPasswordManager,
  getForOrigin,
  classifyCapture,
  canSavePasswords,
  saveCapturedCredential,
  _internals: {
    parseCsvPasswords, decryptPassword, blobKind, normalizeSiteUrl, dpapiUnprotectMany,
    // test: kasayı doğrudan kur (dosya/şifreleme olmadan getForOrigin kurallarını sınamak için)
    _setVaultForTest: (v) => { vault = v; },
  },
};
