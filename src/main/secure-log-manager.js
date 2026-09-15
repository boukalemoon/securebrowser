/**
 * İlgezdi — Şifreli Log Sistemi (Faz 3)
 * AES-256-GCM şifreleme + arama/filtreleme + PDF/CSV dışa aktarma
 */

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { safeStorage } = require('electron');

const ALGO         = 'aes-256-gcm';
const KEY_FILE     = 'ilgezdi.key';     // ESKİ: düz metin anahtar (taşınıp silinir)
const KEY_FILE_ENC = 'ilgezdi.key.enc'; // YENİ: safeStorage ile şifreli anahtar

class SecureLogManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.keyPath      = path.join(userDataPath, KEY_FILE);
    this.keyPathEnc   = path.join(userDataPath, KEY_FILE_ENC);
    this.logsPath     = path.join(userDataPath, 'ilgezdi-logs.enc');
    this.syncPath     = path.join(userDataPath, 'sync-queue.json');
    this.canEncrypt   = this._encryptionAvailable();
    this.key          = this.canEncrypt ? this._loadOrCreateKey() : null;
    this.logs         = [];
    this.syncQueue    = [];
    this._loadLogs();
    this._loadSyncQueue();
  }

  // ── Anahtar Yönetimi ─────────────────────────────────────────────────────────
  // AES anahtarı diske DÜZ METİN yazılmaz. safeStorage (Windows DPAPI / macOS
  // Keychain / Linux Secret Service) ile sarmalanır — aksi halde şifreleme,
  // korumayı iddia ettiği tehdide (userData'yı okuyabilen biri) karşı hiçbir şey
  // yapmaz: anahtar şifreli dosyanın yanında durur.
  //
  // safeStorage kullanılamıyorsa (nadir, ör. keyring'siz Linux) loglar ŞİFRESİZ
  // saklanır ve getStats() bunu `encrypted:false` olarak bildirir. Korunmadığı
  // hâlde korunuyormuş gibi göstermek yerine durumu dürüstçe söylemek daha iyi.

  _encryptionAvailable() {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
  }

  _loadOrCreateKey() {
    // 1) Şifreli anahtar varsa onu kullan
    try {
      if (fs.existsSync(this.keyPathEnc)) {
        const b64 = safeStorage.decryptString(fs.readFileSync(this.keyPathEnc));
        const key = Buffer.from(b64, 'base64');
        if (key.length === 32) return key;
        console.warn('[SecureLog] Şifreli anahtar bozuk, yeniden oluşturulacak');
      }
    } catch (e) {
      console.warn('[SecureLog] Şifreli anahtar okunamadı:', e.message);
    }

    // 2) Eski düz metin anahtar varsa AYNI anahtarı koru (yoksa mevcut loglar
    //    çözülemez hâle gelir), şifreli formata taşı ve düz metin kopyayı sil.
    try {
      if (fs.existsSync(this.keyPath)) {
        const key = fs.readFileSync(this.keyPath);
        if (key.length === 32) {
          this._writeKey(key);
          try { fs.unlinkSync(this.keyPath); } catch {}
          console.log('[SecureLog] Düz metin anahtar şifreli formata taşındı');
          return key;
        }
      }
    } catch (e) {
      console.warn('[SecureLog] Eski anahtar taşınamadı:', e.message);
    }

    // 3) Yeni anahtar
    const key = crypto.randomBytes(32);
    this._writeKey(key);
    console.log('[SecureLog] Yeni AES-256 anahtarı oluşturuldu (safeStorage ile korunuyor)');
    return key;
  }

  _writeKey(key) {
    const blob = safeStorage.encryptString(key.toString('base64'));
    const tmp  = this.keyPathEnc + '.tmp';
    fs.writeFileSync(tmp, blob, { mode: 0o600 });
    fs.renameSync(tmp, this.keyPathEnc);
  }

  // ── Şifreleme / Çözme ────────────────────────────────────────────────────────

  _encrypt(data) {
    const iv         = crypto.randomBytes(16);
    const cipher     = crypto.createCipheriv(ALGO, this.key, iv);
    const jsonStr    = JSON.stringify(data);
    const encrypted  = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
    const authTag    = cipher.getAuthTag();
    // Format: iv(16) + authTag(16) + encrypted
    return Buffer.concat([iv, authTag, encrypted]);
  }

  _decrypt(buffer) {
    const iv        = buffer.slice(0, 16);
    const authTag   = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    const decipher  = crypto.createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  // ── Log Yükleme / Kaydetme ───────────────────────────────────────────────────

  // Yarım yazılmış dosya = kayıp geçmiş. Geçici dosyaya yaz, sonra atomik taşı.
  _atomicWrite(target, data) {
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, target);
  }

  _loadLogs() {
    try {
      if (!fs.existsSync(this.logsPath)) return;
      const buffer = fs.readFileSync(this.logsPath);
      if (!buffer.length) return;
      // Şifreli format iv(16)+tag(16)+ct ile başlar; şifresiz format JSON'dur.
      const isJson = buffer[0] === 0x5b /* [ */ || buffer[0] === 0x7b /* { */;
      this.logs = isJson
        ? JSON.parse(buffer.toString('utf8'))
        : this._decrypt(buffer);
      if (!Array.isArray(this.logs)) this.logs = [];
      console.log(`[SecureLog] ${this.logs.length} log yüklendi (şifreli: ${!isJson})`);
    } catch (e) {
      console.warn('[SecureLog] Log yüklenemedi, sıfırlanıyor:', e.message);
      this.logs = [];
    }
  }

  saveLogs() {
    try {
      this._atomicWrite(
        this.logsPath,
        this.canEncrypt ? this._encrypt(this.logs) : Buffer.from(JSON.stringify(this.logs), 'utf8')
      );
    } catch (e) {
      console.error('[SecureLog] Kayıt hatası:', e.message);
    }
  }

  _loadSyncQueue() {
    try {
      if (fs.existsSync(this.syncPath)) {
        const q = JSON.parse(fs.readFileSync(this.syncPath, 'utf-8'));
        this.syncQueue = Array.isArray(q) ? q : [];
      }
    } catch { this.syncQueue = []; }
  }

  _saveSyncQueue() {
    try {
      this._atomicWrite(this.syncPath, Buffer.from(JSON.stringify(this.syncQueue, null, 2), 'utf8'));
    } catch (e) {
      console.error('[SecureLog] Sync kuyruğu yazılamadı:', e.message);
    }
  }

  // ── Log Ekleme ───────────────────────────────────────────────────────────────

  addVisit(data) {
    const entry = {
      id:          `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp:   Date.now(),
      url:         data.url         || '',
      domain:      data.domain      || '',
      title:       data.title       || '',
      vpnActive:   data.vpnActive   || false,
      vpnProfile:  data.vpnProfile  || '',
      duration:    data.duration    || 0,
      blockedReqs: data.blockedReqs || 0,
      synced:      false,
    };
    this.logs.unshift(entry); // En yeni başa
    if (this.logs.length > 10000) this.logs = this.logs.slice(0, 10000); // Max 10k
    this.syncQueue.push(entry.id);
    this._saveSyncQueue();
    return entry;
  }

  // ── Arama ve Filtreleme ──────────────────────────────────────────────────────

  search(query = {}) {
    let results = this.logs.filter(l => l.url); // Sadece visit logları

    // Metin arama
    if (query.text) {
      const q = query.text.toLowerCase();
      results = results.filter(l =>
        l.url?.toLowerCase().includes(q) ||
        l.domain?.toLowerCase().includes(q) ||
        l.title?.toLowerCase().includes(q)
      );
    }

    // Domain filtresi
    if (query.domain) {
      results = results.filter(l => l.domain?.includes(query.domain));
    }

    // Tarih aralığı
    if (query.dateFrom) {
      results = results.filter(l => l.timestamp >= new Date(query.dateFrom).getTime());
    }
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      to.setHours(23, 59, 59, 999);
      results = results.filter(l => l.timestamp <= to.getTime());
    }

    // VPN filtresi
    if (query.vpnOnly) {
      results = results.filter(l => l.vpnActive);
    }

    // Sıralama
    if (query.sortBy === 'domain') {
      results.sort((a, b) => (a.domain || '').localeCompare(b.domain || ''));
    } else {
      results.sort((a, b) => b.timestamp - a.timestamp); // Varsayılan: en yeni önce
    }

    // Sayfalama
    const page  = query.page  || 1;
    const limit = query.limit || 50;
    const total = results.length;
    const items = results.slice((page - 1) * limit, page * limit);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  getStats() {
    const visits  = this.logs.filter(l => l.url);
    const today   = Date.now() - 86400000;
    const domains = [...new Set(visits.map(l => l.domain))];

    return {
      totalVisits:    visits.length,
      todayVisits:    visits.filter(l => l.timestamp > today).length,
      uniqueDomains:  domains.length,
      vpnVisits:      visits.filter(l => l.vpnActive).length,
      logSizeKb:      fs.existsSync(this.logsPath)
                        ? Math.round(fs.statSync(this.logsPath).size / 1024)
                        : 0,
      // Gerçek durumu bildir — safeStorage yoksa şifreleme de yoktur.
      encrypted:      this.canEncrypt,
      keyExists:      fs.existsSync(this.keyPathEnc),
    };
  }

  clearLogs() {
    this.logs      = [];
    this.syncQueue = [];
    this.saveLogs();
    this._saveSyncQueue();
  }

  /** Geçmiş sayfasından tek tek silme. Senkron kuyruğundan da çıkarılır. */
  deleteEntries(ids) {
    const remove = new Set(Array.isArray(ids) ? ids : []);
    if (!remove.size) return 0;
    const before = this.logs.length;
    this.logs = this.logs.filter((l) => !remove.has(l.id));
    this.syncQueue = this.syncQueue.filter((id) => !remove.has(id));
    const removed = before - this.logs.length;
    if (removed) {
      this.saveLogs();
      this._saveSyncQueue();
    }
    return removed;
  }

  // ── CSV Dışa Aktarma ──────────────────────────────────────────────────────────

  /**
   * CSV hücresi (RFC 4180 + formül enjeksiyonu koruması) — denetim O-11.
   *
   * Eskiden alanlar tırnaklanmadan virgülle birleştiriliyordu: virgül içeren
   * her URL (çok yaygın) satırı kaydırıyordu. Daha önemlisi, =, +, -, @ ile
   * başlayan hücreler Excel/LibreOffice'te FORMÜL olarak çalışır — sayfa
   * başlığını `=HYPERLINK(...)` ya da DDE yükü yapan bir site, kullanıcı CSV'yi
   * açtığında makinesinde işlem tetikleyebilirdi. Başına ' eklenerek metne çevrilir.
   */
  static csvCell(value) {
    let s = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  exportCSV(query = {}) {
    const { items } = this.search({ ...query, limit: 99999 });
    const cell = SecureLogManager.csvCell;
    const headers = ['Tarih', 'Saat', 'Alan adı', 'URL', 'Başlık', 'VPN', 'VPN Profil', 'Süre(ms)'];
    const rows = items.map(l => {
      const d = new Date(l.timestamp);
      return [
        d.toLocaleDateString('tr-TR'),
        d.toLocaleTimeString('tr-TR'),
        l.domain || '',
        l.url    || '',
        l.title  || '',
        l.vpnActive ? 'Evet' : 'Hayır',
        l.vpnProfile || '',
        Number(l.duration) || 0,
      ].map(cell).join(',');
    });
    // CRLF: Excel'in beklediği satır sonu (RFC 4180)
    return [headers.map(cell).join(','), ...rows].join('\r\n');
  }

  // ── Oracle Senkronizasyon ─────────────────────────────────────────────────────
  // Şifreli paket olarak gönderilir — sunucu içeriği göremez

  async syncToServer(serverUrl, apiKey) {
    if (!serverUrl || !this.syncQueue.length) return { synced: 0 };
    // Şifreleme yoksa logları düz metin göndermeyiz.
    if (!this.canEncrypt) return { synced: 0, success: false, error: 'encryption_unavailable' };

    const pendingIds  = [...this.syncQueue];
    const pendingLogs = this.logs.filter(l => pendingIds.includes(l.id));

    // Şifreli paket oluştur
    const packet = this._encrypt(pendingLogs);
    const b64    = packet.toString('base64');

    try {
      const res = await fetch(`${serverUrl}/sync`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-API-Key':     apiKey || '',
          'X-Client-Version': '3.0',
        },
        body: JSON.stringify({
          payload:   b64,
          count:     pendingLogs.length,
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        // Senkronize edilenleri işaretle
        this.logs.forEach(l => {
          if (pendingIds.includes(l.id)) l.synced = true;
        });
        this.syncQueue = this.syncQueue.filter(id => !pendingIds.includes(id));
        this._saveSyncQueue();
        this.saveLogs();
        return { synced: pendingLogs.length, success: true };
      } else {
        return { synced: 0, success: false, error: `HTTP ${res.status}` };
      }
    } catch (e) {
      return { synced: 0, success: false, error: e.message };
    }
  }
}

module.exports = { SecureLogManager };
