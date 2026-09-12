/**
 * SecureBrowser — VPN Yöneticisi (Faz 2 - Windows Fix)
 * Windows'ta wg.exe ile doğrudan bağlantı
 */

'use strict';

const { execFile }    = require('child_process');
const { promisify }   = require('util');
const { safeStorage } = require('electron');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// NOT: Bu modülde `exec` KULLANILMAZ. `exec` komutu kabuk üzerinden çalıştırır;
// profil alanları kullanıcıdan (ya da yapıştırılan bir sunucu yapılandırmasından)
// geldiği için kabuğa açılan her satır komut enjeksiyonu demektir. Her yerde
// `execFile` + argüman dizisi kullanılır.
const execFileAsync = promisify(execFile);
const PLATFORM      = process.platform;
const { log: diag } = require('./diagnostics');

// ─── Profil Alanı Doğrulama ───────────────────────────────────────────────────
// İki ayrı saldırı yüzeyini birlikte kapatır:
//   1) Alanlar işletim sistemi komutlarına argüman olarak giriyor (ping).
//   2) Alanlar WireGuard .conf dosyasına yazılıyor; bu dosya Windows'ta
//      yükseltilmiş bir servise, Linux'ta `wg-quick`e (root) veriliyor ve
//      wg-quick `PostUp = <kabuk komutu>` direktifini çalıştırır. Bir alana
//      satır sonu sokabilen saldırgan root'a yükselir.
// Bu yüzden doğrulama "temizle" değil "şemaya uymuyorsa reddet" biçimindedir.

const RE_IPV4     = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const RE_IPV6     = /^[0-9A-Fa-f:]{2,45}$/;
const RE_HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
// WireGuard anahtarı = 32 baytın base64'ü = 44 karakter. Kalıp hem biçimi
// doğrular hem satır sonu / kabuk metakarakteri geçmesini engeller.
const RE_WG_KEY   = /^[A-Za-z0-9+/=]{44}$/;

function isIpv4(s) {
  return RE_IPV4.test(s) && s.split('.').every(o => Number(o) <= 255);
}
function isHost(s) {
  if (typeof s !== 'string' || s.length > 253) return false;
  // "1.2.3.999" teknik olarak geçerli bir hostname kalıbıdır ama neredeyse her
  // zaman yazım hatası olan bir IP'dir. IPv4 biçiminde görünen bir adres varsa
  // geçerli bir IPv4 OLMAK zorunda — yoksa kullanıcı bağlanamayıp nedenini
  // anlamıyor. (Güvenlik açısından fark etmez; kabuk karakteri yine geçemez.)
  if (/^\d+(?:\.\d+){3}$/.test(s)) return isIpv4(s);
  return RE_IPV6.test(s) || RE_HOSTNAME.test(s);
}
function isAddrCidr(s) {
  const [addr, mask, ...rest] = String(s).split('/');
  if (rest.length) return false;
  if (mask !== undefined && !/^\d{1,3}$/.test(mask)) return false;
  if (mask !== undefined && Number(mask) > 128) return false;
  return isIpv4(addr) || RE_IPV6.test(addr);
}
function isDnsList(s) {
  const parts = String(s).split(',').map(x => x.trim()).filter(Boolean);
  return parts.length > 0 && parts.length <= 4 && parts.every(p => isIpv4(p) || RE_IPV6.test(p));
}

/** "host:port" → {host, port}; geçersizse null. IPv6 için [::1]:51820 biçimi. */
function parseEndpoint(endpoint) {
  const s = String(endpoint || '').trim();
  const m = /^\[([0-9A-Fa-f:]+)\]:(\d{1,5})$/.exec(s) || /^([^\s:/\\]+):(\d{1,5})$/.exec(s);
  if (!m) return null;
  const host = m[1];
  const port = Number(m[2]);
  if (!isHost(host) || !(port >= 1 && port <= 65535)) return null;
  return { host, port };
}

