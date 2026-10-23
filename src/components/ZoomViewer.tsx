import { useRef, useState } from 'react';
import { dist, useWheel, wheelFactor } from '../lib/gestures';
import { clamp } from '../lib/util';

const MIN = 1;
const MAX = 6;

/** Просмотр фото с увеличением: «+»/«−», колёсико, щипок, перетаскивание, сброс */
export function ZoomViewer({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ s0: number; d0: number; x0: number; y0: number; px: number; py: number } | null>(null);

  /** не даём увести картинку за край */
  const fit = (s: number, x: number, y: number) => {
    const el = ref.current;
    const w = el?.clientWidth ?? 0, h = el?.clientHeight ?? 0;
    const mx = ((s - 1) * w) / 2, my = ((s - 1) * h) / 2;
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  };
  /** масштаб вокруг точки (cx, cy) относительно центра */
  const zoomAt = (ns: number, cx = 0, cy = 0) =>
    setZ((cur) => {
      const s = clamp(ns, MIN, MAX);
      const k = s / cur.s;
      return fit(s, cx - (cx - cur.x) * k, cy - (cy - cur.y) * k);
    });
  const center = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return [clientX - r.left - r.width / 2, clientY - r.top - r.height / 2] as const;
  };

  useWheel(ref, (e) => {
    const [cx, cy] = center(e.clientX, e.clientY);
    zoomAt(z.s * wheelFactor(e), cx, cy);
    return true;
  });

  const start = () => {
    const ps = [...pointers.current.values()];
    const mid = ps.length >= 2 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    g.current = { s0: z.s, d0: ps.length >= 2 ? dist(ps[0], ps[1]) : 0, x0: z.x, y0: z.y, px: mid.x, py: mid.y };
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    ref.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !g.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()];
    const s0 = g.current;
    if (ps.length >= 2) {
      const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      const s = clamp((s0.s0 * dist(ps[0], ps[1])) / s0.d0, MIN, MAX);
      const [cx, cy] = center(s0.px, s0.py);
      const k = s / s0.s0;
      setZ(fit(s, cx - (cx - s0.x0) * k + (mid.x - s0.px), cy - (cy - s0.y0) * k + (mid.y - s0.py)));
    } else if (z.s > 1) {
      setZ(fit(z.s, s0.x0 + (ps[0].x - s0.px), s0.y0 + (ps[0].y - s0.py)));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) start();
    else g.current = null;
  };

  return (
    <div
      ref={ref}
      className={`zoom-view ${z.s > 1 ? 'is-zoomed' : ''} ${className ?? ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; const [cx, cy] = center(e.clientX, e.clientY); if (z.s > 1) setZ({ s: 1, x: 0, y: 0 }); else zoomAt(2.5, cx, cy); }}
      data-testid="zoom-view"
      data-scale={z.s.toFixed(2)}
    >
      <img src={src} alt={alt} draggable={false} style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` }} />
      <div className="zoom-bar zoom-bar-viewer" role="group" aria-label="Увеличение фото">
        <button type="button" className="zoom-btn" aria-label="Уменьшить фото" disabled={z.s <= MIN} onClick={() => zoomAt(z.s / 1.4)} data-testid="viewer-zoom-out">−</button>
        <button type="button" className="zoom-pct" title="Сбросить" onClick={() => setZ({ s: 1, x: 0, y: 0 })} data-testid="viewer-zoom-reset">{Math.round(z.s * 100)}%</button>
        <button type="button" className="zoom-btn" aria-label="Увеличить фото" disabled={z.s >= MAX} onClick={() => zoomAt(z.s * 1.4)} data-testid="viewer-zoom-in">+</button>
      </div>
    </div>
  );
}
