/**
 * İlgezdi — sekme sayfalarının ön yükleme betiği: şifre kaydetme önerisi ve doldurma.
 *
 * Yalıtılmış dünyada çalışır (contextIsolation): sayfanın kendi betikleri bu koda,
 * ipcRenderer'a ve kasadan gelen değerlere erişemez. contextBridge ile sayfaya HİÇBİR
 * şey açılmaz.
 *
 * Kaydetme önerisi: parola içeren bir giriş gönderilince (form gönderimi, gönder düğmesi,
 * parola alanında Enter) kullanıcı adı ve parola ana sürece bildirilir. Ana süreç sitenin
 * adresini sayfanın beyanından değil sekmenin kendisinden okur; gizli pencerede, ayar
 * kapalıyken ve "bu sitede asla" denen sitelerde hiçbir şey yapmaz. Öneri arayüzde
 * gösterilir; parola arayüze gitmez.
 *
 * Doldurma: yalnızca GERÇEK kullanıcı etkileşimiyle (navigator.userActivation) boş bir
 * giriş alanına tıklanınca/odaklanınca ana süreç kayıtlı hesapları yerel bir menüde
 * gösterir; kullanıcı seçince doldurulur. Sayfa açılınca kendiliğinden doldurulmaz:
 * görünmez ya da sahte bir form parolayı kullanıcı hiçbir şeye dokunmadan toplayamaz,
 * sayfa betiği focus() çağırarak menüyü açamaz.
 */

'use strict';

const { ipcRenderer, webFrame } = require('electron');

// Parmak izi koruması (src/main/fingerprint-shield.js): her çerçevede, sayfa betiklerinden
// önce sayfanın kendi dünyasına kurulur. Betik ve tohum ana süreçten gelir.
try {
  const shield = ipcRenderer.sendSync('fp-script');
  if (typeof shield === 'string' && shield) webFrame.executeJavaScript(shield);
} catch (e) { /* koruma olmadan devam */ }

// Global Privacy Control: Sec-GPC başlığını ana süreç ekler; sayfa betikleri
// navigator.globalPrivacyControl'ü okur. Özellik sayfanın kendi dünyasında tanımlanmalı
// (bu betik yalıtılmış dünyada). Bayrak sekme açılırken ayardan gelir. Betik değer
// döndürmemeli: executeJavaScript sonucu seri hale getirir, Navigator.prototype'ın
// alıcıları orada "Illegal invocation" hatası verir.
if (process.argv.includes('--ilgezdi-gpc')) {
  webFrame.executeJavaScript("Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get() { return true; }, configurable: true, enumerable: true }); void 0;");
}

