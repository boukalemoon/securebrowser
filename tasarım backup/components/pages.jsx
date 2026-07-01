// İlgezdi — Page screens (Newtab, Welcome, Webpage, History, Downloads, Bookmarks, Discover, Settings)

const Tile = ({ link }) => (
  <div className="shortcut" title={link.name}>
    <div className="tile-mark" style={{
      background: `linear-gradient(135deg, ${link.color}, color-mix(in srgb, ${link.color} 60%, black))`,
      boxShadow: `0 6px 14px -8px ${link.color}`,
    }}>
      <span style={{ position: 'relative', zIndex: 2 }}>{link.letter}</span>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 4px, transparent 4px 8px)'
      }}></div>
    </div>
    <span className="label">{link.name}</span>
  </div>
);

const NewTab = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const submit = (e) => { e.preventDefault(); if (query.trim()) onSearch?.(query); };
  return (
    <div className="newtab fade-up">
      <div className="newtab-greet">
        <div className="runes-greet">𐰚𐰢 𐱅𐰉𐰍𐰢</div>
        <h2>İyi Yolculuklar, Gezgin</h2>
        <div className="sub">Bilgi yolu uzun, atın hazır.</div>
      </div>

      <form className="big-search" onSubmit={submit}>
        <div className="field">
          <Icon name="search" size={18}/>
          <input
            placeholder="İlgezdi ile ara veya bir adres yaz…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button className="search-go" type="submit"><Icon name="arrow-right" size={16}/></button>
        </div>
        <div className="runes-hint">𐰉𐰽𐱃 𐰚𐰢 𐱅𐰢𐰍 · ARA</div>
      </form>

      <div className="shortcuts">
        {QUICK_LINKS.map((link, i) => <Tile key={i} link={link}/>)}
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div className="section-head">
          <div className="title-block">
            <h3>BUGÜNÜN İZLERİ</h3>
            <span className="runes">𐰚 𐰉𐰕 𐰢𐰜</span>
          </div>
          <span className="more">Tümünü gör →</span>
        </div>
        <div className="news-grid">
          {SAMPLE_NEWS.map((n, i) => (
            n.feature ? (
              <div className="news-card feature" key={i}>
                <div className="feature-img">
                  <span className="placeholder-tag">[ ÖNE ÇIKAN GÖRSEL · 760×320 ]</span>
                </div>
                <div className="body-pad">
                  <div className="meta"><span className="cat">{n.cat}</span><span>·</span><span>{n.read} okuma</span></div>
                  <h4>{n.title}</h4>
                  <p>{n.body}</p>
                </div>
              </div>
            ) : (
              <div className="news-card" key={i}>
                <div className="meta"><span className="cat">{n.cat}</span><span>·</span><span>{n.read}</span></div>
                <h4>{n.title}</h4>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
};

const Welcome = ({ onStart }) => (
  <div className="welcome">
    <div className="welcome-inner fade-up">
      <div className="welcome-mark">
        <div className="ring"></div>
        <img src="assets/logo-mark.png" alt="İlgezdi"/>
      </div>
      <div className="runes-line">𐰋𐰠𐰏𐰀 𐰚𐰢 𐱅𐰉𐰍𐰢</div>
      <h1>İLGEZDİ</h1>
      <div className="tagline">
        Bozkırdan dijital çağa uzanan bir yolculuk. İnternet'i bilge bir gezgin gibi keşfedin —
        gizliliğiniz korunur, izleriniz sizin kalır.
      </div>
      <div className="welcome-cta">
        <button className="btn-primary" onClick={onStart}>Yola Çık →</button>
        <button className="btn-ghost">Verilerimi içe aktar</button>
      </div>

      <div className="divider-rune"><span className="rune">𐱅𐰢𐰍 𐰉𐰽𐱃</span></div>

      <div className="feature-grid">
        <div className="feature-card">
          <div className="ico"><Icon name="shield" size={20}/></div>
          <div className="rune-tag">𐰍 𐰕 𐰉</div>
          <h3>Gizli Otağ</h3>
          <p>Reklam ve izleyici engelleyici varsayılan açık. Verileriniz hiçbir yere gönderilmez.</p>
        </div>
        <div className="feature-card">
          <div className="ico"><Icon name="compass" size={20}/></div>
          <div className="rune-tag">𐰚 𐰽 𐱅</div>
          <h3>Bilge Arama</h3>
          <p>Türkçe ve Göktürkçe çift dilli arama. Tarih, kültür ve bilim için özel kanallar.</p>
        </div>
        <div className="feature-card">
          <div className="ico"><Icon name="palette" size={20}/></div>
          <div className="rune-tag">𐰉 𐰕 𐰕</div>
          <h3>Dört Tema</h3>
          <p>Ötüken, Umay, Kağan Otağı ve Hibrit Altın — ruhunuza uyan görünümü seçin.</p>
        </div>
      </div>
    </div>
  </div>
);

const Webpage = () => (
  <div className="webpage">
    <div className="webpage-banner">
      <div className="breadcrumb">tr.wikipedia.org / Bilge Kağan</div>
      <h1>BİLGE KAĞAN</h1>
    </div>
    <div className="webpage-content fade-up">
      <p style={{ fontSize: 15, color: 'var(--ink)' }}>
        <strong style={{ fontFamily: 'var(--font-display)', letterSpacing: 1 }}>Bilge Kağan</strong> (𐰋𐰠𐰏𐰀
        𐰴𐰍𐰣, 683–734), II. Göktürk Kağanlığı'nın 4. kağanıdır. Kül Tigin'in ağabeyi ve Kapgan Kağan'ın yeğeni
        olarak bilinen Bilge Kağan, 716 yılında tahta çıkmış ve 18 yıl boyunca Türk halklarını yönetmiştir.
      </p>
      <div className="webpage-img"><span className="ph-tag">[ MİNYATÜR · BİLGE KAĞAN PORTRESİ · 720×200 ]</span></div>
      <h2>Yazıtları</h2>
      <p>
        Bilge Kağan adına dikilen anıt, Orhun Yazıtları'nın en önemli üç eserinden biridir. Yazıt, hem
        Göktürk alfabesiyle hem de Çince olarak iki dilli yazılmıştır. Anıtın metni kardeşi Kül Tigin'in
        ölümünden sonra duyduğu derin acıyı, Türk milletine olan sevgisini ve gelecek nesillere bıraktığı
        öğütleri anlatır.
      </p>
      <blockquote>
        "Türk milleti, üstte gök çökmedikçe, altta yer delinmedikçe senin ilini, töreni kim bozabilir?"
      </blockquote>
      <h2>Tarihsel Önemi</h2>
      <p>
        Yazıtların Vilhelm Thomsen tarafından 1893 yılında çözülmesi, Türk dilinin yazılı kaynaklarının
        günümüze ulaşan en eski örneklerini bilim dünyasına kazandırmıştır. Yazıtlar bugün hâlâ Moğolistan'ın
        Orhun Vadisi'nde, UNESCO Dünya Mirası listesinde yer almaktadır.
      </p>
    </div>
  </div>
);

const HistoryPage = () => (
  <div className="page fade-up">
    <div className="page-head">
      <div>
        <div className="runes-h">𐰚𐰠𐰏𐰢𐰜 𐰚𐰢 𐱅𐰢𐰍</div>
        <h1>Geçmiş</h1>
      </div>
      <div className="right">
        <div className="page-search">
          <Icon name="search" size={14}/>
          <input placeholder="Geçmişte ara…"/>
        </div>
        <button className="btn-ghost">Geçmişi Temizle</button>
      </div>
    </div>
    <div className="list">
      {SAMPLE_HISTORY.map((d, i) => (
        <React.Fragment key={i}>
          <div className="list-day">{d.day}</div>
          {d.items.map((it, j) => (
            <div className="list-row" key={j}>
              <div className="lr-icon" style={{ background: it.color }}>{it.letter}</div>
              <div className="lr-title">{it.title}</div>
              <div className="lr-url">{it.url}</div>
              <div className="lr-time">{it.time}</div>
              <div className="lr-more"><Icon name="dots" size={14}/></div>
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  </div>
);

const Downloads = () => (
  <div className="page fade-up">
    <div className="page-head">
      <div>
        <div className="runes-h">𐰒𐰠 𐰚𐰢 𐱅𐰢𐰍</div>
        <h1>İndirilenler</h1>
      </div>
      <div className="right">
        <button className="btn-ghost">Klasörü Aç</button>
        <button className="btn-ghost">Listeyi Temizle</button>
      </div>
    </div>
    {SAMPLE_DOWNLOADS.map((d, i) => (
      <div className="dl-row" key={i}>
        <div className="file-icon">{d.ext}</div>
        <div>
          <div className="name">{d.name}</div>
          <div className="src">{d.src} · {d.size}</div>
        </div>
        <div className="progress">
          <div className="bar"><i style={{ width: `${d.pct}%` }}></i></div>
          <div className="pct">{d.pct === 100 ? 'Tamamlandı' : `İniyor… ${d.pct}%`}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>
          {d.pct === 100 ? '✓ Hazır' : '◐ Devam'}
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button className="icon-btn"><Icon name={d.pct === 100 ? 'folder' : 'pause'} size={14}/></button>
          <button className="icon-btn"><Icon name="dots" size={14}/></button>
        </div>
      </div>
    ))}
  </div>
);

const Bookmarks = () => {
  const [folder, setFolder] = useState('Sık Kullanılan');
  return (
    <div className="page fade-up">
      <div className="page-head">
        <div>
          <div className="runes-h">𐰉𐰠𐰢 𐰚𐰢 𐱅𐰢𐰍</div>
          <h1>Yer İmleri</h1>
        </div>
        <div className="right">
          <div className="page-search"><Icon name="search" size={14}/><input placeholder="Yer imi ara…"/></div>
          <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 11 }}>+ Yeni</button>
        </div>
      </div>
      <div className="bookmark-folders">
        {Object.keys(SAMPLE_BOOKMARKS).map((f) => (
          <div key={f} className={`folder-chip ${folder === f ? 'active' : ''}`} onClick={() => setFolder(f)}>
            <Icon name="folder" size={12}/> {f}
            <span style={{ opacity: 0.6, fontSize: 10 }}>{SAMPLE_BOOKMARKS[f].length}</span>
          </div>
        ))}
        <div className="folder-chip"><Icon name="plus" size={12}/> Yeni Klasör</div>
      </div>
      <div className="bookmarks-grid">
        {SAMPLE_BOOKMARKS[folder].map((b, i) => (
          <div className="bm-card" key={i}>
            <div className="bm-favicon" style={{ background: b.color }}>{b.letter}</div>
            <div className="bm-info">
              <div className="bm-title">{b.title}</div>
              <div className="bm-url">{b.url}</div>
            </div>
            <Icon name="star-fill" size={14}/>
          </div>
        ))}
      </div>
    </div>
  );
};

const Discover = () => (
  <div className="page fade-up">
    <div className="page-head">
      <div>
        <div className="runes-h">𐰚𐰽𐱃 𐰚𐰢 𐱅𐰢𐰍</div>
        <h1>Keşfet</h1>
      </div>
      <div className="right">
        <button className="btn-ghost">Tarih</button>
        <button className="btn-ghost">Kültür</button>
        <button className="btn-ghost">Bilim</button>
      </div>
    </div>
    <div className="news-grid" style={{ maxWidth: 'none' }}>
      {[...SAMPLE_NEWS, ...SAMPLE_NEWS].map((n, i) => (
        n.feature && i === 0 ? (
          <div className="news-card feature" key={i}>
            <div className="feature-img"><span className="placeholder-tag">[ KAPAK · 760×320 ]</span></div>
            <div className="body-pad">
              <div className="meta"><span className="cat">{n.cat}</span><span>·</span><span>{n.read}</span></div>
              <h4>{n.title}</h4>
              <p>{n.body}</p>
            </div>
          </div>
        ) : (
          <div className="news-card" key={i}>
            <div className="meta"><span className="cat">{n.cat}</span><span>·</span><span>{n.read}</span></div>
            <h4>{n.title}</h4>
          </div>
        )
      ))}
    </div>
  </div>
);

const Settings = ({ theme, setTheme, runesEnabled, setRunesEnabled }) => {
  const [section, setSection] = useState('appearance');
  const themes = [
    { id: 'otuken', name: 'Ötüken', sub: 'Kayalıklar', runes: '𐰚𐰢 𐰉', bg: '#0e1a2e', accent: '#d4a85a' },
    { id: 'umay', name: 'Umay Ana', sub: 'Işığı', runes: '𐰢 𐰉 𐰽', bg: '#f5ecd9', accent: '#b8893a' },
    { id: 'kagan', name: 'Kağan', sub: 'Otağı', runes: '𐰚𐰍 𐰉', bg: '#f0e0c4', accent: '#b85c3a' },
    { id: 'hibrit', name: 'Hibrit', sub: 'Altın', runes: '𐰋 𐰠𐱃', bg: '#0a1422', accent: '#f0c674' },
  ];
  return (
    <div className="page fade-up">
      <div className="page-head">
        <div>
          <div className="runes-h">𐰕𐰉 𐰚𐰢 𐱅𐰢𐰍</div>
          <h1>Ayarlar</h1>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>v1.0.0 · Bilge</div>
      </div>
      <div className="settings">
        <nav className="settings-nav">
          <div className="group-label">Genel</div>
          <a className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}><Icon name="palette" size={14}/> Görünüm</a>
          <a className={section === 'startup' ? 'active' : ''} onClick={() => setSection('startup')}><Icon name="home" size={14}/> Başlangıç</a>
          <a className={section === 'search' ? 'active' : ''} onClick={() => setSection('search')}><Icon name="search" size={14}/> Arama</a>
          <div className="group-label">Gizlilik</div>
          <a className={section === 'privacy' ? 'active' : ''} onClick={() => setSection('privacy')}><Icon name="shield" size={14}/> Gizli Otağ</a>
          <a><Icon name="eye" size={14}/> Çerezler</a>
          <a><Icon name="lock" size={14}/> Şifreler</a>
          <div className="group-label">Sistem</div>
          <a><Icon name="globe" size={14}/> Diller</a>
          <a><Icon name="download" size={14}/> İndirme</a>
          <a><Icon name="sparkles" size={14}/> Hakkında</a>
        </nav>

        <div className="settings-body">
          {section === 'appearance' && (
            <>
              <div className="settings-section">
                <h2>Tema</h2>
                <div className="runes-s">𐰋𐰠𐰏𐰀 𐰚𐰢 𐱅</div>
                <div className="theme-card-grid">
                  {themes.map((t) => (
                    <div key={t.id} className={`theme-card ${theme === t.id ? 'selected' : ''}`} onClick={() => setTheme(t.id)}>
                      <div className="swatch" style={{
                        background: `linear-gradient(135deg, ${t.bg} 0 50%, ${t.accent} 50% 100%)`
                      }}>
                        <div style={{
                          position: 'absolute', inset: 8, borderRadius: 6,
                          border: `1px dashed ${t.accent}`, opacity: 0.6
                        }}></div>
                      </div>
                      <div className="name">{t.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>{t.sub}</span></div>
                      <div className="runes-l">{t.runes}</div>
                      {theme === t.id && (
                        <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%', background: 'var(--gold)', display: 'grid', placeItems: 'center', color: 'var(--bg)' }}>
                          <Icon name="check" size={12} stroke={2.4}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="setting-row">
                  <div className="lbl-block"><div className="l">Göktürk runelerini göster</div><div className="h">Sekme adlarında, başlıklarda ve menülerde rune yazılar görünür.</div></div>
                  <div className={`toggle ${runesEnabled ? 'on' : ''}`} onClick={() => setRunesEnabled(!runesEnabled)}></div>
                </div>
                <div className="setting-row">
                  <div className="lbl-block"><div className="l">Kilim kenarlık</div><div className="h">Pencere kenarlarında ince dokuma motifi.</div></div>
                  <div className="toggle on"></div>
                </div>
                <div className="setting-row">
                  <div className="lbl-block"><div className="l">Animasyonları azalt</div><div className="h">Geçiş ve hareket efektlerini sınırlı tut.</div></div>
                  <div className="toggle"></div>
                </div>
              </div>
            </>
          )}
          {section === 'startup' && (
            <div className="settings-section">
              <h2>Başlangıç</h2>
              <div className="runes-s">𐰉𐰽𐱃 𐰉𐰍𐱃</div>
              <div className="setting-row">
                <div className="lbl-block"><div className="l">Açılışta göster</div><div className="h">İlgezdi başladığında ne yapılsın?</div></div>
                <select style={{ padding: '6px 12px', background: 'var(--bg-elev)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}>
                  <option>Yeni Sekme sayfası</option>
                  <option>Karşılama ekranı</option>
                  <option>Önceki oturum</option>
                </select>
              </div>
              <div className="setting-row">
                <div className="lbl-block"><div className="l">Kapanışta verileri sil</div><div className="h">Çerezler ve oturum kayıtları otomatik temizlensin.</div></div>
                <div className="toggle on"></div>
              </div>
            </div>
          )}
          {section === 'search' && (
            <div className="settings-section">
              <h2>Arama Motoru</h2>
              <div className="runes-s">𐰚𐰢 𐱅𐰢𐰍</div>
              <div className="setting-row">
                <div className="lbl-block"><div className="l">Varsayılan motor</div><div className="h">Adres çubuğundan yapılan aramalarda kullanılır.</div></div>
                <select style={{ padding: '6px 12px', background: 'var(--bg-elev)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}>
                  <option>İlgezdi Ara</option>
                  <option>Yandex</option>
                  <option>DuckDuckGo</option>
                </select>
              </div>
              <div className="setting-row">
                <div className="lbl-block"><div className="l">Çift dilli sonuçlar</div><div className="h">Türkçe sonuçlarla birlikte Göktürk runeleri ile yazılmış başlıklar göster.</div></div>
                <div className="toggle on"></div>
              </div>
            </div>
          )}
          {section === 'privacy' && (
            <div className="settings-section">
              <h2>Gizli Otağ</h2>
              <div className="runes-s">𐰍𐰕 𐰋𐰍</div>
              <div className="setting-row">
                <div className="lbl-block"><div className="l">İzleyici engelleyici</div><div className="h">Reklam ağları ve parmak izi takipçileri otomatik engellenir.</div></div>
                <div className="toggle on"></div>
              </div>
              <div className="setting-row">
                <div className="lbl-block"><div className="l">Beni izleme</div><div className="h">Web sitelerine "Do Not Track" sinyali gönder.</div></div>
                <div className="toggle on"></div>
              </div>
              <div className="setting-row">
                <div className="lbl-block"><div className="l">HTTPS Yalnız Modu</div><div className="h">Şifresiz bağlantılarda uyarı göster.</div></div>
                <div className="toggle on"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { NewTab, Welcome, Webpage, HistoryPage, Downloads, Bookmarks, Discover, Settings });
