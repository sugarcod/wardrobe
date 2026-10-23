import { useId } from 'react';
import type { Perfume } from '../types';
import { FAMILY_BY_ID } from '../perfume';

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Флакон: фото (если есть) или нарисованный флакон с инициалом */
export function PerfumeBottle({ perfume, className }: { perfume: Pick<Perfume, 'id' | 'name' | 'brand' | 'family' | 'imageDataUrl'>; className?: string }) {
  const uidr = useId().replace(/:/g, '');
  if (perfume.imageDataUrl) {
    return (
      <div className={`bottle bottle-photo ${className ?? ''}`}>
        <img src={perfume.imageDataUrl} alt={perfume.name} draggable={false} />
      </div>
    );
  }
  const color = (FAMILY_BY_ID[perfume.family] ?? FAMILY_BY_ID.other).color;
  const initial = (perfume.name || perfume.brand || '?').trim().charAt(0).toUpperCase();
  const shape = hash(perfume.id || perfume.name) % 3;
  const body =
    shape === 0
      ? 'M12 30 h36 a5 5 0 0 1 5 5 v57 a6 6 0 0 1 -6 6 h-34 a6 6 0 0 1 -6 -6 v-57 a5 5 0 0 1 5 -5z'
      : shape === 1
        ? 'M30 36 a28 28 0 1 1 -0.01 0z'
        : 'M16 40 h28 a10 10 0 0 1 10 10 v38 a10 10 0 0 1 -10 10 h-28 a10 10 0 0 1 -10 -10 v-38 a10 10 0 0 1 10 -10z';
  const cap =
    shape === 0 ? <rect x="21" y="6" width="18" height="18" rx="2.5" /> : shape === 1 ? <rect x="22" y="12" width="16" height="15" rx="7" /> : <rect x="19" y="16" width="22" height="16" rx="3" />;
  const neckY = shape === 0 ? 24 : shape === 1 ? 27 : 32;
  const neckH = shape === 0 ? 6 : shape === 1 ? 9 : 8;
  const liquidTop = shape === 0 ? 46 : shape === 1 ? 58 : 54;
  const labelY = shape === 0 ? 58 : shape === 1 ? 62 : 60;
  return (
    <div className={`bottle ${className ?? ''}`}>
      <svg viewBox="0 0 60 100" role="img" aria-label={perfume.name}>
        <defs>
          <clipPath id={`b${uidr}`}><path d={body} /></clipPath>
          <linearGradient id={`g${uidr}`} x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <g fill="#b49a72">{cap}</g>
        <rect x="26" y={neckY} width="8" height={neckH} fill="#d9cdb8" />
        <path d={body} fill="rgba(255,255,255,0.65)" />
        <g clipPath={`url(#b${uidr})`}>
          <rect x="0" y={liquidTop} width="60" height="60" fill={color} opacity="0.75" />
          <rect x="0" y="0" width="60" height="100" fill={`url(#g${uidr})`} />
        </g>
        <path d={body} fill="none" stroke="rgba(60,45,30,0.25)" strokeWidth="1" />
        <rect x="18" y={labelY} width="24" height="22" rx="2" fill="#fffdf8" opacity="0.92" />
        <text x="30" y={labelY + 16.5} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="16" fontWeight="600" fill="#3a3129">{initial}</text>
      </svg>
    </div>
  );
}
