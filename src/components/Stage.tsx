import { useEffect, useRef } from 'react';
import { CATEGORY_BY_ID } from '../constants';
import { placementOf, slotOf } from '../catalog';
import type { Item, Layer } from '../types';
import { Mannequin } from './Mannequin';
import { ensureAlpha, getAlpha } from '../lib/hit';
import { clamp } from '../lib/util';
import { clampScale } from '../lib/outfit';
import { dist, useWheel, wheelFactor } from '../lib/gestures';

interface Props {
  layers: Layer[];
  itemsById: Map<string, Item>;
  dark?: boolean;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (itemId: string, x: number, y: number) => void;
  onMoveEnd?: () => void;
  /** масштаб вещи: колёсико над вещью, щипок двумя пальцами */
  onScale?: (itemId: string, scale: number) => void;
  className?: string;
  children?: React.ReactNode;
}

export const MAX_OFFSET = 0.3;

export function Stage({ layers, itemsById, dark, interactive, selectedId, onSelect, onMove, onMoveEnd, onScale, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; x0: number; y0: number; pid: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ id: string; d0: number; s0: number } | null>(null);
  /** промах по вещи снимает выделение только если это был не щипок */
  const missDown = useRef(false);

  useEffect(() => {
    if (!interactive) return;
    layers.forEach((l) => {
      const it = itemsById.get(l.itemId);
      if (it) ensureAlpha(it);
    });
  }, [layers, itemsById, interactive]);

  // на манекене только одежда; верхняя одежда и аксессуары — в ячейках (см. Look)
  const visible = layers.filter((l) => {
    const it = itemsById.get(l.itemId);
    return it && !l.hidden && placementOf(it) === 'body';
  });

  const hitTest = (clientX: number, clientY: number): Layer | null => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const W = r.width, H = r.height;
    const px = clientX - r.left, py = clientY - r.top;
    for (let i = visible.length - 1; i >= 0; i--) {
      const l = visible[i];
      const it = itemsById.get(l.itemId)!;
      const b = slotOf(it).box;
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

  const layerOf = (id: string | null | undefined) => (id ? visible.find((l) => l.itemId === id) : undefined);

  useWheel(ref, interactive && onScale ? (e) => {
    const hit = hitTest(e.clientX, e.clientY);
    // колёсико над вещью; щипок на тачпаде (ctrl+wheel) — ещё и над выбранной вещью в любом месте сцены
    const l = hit ?? (e.ctrlKey ? layerOf(selectedId) : undefined);
    if (!l) return false;
    if (hit && hit.itemId !== selectedId) onSelect?.(hit.itemId);
    onScale(l.itemId, clampScale(l.scale * wheelFactor(e)));
    return true;
  } : null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const target = layerOf(drag.current?.id ?? selectedId);
      drag.current = null;
      missDown.current = false;
      if (target && onScale) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { id: target.itemId, d0: dist(a, b), s0: target.scale };
        if (target.itemId !== selectedId) onSelect?.(target.itemId);
      }
      e.preventDefault();
      return;
    }
    if (pointers.current.size > 2) return;
    const l = hitTest(e.clientX, e.clientY);
    missDown.current = !l;
    if (l) {
      onSelect?.(l.itemId);
      e.preventDefault();
      drag.current = { id: l.itemId, sx: e.clientX, sy: e.clientY, x0: l.x, y0: l.y, pid: e.pointerId };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      onScale?.(p.id, clampScale((p.s0 * dist(a, b)) / p.d0));
      return;
    }
    const d = drag.current;
    if (!d || d.pid !== e.pointerId || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = clamp(d.x0 + (e.clientX - d.sx) / r.width, -MAX_OFFSET, MAX_OFFSET);
    const y = clamp(d.y0 + (e.clientY - d.sy) / r.height, -MAX_OFFSET, MAX_OFFSET);
    onMove?.(d.id, x, y);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && pinch.current) {
      pinch.current = null;
      onMoveEnd?.();
    }
    if (missDown.current && !pointers.current.size) {
      missDown.current = false;
      if (e.type === 'pointerup') onSelect?.(null);
    }
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
        const info = slotOf(it);
        const b = info.box;
        return (
          <div
            key={l.itemId}
            className={`stage-layer ${selectedId === l.itemId ? 'is-selected' : ''}`}
            data-item={l.itemId}
            data-slot={info.slot}
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
              alt={it.name || CATEGORY_BY_ID[it.category].label}
              draggable={false}
              style={{ objectPosition: `${b.px * 100}% ${b.py * 100}%` }}
            />
          </div>
        );
      })}
      {interactive && onScale && <ResizeHandle layer={layerOf(selectedId)} item={selectedId ? itemsById.get(selectedId) : undefined} stageRef={ref} onScale={onScale} onEnd={onMoveEnd} />}
      {children}
    </div>
  );
}

/** Угол картинки вещи (в долях сцены) с учётом object-fit: contain, масштаба и отражения */
function cornerOf(l: Layer, it: Item) {
  const b = slotOf(it).box;
  // сцена 1:2 — считаем в единицах ширины: W = 1, H = 2
  const bw = b.w, bh = b.h * 2;
  const a = getAlpha(it);
  let dw = bw, dh = bh, ox = 0, oy = 0;
  if (a) {
    dh = Math.min(bh, bw / a.ar);
    dw = dh * a.ar;
    ox = (bw - dw) * b.px;
    oy = (bh - dh) * b.py;
  }
  const cx = (b.l + l.x) + bw / 2, cy = (b.t + l.y) * 2 + bh / 2;
  let rx = (ox + dw - bw / 2) * l.scale;
  const ry = (oy + dh - bh / 2) * l.scale;
  if (l.flip) rx = -rx;
  return { x: cx + rx, y: (cy + ry) / 2, cx, cy: cy / 2 };
}

/** Уголок для пропорционального изменения размера выбранной вещи */
function ResizeHandle({ layer, item, stageRef, onScale, onEnd }: { layer?: Layer; item?: Item; stageRef: React.RefObject<HTMLDivElement | null>; onScale: (id: string, s: number) => void; onEnd?: () => void }) {
  const st = useRef<{ s0: number; d0: number; cx: number; cy: number; pid: number } | null>(null);
  if (!layer || !item) return null;
  const c = cornerOf(layer, item);
  const center = () => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: r.left + c.cx * r.width, y: r.top + c.cy * r.height };
  };
  return (
    <div
      className="resize-handle"
      data-testid="resize-handle"
      title="Потяните, чтобы увеличить или уменьшить"
      style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const o = center();
        st.current = { s0: layer.scale, d0: Math.hypot(e.clientX - o.x, e.clientY - o.y) || 1, cx: o.x, cy: o.y, pid: e.pointerId };
      }}
      onPointerMove={(e) => {
        const d = st.current;
        if (!d || d.pid !== e.pointerId) return;
        e.stopPropagation();
        onScale(layer.itemId, clampScale((d.s0 * Math.hypot(e.clientX - d.cx, e.clientY - d.cy)) / d.d0));
      }}
      onPointerUp={(e) => { if (st.current?.pid === e.pointerId) { st.current = null; e.stopPropagation(); onEnd?.(); } }}
      onPointerCancel={() => { st.current = null; }}
    />
  );
}
