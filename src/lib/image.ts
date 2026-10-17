import { MAX_FILE_MB, MAX_IMAGE_SIDE } from '../constants';
import { nearestColor } from './colors';

export const ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/jpeg'];

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `«${file.name}»: формат не поддерживается. Нужен PNG или WebP с прозрачным фоном.`;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `«${file.name}»: файл больше ${MAX_FILE_MB} МБ. Уменьшите изображение и попробуйте снова.`;
  }
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = src;
  });
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas недоступен');
  return ctx;
}

/** Загружает файл в canvas, уменьшая до MAX_IMAGE_SIDE по длинной стороне */
export async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return imageToCanvas(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(dataUrl);
  return imageToCanvas(img);
}

function imageToCanvas(img: HTMLImageElement) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
  const c = makeCanvas(w * k, h * k);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Доля полностью/почти прозрачных пикселей */
export function transparentRatio(c: HTMLCanvasElement): number {
  const { data } = ctx2d(c).getImageData(0, 0, c.width, c.height);
  let t = 0, n = 0;
  const step = Math.max(1, Math.floor(data.length / 4 / 60000));
  for (let i = 3; i < data.length; i += 4 * step) {
    n++;
    if (data[i] < 20) t++;
  }
  return n ? t / n : 0;
}

/** Фон считается не убранным, если прозрачных пикселей почти нет */
export function looksLikeHasBackground(c: HTMLCanvasElement) {
  return transparentRatio(c) < 0.02;
}

/** Обрезает прозрачные поля вокруг вещи */
export function trimTransparent(c: HTMLCanvasElement, padRatio = 0.02): HTMLCanvasElement {
  const { width: W, height: H } = c;
  const { data } = ctx2d(c).getImageData(0, 0, W, H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return c; // всё прозрачное
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * padRatio);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad);
  maxY = Math.min(H - 1, maxY + pad);
  const out = makeCanvas(maxX - minX + 1, maxY - minY + 1);
  ctx2d(out).drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Грубое удаление светлого фона: заливка от краёв по пикселям,
 * близким к цвету фона (оценивается по рамке), с мягким краем.
 */
export function removeLightBackground(src: HTMLCanvasElement, tolerance = 40): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const out = makeCanvas(W, H);
  const octx = ctx2d(out);
  octx.drawImage(src, 0, 0);
  const img = octx.getImageData(0, 0, W, H);
  const d = img.data;

  // цвет фона — среднее светлых пикселей рамки
  let br = 0, bg = 0, bb = 0, bn = 0;
  const sampleBorder = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (l > 150 && d[i + 3] > 200) {
      br += d[i]; bg += d[i + 1]; bb += d[i + 2]; bn++;
    }
  };
  for (let x = 0; x < W; x++) { sampleBorder(x, 0); sampleBorder(x, H - 1); }
  for (let y = 0; y < H; y++) { sampleBorder(0, y); sampleBorder(W - 1, y); }
  if (bn === 0) { br = bg = bb = 255; } else { br /= bn; bg /= bn; bb /= bn; }

  const dist = (i: number) => Math.sqrt((d[i] - br) ** 2 + (d[i + 1] - bg) ** 2 + (d[i + 2] - bb) ** 2);
  const visited = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let qh = 0, qt = 0;
  const push = (p: number) => {
    if (visited[p]) return;
    const i = p * 4;
    if (d[i + 3] < 20 || dist(i) <= tolerance) {
      visited[p] = 1;
      queue[qt++] = p;
    }
  };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (y > 0) push(p - W);
    if (y < H - 1) push(p + W);
  }
  // прозрачность фона + мягкий край
  const soft = tolerance * 0.8;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (visited[p]) {
      d[i + 3] = 0;
      continue;
    }
    const x = p % W, y = (p / W) | 0;
    const nearBg =
      (x > 0 && visited[p - 1]) || (x < W - 1 && visited[p + 1]) || (y > 0 && visited[p - W]) || (y < H - 1 && visited[p + W]);
    if (nearBg) {
      const k = Math.min(1, Math.max(0, (dist(i) - tolerance) / soft));
      d[i + 3] = Math.round(d[i + 3] * (0.25 + 0.75 * k));
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Доминирующий цвет непрозрачных пикселей (голосование по палитре) */
export function dominantColor(c: HTMLCanvasElement): string {
  const { data } = ctx2d(c).getImageData(0, 0, c.width, c.height);
  const votes = new Map<string, number>();
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / 25000));
  const memo = new Map<number, string>();
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (data[i + 3] < 200) continue;
    // квантование для кэша
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    let id = memo.get(key);
    if (!id) {
      id = nearestColor(data[i], data[i + 1], data[i + 2]);
      memo.set(key, id);
    }
    votes.set(id, (votes.get(id) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [id, n] of votes) if (n > bestN) { best = id; bestN = n; }
  return best;
}

let webpSupported: boolean | null = null;
export function canvasToDataUrl(c: HTMLCanvasElement): string {
  if (webpSupported === null) {
    webpSupported = makeCanvas(2, 2).toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupported ? c.toDataURL('image/webp', 0.86) : c.toDataURL('image/png');
}

/**
 * Ужимает картинку, пока data URL не станет короче maxChars
 * (для документа Firestore, лимит документа — 1 МиБ). Результат — WebP, если браузер умеет.
 */
export async function fitDataUrl(dataUrl: string, maxChars = 700_000): Promise<string> {
  const isWebp = dataUrl.startsWith('data:image/webp');
  if (dataUrl.length <= maxChars && (isWebp || webpSupported === false)) return dataUrl;
  let c = await dataUrlToCanvas(dataUrl);
  canvasToDataUrl(c); // определить поддержку WebP
  const encode = (q: number) => (webpSupported ? c.toDataURL('image/webp', q) : c.toDataURL('image/png'));
  let out = encode(0.86);
  for (let i = 0; i < 12 && out.length > maxChars; i++) {
    const q = [0.78, 0.7, 0.6][i] ?? 0;
    if (q && webpSupported) {
      out = encode(q);
      continue;
    }
    const s = makeCanvas(c.width * 0.8, c.height * 0.8);
    ctx2d(s).drawImage(c, 0, 0, s.width, s.height);
    c = s;
    out = encode(0.7);
  }
  return out;
}
