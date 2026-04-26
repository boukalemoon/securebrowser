/**
 * SecureBrowser — VPN Panel UI (Faz 2)
 * app.js dosyasına import edilecek VPN panel mantığı
 *
 * Kullanım: Bu dosyanın tüm içeriği app.js'in sonuna eklenir
 * veya <script src="vpn-panel.js"> ile index.html'e eklenir.
 */

'use strict';

// ─── VPN Panel State ─────────────────────────────────────────────────────────
let vpnProfiles = [];
let vpnStatus   = { status: 'disconnected', activeProfile: null, killSwitch: false };

// ─── VPN Paneli Oluştur (index.html'e eklenecek HTML) ────────────────────────
function injectVpnPanelHTML() {
  // Mevcut panel-settings'ten önce VPN panelini ekle
  const vpnPanel = document.createElement('div');
  vpnPanel.id        = 'panel-vpn';
  vpnPanel.className = 'side-panel hidden';
  vpnPanel.innerHTML = `
    <div class="panel-header">
      <h2>🔒 VPN Yönetimi</h2>
      <button class="panel-close" data-panel="vpn">✕</button>
    </div>
    <div class="panel-body">

      <!-- Bağlantı Durumu -->
      <div id="vpn-connection-card">
        <div id="vpn-status-display" class="vpn-status-card disconnected">
          <div class="vpn-status-icon">🔓</div>
          <div class="vpn-status-info">
            <div id="vpn-status-text">Bağlı Değil</div>
            <div id="vpn-status-sub">İnternet trafiğiniz korumasız</div>
          </div>
          <div id="vpn-toggle-btn-wrap">
            <button id="btn-vpn-toggle" class="vpn-toggle-btn off">Bağlan</button>
          </div>
        </div>

        <!-- Kill Switch Göstergesi -->
        <div class="ks-row">
          <span>🛡 Kill Switch</span>
          <span id="ks-status" class="ks-badge off">Kapalı</span>
        </div>

        <!-- DNS Sızıntı Testi -->
        <button id="btn-dns-test" class="btn-secondary">🔍 DNS Sızıntı Testi</button>
        <div id="dns-test-result" class="dns-result hidden"></div>
      </div>

      <!-- Sunucu Listesi -->
      <div class="vpn-section-title">Sunucular</div>
      <div id="vpn-profile-list"></div>

      <!-- Yeni Sunucu Ekle -->
      <div class="vpn-section-title" style="margin-top:16px">Sunucu Ekle</div>
      <div id="vpn-add-form">
        <div class="vpn-input-row">
          <label>Sunucu Adı</label>
          <input type="text" id="vpn-new-name"       placeholder="Oracle Frankfurt" />
        </div>
        <div class="vpn-input-row">
          <label>Konum</label>
          <input type="text" id="vpn-new-location"   placeholder="🇩🇪 Frankfurt" />
        </div>
        <div class="vpn-input-row">
          <label>Endpoint (IP:Port)</label>
          <input type="text" id="vpn-new-endpoint"   placeholder="1.2.3.4:51820" />
        </div>
        <div class="vpn-input-row">
          <label>Sunucu Public Key</label>
          <input type="text" id="vpn-new-pubkey"     placeholder="Base64 public key..." />
        </div>
        <div class="vpn-input-row">
          <label>İstemci Private Key</label>
          <input type="password" id="vpn-new-privkey" placeholder="Base64 private key..." />
        </div>
        <div class="vpn-input-row">
          <label>İstemci Tünel IP</label>
          <input type="text" id="vpn-new-clientip"   placeholder="10.0.0.2/32" value="10.0.0.2/32" />
        </div>
        <div class="vpn-input-row">
          <label>DNS Sunucusu</label>
          <input type="text" id="vpn-new-dns"        placeholder="10.0.0.1" value="10.0.0.1" />
        </div>
        <button id="btn-vpn-add" class="btn-primary" style="margin-top:8px">➕ Sunucu Ekle</button>
      </div>

    </div>
  `;
  document.getElementById('app').appendChild(vpnPanel);
}