// Şifre yardımcıları yalnızca ana çerçevede: alt çerçeve (başka sitenin iframe'i) üst sayfanın
// adına şifre kaydettiremez ya da doldurma menüsü açamaz.
function setupPasswordHelpers() {
  const USER_HINT = /user|mail|login|kullan|eposta|e-posta|account|hesap|uid|phone|tel|gsm|kimlik/i;

  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  }

  const isPassword = (el) => el instanceof HTMLInputElement && el.type === 'password';

  function isUserField(el) {
    if (!(el instanceof HTMLInputElement) || !['text', 'email', 'tel'].includes(el.type)) return false;
    if (el.autocomplete === 'username' || el.type === 'email') return true;
    return USER_HINT.test(`${el.name} ${el.id} ${el.autocomplete} ${el.placeholder} ${el.getAttribute('aria-label') || ''}`);
  }

  // Parola alanına ait kullanıcı adı alanı: aynı formda (form yoksa belgede) parolanın
  // önündeki son uygun ve görünür alan.
  function userFieldFor(pw) {
    const inputs = Array.from((pw.form || document).querySelectorAll('input'));
    for (let i = inputs.indexOf(pw) - 1; i >= 0; i--) {
      if (isUserField(inputs[i]) && visible(inputs[i])) return inputs[i];
    }
    return null;
  }

  // Kullanıcı adı alanına ait parola alanı: aynı formda sonraki görünür parola alanı.
  function passwordFieldFor(user) {
    const inputs = Array.from((user.form || document).querySelectorAll('input'));
    for (let i = inputs.indexOf(user) + 1; i < inputs.length; i++) {
      if (isPassword(inputs[i]) && visible(inputs[i])) return inputs[i];
    }
    return null;
  }

  // ─── Kaydetme önerisi ─────────────────────────────────────────────────────────
  let lastSent = '';

  function filledPassword(scope) {
    return Array.from((scope || document).querySelectorAll('input[type="password"]')).find((p) => p.value) || null;
  }

  function capture(pw) {
    if (!pw || !pw.value) return;
    // Parola değiştirme formları (farklı değerli birden çok parola alanı) öneriye konu değil.
    // Kayıt formundaki "şifre + tekrar" (aynı değer) kaydedilir: oluşturulan şifre böyle gelir.
    const filled = Array.from((pw.form || document).querySelectorAll('input[type="password"]')).filter((p) => p.value);
    if (filled.length > 2 || (filled.length === 2 && filled[0].value !== filled[1].value)) return;
    const user = userFieldFor(pw);
    const username = user ? user.value.trim() : '';
    const key = JSON.stringify([username, pw.value]);
    if (key === lastSent) return;
    lastSent = key;
    ipcRenderer.send('pw-capture', { username: username.slice(0, 200), password: pw.value.slice(0, 500) });
  }

  document.addEventListener('submit', (e) => {
    capture(filledPassword(e.target instanceof HTMLFormElement ? e.target : null));
  }, true);

  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button, input[type="submit"], input[type="button"], [role="button"]') : null;
    if (!btn) return;
    const form = btn.closest('form');
    const pw = filledPassword(form);
    // Formsuz (tek sayfalık uygulama) girişlerde yalnızca görünür parola alanı sayılır.
    if (pw && (form || visible(pw))) capture(pw);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isPassword(e.target)) capture(e.target);
  }, true);

  // ─── Doldurma ─────────────────────────────────────────────────────────────────
  let target = null;
  let lastAsk = { el: null, at: 0 };

  // Yeni şifre alanı (kayıt formu): site belirtmişse ona göre; belirtmemişse formda tam iki
  // görünür parola alanı (şifre + tekrar). Üç alan parola değiştirme formudur, karışmaz.
  function isNewPasswordField(pw) {
    if (!isPassword(pw)) return false;
    const ac = String(pw.getAttribute('autocomplete') || '').toLowerCase();
    if (ac.includes('new-password')) return true;
    if (ac.includes('current-password')) return false;
    return Array.from((pw.form || document).querySelectorAll('input[type="password"]')).filter(visible).length === 2;
  }

  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(isPassword(el) || isUserField(el)) || !visible(el) || el.value) return;
    // Yalnızca gerçek kullanıcı etkileşimi (tıklama, tuş): sayfa betiği focus() ile tetikleyemez.
    if (!navigator.userActivation || !navigator.userActivation.isActive) return;
    const pw = isPassword(el) ? el : passwordFieldFor(el);
    // Parola alanı olmayan sıradan metin kutuları (arama, bülten) menü açmaz.
    if (!pw && el.autocomplete !== 'username') return;
    const now = Date.now();
    if (lastAsk.el === el && now - lastAsk.at < 8000) return;
    lastAsk = { el, at: now };
    target = { user: isPassword(el) ? userFieldFor(el) : el, pw };
    const r = el.getBoundingClientRect();
    ipcRenderer.send('pw-field-focus', { x: Math.round(r.left), y: Math.round(r.bottom), width: Math.round(r.width), newPassword: isNewPasswordField(el) });
  }, true);

  function setValue(el, value) {
    if (!el) return;
    // Yerel değer ayarlayıcı + input/change olayları: React/Vue gibi çerçeveler de değişikliği görür.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  ipcRenderer.on('pw-fill', (_e, cred) => {
    if (!target || !cred || typeof cred !== 'object') return;
    if (cred.generated === true) {
      // Oluşturulan şifre: tıklanan alan ve aynı formdaki boş "tekrar" alanı doldurulur.
      if (typeof cred.password !== 'string' || !target.pw) return;
      const scope = target.pw.form || document;
      const fields = Array.from(scope.querySelectorAll('input[type="password"]')).filter((p) => visible(p) && (p === target.pw || !p.value));
      for (const p of fields.slice(0, 2)) setValue(p, cred.password);
      target = null;
      return;
    }
    if (target.user && typeof cred.username === 'string' && cred.username) setValue(target.user, cred.username);
    if (target.pw && typeof cred.password === 'string') setValue(target.pw, cred.password);
    // Doldurulan hesap gönderilince yeniden "kaydedilsin mi?" diye sorulmasın.
    lastSent = JSON.stringify([String(cred.username || ''), String(cred.password || '')]);
    target = null;
  });
}

if (process.isMainFrame) setupPasswordHelpers();
