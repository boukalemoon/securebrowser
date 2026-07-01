'use strict';

const SB_URL = 'https://kfpnsxoxfrxepxezatsr.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcG5zeG94ZnJ4ZXB4ZXphdHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MjQ0NDUsImV4cCI6MjA4NTIwMDQ0NX0.HN7nKw5gO1cuN9fSmrRO72cgIgqNSUfLsY2L3FOhHDg';

let _qrPoll      = null;
let _qrToken     = null;
let _countdown   = null;
let _eventsReady = false;

// ─── Supabase REST yardımcıları ───────────────────────────────────────────────
async function authPost(path, body) {
  const r = await fetch(`${SB_URL}/auth/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function restPost(table, body, token) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY,
      'Authorization': `Bearer ${token || SB_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function restGet(table, query, token) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${token || SB_KEY}`,
    },
  });
  return r.json();
}

async function restPatch(table, query, body, token) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY,
      'Authorization': `Bearer ${token || SB_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (r.status === 204) return null;
  return r.json();
}

// ─── Auth işlemleri ───────────────────────────────────────────────────────────
async function doRegister(email, password, name) {
  const data = await authPost('/signup', {
    email, password,
    data: { display_name: name },
  });
  if (data.error) throw new Error(data.error.message || data.msg || 'Kayıt başarısız');
  // Profil satırını oluştur
  if (data.user?.id) {
    await restPost('ilgezdi_profiles', {
      user_id:      data.user.id,
      email:        data.user.email,
      display_name: name,
    }, data.access_token);
  }
  return data;
}

async function doLogin(email, password) {
  const data = await authPost('/token?grant_type=password', { email, password });
  if (data.error) throw new Error(data.error.message || data.msg || 'Giriş başarısız');
  // last_login_at güncelle
  if (data.access_token) {
    restPatch('ilgezdi_profiles', `user_id=eq.${data.user?.id}`,
      { last_login_at: new Date().toISOString() }, data.access_token).catch(() => {});
  }
  return data;
}

async function doRefresh(refreshToken) {
  const data = await authPost('/token?grant_type=refresh_token', { refresh_token: refreshToken });
  if (data.error) throw new Error('refresh_failed');
  return data;
}

// ─── QR Session ───────────────────────────────────────────────────────────────
async function createQrSession() {
  const data = await restPost('ilgezdi_qr_sessions', { status: 'pending' });
  if (!data || data.error || !data[0]) throw new Error('QR oturum oluşturulamadı');
  return data[0];
}

function stopQrPoll() {
  if (_qrPoll)    { clearInterval(_qrPoll);    _qrPoll    = null; }
  if (_countdown) { clearInterval(_countdown); _countdown = null; }
}

async function loadQrCode() {
  stopQrPoll();
  const img = authEl('qr-img');
  if (!img) return;

  img.src = '';
  setQrStatus('QR oluşturuluyor...', '');

  try {
    const session = await createQrSession();
    _qrToken = session.session_token;

    const payload  = `https://qrtim.com/browser-login?token=${session.session_token}`;
    const encoded  = encodeURIComponent(payload);
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=d4a85a&bgcolor=0e1a2e&qzone=2&data=${encoded}`;

    const expiresAt = new Date(session.expires_at).getTime();

    _countdown = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setQrStatus(`QRtım uygulamanızla okutun (${left}s)`, '');
      if (left <= 0) {
        clearInterval(_countdown);
        setQrStatus('Süre doldu — yenile', 'error');
      }
    }, 1000);

    _qrPoll = setInterval(async () => {
      try {
        const rows = await restGet(
          'ilgezdi_qr_sessions',
          `session_token=eq.${_qrToken}&select=status,user_id`
        );
        if (!rows?.length) return;
        const { status: st, user_id } = rows[0];
        if (st === 'approved' && user_id) {
          stopQrPoll();
          setQrStatus('✓ Onaylandı, giriş yapılıyor...', 'success');
          await finishQrLogin(user_id);
        } else if (st === 'expired') {
          stopQrPoll();
          setQrStatus('Süre doldu — yenile', 'error');
        }
      } catch {}
    }, 3000);

  } catch (e) {
    setQrStatus('QR oluşturulamadı: ' + e.message, 'error');
  }
}

async function finishQrLogin(userId) {
  try {
    const rows = await restGet('ilgezdi_profiles', `user_id=eq.${userId}&select=email,display_name,plan`);
    const profile = rows?.[0] || {};
    await saveSession({ userId, email: profile.email, displayName: profile.display_name, plan: profile.plan || 'free', loginMethod: 'qr' });
    updateAccountBadge(profile.email || 'Kullanıcı');
    setTimeout(hideAuthScreen, 700);
  } catch (e) {
    setQrStatus('Profil alınamadı: ' + e.message, 'error');
  }
}

// ─── Session yönetimi ─────────────────────────────────────────────────────────
async function saveSession(s)  { return window.secureBrowser?.auth?.saveSession(s); }
async function loadSession()   { return window.secureBrowser?.auth?.getSession(); }
async function clearSession()  { return window.secureBrowser?.auth?.clearSession(); }

// ─── DOM yardımcıları ─────────────────────────────────────────────────────────
function authEl(id)    { return document.getElementById(id); }
function setStatus(msg, cls) {
  const el = authEl('auth-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = `auth-status${cls ? ' ' + cls : ''}`;
}
function setQrStatus(msg, cls) {
  const el = authEl('qr-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = `qr-status${cls ? ' ' + cls : ''}`;
}

// ─── Auth overlay göster / gizle ─────────────────────────────────────────────
function showAuthScreen() {
  const el = authEl('auth-screen');
  if (!el) return;
  // BrowserView native layer olduğu için DOM overlay'in üstünde render eder.
  // Auth ekranı gösterilirken aktif sekmeyi gizle, yoksa overlay çalışmaz.
  window.secureBrowser?.hideActiveTab?.().catch?.(() => {});
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('visible'));
}
function hideAuthScreen() {
  stopQrPoll();
  const el = authEl('auth-screen');
  if (!el) return;
  el.classList.remove('visible');
  setTimeout(() => el.classList.add('hidden'), 300);
}

// ─── Tab geçişi ───────────────────────────────────────────────────────────────
function switchTab(name) {
  ['login', 'register'].forEach(t => {
    authEl(`auth-tab-${t}`)?.classList.toggle('active', t === name);
    authEl(`auth-panel-${t}`)?.classList.toggle('hidden', t !== name);
  });
  setStatus('');
}

// ─── QR ↔ Form toggle ────────────────────────────────────────────────────────
function showQrView() {
  authEl('form-section')?.classList.add('hidden');
  authEl('qr-section')?.classList.remove('hidden');
  loadQrCode();
}
function showFormView() {
  stopQrPoll();
  authEl('qr-section')?.classList.add('hidden');
  authEl('form-section')?.classList.remove('hidden');
}

// ─── Hesap rozeti ─────────────────────────────────────────────────────────────
function updateAccountBadge(emailOrName) {
  // Sidebar ayarlar butonu altına küçük e-posta ekle
  const settings = authEl('btn-settings');
  if (!settings) return;
  let badge = authEl('auth-account-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'auth-account-badge';
    badge.style.cssText = 'position:absolute;bottom:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:var(--gold);border:1px solid var(--bg);';
    settings.style.position = 'relative';
    settings.appendChild(badge);
  }
  settings.title = `Ayarlar — ${emailOrName}`;
}

// ─── Event'ler ────────────────────────────────────────────────────────────────
function bindAuthEvents() {
  if (_eventsReady) return;
  _eventsReady = true;

  authEl('auth-tab-login')?.addEventListener('click',    () => switchTab('login'));
  authEl('auth-tab-register')?.addEventListener('click', () => switchTab('register'));
  authEl('auth-skip')?.addEventListener('click',         hideAuthScreen);
  authEl('show-qr-btn')?.addEventListener('click',       showQrView);
  authEl('show-form-btn')?.addEventListener('click',     showFormView);
  authEl('qr-refresh')?.addEventListener('click',        loadQrCode);

  // Login formu
  authEl('auth-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = authEl('login-email')?.value.trim();
    const password = authEl('login-password')?.value;
    if (!email || !password) return;
    const btn = authEl('auth-login-btn');
    if (btn) { btn.textContent = 'Giriş yapılıyor...'; btn.disabled = true; }
    setStatus('');
    try {
      const data = await doLogin(email, password);
      await saveSession({
        userId: data.user?.id, email,
        displayName: data.user?.user_metadata?.display_name || '',
        plan: 'free', refreshToken: data.refresh_token, loginMethod: 'email',
      });
      setStatus('✓ Giriş başarılı!', 'success');
      updateAccountBadge(email);
      setTimeout(hideAuthScreen, 600);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.textContent = 'Giriş Yap'; btn.disabled = false; }
    }
  });

  // Kayıt formu
  authEl('auth-register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name      = authEl('register-name')?.value.trim();
    const email     = authEl('register-email')?.value.trim();
    const password  = authEl('register-password')?.value;
    const password2 = authEl('register-password2')?.value;
    if (!name || !email || !password) { setStatus('Tüm alanları doldurun', 'error'); return; }
    if (password !== password2)        { setStatus('Şifreler eşleşmiyor', 'error'); return; }
    if (password.length < 8)           { setStatus('Şifre en az 8 karakter olmalı', 'error'); return; }
    const btn = authEl('auth-register-btn');
    if (btn) { btn.textContent = 'Kayıt oluşturuluyor...'; btn.disabled = true; }
    setStatus('');
    try {
      const data = await doRegister(email, password, name);
      await saveSession({
        userId: data.user?.id, email, displayName: name,
        plan: 'free', refreshToken: data.refresh_token, loginMethod: 'email',
      });
      setStatus('✓ Hesabınız oluşturuldu! Hoş geldiniz.', 'success');
      updateAccountBadge(email);
      setTimeout(hideAuthScreen, 700);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.textContent = 'Kayıt Ol'; btn.disabled = false; }
    }
  });
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
function injectAuthStyles() {
  if (document.getElementById('ilgezdi-auth-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-auth-style';
  s.textContent = `
#auth-screen {
  position:fixed;inset:0;z-index:9999;
  background:rgba(10,14,26,0.88);
  backdrop-filter:blur(10px);
  display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity 0.3s;
}
#auth-screen.visible{opacity:1;}
#auth-screen.hidden{display:none;}
.auth-modal{
  background:var(--bg-elev);border:1px solid var(--line);
  border-radius:20px;width:420px;padding:36px 40px 28px;
  box-shadow:0 32px 80px rgba(0,0,0,0.65);position:relative;
}
.auth-skip{
  position:absolute;top:14px;right:16px;
  font-size:11px;color:var(--ink-mute);background:none;border:none;
  cursor:pointer;padding:4px 8px;border-radius:6px;
}
.auth-skip:hover{color:var(--ink);}
.auth-brand{
  display:flex;align-items:center;gap:12px;
  justify-content:center;margin-bottom:26px;
}
.auth-brand img{width:34px;height:34px;object-fit:contain;}
.auth-brand span{
  font-family:var(--font-display);font-size:21px;font-weight:700;
  letter-spacing:3px;color:var(--gold);
}
.auth-tabs{
  display:flex;gap:4px;background:var(--bg);border-radius:10px;
  padding:4px;margin-bottom:22px;
}
.auth-tab{
  flex:1;padding:8px;border:none;background:transparent;
  border-radius:8px;color:var(--ink-soft);font-size:13px;cursor:pointer;
  font-family:var(--font-ui);transition:all 0.2s;
}
.auth-tab.active{
  background:linear-gradient(135deg,
    color-mix(in srgb,var(--gold) 18%,transparent),
    color-mix(in srgb,var(--copper) 12%,transparent));
  color:var(--gold);font-weight:600;
}
.auth-panel.hidden{display:none;}
.auth-field{margin-bottom:12px;}
.auth-field label{
  display:block;font-size:11px;color:var(--ink-mute);
  margin-bottom:5px;letter-spacing:0.8px;font-family:var(--font-mono);
}
.auth-field input{
  width:100%;height:42px;background:var(--bg);
  border:1px solid var(--line);border-radius:10px;
  padding:0 14px;color:var(--ink);font-size:14px;
  font-family:var(--font-ui);box-sizing:border-box;
  transition:border-color 0.2s;
}
.auth-field input:focus{
  outline:none;border-color:var(--gold);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--gold) 11%,transparent);
}
.auth-btn{
  width:100%;height:44px;margin-top:6px;
  background:linear-gradient(135deg,var(--gold),var(--copper));
  border:none;border-radius:12px;color:#0e1a2e;
  font-size:14px;font-weight:700;cursor:pointer;
  font-family:var(--font-display);letter-spacing:1px;
  transition:all 0.2s;
}
.auth-btn:hover{opacity:0.9;transform:translateY(-1px);}
.auth-btn:disabled{opacity:0.55;transform:none;cursor:wait;}
.auth-status{
  font-size:12.5px;text-align:center;margin-top:10px;min-height:18px;
  color:var(--ink-mute);
}
.auth-status.error  {color:#fc8181;}
.auth-status.success{color:#68d391;}
.auth-divider{
  display:flex;align-items:center;gap:10px;
  margin:16px 0;color:var(--ink-mute);font-size:11.5px;
}
.auth-divider::before,.auth-divider::after{
  content:'';flex:1;height:1px;background:var(--line);
}
.auth-qr-btn{
  width:100%;padding:10px;border:1px solid var(--line);
  border-radius:10px;background:transparent;color:var(--ink-soft);
  font-size:13px;cursor:pointer;font-family:var(--font-ui);
  display:flex;align-items:center;gap:8px;justify-content:center;
  transition:all 0.18s;
}
.auth-qr-btn:hover{border-color:var(--gold);color:var(--gold);}
.form-section.hidden,.qr-section.hidden{display:none;}
.qr-section{text-align:center;padding:4px 0;}
#qr-img{
  width:180px;height:180px;border-radius:14px;
  border:2px solid var(--line);display:block;
  margin:0 auto 10px;background:var(--bg-soft);
}
.qr-status{font-size:12px;color:var(--ink-mute);margin-bottom:8px;min-height:16px;}
.qr-status.error  {color:#fc8181;}
.qr-status.success{color:#68d391;}
.qr-actions{display:flex;gap:8px;justify-content:center;margin-bottom:12px;}
.qr-refresh-btn,.qr-back-btn{
  font-size:11.5px;padding:6px 14px;border:1px solid var(--line);
  border-radius:8px;background:transparent;color:var(--ink-mute);cursor:pointer;
  font-family:var(--font-ui);transition:all 0.18s;
}
.qr-refresh-btn:hover,.qr-back-btn:hover{border-color:var(--gold);color:var(--gold);}
  `;
  document.head.appendChild(s);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initAuth() {
  injectAuthStyles();

  try {
    const stored = await loadSession();

    if (stored?.refreshToken) {
      // Oturumu yenilemeyi dene
      try {
        const refreshed = await doRefresh(stored.refreshToken);
        await saveSession({ ...stored, refreshToken: refreshed.refresh_token });
        updateAccountBadge(stored.email || stored.displayName);
        return; // Auth screen gösterme
      } catch {
        // Refresh başarısız → auth screen göster
      }
    } else if (stored?.userId && !stored.refreshToken) {
      // QR ile giriş yapılmış veya refresh token yok, ama userId var → geçerli say
      updateAccountBadge(stored.email || stored.displayName || 'Kullanıcı');
      return;
    }
  } catch {}

  await window.secureBrowser?.hideActiveTab?.().catch?.(() => {});
  showAuthScreen();
  bindAuthEvents();
}

// Dışarıya aç (settings paneli için logout, vb.)
window.ilgezdiAuth = {
  logout: async () => {
    await clearSession();
    _eventsReady = false;
    showAuthScreen();
    bindAuthEvents();
  },
  getSession: loadSession,
  showScreen: showAuthScreen,
  // Ayarlar → Hesap: ekranı göster VE event'leri bağla (otomatik-giriş
  // durumunda initAuth bindAuthEvents'i çağırmamış olabiliyor → butonlar ölü kalır).
  open: () => {
    showFormView();
    switchTab('login');
    showAuthScreen();
    bindAuthEvents();
  },
};

window.addEventListener('load', () => setTimeout(initAuth, 900));
