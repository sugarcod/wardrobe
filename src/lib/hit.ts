import type { Item } from '../types';

interface AlphaMap { w: number; h: number; ar: number; alpha: Uint8Array }

const cache = new Map<string, AlphaMap>();
const pending = new Set<string>();

const keyOf = (item: Item) => `${item.id}:${item.imageDataUrl.length}:${item.imageDataUrl.slice(-24)}`;

export function getAlpha(item: Item): AlphaMap | undefined {
  return cache.get(keyOf(item));
}

export function ensureAlpha(item: Item): Promise<void> {
  const key = keyOf(item);
  if (cache.has(key) || pending.has(key)) return Promise.resolve();
  pending.add(key);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const alpha = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3];
        cache.set(key, { w, h, ar: img.naturalWidth / img.naturalHeight, alpha });
      }
      pending.delete(key);
      resolve();
    };
    img.onerror = () => { pending.delete(key); resolve(); };
    img.src = item.imageDataUrl;
  });
}
