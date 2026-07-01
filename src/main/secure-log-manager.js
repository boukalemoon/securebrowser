/**
 * İlgezdi — Şifreli Log Sistemi (Faz 3)
 * AES-256-GCM şifreleme + arama/filtreleme + PDF/CSV dışa aktarma
 */

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const ALGO      = 'aes-256-gcm';
const KEY_FILE  = 'ilgezdi.key';

class SecureLogManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.keyPath      = path.join(userDataPath, KEY_FILE);
    this.logsPath     = path.join(userDataPath, 'ilgezdi-logs.enc');
    this.syncPath     = path.join(userDataPath, 'sync-queue.json');
    this.key          = this._loadOrCreateKey();
    this.logs         = [];
    this.syncQueue    = [];
    this._loadLogs();
    this._loadSyncQueue();
  }

  // ── Anahtar Yönetimi ─────────────────────────────────────────────────────────

  _loadOrCreateKey() {
    try {
      if (fs.existsSync(this.keyPath)) {
        return fs.readFileSync(this.keyPath);
      }
    } catch {}
    // Yeni 256-bit anahtar oluştur
    const key = crypto.randomBytes(32);
    fs.writeFileSync(this.keyPath, key, { mode: 0o600 });
    console.log('[SecureLog] Yeni AES-256 anahtarı oluşturuldu');
    return key;
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

  _loadLogs() {
    try {
      if (fs.existsSync(this.logsPath)) {
        const buffer = fs.readFileSync(this.logsPath);
        this.logs    = this._decrypt(buffer);
        console.log(`[SecureLog] ${this.logs.length} şifreli log yüklendi`);
      }
    } catch (e) {
      console.warn('[SecureLog] Log yüklenemedi, sıfırlanıyor:', e.message);
      this.logs = [];
    }
  }

  saveLogs() {
    try {
      const encrypted = this._encrypt(this.logs);
      fs.writeFileSync(this.logsPath, encrypted);
    } catch (e) {
      console.error('[SecureLog] Kayıt hatası:', e.message);
    }
  }

  _loadSyncQueue() {
    try {
      if (fs.existsSync(this.syncPath)) {
        this.syncQueue = JSON.parse(fs.readFileSync(this.syncPath, 'utf-8'));
      }
    } catch { this.syncQueue = []; }
  }

  _saveSyncQueue() {
    fs.writeFileSync(this.syncPath, JSON.stringify(this.syncQueue, null, 2));
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

  addBlocked(data) {
    // Engellenen istekler ayrı sayaç olarak tutulur (log şişirmeyelim)
    const today = new Date().toDateString();
    const existing = this.logs.find(l => l.type === 'blocked_summary' && l.date === today);
    if (existing) {
      existing.count = (existing.count || 0) + 1;
    } else {
      this.logs.unshift({ type: 'blocked_summary', date: today, count: 1, timestamp: Date.now() });
    }
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
    const blocked = this.logs.find(l => l.type === 'blocked_summary' && l.date === new Date().toDateString());

    return {
      totalVisits:    visits.length,
      todayVisits:    visits.filter(l => l.timestamp > today).length,
      uniqueDomains:  domains.length,
      vpnVisits:      visits.filter(l => l.vpnActive).length,
      blockedToday:   blocked?.count || 0,
      logSizeKb:      fs.existsSync(this.logsPath)
                        ? Math.round(fs.statSync(this.logsPath).size / 1024)
                        : 0,
      encrypted:      true,
      keyExists:      fs.existsSync(this.keyPath),
    };
  }

  clearLogs() {
    this.logs      = [];
    this.syncQueue = [];
    this.saveLogs();
    this._saveSyncQueue();
  }

  // ── CSV Dışa Aktarma ──────────────────────────────────────────────────────────

  exportCSV(query = {}) {
    const { items } = this.search({ ...query, limit: 99999 });
    const headers = ['Tarih', 'Saat', 'Domain', 'URL', 'Başlık', 'VPN', 'VPN Profil', 'Süre(ms)', 'Engellenen'];
    const rows = items.map(l => {
      const d = new Date(l.timestamp);
      return [
        d.toLocaleDateString('tr-TR'),
        d.toLocaleTimeString('tr-TR'),
        l.domain || '',
        l.url    || '',
        (l.title || '').replace(/,/g, ' '),
        l.vpnActive ? 'Evet' : 'Hayır',
        l.vpnProfile || '',
        l.duration   || 0,
        l.blockedReqs || 0,
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  // ── Oracle Senkronizasyon ─────────────────────────────────────────────────────
  // Şifreli paket olarak gönderilir — sunucu içeriği göremez

  async syncToServer(serverUrl, apiKey) {
    if (!serverUrl || !this.syncQueue.length) return { synced: 0 };

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
