// İlgezdi — Main app entry

const TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "otuken",
  "runesEnabled": true
}/*EDITMODE-END*/;

const App = () => {
  const [tweaks, setTweaksRaw] = uS(TWEAKS);

  const setTweak = (k, v) => {
    const next = typeof k === 'object' ? { ...tweaks, ...k } : { ...tweaks, [k]: v };
    setTweaksRaw(next);
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: typeof k === 'object' ? k : { [k]: v } }, '*');
    } catch {}
  };

  // Tweaks panel host protocol
  const [editMode, setEditMode] = uS(false);
  uE(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setEditMode(true);
      if (d.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {}
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <div data-screen-label="01 İlgezdi Browser" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Mobile + Desktop side by side */}
      <div style={{
        width: '100%', height: '100%',
        background: '#0a0e15',
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(212, 168, 90, 0.06), transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(200, 127, 74, 0.06), transparent 50%)
        `,
        display: 'flex', alignItems: 'stretch'
      }}>
        {/* Desktop browser fills most */}
        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flex: 1, borderRadius: 14, overflow: 'hidden', boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(212, 168, 90, 0.18)', minHeight: 0 }}>
            <Browser tweaks={tweaks} setTweak={setTweak} embedded/>
          </div>
        </div>
        {/* Mobile companion */}
        <div style={{
          width: 320, padding: '16px 16px 16px 0', display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            width: 280, height: 580,
            borderRadius: 36,
            border: '8px solid #0e1422',
            background: '#000',
            overflow: 'hidden',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(212, 168, 90, 0.2)',
            position: 'relative'
          }} data-screen-label="02 Mobil">
            {/* notch */}
            <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: 90, height: 18, background: '#0e1422',
              borderRadius: '0 0 12px 12px', zIndex: 10
            }}></div>
            <div style={{ width: '100%', height: '100%' }}>
              <Mobile tweaks={tweaks}/>
            </div>
          </div>
        </div>
      </div>

      {/* Tweaks panel */}
      {editMode && (
        <TweaksPanel onClose={() => { setEditMode(false); try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch {} }} title="Tweaks">
          <TweakSection title="Tema">
            <TweakRadio
              value={tweaks.theme}
              options={[
                { value: 'otuken', label: 'Ötüken' },
                { value: 'umay', label: 'Umay' },
                { value: 'kagan', label: 'Kağan' },
                { value: 'hibrit', label: 'Hibrit' },
              ]}
              onChange={(v) => setTweak('theme', v)}
            />
          </TweakSection>
          <TweakSection title="Görsel">
            <TweakToggle label="Göktürk runeleri" value={tweaks.runesEnabled} onChange={(v) => setTweak('runesEnabled', v)}/>
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
