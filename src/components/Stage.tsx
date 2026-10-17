import { useEffect, useRef } from 'react';
import { CATEGORY_BY_ID } from '../constants';
import type { Item, Layer } from '../types';
import { Mannequin } from './Mannequin';
import { ensureAlpha, getAlpha } from '../lib/hit';
import { clamp } from '../lib/util';

interface Props {
  layers: Layer[];
  itemsById: Map<string, Item>;
  dark?: boolean;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (itemId: string, x: number, y: number) => void;
  onMoveEnd?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const MAX_OFFSET = 0.3;

export function Stage({ layers, itemsById, dark, interactive, selectedId, onSelect, onMove, onMoveEnd, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; x0: number; y0: number; pid: number } | null>(null);

  useEffect(() => {
    if (!interactive) return;
    layers.forEach((l) => {
      const it = itemsById.get(l.itemId);
      if (it) ensureAlpha(it);
    });
  }, [layers, itemsById, interactive]);

  const visible = layers.filter((l) => itemsById.has(l.itemId));

  const hitTest = (clientX: number, clientY: number): Layer | null => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const W = r.width, H = r.height;
    const px = clientX - r.left, py = clientY - r.top;
    for (let i = visible.length - 1; i >= 0; i--) {
      const l = visible[i];
      const it = itemsById.get(l.itemId)!;
      const b = CATEGORY_BY_ID[it.category].box;
      const bw = b.w * W, bh = b.h * H;
      const cx = (b.l + l.x) * W + bw / 2, cy = (b.t + l.y) * H + bh / 2;
      let dx = (px - cx) / l.scale;
      const dy = (py - cy) / l.scale;
      if (l.flip) dx = -dx;
      const u = dx + bw / 2, v = dy + bh / 2;
      if (u < 0 || v < 0 || u > bw || v > bh) continue;
      const a = getAlpha(it);
      if (!a) return l; // карта прозрачности ещё не готова — считаем попаданием по рамке
      // object-fit: contain — размеры картинки внутри рамки
      const dh = Math.min(bh, bw / a.ar);
      const dw = dh * a.ar;
      const ox = (bw - dw) * b.px, oy = (bh - dh) * b.py;
      const ix = ((u - ox) / dw) * a.w, iy = ((v - oy) / dh) * a.h;
      if (ix < 0 || iy < 0 || ix >= a.w || iy >= a.h) continue;
      // небольшой допуск: проверяем окрестность
      let hit = false;
      for (let oyy = -2; oyy <= 2 && !hit; oyy += 2)
        for (let oxx = -2; oxx <= 2 && !hit; oxx += 2) {
          const xx = Math.floor(ix + oxx), yy = Math.floor(iy + oyy);
          if (xx >= 0 && yy >= 0 && xx < a.w && yy < a.h && a.alpha[yy * a.w + xx] > 40) hit = true;
        }
      if (hit) return l;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    const l = hitTest(e.clientX, e.clientY);
    onSelect?.(l ? l.itemId : null);
    if (l) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { id: l.itemId, sx: e.clientX, sy: e.clientY, x0: l.x, y0: l.y, pid: e.pointerId };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = clamp(d.x0 + (e.clientX - d.sx) / r.width, -MAX_OFFSET, MAX_OFFSET);
    const y = clamp(d.y0 + (e.clientY - d.sy) / r.height, -MAX_OFFSET, MAX_OFFSET);
    onMove?.(d.id, x, y);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.pid === e.pointerId) {
      drag.current = null;
      onMoveEnd?.();
    }
  };

  return (
    <div
      ref={ref}
      className={`stage ${dark ? 'stage-dark' : ''} ${interactive ? 'stage-interactive' : ''} ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Mannequin dark={dark} />
      {visible.map((l) => {
        const it = itemsById.get(l.itemId)!;
        const info = CATEGORY_BY_ID[it.category];
        const b = info.box;
        return (
          <div
            key={l.itemId}
            className={`stage-layer ${selectedId === l.itemId ? 'is-selected' : ''}`}
            data-item={l.itemId}
            style={{
              left: `${(b.l + l.x) * 100}%`,
              top: `${(b.t + l.y) * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              transform: `scale(${l.scale}) scaleX(${l.flip ? -1 : 1})`,
              zIndex: 10 + info.order,
            }}
          >
            <img
              src={it.imageDataUrl}
              alt={it.name || info.label}
              draggable={false}
              style={{ objectPosition: `${b.px * 100}% ${b.py * 100}%` }}
            />
          </div>
        );
      })}
      {children}
    </div>
  );
}
