/**
 * İlgezdi — Ülgen yan paneli (yerel asistan).
 *
 * Motor ana süreçte çalışır (src/main/ulgen-motor.js): AĞA ÇIKMAZ, dil modeli
 * kullanmaz. Bu dosya yalnız arayüzdür; motora dar köprüden (`secureBrowser.ulgen`)
 * ulaşır ve kendisi hiçbir ağ isteği yapmaz, hiçbir şey saklamaz.
 *
 * Tasarım: İlgezdi teması — gece göğü başlığı, Ülgen'in altın tekerleği (Ülgen
 * uygulamasının simgesinden çizildi), Cinzel başlık, Göktürk harfleriyle ad. Renkler
 * yalnız tema belirteçlerinden (--gold, --copper, --bg…): dört temada ve özel vurgu
 * renginde doğru görünür.
 *
 * Güvenlik:
 *   · Sayfadan ve geçmişten gelen HER metin textContent ile basılır (innerHTML yok).
 *   · Sabit iskelet TH() ile kaçışlanır. Satır içi olay işleyicisi yok (CSP).
 *   · Simgeler iskeletteki <template>'lerden kopyalanır; dinamik HTML üretilmez.
 *   · Arama/sekme açma yalnız kullanıcı düğmeye basınca ana sürece gider.
 * İzinler Veri ve Gizlilik'tedir; panel yalnız okur ve yönlendirir.
 */

'use strict';

