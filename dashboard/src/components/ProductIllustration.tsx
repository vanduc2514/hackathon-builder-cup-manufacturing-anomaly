// ProductIllustration: steel-tone SVG drawing of each Line-01 product for the product catalog cards.
import React from 'react';

interface ProductIllustrationProps {
  product: string;
  muted?: boolean;
}

const STROKE = '#475569';

function bolts(cx: number, cy: number, rx: number, ry: number, n: number, r = 2.6): React.ReactElement[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return <circle key={i} cx={cx + Math.cos(a) * rx} cy={cy + Math.sin(a) * ry} r={r} fill="#334155" />;
  });
}

function drawing(product: string): React.ReactElement {
  switch (product) {
    case 'Engine Block':
      return (
        <g stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round">
          <polygon points="30,62 92,42 170,62 108,82" fill="url(#pi-top)" />
          <polygon points="30,62 108,82 108,124 30,104" fill="url(#pi-front)" />
          <polygon points="108,82 170,62 170,104 108,124" fill="url(#pi-side)" />
          {[0.16, 0.39, 0.62, 0.85].map((t) => (
            <ellipse key={t} cx={61 + t * 78} cy={52 + t * 20} rx="10" ry="5.5" transform={`rotate(14 ${61 + t * 78} ${52 + t * 20})`} fill="#1e293b" />
          ))}
          {[44, 62, 80, 96].map((x, i) => (
            <circle key={x} cx={x} cy={88 + i * 4.2} r="2.4" fill="#334155" stroke="none" />
          ))}
          <path d="M60 110 q10 14 26 6" fill="none" />
        </g>
      );
    case 'Cylinder Head':
      return (
        <g stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round">
          <polygon points="26,72 90,52 174,72 110,92" fill="url(#pi-top)" />
          <polygon points="26,72 110,92 110,112 26,92" fill="url(#pi-front)" />
          <polygon points="110,92 174,72 174,92 110,112" fill="url(#pi-side)" />
          {[0, 1].map((k) => (
            <g key={k}>
              <line x1={48 + k * 18} y1={62 + k * 5} x2={128 + k * 18} y2={82 + k * 5} stroke="#64748b" strokeWidth="7" strokeLinecap="round" />
              <line x1={48 + k * 18} y1={62 + k * 5} x2={128 + k * 18} y2={82 + k * 5} stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
            </g>
          ))}
          {[0.2, 0.45, 0.7].map((t) => (
            <circle key={t} cx={52 + t * 90} cy={78 + t * 22} r="3.2" fill="#1e293b" stroke="none" />
          ))}
        </g>
      );
    case 'Gearbox Casing':
      return (
        <g stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round">
          <path d="M66 28 L156 56 Q166 75 156 94 L66 122 Z" fill="url(#pi-side)" />
          <ellipse cx="156" cy="75" rx="9" ry="19" fill="url(#pi-front)" />
          <ellipse cx="156" cy="75" rx="4" ry="8" fill="#1e293b" />
          <ellipse cx="66" cy="75" rx="34" ry="47" fill="url(#pi-front)" />
          <ellipse cx="66" cy="75" rx="22" ry="32" fill="url(#pi-top)" />
          <ellipse cx="66" cy="75" rx="8" ry="11" fill="#1e293b" />
          {bolts(66, 75, 28, 40, 10)}
          {[0.35, 0.6].map((t) => (
            <line key={t} x1={66 + t * 90} y1={28 + t * 28} x2={66 + t * 90} y2={122 - t * 28} stroke="#94a3b8" />
          ))}
        </g>
      );
    case 'Clutch Housing':
      return (
        <g stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round">
          <ellipse cx="110" cy="76" rx="46" ry="50" fill="url(#pi-side)" />
          <ellipse cx="96" cy="74" rx="50" ry="54" fill="url(#pi-front)" />
          <ellipse cx="96" cy="74" rx="36" ry="39" fill="url(#pi-top)" />
          <ellipse cx="96" cy="74" rx="15" ry="16" fill="#1e293b" />
          {bolts(96, 74, 44, 47, 12)}
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            return <line key={i} x1={96 + Math.cos(a) * 16} y1={74 + Math.sin(a) * 17} x2={96 + Math.cos(a) * 35} y2={74 + Math.sin(a) * 38} stroke="#64748b" strokeWidth="5" strokeLinecap="round" />;
          })}
        </g>
      );
    default:
      return (
        <g stroke={STROKE} strokeWidth="1.4">
          {Array.from({ length: 44 }, (_, i) => {
            const a = (i / 44) * 360;
            return <rect key={i} x="97" y="16" width="6" height="9" rx="1" fill="#94a3b8" transform={`rotate(${a} 100 74)`} />;
          })}
          <circle cx="100" cy="74" r="50" fill="url(#pi-front)" />
          <circle cx="100" cy="74" r="38" fill="url(#pi-top)" />
          <circle cx="100" cy="74" r="12" fill="#1e293b" />
          {bolts(100, 74, 24, 24, 6, 3)}
        </g>
      );
  }
}

export default function ProductIllustration({ product, muted = false }: ProductIllustrationProps): React.ReactElement {
  return (
    <svg viewBox="0 0 200 148" role="img" aria-label={`${product} illustration`} style={{ width: '100%', height: '100%', filter: muted ? 'grayscale(1) opacity(0.55)' : 'drop-shadow(0 12px 14px rgba(30,41,90,0.18))' }}>
      <defs>
        <linearGradient id="pi-top" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="pi-front" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="pi-side" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="136" rx="70" ry="6" fill="rgba(15,23,42,0.08)" />
      {drawing(product)}
    </svg>
  );
}
