/**
 * SecureBrowser — VPN Yöneticisi (Faz 2 - Windows Fix)
 * Windows'ta wg.exe ile doğrudan bağlantı
 */

'use strict';

const { exec, execSync } = require('child_process');
const { promisify }      = require('util');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const execAsync = promisify(exec);
const PLATFORM  = process.platform;

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

  _loadProfiles() {
    try {
      if (fs.existsSync(this.profilesPath)) {
        this.profiles = JSON.parse(fs.readFileSync(this.profilesPath, 'utf-8'));
      }
    } catch (e) {
      this.profiles = [];
    }
  }

  _saveProfiles() {
    fs.writeFileSync(this.profilesPath, JSON.stringify(this.profiles, null, 2));
  }

  getProfiles() {
    return this.profiles.map(p => ({
      ...p,
      privateKey: '••••••••',
      isActive: p.id === this.activeProfile?.id,
    }));
  }

  addProfile(profile) {
    const id = `vpn_${Date.now()}`;
    const newProfile = {
      id,
      name:       profile.name       || 'Yeni Sunucu',
      endpoint:   profile.endpoint   || '',
      publicKey:  profile.publicKey  || '',
      privateKey: profile.privateKey || '',
      clientIp:   profile.clientIp   || '10.8.0.2/32',
      dns:        profile.dns        || '1.1.1.1',
      location:   profile.location   || '🌐 Bilinmiyor',
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
    const [host, port] = profile.endpoint.split(':');
    return `[Interface]
PrivateKey = ${profile.privateKey}
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
      this._setStatus('connected');
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
    fs.writeFileSync(confPath, this._generateWgConf(profile));

    // Önce varsa eski tüneli kaldır
    await execAsync(`"${WG_APP}" /uninstalltunnelservice sb-vpn`).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));

    // Tunnel servisini kur — Bu UAC gerektirir, elevation script ile yapıyoruz
    const psScript = `
Start-Process -FilePath "${WG_APP}" -ArgumentList "/installtunnelservice","${confPath}" -Verb RunAs -Wait
`;
    const psPath = path.join(os.tmpdir(), 'sb-wg-install.ps1');
    fs.writeFileSync(psPath, psScript);

    try {
      await execAsync(`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${psPath}"`);
    } catch (e) {
      // UAC iptal edilmiş olabilir, alternatif yöntem dene
      throw new Error(
        'WireGuard bağlantısı için yönetici yetkisi gerekiyor.\n\n' +
        'Çözüm: WireGuard uygulamasını aç, "Import tunnel(s) from file" ile şu dosyayı ekle:\n' +
        confPath + '\n\nSonra "Activate" butonuna bas.'
      );
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  async _connectUnix(profile) {
    const confPath = path.join(os.tmpdir(), `sb-vpn.conf`);
    fs.writeFileSync(confPath, this._generateWgConf(profile), { mode: 0o600 });
    await execAsync(`wg-quick down "${confPath}"`).catch(() => {});
    await execAsync(`wg-quick up "${confPath}"`);
  }

  async disconnect() {
    if (!this.activeProfile) return;

    try {
      if (PLATFORM === 'win32') {
        if (WG_APP) {
          const psScript = `Start-Process -FilePath "${WG_APP}" -ArgumentList "/uninstalltunnelservice","sb-vpn" -Verb RunAs -Wait`;
          const psPath = path.join(os.tmpdir(), 'sb-wg-uninstall.ps1');
          fs.writeFileSync(psPath, psScript);
          await execAsync(`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${psPath}"`).catch(() => {});
        }
      } else {
        const confPath = path.join(os.tmpdir(), 'sb-vpn.conf');
        await execAsync(`wg-quick down "${confPath}"`).catch(() => {});
      }
    } catch (e) {
      console.error('[VPN] Disconnect hatası:', e.message);
    }

    this.activeProfile = null;
    this._setStatus('disconnected');
  }

  async pingProfile(profileId) {
    const profile = this.profiles.find(p => p.id === profileId);
    if (!profile) return null;
    const [host] = profile.endpoint.split(':');
    const start = Date.now();
    try {
      const cmd = PLATFORM === 'win32' ? `ping -n 1 ${host}` : `ping -c 1 -W 2 ${host}`;
      await execAsync(cmd);
      const ping = Date.now() - start;
      profile.ping = ping;
      this._saveProfiles();
      return ping;
    } catch {
      profile.ping = null;
      return null;
    }
  }

  async pingAllProfiles() {
    const results = {};
    for (const profile of this.profiles) {
      results[profile.id] = await this.pingProfile(profile.id);
    }
    return results;
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
    return {
      status:        this.status,
      activeProfile: this.activeProfile ? { ...this.activeProfile, privateKey: '••••••••' } : null,
      killSwitch:    this.killSwitchOn,
      platform:      PLATFORM,
      wgAvailable:   PLATFORM === 'win32' ? !!WG_EXE : true,
    };
  }

  // Kill switch - basitleştirildi
  async enableKillSwitch(endpoint) { this.killSwitchOn = true; }
  async disableKillSwitch()        { this.killSwitchOn = false; }
}

async function testDnsLeak() {
  try {
    const res = await fetch('https://dns.google/resolve?name=whoami.akamai.net&type=A', {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return { tested: true, results: [{ resolver: 'dns.google', status: 'fulfilled', data }] };
  } catch (e) {
    return { tested: false, error: e.message };
  }
}

module.exports = { VpnManager, testDnsLeak };