// ─── VPN CSS ─────────────────────────────────────────────────────────────────
function injectVpnStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .vpn-status-card {
      display: flex; align-items: center; gap: 12px;
      padding: 14px; border-radius: 10px;
      border: 1px solid var(--border);
      margin-bottom: 12px; transition: all 0.3s;
    }
    .vpn-status-card.connected    { background: rgba(0,230,118,0.08); border-color: rgba(0,230,118,0.3); }
    .vpn-status-card.disconnected { background: rgba(255,82,82,0.08);  border-color: rgba(255,82,82,0.3); }
    .vpn-status-card.connecting   { background: rgba(255,171,64,0.08); border-color: rgba(255,171,64,0.3); }

    .vpn-status-icon  { font-size: 28px; flex-shrink: 0; }
    .vpn-status-info  { flex: 1; }
    #vpn-status-text  { font-size: 14px; font-weight: 700; color: var(--text-primary); }
    #vpn-status-sub   { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    .vpn-toggle-btn {
      padding: 7px 14px; border: none; border-radius: 6px;
      font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;
      white-space: nowrap;
    }
    .vpn-toggle-btn.off { background: var(--success); color: #000; }
    .vpn-toggle-btn.on  { background: var(--danger);  color: #fff; }
    .vpn-toggle-btn.loading { background: var(--warning); color: #000; cursor: wait; }

    .ks-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 0; border-bottom: 1px solid var(--border-dim);
      font-size: 13px; color: var(--text-secondary);
    }
    .ks-badge {
      font-size: 11px; font-weight: 700; padding: 2px 8px;
      border-radius: 10px;
    }
    .ks-badge.on  { background: rgba(0,230,118,0.15); color: var(--success); }
    .ks-badge.off { background: rgba(255,82,82,0.15);  color: var(--danger); }

    .btn-secondary {
      width: 100%; padding: 8px; margin-top: 10px;
      background: var(--bg-elevated); border: 1px solid var(--border);
      border-radius: 6px; color: var(--text-primary);
      font-size: 12px; cursor: pointer; transition: all 0.15s;
    }
    .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }

    .dns-result {
      margin-top: 10px; padding: 10px; border-radius: 6px;
      font-size: 11px; font-family: var(--font-mono);
      background: var(--bg-elevated); border: 1px solid var(--border);
      color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;
    }

    .vpn-section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1px; color: var(--accent); margin: 16px 0 8px;
      padding-bottom: 5px; border-bottom: 1px solid var(--border-dim);
    }

    .vpn-profile-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px; border-radius: 8px; margin-bottom: 6px;
      background: var(--bg-elevated); border: 1px solid var(--border);
      transition: all 0.15s; cursor: pointer;
    }
    .vpn-profile-item:hover       { border-color: var(--accent-dim); }
    .vpn-profile-item.active-vpn  { border-color: var(--success); background: rgba(0,230,118,0.06); }

    .profile-location { font-size: 18px; flex-shrink: 0; }
    .profile-info     { flex: 1; }
    .profile-name     { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .profile-endpoint { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
    .profile-ping     { font-size: 11px; font-family: var(--font-mono); }
    .ping-good { color: var(--success); }
    .ping-mid  { color: var(--warning); }
    .ping-bad  { color: var(--danger); }

    .profile-actions { display: flex; gap: 4px; }
    .profile-btn {
      padding: 4px 8px; border-radius: 4px; border: none;
      font-size: 11px; cursor: pointer; font-weight: 600; transition: all 0.15s;
    }
    .profile-btn.connect    { background: var(--success); color: #000; }
    .profile-btn.disconnect { background: var(--danger);  color: #fff; }
    .profile-btn.delete     { background: var(--bg-hover); color: var(--text-muted); }
    .profile-btn.delete:hover { background: var(--danger); color: #fff; }

    .vpn-input-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .vpn-input-row label { font-size: 11px; color: var(--text-secondary); }
    .vpn-input-row input {
      background: var(--bg-elevated); border: 1px solid var(--border);
      border-radius: 5px; color: var(--text-primary);
      padding: 7px 10px; font-size: 12px; font-family: var(--font-mono);
      outline: none; transition: border-color 0.2s;
    }
    .vpn-input-row input:focus { border-color: var(--accent); }
  `;
  document.head.appendChild(style);
}

// ─── VPN Panel Render ─────────────────────────────────────────────────────────
function renderVpnStatus(status) {
  vpnStatus = status;

  const card    = document.getElementById('vpn-status-display');
  const icon    = card?.querySelector('.vpn-status-icon');
  const text    = document.getElementById('vpn-status-text');
  const sub     = document.getElementById('vpn-status-sub');
  const toggleBtn = document.getElementById('btn-vpn-toggle');
  const ksStatus  = document.getElementById('ks-status');

  if (!card) return;

  // Kart rengi
  card.className = `vpn-status-card ${status.status}`;

  if (status.status === 'connected' && status.activeProfile) {
    icon.textContent    = '🔒';
    text.textContent    = `${status.activeProfile.location} — Bağlı`;
    sub.textContent     = `${status.activeProfile.name} · ${status.activeProfile.endpoint}`;
    toggleBtn.textContent = 'Bağlantıyı Kes';
    toggleBtn.className = 'vpn-toggle-btn on';
  } else if (status.status === 'connecting') {
    icon.textContent    = '⏳';
    text.textContent    = 'Bağlanıyor...';
    sub.textContent     = 'Lütfen bekleyin';
    toggleBtn.textContent = 'Bağlanıyor...';
    toggleBtn.className = 'vpn-toggle-btn loading';
    toggleBtn.disabled  = true;
  } else {
    icon.textContent    = '🔓';
    text.textContent    = 'Bağlı Değil';
    sub.textContent     = 'İnternet trafiğiniz korumasız';
    toggleBtn.textContent = 'Bağlan';
    toggleBtn.className = 'vpn-toggle-btn off';
    toggleBtn.disabled  = false;
  }

  // Kill switch
  if (ksStatus) {
    ksStatus.textContent = status.killSwitch ? 'Aktif' : 'Kapalı';
    ksStatus.className   = `ks-badge ${status.killSwitch ? 'on' : 'off'}`;
  }

  // Başlık çubuğu VPN göstergesi güncelle
  updateVpnIndicator(status.status === 'connected');
}

function renderVpnProfiles(profiles, pings = {}) {
  vpnProfiles = profiles;
  const list  = document.getElementById('vpn-profile-list');
  if (!list) return;

  if (!profiles.length) {
    list.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:12px">
      Henüz sunucu eklenmedi.<br>Aşağıdan yeni sunucu ekleyin.
    </p>`;
    return;
  }

  list.innerHTML = profiles.map(p => {
    const ping      = pings[p.id] || p.ping;
    const pingClass = !ping ? '' : ping < 80 ? 'ping-good' : ping < 150 ? 'ping-mid' : 'ping-bad';
    const pingText  = ping ? `${ping}ms` : '—';
    const isActive  = vpnStatus.activeProfile?.id === p.id && vpnStatus.status === 'connected';

    return `
      <div class="vpn-profile-item ${isActive ? 'active-vpn' : ''}" data-id="${p.id}">
        <div class="profile-location">${p.location || '🌐'}</div>
        <div class="profile-info">
          <div class="profile-name">${p.name}</div>
          <div class="profile-endpoint">${p.endpoint}</div>
        </div>
        <div class="profile-ping ${pingClass}">${pingText}</div>
        <div class="profile-actions">
          ${isActive
            ? `<button class="profile-btn disconnect" data-action="disconnect">Kes</button>`
            : `<button class="profile-btn connect" data-action="connect" data-id="${p.id}">Bağlan</button>`
          }
          <button class="profile-btn delete" data-action="delete" data-id="${p.id}">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  // Event delegasyonu ile buton handler'ları
  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id     = btn.dataset.id;

      if (action === 'connect') {
        await vpnConnect(id);
      } else if (action === 'disconnect') {
        await vpnDisconnect();
      } else if (action === 'delete') {
        await sb.vpn.removeProfile(id);
        await loadVpnPanel();
      }
    });
  });
}

// ─── VPN İşlemleri ────────────────────────────────────────────────────────────
async function vpnConnect(profileId) {
  if (!profileId) {
    // Bağlan butonuna basıldı ama profil seçilmedi
    if (!vpnProfiles.length) {
      alert('Önce bir sunucu ekleyin.');
      return;
    }
    // İlk profili seç
    profileId = vpnProfiles[0].id;
  }

  const toggleBtn = document.getElementById('btn-vpn-toggle');
  if (toggleBtn) { toggleBtn.textContent = 'Bağlanıyor...'; toggleBtn.disabled = true; }

  const result = await sb.vpn.connect(profileId);
  if (!result?.success) {
    alert('VPN bağlantısı kurulamadı:\n' + (result?.error || 'Bilinmeyen hata'));
  }
  await loadVpnPanel();
}

async function vpnDisconnect() {
  const result = await sb.vpn.disconnect();
  if (!result?.success) {
    alert('Bağlantı kesilirken hata:\n' + (result?.error || 'Bilinmeyen hata'));
  }
  await loadVpnPanel();
}

async function loadVpnPanel() {
  const [profiles, status] = await Promise.all([
    sb.vpn.getProfiles(),
    sb.vpn.getStatus(),
  ]);
  renderVpnStatus(status);
  renderVpnProfiles(profiles);
}

// ─── VPN Panel Event Listeners ────────────────────────────────────────────────
function initVpnPanelEvents() {

  // Toggle (bağlan / kes)
  document.getElementById('btn-vpn-toggle')?.addEventListener('click', async () => {
    if (vpnStatus.status === 'connected') {
      await vpnDisconnect();
    } else if (vpnStatus.status === 'disconnected' || vpnStatus.status === 'error') {
      await vpnConnect(null); // ilk profili kullan
    }
  });

  // DNS Sızıntı Testi
  document.getElementById('btn-dns-test')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-dns-test');
    const res = document.getElementById('dns-test-result');
    btn.textContent = '⏳ Test ediliyor...';
    btn.disabled = true;
    res.classList.remove('hidden');
    res.textContent = 'Sorgu gönderiliyor...';

    const result = await sb.vpn.testDnsLeak();
    if (result.tested) {
      res.textContent = 'DNS Test Sonuçları:\n' +
        result.results.map(r =>
          `${r.status === 'fulfilled' ? '✓' : '✗'} ${r.resolver.split('/')[2]}`
        ).join('\n') +
        '\n\nTüm sorgular VPN üzerinden geçiyorsa güvenlisiniz.';
    } else {
      res.textContent = 'Test yapılamadı: ' + (result.error || 'Bağlantı yok');
    }
    btn.textContent = '🔍 DNS Sızıntı Testi';
    btn.disabled = false;
  });

  // Yeni profil ekle
  document.getElementById('btn-vpn-add')?.addEventListener('click', async () => {
    const name     = document.getElementById('vpn-new-name')?.value.trim();
    const location = document.getElementById('vpn-new-location')?.value.trim();
    const endpoint = document.getElementById('vpn-new-endpoint')?.value.trim();
    const publicKey= document.getElementById('vpn-new-pubkey')?.value.trim();
    const privateKey=document.getElementById('vpn-new-privkey')?.value.trim();
    const clientIp = document.getElementById('vpn-new-clientip')?.value.trim();
    const dns      = document.getElementById('vpn-new-dns')?.value.trim();

    if (!name || !endpoint || !publicKey || !privateKey) {
      alert('Lütfen en azından: Sunucu Adı, Endpoint, Public Key ve Private Key doldurun.');
      return;
    }

    await sb.vpn.addProfile({ name, location, endpoint, publicKey, privateKey, clientIp, dns });

    // Formu temizle
    ['vpn-new-name','vpn-new-location','vpn-new-endpoint','vpn-new-pubkey','vpn-new-privkey']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    await loadVpnPanel();

    // Ping ölç
    const pings = await sb.vpn.pingAll();
    const profiles = await sb.vpn.getProfiles();
    renderVpnProfiles(profiles, pings);
  });

  // Panel kapatma (mevcut handler'a ek)
  document.querySelector('[data-panel="vpn"]')?.addEventListener('click', () => {
  window.ilgezdiCloseAllPanels?.();
});

  // Main process'ten gelen VPN durum güncellemeleri
  sb.onVpnStatus((status) => {
    renderVpnStatus(status);
  });
}

// ─── Toolbar'a VPN Butonu Ekle ────────────────────────────────────────────────
function injectVpnToolbarButton() {
  const actionsDiv = document.getElementById('toolbar-actions');
  if (!actionsDiv) return;

  const vpnBtn = document.createElement('button');
  vpnBtn.className = 'action-btn';
  vpnBtn.id        = 'btn-vpn-panel';
  vpnBtn.title     = 'VPN Yönetimi';
  vpnBtn.textContent = '🔒';
  actionsDiv.prepend(vpnBtn);

  vpnBtn.addEventListener('click', async () => {
    const panel = document.getElementById('panel-vpn');
    if (!panel) return;

    if (panel.classList.contains('visible')) {
      window.ilgezdiCloseAllPanels?.();
    } else {
      window.ilgezdiCloseAllPanels?.();
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  vpnBtn.classList.add('active');
  if (typeof sb !== 'undefined') sb.panelOpened(true);
  await loadVpnPanel();
}
  });
}

// ─── Faz 2 Başlatıcı ─────────────────────────────────────────────────────────
async function initFaz2() {
  injectVpnStyles();
  injectVpnPanelHTML();
  injectVpnToolbarButton();
  initVpnPanelEvents();

  // İlk durum yükle
  const status = await sb.vpn.getStatus();
  renderVpnStatus(status);

  console.log('[Faz2] VPN paneli hazır');
}

// DOMContentLoaded'dan sonra çalıştır
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFaz2);
} else {
  initFaz2();
}