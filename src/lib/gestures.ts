import { useEffect, useRef } from 'react';

/** Множитель масштаба от колёсика (или жеста «щипок» на тачпаде — он приходит как wheel + ctrlKey) */
export function wheelFactor(e: WheelEvent) {
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  return Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
}

/**
 * Неблокирующий для страницы обработчик колёсика: handler возвращает true,
 * если событие «съедено» (тогда страница не прокручивается).
 */
export function useWheel(ref: React.RefObject<HTMLElement | null>, handler: ((e: WheelEvent) => boolean) | null) {
  const h = useRef(handler);
  h.current = handler;
  const on = !!handler;
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    const fn = (e: WheelEvent) => {
      if (h.current?.(e)) e.preventDefault();
    };
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, [ref, on]);
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
