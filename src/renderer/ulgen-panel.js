/**
 * İlgezdi — Ülgen yan paneli (yapay zekâ alanı).
 *
 * Bu dosya panelin İSKELETİ: kenar çubuğu düğmesi, panel yerleşimi ve hazır olmayan
 * durum. Asistan motoru (Ülgen) ayrı bir depoda geliştiriliyor; bağlanınca sohbet
 * alanı ve öneriler buraya takılacak. Panel, diğer yan panellerle aynı desende açılıp
 * kapanır (sb.panelOpened → sekme görünümü daralır, panel sayfanın üstünde kalmaz).
 *
 * Gizlilik: hazır olmayan durumda hiçbir veri toplanmaz ve hiçbir ağ isteği yapılmaz.
 * Motor bağlandığında sayfa içeriği ve gezinti geçmişi, kullanıcı açıkça izin vermeden
 * asistana gönderilmeyecek (panelde de yazılı).
 */

'use strict';

function injectUlgenStyles() {
  if (document.getElementById('ilgezdi-ulgen-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-ulgen-style';
  s.textContent = `
    .ulgen-body { display:flex; flex-direction:column; gap:14px; padding:14px 16px; }
    .ulgen-hero { text-align:center; padding:18px 10px 6px; }
    .ulgen-hero-icon { font-size:30px; line-height:1; }
    .ulgen-hero-title { font-family:var(--font-display); font-size:17px; letter-spacing:.5px; margin-top:8px; color:var(--ink); }
    .ulgen-hero-sub { font-size:12px; color:var(--text-muted); margin-top:4px; }
    .ulgen-note { font-size:12px; line-height:1.5; color:var(--text-secondary); background:var(--bg-soft,rgba(255,255,255,.03));
                  border:1px solid var(--border-color); border-radius:10px; padding:11px 12px; }
    .ulgen-section-title { font-size:10.5px; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); }
    .ulgen-chips { display:flex; flex-wrap:wrap; gap:7px; }
    .ulgen-chip { font-size:11.5px; color:var(--text-muted); border:1px solid var(--border-color); border-radius:999px;
                  padding:6px 11px; background:none; cursor:default; opacity:.75; }
    .ulgen-ask { display:flex; gap:8px; align-items:center; }
    .ulgen-ask input { flex:1; }
    .ulgen-ask input[disabled], .ulgen-ask button[disabled] { opacity:.6; cursor:not-allowed; }
  `;
  document.head.appendChild(s);
}

function ulgenBuildPanel() {
  const panel = document.getElementById('panel-ulgen');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-header">
      <h2>${TH('ulgen.title')}</h2>
      <button class="panel-close" data-panel="ulgen" aria-label="${TH('common.closePanel')}">✕</button>
    </div>
    <div class="panel-body ulgen-body">
      <div class="ulgen-hero">
        <div class="ulgen-hero-icon" aria-hidden="true">✨</div>
        <div class="ulgen-hero-title">${TH('ulgen.soon')}</div>
        <div class="ulgen-hero-sub">${TH('ulgen.subtitle')}</div>
      </div>
      <p class="ulgen-note">${TH('ulgen.soonHint')}</p>
      <div class="ulgen-section-title">${TH('ulgen.canDo')}</div>
      <div class="ulgen-chips">
        <span class="ulgen-chip">${TH('ulgen.sample1')}</span>
        <span class="ulgen-chip">${TH('ulgen.sample2')}</span>
        <span class="ulgen-chip">${TH('ulgen.sample3')}</span>
      </div>
      <div class="ulgen-ask">
        <input type="text" id="ulgen-ask-input" disabled placeholder="${TH('ulgen.soon')}…" aria-label="${TH('ulgen.subtitle')}" />
        <button class="btn-secondary" id="ulgen-ask-send" disabled>${TH('feedback.send')}</button>
      </div>
      <p class="ulgen-note" id="ulgen-account-note">${TH('ulgen.account')}</p>
      <p class="ulgen-note">${TH('ulgen.privacy')}</p>
    </div>
  `;

  document.querySelector('[data-panel="ulgen"]')?.addEventListener('click', () => {
    window.ilgezdiCloseAllPanels?.();
  });
}

function initUlgenPanel() {
  injectUlgenStyles();
  ulgenBuildPanel();

  document.getElementById('btn-ulgen')?.addEventListener('click', () => {
    const panel = document.getElementById('panel-ulgen');
    if (!panel) return;
    if (panel.classList.contains('visible')) {
      window.ilgezdiCloseAllPanels?.();
      return;
    }
    window.ilgezdiCloseAllPanels?.();
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
    document.getElementById('btn-ulgen')?.classList.add('active');
    window.secureBrowser?.panelOpened(true);
  });

  console.log('[İlgezdi] Ülgen paneli hazır (motor bağlı değil)');
}

window.addEventListener('load', () => setTimeout(initUlgenPanel, 500));
