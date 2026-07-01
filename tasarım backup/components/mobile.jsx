// İlgezdi — Mobile (iOS) wrapper

const Mobile = ({ tweaks }) => {
  const [view, setView] = uS('newtab'); // newtab, search, page, bookmarks, history, settings
  const [menuOpen, setMenuOpen] = uS(false);

  const renderView = () => {
    switch (view) {
      case 'newtab': return <MobileNewTab onSearch={() => setView('page')}/>;
      case 'page': return <MobilePage/>;
      case 'bookmarks': return <MobileList kind="bookmarks"/>;
      case 'history': return <MobileList kind="history"/>;
      case 'menu': return <MobileMenu onNav={(v) => setView(v)}/>;
      default: return <MobileNewTab/>;
    }
  };

  return (
    <div data-theme={tweaks.theme} style={{
      width: '100%', height: '100%',
      background: 'var(--bg)', color: 'var(--ink)',
      fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Top mini-bar */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: '1px solid var(--line)',
        background: 'var(--bg-elev)'
      }}>
        <BrandMark size={22}/>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: 2, color: 'var(--gold)' }}>İLGEZDİ</div>
        <button style={iconBtnStyle} onClick={() => setView('menu')}><Icon name="menu" size={16}/></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderView()}
      </div>

      {/* Bottom bar */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center',
        gap: 4, padding: '0 8px',
        borderTop: '1px solid var(--line)',
        background: 'var(--bg-elev)'
      }}>
        <button style={iconBtnStyle}><Icon name="back" size={18}/></button>
        <button style={iconBtnStyle}><Icon name="fwd" size={18}/></button>
        <div style={{
          flex: 1, height: 36, background: 'var(--bg-soft)',
          border: '1px solid var(--line)', borderRadius: 18,
          display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
          fontSize: 12, color: 'var(--ink-soft)'
        }}>
          <Icon name="lock" size={11}/>
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {view === 'newtab' ? 'İlgezdi ile ara…' : 'tr.wikipedia.org'}
          </span>
          {tweaks.runesEnabled && (
            <span style={{ fontFamily: 'var(--font-rune)', fontSize: 9, color: 'var(--rune)', letterSpacing: 1, opacity: 0.7 }}>𐰚𐰢</span>
          )}
        </div>
        <button style={iconBtnStyle} onClick={() => setView('history')}><Icon name="history" size={18}/></button>
        <button style={iconBtnStyle} onClick={() => setView('newtab')}><Icon name="plus" size={18}/></button>
      </div>
    </div>
  );
};

const iconBtnStyle = {
  width: 36, height: 36, border: 'none', background: 'transparent',
  color: 'var(--ink-soft)', borderRadius: 8, cursor: 'pointer',
  display: 'grid', placeItems: 'center'
};

const MobileNewTab = ({ onSearch }) => (
  <div style={{ padding: '24px 18px 32px' }}>
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{ fontFamily: 'var(--font-rune)', fontSize: 11, letterSpacing: 5, color: 'var(--rune)', opacity: 0.7, marginBottom: 4 }}>𐰚𐰢 𐱅𐰉𐰍𐰢</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)', letterSpacing: 1.5 }}>İyi yolculuklar</div>
    </div>
    <div onClick={onSearch} style={{
      height: 48, background: 'var(--bg-elev)',
      border: '1px solid var(--line)', borderRadius: 24,
      display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10,
      fontSize: 14, color: 'var(--ink-mute)', marginBottom: 24
    }}>
      <Icon name="search" size={16}/>
      <span>İlgezdi ile ara…</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
      {QUICK_LINKS.slice(0, 8).map((l, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `linear-gradient(135deg, ${l.color}, color-mix(in srgb, ${l.color} 60%, black))`,
            display: 'grid', placeItems: 'center', color: 'white', fontWeight: 700,
            fontFamily: 'var(--font-display)', fontSize: 18
          }}>{l.letter}</div>
          <span style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>{l.name}</span>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: 1, color: 'var(--ink)' }}>İZLER</span>
      <span style={{ fontFamily: 'var(--font-rune)', fontSize: 10, color: 'var(--rune)', letterSpacing: 3, opacity: 0.7 }}>𐰚𐰢 𐱅</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {SAMPLE_NEWS.slice(0, 4).map((n, i) => (
        <div key={i} style={{
          padding: 14, background: 'var(--bg-elev)', border: '1px solid var(--line)',
          borderRadius: 12
        }}>
          <div style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: 1.5, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{n.cat} · {n.read || '4 dk'}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, lineHeight: 1.35, color: 'var(--ink)' }}>{n.title}</div>
        </div>
      ))}
    </div>
  </div>
);

