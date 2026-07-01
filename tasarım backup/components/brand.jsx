// İlgezdi — Brand Mark (SVG recreation of the logo)
// Used at small sizes where the PNG would be muddy.

const BrandMark = ({ size = 28, glow = false }) => {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`globe-${id}`} cx="0.4" cy="0.35">
          <stop offset="0%" stopColor="#cfe2f5"/>
          <stop offset="60%" stopColor="#7fa6c8"/>
          <stop offset="100%" stopColor="#3a5a7a"/>
        </radialGradient>
        <linearGradient id={`gold-${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f0c674"/>
          <stop offset="100%" stopColor="#a8742a"/>
        </linearGradient>
        <linearGradient id={`silver-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#e8eef4"/>
          <stop offset="100%" stopColor="#8a9eb3"/>
        </linearGradient>
        {glow && (
          <filter id={`glow-${id}`}>
            <feGaussianBlur stdDeviation="1.2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        )}
      </defs>

      {/* outer ring */}
      <circle cx="50" cy="50" r="48" fill="#162840" stroke="#d4a85a" strokeWidth="0.8"/>

      {/* runic ring (decorative dashed) */}
      <circle cx="50" cy="50" r="44" fill="none" stroke="#8aa6c8" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.6"/>

      {/* zigzag rim — 16-fold */}
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const x1 = 50 + Math.cos(a) * 41;
        const y1 = 50 + Math.sin(a) * 41;
        const x2 = 50 + Math.cos(a) * 46;
        const y2 = 50 + Math.sin(a) * 46;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8aa6c8" strokeWidth="0.8" opacity="0.7"/>;
      })}

      {/* globe */}
      <circle cx="50" cy="50" r="26" fill={`url(#globe-${id})`} stroke="#d4a85a" strokeWidth="0.6"/>
      {/* meridians */}
      <ellipse cx="50" cy="50" rx="26" ry="10" fill="none" stroke="#3a5a7a" strokeWidth="0.4" opacity="0.7"/>
      <ellipse cx="50" cy="50" rx="10" ry="26" fill="none" stroke="#3a5a7a" strokeWidth="0.4" opacity="0.7"/>
      <line x1="24" y1="50" x2="76" y2="50" stroke="#3a5a7a" strokeWidth="0.4" opacity="0.6"/>
      <line x1="50" y1="24" x2="50" y2="76" stroke="#3a5a7a" strokeWidth="0.4" opacity="0.6"/>

      {/* I letter / pillar */}
      <g filter={glow ? `url(#glow-${id})` : undefined}>
        <rect x="46" y="32" width="8" height="34" fill={`url(#silver-${id})`} stroke="#3a5a7a" strokeWidth="0.4"/>
        <polygon points="46,32 50,28 54,32" fill={`url(#silver-${id})`} stroke="#3a5a7a" strokeWidth="0.4"/>
        <polygon points="46,66 50,70 54,66" fill={`url(#silver-${id})`} stroke="#3a5a7a" strokeWidth="0.4"/>
      </g>

      {/* gold compass needle (NE-SW) */}
      <g filter={glow ? `url(#glow-${id})` : undefined}>
        <polygon points="64,36 68,32 56,52 52,48" fill={`url(#gold-${id})`} stroke="#a8742a" strokeWidth="0.4"/>
        <polygon points="36,64 32,68 44,48 48,52" fill="#444" opacity="0.5"/>
      </g>

      {/* tiny wolves at the bottom */}
      <g fill="#8aa6c8" opacity="0.85">
        <path d="M38,82 q1.5,-3 4,-3 q1,-2 2,-1 q1,-2 2,-1 q0.5,1 0,2 q1,1 0,2 q1,1.5 -1,2 q-2,0.5 -3,0 q-2,0.5 -4,-1z"/>
        <path d="M55,82 q1.5,-3 4,-3 q1,-2 2,-1 q1,-2 2,-1 q0.5,1 0,2 q1,1 0,2 q1,1.5 -1,2 q-2,0.5 -3,0 q-2,0.5 -4,-1z"/>
      </g>
    </svg>
  );
};

window.BrandMark = BrandMark;

// Wordmark (Cinzel)
const Wordmark = ({ size = 14, color }) => (
  <span style={{
    fontFamily: 'Cinzel, Georgia, serif',
    fontWeight: 800,
    fontSize: size,
    letterSpacing: '2px',
    color: color || 'var(--gold)',
    textShadow: '0 1px 0 rgba(0,0,0,0.2)'
  }}>İLGEZDİ</span>
);
window.Wordmark = Wordmark;