/** Görünen ad / konum: kontrol karakteri yok, uzunluk sınırlı. */
function cleanLabel(s, max = 60) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/** Profil geçerliyse null, değilse kullanıcıya gösterilecek hata metni döner. */
function validateProfileInput(p) {
  if (!parseEndpoint(p.endpoint)) {
    return 'Sunucu adresi geçersiz. Beklenen biçim: sunucu.adresi:51820';
  }
  if (!RE_WG_KEY.test(String(p.publicKey || '').trim())) {
    return 'Sunucu public key geçersiz. 44 karakterlik base64 bir WireGuard anahtarı bekleniyor.';
  }
  const priv = String(p.privateKey || '').trim();
  if (priv && priv !== '••••••••' && !RE_WG_KEY.test(priv)) {
    return 'Private key geçersiz. 44 karakterlik base64 bir WireGuard anahtarı bekleniyor.';
  }
  if (p.clientIp && !isAddrCidr(String(p.clientIp).trim())) {
    return 'İstemci IP geçersiz. Örnek: 10.8.0.2/32';
  }
  if (p.dns && !isDnsList(p.dns)) {
    return 'DNS geçersiz. Örnek: 1.1.1.1 veya 1.1.1.1, 1.0.0.1';
  }
  return null;
}

const WG_EXE = (() => {
  const paths = [
    'C:\\Program Files\\WireGuard\\wg.exe',
    'C:\\Program Files (x86)\\WireGuard\\wg.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
})();

const WG_APP = (() => {
  const paths = [
    'C:\\Program Files\\WireGuard\\wireguard.exe',
    'C:\\Program Files (x86)\\WireGuard\\wireguard.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
})();

class VpnManager {
  constructor(userDataPath) {
    this.userDataPath    = userDataPath;
    this.profilesPath    = path.join(userDataPath, 'vpn-profiles.json');
    this.profiles        = [];
    this.activeProfile   = null;
    this.status          = 'disconnected';
    this.killSwitchOn    = false;
    this.statusListeners = [];
    this._loadProfiles();
  }

  // WireGuard private key'leri diske düz metin yazılmaz — safeStorage ile şifrelenir.
  _encryptKey(plain) {
    if (!plain) return '';
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plain).toString('base64');
    }
    return plain; // şifreleme yoksa (nadir) mevcut davranışa düş
  }

  _decryptKey(stored) {
    if (!stored) return '';
    if (stored.startsWith('enc:')) {
      try { return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64')); }
      catch { return ''; }
    }
    return stored; // eski düz metin kayıt
  }

  _loadProfiles() {
    try {
      if (fs.existsSync(this.profilesPath)) {
        this.profiles = JSON.parse(fs.readFileSync(this.profilesPath, 'utf-8'));
        // Eski düz metin anahtarları şifreli formata taşı
        let migrated = false;
        for (const p of this.profiles) {
          if (p.privateKey && !p.privateKey.startsWith('enc:') && p.privateKey !== '••••••••') {
            p.privateKey = this._encryptKey(p.privateKey);
            migrated = true;
          }
        }
        if (migrated) this._saveProfiles();
      }
    } catch (e) {
      this.profiles = [];
    }
  }

  _saveProfiles() {
    // Atomik yazma: yarım yazılmış dosya, _loadProfiles'ın catch'ine düşüp
    // kullanıcının tüm VPN profillerini sessizce silerdi.
    try {
      const tmp = this.profilesPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.profiles, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.profilesPath);
    } catch (e) {
      console.error('[VPN] Profiller yazılamadı:', e.message);
    }
  }

  getProfiles() {
    return this.profiles.map(p => ({
      ...p,
      privateKey: '••••••••',
      isActive: p.id === this.activeProfile?.id,
    }));
  }

  addProfile(profile) {
    // Varsayılanları doğrulamadan ÖNCE uygula — boş alan gelirse şema ihlali
    // sayılmasın, ama kullanıcının yazdığı her şey şemadan geçsin.
    const candidate = {
      endpoint:   String(profile.endpoint   || '').trim(),
      publicKey:  String(profile.publicKey  || '').trim(),
      privateKey: String(profile.privateKey || '').trim(),
      clientIp:   String(profile.clientIp   || '').trim() || '10.8.0.2/32',
      dns:        String(profile.dns        || '').trim() || '1.1.1.1',
    };

    const err = validateProfileInput(candidate);
    if (err) throw new Error(err);
    if (!candidate.privateKey) throw new Error('Private key zorunludur.');

    const newProfile = {
      id:         `vpn_${Date.now()}`,
      name:       cleanLabel(profile.name)     || 'Yeni Sunucu',
      endpoint:   candidate.endpoint,
      publicKey:  candidate.publicKey,
      privateKey: this._encryptKey(candidate.privateKey),
      clientIp:   candidate.clientIp,
      dns:        candidate.dns,
      location:   cleanLabel(profile.location, 40) || '🌐 Bilinmiyor',
      isActive:   false,
      ping:       null,
    };
    this.profiles.push(newProfile);
    this._saveProfiles();
    return { ...newProfile, privateKey: '••••••••' };
  }

  removeProfile(id) {
    if (this.activeProfile?.id === id) {
      throw new Error('Aktif bağlantıyı silmeden önce bağlantıyı kes.');
    }
    this.profiles = this.profiles.filter(p => p.id !== id);
    this._saveProfiles();
  }

  _generateWgConf(profile) {
    // İKİNCİ savunma katmanı. Profil addProfile'da doğrulanır, ama diskteki eski
    // kayıtlar (doğrulama eklenmeden önce yazılmış olanlar) ya da elle düzenlenmiş
    // vpn-profiles.json buraya doğrudan gelebilir. Yazmadan önce yine doğrula:
    // bu dosya yükseltilmiş yetkiyle işlenecek.
    const err = validateProfileInput(profile);
    if (err) throw new Error('Profil güvenlik doğrulamasından geçemedi: ' + err);

    const privateKey = this._decryptKey(profile.privateKey);
    if (!RE_WG_KEY.test(privateKey)) {
      throw new Error('Private key geçersiz — yapılandırma oluşturulmadı.');
    }

    // Doğrulanmış alanlar satır sonu içeremez; yine de son bir kontrol yapalım.
    const fields = [privateKey, profile.clientIp, profile.dns, profile.publicKey, profile.endpoint];
    if (fields.some(f => /[\r\n]/.test(String(f)))) {
      throw new Error('Profil alanlarında satır sonu var — yapılandırma oluşturulmadı.');
    }

    return `[Interface]
PrivateKey = ${privateKey}
Address = ${profile.clientIp}
DNS = ${profile.dns}

[Peer]
PublicKey = ${profile.publicKey}
Endpoint = ${profile.endpoint}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;
  }

  async connect(profileId) {
    const profile = this.profiles.find(p => p.id === profileId);
    if (!profile) throw new Error('Profil bulunamadı.');
    if (!profile.privateKey || profile.privateKey === '••••••••') {
      throw new Error('Profil bilgileri eksik.');
    }

    if (this.activeProfile) await this.disconnect().catch(() => {});

    this._setStatus('connecting');

    try {
      if (PLATFORM === 'win32') {
        await this._connectWindows(profile);
      } else {
        await this._connectUnix(profile);
      }

      this.activeProfile = profile;

      // Komutun hata vermemesi tünelin gerçekten kalktığı anlamına GELMEZ
      // (servis kurulup hemen durabilir, sunucu anahtarı yanlış olabilir).
      // Doğrulanamayan bağlantı "bağlı" diye gösterilmez (denetim Y-07).
      const up = await this._verifyTunnel();
      if (!up) {
        const state = PLATFORM === 'win32' ? await this._serviceState() : 'unknown';
        // Kurulu ama çalışmayan servis kalmasın; hiç kurulmadıysa temizlik gereksiz.
        if (state !== 'missing') await this.disconnect().catch(() => {});
        this.activeProfile = null;
        throw new Error(
          'Tünel başlatıldı ama bağlantı doğrulanamadı.\n\n' +
          'WireGuard kurulumunu ve sunucu bilgilerini (endpoint, public key) kontrol edin.'
        );
      }

      this._setStatus('connected');
      this._startMonitor();
      diag.info('vpn', 'VPN bağlandı ve doğrulandı', { platform: PLATFORM });
      console.log('[VPN] Bağlandı:', profile.name);
      return { success: true, profile: { ...profile, privateKey: '••••••••' } };

    } catch (e) {
      this._setStatus('error');
      console.error('[VPN] Hata:', e.message);
      throw e;
    }
  }

  async _connectWindows(profile) {
    if (!WG_EXE) throw new Error('WireGuard (wg.exe) bulunamadı. Lütfen WireGuard kurun.');

    const confPath = path.join(os.tmpdir(), `sb-vpn.conf`);
    const psPath   = path.join(os.tmpdir(), 'sb-wg-install.ps1');
    // conf private key içerir — HER çıkış yolunda silinmesi gerekir (finally).
    fs.writeFileSync(confPath, this._generateWgConf(profile), { mode: 0o600 });

    try {
      // Önce varsa eski tüneli kaldır
      await execFileAsync(WG_APP, ['/uninstalltunnelservice', 'sb-vpn']).catch(() => {});
      await new Promise(r => setTimeout(r, 1000));

      // Tunnel servisini kur — UAC gerektirir, yükseltme betiğiyle yapıyoruz.
      // WG_APP ve confPath program denetimindeki sabitler; profil verisi bu
      // betiğe HİÇ girmez.
      const psScript =
        `Start-Process -FilePath '${WG_APP.replace(/'/g, "''")}' ` +
        `-ArgumentList '/installtunnelservice','${confPath.replace(/'/g, "''")}' -Verb RunAs -Wait\n`;
      fs.writeFileSync(psPath, psScript);

      try {
        await execFileAsync('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-WindowStyle', 'Hidden', '-File', psPath,
        ]);
      } catch (e) {
        // UAC iptal edilmiş olabilir. NOT: Eskiden bu mesaj kullanıcıyı temp
        // dosyayı elle içe aktarmaya yönlendirip private key'i diskte bırakıyordu.
        throw new Error(
          'WireGuard bağlantısı için yönetici yetkisi gerekiyor.\n\n' +
          'Yükseltme isteğini onayladığınızdan emin olup yeniden deneyin.'
        );
      }

      await new Promise(r => setTimeout(r, 2000));
    } finally {
      // Servis conf'u kendi korumalı deposuna kopyaladı; bizim kopyamız gitmeli.
      try { fs.unlinkSync(psPath); } catch {}
      try { fs.unlinkSync(confPath); } catch {}
    }
  }

  async _connectUnix(profile) {
    const confPath = path.join(os.tmpdir(), `sb-vpn.conf`);
    fs.writeFileSync(confPath, this._generateWgConf(profile), { mode: 0o600 });
    try {
      await execFileAsync('wg-quick', ['down', confPath]).catch(() => {});
      await execFileAsync('wg-quick', ['up', confPath]);
    } catch (e) {
      // Bağlantı kurulamadı → private key içeren dosyayı hemen sil.
      try { fs.unlinkSync(confPath); } catch {}
      throw e;
    }
    // Başarılıysa dosya KALIR: `wg-quick down` bağlantıyı kesmek için bu dosyaya
    // ihtiyaç duyuyor (arayüz adıyla kapatmak /etc/wireguard/<ad>.conf arar).
    // disconnect() tünel kapandıktan sonra siliyor. Unix'te mode 0600 gerçekten
    // uygulandığı için dosya yalnızca bu kullanıcı ve root tarafından okunabilir.
  }

  async disconnect() {
    if (!this.activeProfile) return;

    try {
      if (PLATFORM === 'win32') {
        if (WG_APP) {
          const psScript =
            `Start-Process -FilePath '${WG_APP.replace(/'/g, "''")}' ` +
            `-ArgumentList '/uninstalltunnelservice','sb-vpn' -Verb RunAs -Wait\n`;
          const psPath = path.join(os.tmpdir(), 'sb-wg-uninstall.ps1');
          fs.writeFileSync(psPath, psScript);
          await execFileAsync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Hidden', '-File', psPath,
          ]).catch(() => {});
          try { fs.unlinkSync(psPath); } catch {}
        }
        try { fs.unlinkSync(path.join(os.tmpdir(), 'sb-vpn.conf')); } catch {}
      } else {
        const confPath = path.join(os.tmpdir(), 'sb-vpn.conf');
        await execFileAsync('wg-quick', ['down', confPath]).catch(() => {});
        try { fs.unlinkSync(confPath); } catch {}
      }
    } catch (e) {
      console.error('[VPN] Disconnect hatası:', e.message);
    }

    // Kesme komutunun sonucuna güvenme — UAC iptal edildiyse tünel hâlâ açıktır.
    // Eskiden bu durumda da "bağlı değil" deniyordu: kullanıcı VPN'in kapandığını
    // sanıyor, trafik ise hâlâ tünelden geçiyordu (denetim Y-07).
    const stillUp = await this._verifyTunnelOnce().catch(() => false);
    if (stillUp) {
      diag.warn('vpn', 'Bağlantı kesme tamamlanamadı, tünel hâlâ açık', { platform: PLATFORM });
      throw new Error('Bağlantı kesilemedi — tünel hâlâ açık. Yönetici onayını verdiğinizden emin olup yeniden deneyin.');
    }

    this._stopMonitor();
    this.activeProfile = null;
    this._setStatus('disconnected');
    diag.info('vpn', 'VPN bağlantısı kesildi', { platform: PLATFORM });
  }

  async pingProfile(profileId) {
    const profile = this.profiles.find(p => p.id === profileId);
    if (!profile) return null;

    // endpoint doğrulanmış şemadan geçmeli. Doğrulama eklenmeden önce kaydedilmiş
    // bir profil şemaya uymuyorsa ping ATLANIR — komuta asla ham metin geçmez.
    const ep = parseEndpoint(profile.endpoint);
    if (!ep) { profile.ping = null; return null; }

    // execFile + argüman dizisi: kabuk yok, dolayısıyla enjeksiyon yok.
    // Windows'ta -w ile zaman aşımı veriyoruz; yoksa erişilemeyen sunucu
    // saniyelerce bekletip arayüzü kilitliyordu.
    const args = PLATFORM === 'win32'
      ? ['-n', '1', '-w', '2000', ep.host]
      : ['-c', '1', '-W', '2', ep.host];

    const start = Date.now();
    try {
      await execFileAsync('ping', args, { timeout: 5000, windowsHide: true });
      profile.ping = Date.now() - start;
      return profile.ping;
    } catch {
      profile.ping = null;
      return null;
    }
  }

  async pingAllProfiles() {
    // Paralel: sıralı ping, erişilemeyen birkaç sunucuda IPC çağrısını
    // (ve onunla birlikte VPN panelini) onlarca saniye bekletiyordu.
    const entries = await Promise.all(
      this.profiles.map(async (p) => [p.id, await this.pingProfile(p.id)])
    );
    this._saveProfiles(); // ölçüm sonuçlarını tek seferde yaz
    return Object.fromEntries(entries);
  }

  async getConnectionStatus() {
    if (!this.activeProfile) return { connected: false };
    return {
      connected: this.status === 'connected',
      profile: this.activeProfile ? { ...this.activeProfile, privateKey: '••••••••' } : null,
      killSwitch: this.killSwitchOn,
    };
  }

  _setStatus(status) {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status, this.activeProfile));
  }

  onStatusChange(cb) {
    this.statusListeners.push(cb);
  }

  getStatus() {
    const connected = this.status === 'connected' && !!this.activeProfile;
    // KILL SWITCH — GERÇEK DURUM (denetim Y-06)
    // Eskiden enableKillSwitch/disableKillSwitch yalnızca bir bayrağı değiştiriyordu
    // ve hiçbir yerden çağrılmıyordu: güvenlik duvarı kuralı yoktu, tünel düşünce
    // trafik doğrudan çıkıyordu. Artık yalnızca gerçekten sağlanan koruma bildirilir:
    //
    //  • Windows: WireGuard, tek eşin AllowedIPs değeri 0.0.0.0/0 ve ::/0 olduğunda
    //    tünel dışı trafiği kendi WFP (Windows Filtering Platform) kurallarıyla
    //    engeller (wireguard-windows, docs/netquirk.md). _generateWgConf tam olarak
    //    bu yapılandırmayı üretiyor → DOĞRULANMIŞ bağlantı varken koruma etkindir.
    //  • Linux / macOS (wg-quick): yerleşik böyle bir koruma yok. Tünel düşerse
    //    trafik korumasız çıkar → "desteklenmiyor" olarak bildirilir.
    const killSwitchSupported = PLATFORM === 'win32';
    return {
      status:        this.status,   // connected | connecting | disconnected | dropped | error
      activeProfile: this.activeProfile ? { ...this.activeProfile, privateKey: '••••••••' } : null,
      killSwitch:    connected && killSwitchSupported,
      killSwitchSupported,
      lastDropAt:    this.lastDropAt || null,
      platform:      PLATFORM,
      wgAvailable:   PLATFORM === 'win32' ? !!WG_EXE : true,
    };
  }

  // ─── Tünel doğrulama ─────────────────────────────────────────────────────────
  // Buradaki yöntemlerin hiçbiri yönetici yetkisi GEREKTİRMEZ. `wg show`
  // gerektirirdi; yetkisiz çalışınca hep "bağlı değil" döneceği için kullanılmıyor.

  /** Windows servis durumu: running | starting | stopped | missing | unknown */
  async _serviceState() {
    // WireGuard Windows her tüneli "WireGuardTunnel$<ad>" adlı bir servis olarak çalıştırır.
    try {
      const { stdout } = await execFileAsync('sc.exe', ['query', 'WireGuardTunnel$sb-vpn'],
        { windowsHide: true, timeout: 5000 });
      const out = String(stdout || '');
      if (out.includes('RUNNING'))       return 'running';
      if (out.includes('START_PENDING')) return 'starting';
      if (out.includes('STOP'))          return 'stopped';
      // Durum sözcükleri beklenmedik biçimdeyse sayısal koda bak (4 = RUNNING).
      if (/STATE\s*:\s*4\s/.test(out))   return 'running';
      return 'unknown';
    } catch (e) {
      const out = String((e && (e.stdout || e.stderr || e.message)) || '');
      if (out.includes('1060')) return 'missing';   // ERROR_SERVICE_DOES_NOT_EXIST
      return 'unknown';
    }
  }

  async _verifyTunnelOnce() {
    if (PLATFORM === 'win32')  return (await this._serviceState()) === 'running';
    // Linux: arayüz /sys/class/net altında görünür.
    if (PLATFORM === 'linux')  return fs.existsSync('/sys/class/net/sb-vpn');
    // macOS: wg-quick gerçek utun adını /var/run/wireguard/<ad>.name içinde tutar.
    if (PLATFORM === 'darwin') return fs.existsSync('/var/run/wireguard/sb-vpn.name');
    return false;
  }

  /** Servisin ayağa kalkması birkaç saniye sürebilir — kısa süre bekleyerek doğrula. */
  async _verifyTunnel(attempts = 6) {
    for (let i = 0; i < attempts; i++) {
      if (PLATFORM === 'win32') {
        const st = await this._serviceState();
        if (st === 'running') return true;
        if (st === 'missing') return false;
      } else if (await this._verifyTunnelOnce()) {
        return true;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  /** Bağlıyken tüneli izle; beklenmedik düşüşte kullanıcıyı "bağlı" yanılgısında bırakma. */
  _startMonitor() {
    this._stopMonitor();
    this._monitor = setInterval(async () => {
      if (this.status !== 'connected' || !this.activeProfile || this._checking) return;
      this._checking = true;
      try {
        // Tek başarısız kontrol geçici olabilir (sorgu zaman aşımı) —
        // düşüş ilan etmeden önce bir kez daha dene.
        let up = await this._verifyTunnelOnce().catch(() => false);
        if (!up) {
          await new Promise(r => setTimeout(r, 2000));
          up = await this._verifyTunnelOnce().catch(() => false);
        }
        if (!up && this.status === 'connected') {
          this._stopMonitor();
          this.activeProfile = null;
          this.lastDropAt = Date.now();
          diag.warn('vpn', 'Tünel izleme: bağlantı düştü', { platform: PLATFORM });
          this._setStatus('dropped');
        }
      } finally {
        this._checking = false;
      }
    }, 10000);
    if (this._monitor.unref) this._monitor.unref();
  }

  _stopMonitor() {
    if (this._monitor) { clearInterval(this._monitor); this._monitor = null; }
  }

  /**
   * Açılışta sistemle eşitle. Uygulama çöktüyse ya da tünel önceki oturumdan
   * açık kaldıysa arayüz "bağlı değil" derken trafik hâlâ tünelden geçiyor
   * olabilir. Bu durumda kullanıcının kapatabilmesi için tüneli görünür kıl.
   */
  async reconcile() {
    const up = await this._verifyTunnelOnce().catch(() => false);
    if (!up || this.activeProfile) return;
    this.activeProfile = {
      id: null, name: 'Önceki oturumdan kalan tünel', endpoint: '—',
      location: '🌐', publicKey: '', privateKey: '', clientIp: '', dns: '',
    };
    diag.warn('vpn', 'Açılışta önceki oturumdan kalan açık tünel bulundu', { platform: PLATFORM });
    this._setStatus('connected');
    this._startMonitor();
  }

  // ─── DNS sızıntı testi (denetim Y-08) ───────────────────────────────────────
  async testDnsLeak() {
    // Sistem çözümleyicisini (getaddrinfo) kullanan dns.lookup ile Akamai'nin
    // whoami kaydı sorgulanır; bu kayıt, sorguyu Akamai'ye ileten ÇÖZÜMLEYİCİNİN
    // IP'sini döndürür. Eski test sorguyu Google DoH üzerinden yaptığı için her
    // koşulda Google'ın IP'sini görüyor ve hiçbir sızıntıyı yakalayamıyordu.
    const dnsp = require('dns').promises;
    const withTimeout = (p, ms) => Promise.race([
      p, new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ms)),
    ]);

    let resolverIp = null;
    try {
      const r = await withTimeout(dnsp.lookup('whoami.akamai.net', { family: 4 }), 6000);
      resolverIp = r && r.address;
    } catch (e) {
      return { tested: false, error: 'DNS sorgusu başarısız: ' + (e.message || e) };
    }

    const connected = this.status === 'connected' && !!this.activeProfile;
    const vpnDns = connected ? String(this.activeProfile.dns || '') : '';
    let endpointIp = null;
    if (connected) {
      const ep = parseEndpoint(this.activeProfile.endpoint);
      if (ep) {
        endpointIp = isIpv4(ep.host)
          ? ep.host
          : await withTimeout(dnsp.lookup(ep.host, { family: 4 }), 4000).then(r => r.address).catch(() => null);
      }
    }

    let verdict;
    let level;
    if (!connected) {
      level = 'info';
      verdict = 'VPN bağlı değil. DNS sorguları ağınızın çözümleyicisinden geçiyor — bu beklenen durumdur.';
    } else if (endpointIp && resolverIp === endpointIp) {
      level = 'ok';
      verdict = 'Güvenli: DNS sorguları VPN sunucusu üzerinden çıkıyor.';
    } else {
      level = 'warn';
      verdict = 'Kesin doğrulanamadı. Çözümleyici IP: ' + resolverIp +
        '. Bu IP VPN sağlayıcınıza ya da tünelde tanımlı DNS sunucusuna aitse sorun yok; ' +
        'internet servis sağlayıcınıza aitse DNS sızıntısı var.';
    }
    diag.info('vpn', 'DNS sızıntı testi yapıldı', { level, vpnConnected: connected });
    return { tested: true, resolverIp, vpnConnected: connected, vpnDns, endpointIp, verdict, level };
  }
}

module.exports = {
  VpnManager,
  // Saf doğrulama yardımcıları — güvenlik sınırını oluşturdukları için
  // testten geçirilebilir olmaları gerekiyor.
  _internals: { parseEndpoint, validateProfileInput, isIpv4, isHost, isAddrCidr, isDnsList, cleanLabel },
};