const MobilePage = () => (
  <div>
    <div style={{
      height: 140,
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--gold) 28%, transparent), transparent), var(--bg-elev)',
      display: 'grid', placeItems: 'center', borderBottom: '1px solid var(--line)'
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--gold)', letterSpacing: 2 }}>BİLGE KAĞAN</div>
    </div>
    <div style={{ padding: '20px 18px 32px' }}>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
        <strong style={{ color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>Bilge Kağan</strong> (𐰋𐰠𐰏𐰀 𐰴𐰍𐰣, 683–734),
        II. Göktürk Kağanlığı'nın 4. kağanıdır. 716 yılında tahta çıkmış ve 18 yıl boyunca Türk halklarını yönetmiştir.
      </p>
      <div style={{
        height: 130, borderRadius: 10, margin: '14px 0',
        background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--copper) 14%, transparent) 0 12px, transparent 12px 24px), var(--bg-elev)',
        border: '1px solid var(--line)', display: 'grid', placeItems: 'center'
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', background: 'var(--bg)', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line)' }}>[ MİNYATÜR · 320×130 ]</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
        Bilge Kağan adına dikilen anıt, Orhun Yazıtları'nın en önemli üç eserinden biridir.
      </p>
      <div style={{
        borderLeft: '3px solid var(--gold)', padding: '6px 14px', margin: '14px 0',
        fontStyle: 'italic', fontFamily: 'var(--font-display)', fontSize: 13,
        background: 'color-mix(in srgb, var(--gold) 6%, transparent)'
      }}>
        "Türk milleti, üstte gök çökmedikçe, altta yer delinmedikçe…"
      </div>
    </div>
  </div>
);

const MobileList = ({ kind }) => {
  const items = kind === 'bookmarks' ? SAMPLE_BOOKMARKS['Sık Kullanılan'] : SAMPLE_HISTORY[0].items;
  return (
    <div style={{ padding: '20px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-rune)', fontSize: 10, letterSpacing: 4, color: 'var(--rune)', opacity: 0.7 }}>
          {kind === 'bookmarks' ? '𐰉𐰠𐰢' : '𐰚𐰠𐰏𐰢𐰜'}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', letterSpacing: 1.5 }}>
          {kind === 'bookmarks' ? 'Yer İmleri' : 'Geçmiş'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 12,
            background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 7, background: item.color,
              display: 'grid', placeItems: 'center', color: 'white', fontWeight: 700, fontSize: 12
            }}>{item.letter}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>{item.url}{item.time ? ' · ' + item.time : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MobileMenu = ({ onNav }) => (
  <div style={{ padding: '24px 18px' }}>
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--font-rune)', fontSize: 10, letterSpacing: 4, color: 'var(--rune)', opacity: 0.7 }}>𐰢𐰜 𐰍𐰢</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)', letterSpacing: 2 }}>MENÜ</div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[
        { name: 'Yer İmleri', rune: '𐰉𐰠', icon: 'star', view: 'bookmarks' },
        { name: 'Geçmiş', rune: '𐰚𐰠', icon: 'history', view: 'history' },
        { name: 'İndirilenler', rune: '𐰒𐰠', icon: 'download' },
        { name: 'Keşfet', rune: '𐰚𐰽', icon: 'compass' },
        { name: 'Gizli Otağ', rune: '𐰍𐰕', icon: 'shield' },
        { name: 'Ayarlar', rune: '𐰕𐰉', icon: 'gear' },
      ].map((m, i) => (
        <div key={i} onClick={() => m.view && onNav(m.view)} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: 14,
          background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'color-mix(in srgb, var(--gold) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--gold) 36%, transparent)',
            color: 'var(--gold)', display: 'grid', placeItems: 'center'
          }}><Icon name={m.icon} size={16}/></div>
          <div style={{ flex: 1, fontSize: 14, color: 'var(--ink)' }}>{m.name}</div>
          <span style={{ fontFamily: 'var(--font-rune)', fontSize: 10, color: 'var(--rune)', letterSpacing: 2, opacity: 0.6 }}>{m.rune}</span>
        </div>
      ))}
    </div>
  </div>
);

window.Mobile = Mobile;