function injectUlgenStyles() {
  if (document.getElementById('ilgezdi-ulgen-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-ulgen-style';
  s.textContent = `
    #panel-ulgen { --ul-glow: color-mix(in srgb, var(--gold) 45%, transparent); }
    /* Başlık: gece göğü */
    .ulgen-head { position:relative; flex-shrink:0; display:flex; align-items:center; gap:12px; padding:16px 12px 14px 16px;
      border-bottom:1px solid var(--line); overflow:hidden;
      background:
        radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--gold) 18%, transparent), transparent 55%),
        linear-gradient(180deg, var(--bg-elev), color-mix(in srgb, var(--bg) 70%, var(--bg-elev))); }
    .ulgen-head::before { content:''; position:absolute; inset:0; pointer-events:none; opacity:.8;
      background-image:
        radial-gradient(1.2px 1.2px at 22% 28%, color-mix(in srgb, var(--gold) 80%, transparent) 50%, transparent 52%),
        radial-gradient(1px 1px at 48% 18%, color-mix(in srgb, var(--ink) 55%, transparent) 50%, transparent 52%),
        radial-gradient(1.4px 1.4px at 66% 62%, color-mix(in srgb, var(--gold) 70%, transparent) 50%, transparent 52%),
        radial-gradient(1px 1px at 82% 30%, color-mix(in srgb, var(--ink) 50%, transparent) 50%, transparent 52%),
        radial-gradient(1px 1px at 38% 78%, color-mix(in srgb, var(--ink) 40%, transparent) 50%, transparent 52%),
        radial-gradient(1.2px 1.2px at 92% 76%, color-mix(in srgb, var(--gold) 60%, transparent) 50%, transparent 52%); }
    .ulgen-mark { flex-shrink:0; width:42px; height:42px; color:var(--gold); position:relative;
      filter:drop-shadow(0 0 10px var(--ul-glow)); }
    .ulgen-mark svg { width:100%; height:100%; display:block; }
    .ulgen-id { position:relative; min-width:0; }
    .ulgen-id h2 { margin:0; font-family:var(--font-display); font-size:19px; font-weight:700; letter-spacing:5px; color:var(--ink); text-transform:uppercase; }
    .ulgen-rune { font-family:var(--font-rune); font-size:13px; letter-spacing:7px; color:var(--rune); opacity:.85; margin-top:2px; }
    .ulgen-status { display:inline-flex; align-items:center; gap:6px; margin-top:6px; padding:2px 9px; border-radius:999px;
      border:1px solid color-mix(in srgb, var(--success, #4ade80) 40%, var(--line)); background:color-mix(in srgb, var(--success, #4ade80) 8%, transparent);
      font:600 10px var(--font-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--ink-soft); white-space:nowrap; cursor:pointer; }
    .ulgen-status::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--success, #4ade80); box-shadow:0 0 6px var(--success, #4ade80); }
    .ulgen-status svg { opacity:.7; }
    .ulgen-status:hover, .ulgen-status[aria-expanded="true"] { border-color:color-mix(in srgb, var(--success, #4ade80) 70%, var(--line)); color:var(--ink); }
    .ulgen-status:hover svg, .ulgen-status[aria-expanded="true"] svg { opacity:1; }
    .ulgen-status:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }

    /* "İnternetsiz" ne demek: rozete basınca açılan kart */
    .ulgen-info { flex-shrink:0; position:relative; padding:12px 12px 12px 14px; border-radius:14px; animation:ulgenIn .2s ease-out both;
      border:1px solid color-mix(in srgb, var(--success, #4ade80) 35%, var(--line));
      background:linear-gradient(160deg, color-mix(in srgb, var(--success, #4ade80) 7%, var(--bg-elev)), var(--bg-elev)); }
    .ulgen-info[hidden] { display:none; }
    .ulgen-info h3 { margin:0 28px 10px 0; font-size:13px; font-weight:700; color:var(--ink); }
    .ulgen-info ul { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:10px; }
    .ulgen-info li { display:grid; grid-template-columns:26px 1fr; gap:9px; align-items:start; }
    .ulgen-info-icon { width:26px; height:26px; border-radius:8px; display:grid; place-items:center; color:var(--gold); background:color-mix(in srgb, var(--gold) 13%, transparent); }
    .ulgen-info li strong { display:block; font-size:12.5px; color:var(--ink); line-height:1.35; }
    .ulgen-info li div span { display:block; font-size:11.5px; line-height:1.5; color:var(--ink-mute); margin-top:1px; }
    .ulgen-info .ulgen-icon-btn { position:absolute; top:6px; right:6px; }
    .ulgen-head-actions { position:relative; margin-left:auto; display:flex; align-self:flex-start; gap:2px; }
    .ulgen-icon-btn { width:28px; height:28px; border:none; background:transparent; color:var(--ink-mute); border-radius:7px; display:grid; place-items:center; cursor:pointer; }
    .ulgen-icon-btn:hover { background:var(--bg-soft); color:var(--gold); }
    .ulgen-icon-btn:focus-visible { outline:2px solid var(--gold); outline-offset:1px; }

    /* Gövde: kayan alan + iş kartları + yazma kutusu */
    .ulgen-body { flex:1; min-height:0; display:flex; flex-direction:column; padding:0; overflow:hidden; }
    .ulgen-scroll { flex:1; min-height:0; overflow-y:auto; padding:18px 16px 10px; display:flex; flex-direction:column; gap:14px; }
    /* Karşılama: boş alanın ortasında dönen tamga */
    .ulgen-welcome { margin-block:auto; display:flex; flex-direction:column; align-items:center; text-align:center; padding:8px 8px 4px; }
    .ulgen-halo { position:relative; width:96px; height:96px; display:grid; place-items:center; margin-bottom:14px; border-radius:50%;
      background:radial-gradient(circle, color-mix(in srgb, var(--gold) 20%, transparent), transparent 68%); }
    .ulgen-halo::before { content:''; position:absolute; inset:-10px; border-radius:50%; border:1px dashed color-mix(in srgb, var(--gold) 30%, transparent); }
    .ulgen-halo .ulgen-mark { width:66px; height:66px; filter:drop-shadow(0 0 16px var(--ul-glow)); }
    .ulgen-welcome h3 { margin:0; font-family:var(--font-display); font-size:22px; font-weight:700; letter-spacing:1px; text-wrap:balance;
      background:linear-gradient(135deg, var(--ink), var(--gold) 70%, var(--copper)); -webkit-background-clip:text; background-clip:text; color:transparent; }
    .ulgen-welcome p { margin:8px 0 0; font-size:12.5px; line-height:1.6; color:var(--ink-mute); max-width:36ch; text-wrap:balance; }
    #panel-ulgen.ulgen-talking .ulgen-welcome, .ulgen-welcome.hidden { display:none; }

    .ulgen-off { display:flex; flex-direction:column; align-items:center; text-align:center; gap:10px; padding:18px 16px;
      border:1px dashed color-mix(in srgb, var(--gold) 45%, var(--line)); border-radius:14px; font-size:12.5px; line-height:1.55; color:var(--ink-soft);
      background:color-mix(in srgb, var(--bg-soft) 45%, transparent); }
    .ulgen-off.hidden { display:none; }
    .ulgen-off .ulgen-mark { width:48px; height:48px; opacity:.55; filter:none; }

    .ulgen-actions { flex-shrink:0; display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:0 16px 10px; }
    .ulgen-chip { display:flex; flex-direction:column; align-items:flex-start; gap:6px; min-width:0; padding:11px 12px; text-align:left;
      border:1px solid var(--line); border-radius:12px; color:var(--ink); cursor:pointer; font:inherit;
      background:linear-gradient(160deg, color-mix(in srgb, var(--bg-soft) 75%, transparent), color-mix(in srgb, var(--bg-elev) 40%, transparent));
      transition:border-color .15s, transform .15s, box-shadow .15s, background .15s; }
    .ulgen-chip:hover:not([disabled]) { border-color:color-mix(in srgb, var(--gold) 70%, transparent); transform:translateY(-1px);
      box-shadow:0 10px 24px -16px var(--ul-glow); }
    .ulgen-chip:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
    .ulgen-chip.active { border-color:var(--gold); background:color-mix(in srgb, var(--gold) 13%, var(--bg-elev)); }
    .ulgen-chip[disabled] { opacity:.45; cursor:not-allowed; transform:none; }
    .ulgen-chip-icon { width:28px; height:28px; border-radius:8px; display:grid; place-items:center; color:var(--gold);
      background:color-mix(in srgb, var(--gold) 13%, transparent); flex-shrink:0; }
    .ulgen-chip-title { font-size:12.5px; font-weight:600; line-height:1.3; }
    .ulgen-chip-hint { font-size:11px; color:var(--ink-mute); line-height:1.4; }
    /* Sohbet başlayınca kartlar yazma kutusunun üstünde ince bir sıraya dönüşür */
    #panel-ulgen.ulgen-talking .ulgen-actions { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; padding-bottom:8px; overscroll-behavior-x:contain;
      -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 36px), transparent); mask-image:linear-gradient(90deg, #000 calc(100% - 36px), transparent); }
    #panel-ulgen.ulgen-talking .ulgen-actions.at-end { -webkit-mask-image:none; mask-image:none; }
    #panel-ulgen.ulgen-talking .ulgen-actions::-webkit-scrollbar { display:none; }
    #panel-ulgen.ulgen-talking .ulgen-chip { flex-direction:row; align-items:center; flex-shrink:0; padding:5px 11px 5px 6px; border-radius:999px; gap:6px; }
    #panel-ulgen.ulgen-talking .ulgen-chip-icon { width:22px; height:22px; border-radius:50%; }
    #panel-ulgen.ulgen-talking .ulgen-chip-hint { display:none; }
    #panel-ulgen.ulgen-talking .ulgen-chip-title { font-size:12px; white-space:nowrap; }

    /* Mesajlar */
    .ulgen-log { display:flex; flex-direction:column; gap:12px; }
    .ulgen-msg { display:flex; gap:9px; align-items:flex-start; font-size:13px; line-height:1.6; animation:ulgenIn .22s ease-out both; }
    .ulgen-msg.siz { justify-content:flex-end; }
    .ulgen-avatar { flex-shrink:0; width:26px; height:26px; margin-top:2px; border-radius:50%; display:grid; place-items:center; color:var(--gold);
      background:color-mix(in srgb, var(--gold) 12%, var(--bg-elev)); border:1px solid color-mix(in srgb, var(--gold) 35%, var(--line)); }
    .ulgen-avatar svg { width:18px; height:18px; }
    .ulgen-bubble { min-width:0; max-width:100%; padding:10px 12px; border-radius:4px 14px 14px 14px; color:var(--ink-soft);
      background:var(--bg-elev); border:1px solid var(--line); overflow-wrap:anywhere; }
    .ulgen-msg.biz .ulgen-bubble { flex:1; }
    .ulgen-msg.siz .ulgen-bubble { max-width:86%; border-radius:14px 4px 14px 14px; color:var(--ink);
      background:linear-gradient(135deg, color-mix(in srgb, var(--gold) 22%, var(--bg-elev)), color-mix(in srgb, var(--copper) 16%, var(--bg-elev)));
      border-color:color-mix(in srgb, var(--gold) 40%, transparent); }
    /* İşlem sürerken tamga dönmez: yukarıdan aşağıya bir ışık geçer (Burak, 20 Eyl 2026). */
    .ulgen-msg.busy .ulgen-avatar svg,
    #panel-ulgen.ulgen-isliyor .ulgen-head .ulgen-mark svg,
    #panel-ulgen.ulgen-isliyor .ulgen-halo .ulgen-mark svg {
      -webkit-mask-image:linear-gradient(180deg, rgba(0,0,0,.3) 0 34%, #000 50%, rgba(0,0,0,.3) 66% 100%);
      mask-image:linear-gradient(180deg, rgba(0,0,0,.3) 0 34%, #000 50%, rgba(0,0,0,.3) 66% 100%);
      -webkit-mask-size:100% 280%; mask-size:100% 280%;
      animation:ulgenTara 1.4s ease-in-out infinite;
    }
    .ulgen-msg.busy .ulgen-bubble { color:var(--ink-mute); font-style:italic; }
    .ulgen-bubble h4 { margin:0 0 2px; font-family:var(--font-display); font-size:13.5px; letter-spacing:.4px; color:var(--ink); }
    .ulgen-source { font:500 10.5px var(--font-mono); color:var(--ink-mute); margin-bottom:8px; }
    .ulgen-bubble ol, .ulgen-bubble ul { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:7px; }
    .ulgen-sum { counter-reset:ulgen; }
    .ulgen-sum li { counter-increment:ulgen; position:relative; padding-left:24px; color:var(--ink-soft); }
    .ulgen-sum li::before { content:counter(ulgen); position:absolute; left:0; top:1px; width:17px; height:17px; border-radius:50%;
      display:grid; place-items:center; font:700 10px var(--font-mono); color:var(--bg); background:linear-gradient(135deg, var(--gold), var(--copper)); }
    /* Çeviri: özgün cümlenin altında, ayrı renkte ve ince bir çizgiyle */
    .ulgen-tr { margin-top:4px; padding-left:8px; border-left:2px solid color-mix(in srgb, var(--copper) 55%, transparent);
      font-size:12.5px; line-height:1.5; color:var(--ink); }
    .ulgen-tr-foot { display:inline-flex; align-items:center; gap:5px; }
    .ulgen-tr-foot::before { content:''; width:5px; height:5px; border-radius:50%; background:var(--copper); }
    .ulgen-quote { padding:6px 10px; border-left:2px solid var(--gold); border-radius:0 8px 8px 0; background:color-mix(in srgb, var(--gold) 6%, transparent); color:var(--ink-soft); }
    .ulgen-quote mark { background:color-mix(in srgb, var(--gold) 38%, transparent); color:var(--ink); border-radius:3px; padding:0 2px; }
    .ulgen-foot { font-size:11px; color:var(--ink-mute); margin-top:8px; line-height:1.5; }
    .ulgen-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
    .ulgen-tag { font:500 10.5px var(--font-mono); padding:1px 8px; border-radius:999px; color:var(--gold); border:1px solid color-mix(in srgb, var(--gold) 40%, transparent); }
    .ulgen-hist li { display:flex; flex-direction:column; gap:1px; }
    .ulgen-link { background:none; border:none; padding:0; color:var(--ink); cursor:pointer; text-align:left; font:inherit; font-weight:600; }
    .ulgen-link:hover { color:var(--gold); text-decoration:underline; text-underline-offset:2px; }
    .ulgen-host { font:500 10.5px var(--font-mono); color:var(--ink-mute); }
    .ulgen-query { display:block; margin:6px 0 2px; padding:7px 10px; border-radius:8px; border:1px solid var(--line); background:var(--bg);
      font:500 12.5px var(--font-mono); color:var(--ink); }
    .ulgen-row { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
    .ulgen-btn { height:30px; padding:0 13px; border-radius:8px; border:1px solid var(--line); background:var(--bg-soft); color:var(--ink-soft); font:600 12px var(--font-ui); cursor:pointer; }
    .ulgen-btn:hover { border-color:var(--gold); color:var(--gold); }
    .ulgen-btn.primary { border:none; color:#1a1206; background:linear-gradient(135deg, var(--gold), var(--copper)); }
    .ulgen-btn.primary:hover { filter:brightness(1.07); color:#1a1206; }
    .ulgen-btn:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
    .ulgen-consent { border-color:color-mix(in srgb, var(--gold) 45%, var(--line)); }
    .ulgen-consent-head { display:flex; gap:8px; align-items:flex-start; color:var(--ink); }
    .ulgen-consent-head svg { flex-shrink:0; color:var(--gold); margin-top:2px; }

    /* Yazma kutusu */
    .ulgen-composer { flex-shrink:0; padding:10px 12px 12px; border-top:1px solid var(--line); background:var(--bg-elev); }
    .ulgen-ask { display:flex; align-items:center; gap:6px; padding:4px 4px 4px 12px; border-radius:14px; border:1px solid var(--line); background:var(--bg);
      transition:border-color .15s, box-shadow .15s; }
    .ulgen-ask:focus-within { border-color:var(--gold); box-shadow:0 0 0 3px color-mix(in srgb, var(--gold) 16%, transparent); }
    .ulgen-mode { display:inline-flex; align-items:center; gap:3px; flex-shrink:0; padding:2px 4px 2px 9px; border-radius:999px;
      font:600 11px var(--font-ui); color:var(--gold); background:color-mix(in srgb, var(--gold) 13%, transparent); }
    .ulgen-mode[hidden] { display:none; }
    .ulgen-mode button { width:18px; height:18px; border:none; background:transparent; color:inherit; border-radius:50%; cursor:pointer; display:grid; place-items:center; padding:0; }
    .ulgen-mode button:hover { background:color-mix(in srgb, var(--gold) 20%, transparent); }
    .ulgen-ask input { flex:1; min-width:0; height:34px; border:none; outline:none; background:transparent; color:var(--ink); font:13px var(--font-ui); }
    .ulgen-ask input::placeholder { color:var(--ink-mute); }
    .ulgen-send { flex-shrink:0; width:34px; height:34px; border:none; border-radius:11px; display:grid; place-items:center; cursor:pointer; color:#1a1206;
      background:linear-gradient(135deg, var(--gold), var(--copper)); box-shadow:0 6px 16px -10px var(--ul-glow); transition:filter .15s, opacity .15s; }
    .ulgen-send:hover:not([disabled]) { filter:brightness(1.08); }
    .ulgen-send:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
    .ulgen-ask input[disabled], .ulgen-send[disabled] { opacity:.45; cursor:not-allowed; }
    .ulgen-notes { display:flex; flex-direction:column; gap:3px; margin:9px 2px 0; }
    .ulgen-note { display:flex; gap:6px; align-items:flex-start; margin:0; font-size:10.5px; line-height:1.5; color:var(--ink-mute); }
    .ulgen-note svg { flex-shrink:0; margin-top:2px; color:color-mix(in srgb, var(--gold) 70%, var(--ink-mute)); }

    @keyframes ulgenIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
    @keyframes ulgenTara {
      0%   { -webkit-mask-position:0 -110%; mask-position:0 -110%; }
      100% { -webkit-mask-position:0 110%;  mask-position:0 110%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .ulgen-msg, .ulgen-info, .ulgen-msg.busy .ulgen-avatar svg,
      #panel-ulgen.ulgen-isliyor .ulgen-head .ulgen-mark svg, #panel-ulgen.ulgen-isliyor .ulgen-halo .ulgen-mark svg {
        animation:none; -webkit-mask-image:none; mask-image:none;
      }
      .ulgen-chip { transition:none; }
    }
    :root[data-reduce-motion] .ulgen-msg, :root[data-reduce-motion] .ulgen-info,
    :root[data-reduce-motion] .ulgen-msg.busy .ulgen-avatar svg,
    :root[data-reduce-motion] #panel-ulgen.ulgen-isliyor .ulgen-head .ulgen-mark svg,
    :root[data-reduce-motion] #panel-ulgen.ulgen-isliyor .ulgen-halo .ulgen-mark svg {
      animation:none; -webkit-mask-image:none; mask-image:none;
    }
  `;
  document.head.appendChild(s);
}

const ulgen = { mod: null, durum: null, mesgul: false };
const U = () => window.secureBrowser && window.secureBrowser.ulgen;

// Ülgen'in işareti: Ülgen panosunun sesli komut alanındaki dünya ağacı (AgacGlyph + halkalar),
// 400'lük çizimden 64'e ölçeklendi. Dallar yukarı, aynısı kökler olarak aşağı yansıtılır.
// Dört dal ve gövde: panodaki çizimin küçük boyutta okunan sadeleşmiş hâli.
const ULGEN_DALLAR = 'M32 33V17.6'
  + 'M32 28.5C28.8 25.2 25.4 24.6 21.8 20.2M32 28.5C35.2 25.2 38.6 24.6 42.2 20.2'
  + 'M32 23.2C30.2 20.8 28.6 20.2 26.6 17.4M32 23.2C33.8 20.8 35.4 20.2 37.4 17.4';
const ULGEN_YAPRAK = [[21.8, 20.2], [42.2, 20.2], [26.6, 17.4], [37.4, 17.4], [32, 17.6]];
const ulgenAgac = (kok) => '<g' + (kok ? ' transform="matrix(1,0,0,-1,0,64)" opacity=".45"' : '') + '>'
  + '<path d="' + ULGEN_DALLAR + '" stroke-width="2.1"/>'
  + ULGEN_YAPRAK.map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="1.7" fill="currentColor" stroke="none"/>').join('') + '</g>';
// Küçük boyutta okunsun diye ağaç halkanın içini dolduracak kadar büyütülür.
const ULGEN_MARK = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="32" cy="32" r="29" stroke-width="1.8" opacity=".6"/>'
  + '<circle cx="32" cy="32" r="24.5" stroke-width="1" stroke-dasharray="1.2 3.6" opacity=".65"/>'
  + '<g transform="translate(32 32) scale(1.12) translate(-32 -32)">' + ulgenAgac(false) + ulgenAgac(true) + '</g>'
  + '<circle cx="32" cy="32" r="6.4" stroke-width="1.5" opacity=".85"/></svg>';
const IKON = {
  bilgi: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/></svg>',
  cihaz: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/></svg>',
  cevrimdisi: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 4.2-2.4M19 12.5a10 10 0 0 0-2.7-1.8"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/></svg>',
  summary: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6h14M5 10h14M5 14h9M5 18h6"/><path d="M18 14.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/></svg>',
  find: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M8 8h6M8 12h3"/><circle cx="16.5" cy="15.5" r="3.5"/><path d="M19 18l2.5 2.5"/></svg>',
  history: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  web: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>',
  yeni: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 20 12z"/><path d="M12 9v6M9 12h6"/></svg>',
  kilit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  kapat: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function el(etiket, sinif, metin) {
  const e = document.createElement(etiket);
  if (sinif) e.className = sinif;
  if (metin != null) e.textContent = metin;
  return e;
}

// İskeletteki <template>'ten simge kopyası (dinamik HTML üretmeden).
function sablon(id) {
  const t = document.getElementById(id);
  return t && t.content && t.content.firstElementChild ? t.content.firstElementChild.cloneNode(true) : null;
}

function balon(m) { return m ? (m.querySelector('.ulgen-bubble') || m) : null; }

function mesaj(kim, ...cocuklar) {
  const log = document.getElementById('ulgen-log');
  if (!log) return null;
  document.getElementById('panel-ulgen')?.classList.add('ulgen-talking');
  const m = el('div', 'ulgen-msg ' + kim);
  if (kim === 'biz') {
    const av = el('span', 'ulgen-avatar');
    const isaret = sablon('ulgen-tpl-mark');
    if (isaret) av.appendChild(isaret);
    m.appendChild(av);
  }
  const b = el('div', 'ulgen-bubble');
  for (const c of cocuklar) if (c) b.appendChild(typeof c === 'string' ? el('div', null, c) : c);
  m.appendChild(b);
  log.appendChild(m);
  m.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return m;
}

function dugme(metin, tik, sinif = 'ulgen-btn') {
  const b = el('button', sinif, metin);
  b.type = 'button';
  b.addEventListener('click', tik);
  return b;
}

function veriSayfasi() {
  window.ilgezdiCloseAllPanels?.();
  window.ilgezdiDataCenter?.open?.('ulgen');
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Sayfada bulunan cümlede aranan sözcükleri işaretler (metin parçaları + <mark>, innerHTML yok).
function vurgula(metin, sorgu) {
  const kapsayici = el('li', 'ulgen-quote');
  const sozcukler = String(sorgu || '').toLocaleLowerCase('tr').split(/\s+/).filter((w) => w.length > 1);
  if (!sozcukler.length) { kapsayici.textContent = metin; return kapsayici; }
  const kucuk = metin.toLocaleLowerCase('tr');
  let i = 0;
  while (i < metin.length) {
    let enYakin = -1, uzunluk = 0;
    for (const w of sozcukler) {
      const j = kucuk.indexOf(w, i);
      if (j >= 0 && (enYakin < 0 || j < enYakin)) { enYakin = j; uzunluk = w.length; }
    }
    if (enYakin < 0) { kapsayici.appendChild(document.createTextNode(metin.slice(i))); break; }
    if (enYakin > i) kapsayici.appendChild(document.createTextNode(metin.slice(i, enYakin)));
    kapsayici.appendChild(el('mark', null, metin.slice(enYakin, enYakin + uzunluk)));
    i = enYakin + uzunluk;
  }
  return kapsayici;
}

const HATA = {
  izin_chat: 'ulgen.off', izin_history: 'ulgen.err.historyOff', gizli_pencere: 'ulgen.err.incognito',
  sayfa_yok: 'ulgen.err.noPage', makale_yok: 'ulgen.err.noArticle', sayfa_degisti: 'ulgen.err.navigated',
  sorgu_bos: 'ulgen.err.emptyQuery',
};

function yanitiGoster(r, istek) {
  if (!r || !r.ok) {
    const sebep = r && r.sebep;
    if (sebep === 'onay_gerek') {
      const bas = el('div', 'ulgen-consent-head');
      const kilit = sablon('ulgen-tpl-lock');
      if (kilit) bas.appendChild(kilit);
      bas.appendChild(el('span', null, T('ulgen.ask.page')));
      const m = mesaj('biz', bas);
      balon(m)?.classList.add('ulgen-consent');
      const satir = el('div', 'ulgen-row');
      satir.append(
        dugme(T('ulgen.ask.allow'), () => { satir.remove(); gonder({ ...istek, onay: true }, false); }, 'ulgen-btn primary'),
        dugme(T('ulgen.ask.cancel'), () => satir.remove()));
      balon(m)?.appendChild(satir);
      return;
    }
    const m = mesaj('biz', T(HATA[sebep] || 'ulgen.err.generic'));
    if (m && (sebep === 'izin_chat' || sebep === 'izin_history')) {
      const satir = el('div', 'ulgen-row');
      satir.appendChild(dugme(T('ulgen.openData'), veriSayfasi));
      balon(m).appendChild(satir);
    }
    return;
  }
  switch (r.tur) {
    case 'ozet': {
      const ol = el('ol', 'ulgen-sum');
      const cev = r.ceviri && r.ceviri.durum === 'hazir' ? r.ceviri.cumleler || [] : [];
      (r.cumleler || []).forEach((c, i) => {
        const li = el('li', null, c);
        // Özgün cümle kaybolmaz: çeviri altında, makine çevirisi damgasıyla durur.
        if (cev[i]) li.appendChild(el('div', 'ulgen-tr', cev[i]));
        ol.appendChild(li);
      });
      const m = mesaj('biz', el('h4', null, r.baslik || ''), el('div', 'ulgen-source', hostOf(r.url)), ol,
        el('div', 'ulgen-foot', T('ulgen.sum.foot', { count: (r.cumleler || []).length, total: r.toplam || 0 })));
      if (m) ceviriNotu(balon(m), r.ceviri, istek);
      if (m && r.etiket && r.etiket.length) {
        balon(m).appendChild(el('div', 'ulgen-foot', T('ulgen.sum.tagsLabel')));
        const kutu = el('div', 'ulgen-tags');
        for (const t of r.etiket) kutu.appendChild(el('span', 'ulgen-tag', t));
        balon(m).appendChild(kutu);
      }
      return;
    }
    case 'sayfada': {
      if (!r.sonuclar || !r.sonuclar.length) { mesaj('biz', T('ulgen.find.none', { q: r.sorgu })); return; }
      const ul = el('ul');
      for (const c of r.sonuclar) ul.appendChild(vurgula(c, r.sorgu));
      mesaj('biz', el('h4', null, T('ulgen.find.head', { q: r.sorgu })), ul);
      return;
    }
    case 'gecmis': {
      if (!r.sonuclar || !r.sonuclar.length) { mesaj('biz', T('ulgen.hist.none')); return; }
      const ul = el('ul', 'ulgen-hist');
      for (const s of r.sonuclar) {
        const li = el('li');
        li.appendChild(dugme(s.baslik, () => sekmedeAc({ tur: 'ac', url: s.url }), 'ulgen-link'));
        if (s.alan) li.appendChild(el('span', 'ulgen-host', s.alan));
        ul.appendChild(li);
      }
      mesaj('biz', el('h4', null, T('ulgen.hist.head', { q: r.sorgu })), ul);
      return;
    }
    case 'web':
    case 'sorgu': {
      // Sorguyu gösterip beklemek yerine arama hemen açılır; kayıt sohbette kalır (Burak, 20 Eyl 2026).
      const satir = el('div', 'ulgen-row');
      satir.appendChild(dugme(T('ulgen.web.open'), () => sekmedeAc({ tur: 'ara', sorgu: r.sorgu }), 'ulgen-btn'));
      mesaj('biz', el('h4', null, T('ulgen.web.opened')), el('code', 'ulgen-query', r.sorgu), satir);
      sekmedeAc({ tur: 'ara', sorgu: r.sorgu });
      return;
    }
    default:
      mesaj('biz', T('ulgen.help'));
  }
}

// Sonuç yeni sekmede açılır. Panel açık kalırsa sayfayı örter; bu yüzden kenara çekilir.
/**
 * Özetin altındaki çeviri notu. Sayfanın dili arayüz diliyle aynıysa ya da motor dili
 * bilmiyorsa hiçbir şey gösterilmez — kimseye çeviri dayatılmaz. Paket yoksa indirme
 * düğmesi çıkar ve "sayfa metni gitmiyor, yalnızca dil paketi iniyor" ayrımı yazılır.
 */
function ceviriNotu(kutu, ceviri, istek) {
  if (!kutu || !ceviri || !ceviri.durum || ceviri.durum === 'dil_bilinmiyor') return;
  if (ceviri.kaynakDil && ceviri.kaynakDil === hedefDil()) return;
  if (ceviri.durum === 'hazir') {
    kutu.appendChild(el('div', 'ulgen-foot ulgen-tr-foot', T('ulgen.tr.stamp')));
    return;
  }
  if (ceviri.durum === 'kapali') {
    kutu.appendChild(el('div', 'ulgen-foot', T('ulgen.tr.off')));
    const satir = el('div', 'ulgen-row');
    satir.appendChild(dugme(T('ulgen.tr.turnOn'), veriSayfasi));
    kutu.appendChild(satir);
    return;
  }
  if (ceviri.durum === 'paket_yok') {
    kutu.appendChild(el('div', 'ulgen-foot', T('ulgen.tr.downloadNote')));
    const satir = el('div', 'ulgen-row');
    const btn = dugme(T('ulgen.tr.download'), () => paketIndir(btn, ceviri.kaynakDil, istek), 'ulgen-btn primary');
    satir.appendChild(btn);
    kutu.appendChild(satir);
    return;
  }
  // Dil çifti yoksa sessizce geçmek yerine tek satır: kullanıcı neden çevrilmediğini bilsin.
  if (ceviri.durum === 'desteklenmiyor') {
    kutu.appendChild(el('div', 'ulgen-foot', T('ulgen.tr.unsupported')));
    return;
  }
  if (ceviri.durum === 'hata') {
    kutu.appendChild(el('div', 'ulgen-foot', T('ulgen.tr.error')));
    const satir = el('div', 'ulgen-row');
    const btn = dugme(T('ulgen.tr.retry'), () => paketIndir(btn, ceviri.kaynakDil, istek));
    satir.appendChild(btn);
    kutu.appendChild(satir);
  }
  // 'gerek_yok' ve 'dil_bilinmiyor': sayfa zaten hedef dilde ya da dil bilinmiyor — hiçbir şey gösterilmez.
}

async function paketIndir(btn, kaynakDil, istek) {
  const kopru = U();
  if (!kopru || !btn || btn.disabled) return;
  const eski = btn.textContent;
  btn.disabled = true;
  btn.textContent = T('ulgen.tr.downloading');
  // Motor ilerleme bildiriyorsa yüzde yazılır; bildirmiyorsa düğme "iniyor" der ve bekler.
  let birak = null;
  try {
    birak = kopru.onCeviriDurum?.((d) => {
      if (!d || d.durum !== 'iniyor' || !Number.isFinite(d.yuzde)) return;
      btn.textContent = T('ulgen.tr.downloadingPct', { pct: Math.max(0, Math.min(100, Math.round(d.yuzde))) });
    });
  } catch { birak = null; }
  let r = null;
  try { r = await kopru.eylem({ tur: 'ceviriPaketi', kaynakDil, hedefDil: hedefDil() }); } catch { r = null; }
  if (typeof birak === 'function') { try { birak(); } catch {} }
  btn.disabled = false;
  btn.textContent = eski;
  if (r && r.ok !== false && r.durum !== 'hata') {
    // Paket indi: aynı özet yeniden istenir, bu kez çeviriyle gelir.
    gonder({ tur: (istek && istek.tur) || 'ozet', metin: T('ulgen.act.summary'), onay: istek && istek.onay });
  } else {
    mesaj('biz', T('ulgen.tr.failed'));
  }
}

function sekmedeAc(eylem) {
  U()?.eylem(eylem);
  window.ilgezdiCloseAllPanels?.();
}

// Arayüz dili çevirinin hedefi: Kazakça arayüzde özet Kazakçaya çevrilir.
const hedefDil = () => (window.ilgezdiI18n && window.ilgezdiI18n.locale) || 'tr';

async function gonder(istek, yazdir = true) {
  const kopru = U();
  if (!kopru || ulgen.mesgul) return;
  if (istek.tur === 'ozet' && !istek.hedefDil) istek = { ...istek, hedefDil: hedefDil() };
  if (yazdir && istek.metin) mesaj('siz', istek.metin);
  ulgen.mesgul = true;
  const panel = document.getElementById('panel-ulgen');
  panel?.classList.add('ulgen-isliyor');          // tamga işlem boyunca yanıp söner
  const bekle = mesaj('biz', T('ulgen.busy'));
  bekle?.classList.add('busy');
  let r = null;
  try { r = await kopru.sor(istek); } catch { r = null; }
  bekle?.remove();
  panel?.classList.remove('ulgen-isliyor');
  ulgen.mesgul = false;
  yanitiGoster(r, istek);
}

function modSec(mod) {
  ulgen.mod = ulgen.mod === mod ? null : mod;
  document.querySelectorAll('.ulgen-chip[data-mod]').forEach((c) => c.classList.toggle('active', c.dataset.mod === ulgen.mod));
  const pill = document.getElementById('ulgen-mode');
  const ad = document.getElementById('ulgen-mode-name');
  if (pill && ad) {
    pill.hidden = !ulgen.mod;
    ad.textContent = ulgen.mod ? T('ulgen.act.' + ulgen.mod) : '';
  }
  const g = document.getElementById('ulgen-ask-input');
  if (g) {
    g.placeholder = T(ulgen.mod ? 'ulgen.ph.' + ulgen.mod : 'ulgen.placeholder');
    g.focus();
  }
}

function sor() {
  const g = document.getElementById('ulgen-ask-input');
  const metin = (g && g.value || '').trim();
  if (!metin) return;
  g.value = '';
  const TUR = { find: 'sayfada', history: 'gecmis', web: 'web' };
  gonder(ulgen.mod ? { tur: TUR[ulgen.mod], metin } : { metin });
}

function yeniSohbet() {
  const log = document.getElementById('ulgen-log');
  if (log) log.replaceChildren();
  document.getElementById('panel-ulgen')?.classList.remove('ulgen-talking');
  if (ulgen.mod) modSec(ulgen.mod);
}

async function durumuUygula() {
  const kopru = U();
  ulgen.durum = kopru ? await kopru.durum().catch(() => null) : null;
  const acik = !!(ulgen.durum && ulgen.durum.chat);
  document.getElementById('ulgen-off')?.classList.toggle('hidden', acik);
  document.getElementById('ulgen-welcome')?.classList.toggle('hidden', !acik);
  for (const id of ['ulgen-ask-input', 'ulgen-ask-send']) {
    const e = document.getElementById(id);
    if (e) e.disabled = !acik;
  }
  document.querySelectorAll('.ulgen-chip').forEach((c) => { c.disabled = !acik; });
}

function ulgenBuildPanel() {
  const panel = document.getElementById('panel-ulgen');
  if (!panel) return;
  const kart = (ikon, baslik, ipucu, nitelik) => `
        <button type="button" class="ulgen-chip" ${nitelik}>
          <span class="ulgen-chip-icon">${ikon}</span>
          <span class="ulgen-chip-title">${TH(baslik)}</span>
          <span class="ulgen-chip-hint">${TH(ipucu)}</span>
        </button>`;
  panel.innerHTML = `
    <template id="ulgen-tpl-mark">${ULGEN_MARK}</template>
    <template id="ulgen-tpl-lock">${IKON.kilit}</template>
    <div class="ulgen-head">
      <div class="ulgen-mark">${ULGEN_MARK}</div>
      <div class="ulgen-id">
        <h2 id="ulgen-title">Ülgen</h2>
        <div class="ulgen-rune" aria-hidden="true">𐰇𐰞𐰏𐰤</div>
        <button type="button" class="ulgen-status" id="ulgen-status" aria-expanded="false" aria-controls="ulgen-info" title="${TH('ulgen.localWhy')}">${TH('ulgen.local')}${IKON.bilgi}</button>
      </div>
      <div class="ulgen-head-actions">
        <button type="button" class="ulgen-icon-btn" id="ulgen-new" title="${TH('ulgen.newChat')}" aria-label="${TH('ulgen.newChat')}">${IKON.yeni}</button>
        <button type="button" class="panel-close" data-panel="ulgen" aria-label="${TH('common.closePanel')}">✕</button>
      </div>
    </div>
    <div class="panel-body ulgen-body" aria-labelledby="ulgen-title">
      <div class="ulgen-scroll">
        <section class="ulgen-info" id="ulgen-info" aria-labelledby="ulgen-info-title" hidden>
          <h3 id="ulgen-info-title">${TH('ulgen.localWhy')}</h3>
          <button type="button" class="ulgen-icon-btn" id="ulgen-info-close" title="${TH('common.close')}" aria-label="${TH('common.close')}">${IKON.kapat}</button>
          <ul>
            <li><span class="ulgen-info-icon">${IKON.cihaz}</span><div><strong>${TH('ulgen.info.deviceTitle')}</strong><span>${TH('ulgen.info.deviceBody')}</span></div></li>
            <li><span class="ulgen-info-icon">${IKON.web}</span><div><strong>${TH('ulgen.info.webTitle')}</strong><span>${TH('ulgen.info.webBody')}</span></div></li>
            <li><span class="ulgen-info-icon">${IKON.cevrimdisi}</span><div><strong>${TH('ulgen.info.offlineTitle')}</strong><span>${TH('ulgen.info.offlineBody')}</span></div></li>
          </ul>
        </section>
        <div class="ulgen-welcome hidden" id="ulgen-welcome">
          <div class="ulgen-halo"><div class="ulgen-mark">${ULGEN_MARK}</div></div>
          <h3>${TH('ulgen.greet')}</h3>
          <p>${TH('ulgen.greetSub')}</p>
        </div>
        <div class="ulgen-off hidden" id="ulgen-off">
          <div class="ulgen-mark">${ULGEN_MARK}</div>
          <div>${TH('ulgen.off')}</div>
          <button type="button" class="ulgen-btn primary" id="ulgen-open-data">${TH('ulgen.openData')}</button>
        </div>
        <div class="ulgen-log" id="ulgen-log" aria-live="polite"></div>
      </div>
      <div class="ulgen-actions" role="group" aria-label="${TH('ulgen.subtitle')}">
        ${kart(IKON.summary, 'ulgen.act.summary', 'ulgen.act.summaryHint', 'id="ulgen-act-summary"')}
        ${kart(IKON.find, 'ulgen.act.find', 'ulgen.act.findHint', 'data-mod="find"')}
        ${kart(IKON.history, 'ulgen.act.history', 'ulgen.act.historyHint', 'data-mod="history"')}
        ${kart(IKON.web, 'ulgen.act.web', 'ulgen.act.webHint', 'data-mod="web"')}
      </div>
      <div class="ulgen-composer">
        <div class="ulgen-ask">
          <span class="ulgen-mode" id="ulgen-mode" hidden><span id="ulgen-mode-name"></span>
            <button type="button" id="ulgen-mode-clear" title="${TH('ulgen.clearMode')}" aria-label="${TH('ulgen.clearMode')}">${IKON.kapat}</button></span>
          <input type="text" id="ulgen-ask-input" maxlength="500" disabled placeholder="${TH('ulgen.placeholder')}" aria-label="${TH('ulgen.subtitle')}" />
          <button type="button" class="ulgen-send" id="ulgen-ask-send" disabled title="${TH('feedback.send')}" aria-label="${TH('feedback.send')}">${IKON.send}</button>
        </div>
        <div class="ulgen-notes">
          <p class="ulgen-note">${IKON.kilit}<span>${TH('ulgen.privacy')}</span></p>
          <p class="ulgen-note" id="ulgen-account-note">${IKON.kilit}<span>${TH('ulgen.account')}</span></p>
        </div>
      </div>
    </div>
  `;

  document.querySelector('[data-panel="ulgen"]')?.addEventListener('click', () => {
    window.ilgezdiCloseAllPanels?.();
  });
  document.getElementById('ulgen-open-data')?.addEventListener('click', veriSayfasi);
  document.getElementById('ulgen-new')?.addEventListener('click', yeniSohbet);
  const rozet = document.getElementById('ulgen-status');
  const bilgi = document.getElementById('ulgen-info');
  const bilgiGoster = (acik) => {
    bilgi.hidden = !acik;
    rozet.setAttribute('aria-expanded', String(acik));
    if (acik) panel.querySelector('.ulgen-scroll').scrollTop = 0;
  };
  rozet.addEventListener('click', () => bilgiGoster(bilgi.hidden));
  document.getElementById('ulgen-info-close').addEventListener('click', () => { bilgiGoster(false); rozet.focus(); });
  document.getElementById('ulgen-mode-clear')?.addEventListener('click', () => { if (ulgen.mod) modSec(ulgen.mod); });
  document.getElementById('ulgen-act-summary')?.addEventListener('click', () => gonder({ tur: 'ozet', metin: T('ulgen.act.summary') }));
  document.querySelectorAll('.ulgen-chip[data-mod]').forEach((c) => c.addEventListener('click', () => modSec(c.dataset.mod)));
  // İnce sırada son iş görünene kadar sağ kenar solar; tekerlek sırayı yana kaydırır.
  const isler = panel.querySelector('.ulgen-actions');
  const sonMu = () => isler.classList.toggle('at-end', isler.scrollLeft + isler.clientWidth >= isler.scrollWidth - 2);
  isler.addEventListener('scroll', sonMu, { passive: true });
  isler.addEventListener('wheel', (e) => {
    if (!panel.classList.contains('ulgen-talking') || isler.scrollWidth <= isler.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    isler.scrollLeft += e.deltaY;
  }, { passive: false });
  new ResizeObserver(sonMu).observe(isler);
  document.getElementById('ulgen-ask-send')?.addEventListener('click', sor);
  document.getElementById('ulgen-ask-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sor();
    else if (e.key === 'Escape' && ulgen.mod) { e.preventDefault(); modSec(ulgen.mod); }
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
    // İzin Veri ve Gizlilik'te değişmiş olabilir; her açılışta yeniden okunur.
    durumuUygula();
  });

  durumuUygula();
}

window.addEventListener('load', () => setTimeout(initUlgenPanel, 500));
