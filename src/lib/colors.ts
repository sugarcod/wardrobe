export interface NamedColor {
  id: string;
  label: string;
  hex: string;
  neutral: boolean;
  /** участвует в автоопределении по картинке */
  auto: boolean;
}

export const COLORS: NamedColor[] = [
  { id: 'white', label: 'Белый', hex: '#f4f3ef', neutral: true, auto: true },
  { id: 'beige', label: 'Бежевый', hex: '#d8c3a3', neutral: true, auto: true },
  { id: 'gray', label: 'Серый', hex: '#9b9a97', neutral: true, auto: true },
  { id: 'black', label: 'Чёрный', hex: '#222222', neutral: true, auto: true },
  { id: 'navy', label: 'Тёмно-синий', hex: '#1f2a48', neutral: true, auto: true },
  { id: 'denim', label: 'Деним', hex: '#4b6a93', neutral: true, auto: true },
  { id: 'brown', label: 'Коричневый', hex: '#7a5434', neutral: true, auto: true },
  { id: 'khaki', label: 'Хаки', hex: '#7c7a4e', neutral: false, auto: true },
  { id: 'red', label: 'Красный', hex: '#c7302d', neutral: false, auto: true },
  { id: 'burgundy', label: 'Бордовый', hex: '#6d1f2c', neutral: false, auto: true },
  { id: 'pink', label: 'Розовый', hex: '#e6a1b5', neutral: false, auto: true },
  { id: 'orange', label: 'Оранжевый', hex: '#e2803a', neutral: false, auto: true },
  { id: 'yellow', label: 'Жёлтый', hex: '#e9c548', neutral: false, auto: true },
  { id: 'green', label: 'Зелёный', hex: '#4e8a52', neutral: false, auto: true },
  { id: 'lightblue', label: 'Голубой', hex: '#93bfe4', neutral: false, auto: true },
  { id: 'blue', label: 'Синий', hex: '#2f5eb3', neutral: false, auto: true },
  { id: 'purple', label: 'Фиолетовый', hex: '#7a4fa3', neutral: false, auto: true },
  { id: 'multi', label: 'Разноцветный', hex: 'conic-gradient(#e6a1b5, #e9c548, #93bfe4, #4e8a52, #e6a1b5)', neutral: false, auto: false },
];

export const COLOR_BY_ID: Record<string, NamedColor> = Object.fromEntries(COLORS.map((c) => [c.id, c]));

export function colorLabel(id: string) {
  return COLOR_BY_ID[id]?.label ?? id;
}

export function isNeutral(id: string) {
  return COLOR_BY_ID[id]?.neutral ?? false;
}

export function swatchStyle(id: string): React.CSSProperties {
  const c = COLOR_BY_ID[id];
  if (!c) return { background: 'transparent' };
  return { background: c.hex };
}

// --- конвертация в Lab для поиска ближайшего цвета
function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const AUTO_PALETTE = COLORS.filter((c) => c.auto).map((c) => ({ id: c.id, lab: rgbToLab(...hexToRgb(c.hex)) }));

export function nearestColor(r: number, g: number, b: number): string {
  const [L, A, B] = rgbToLab(r, g, b);
  let best = AUTO_PALETTE[0].id;
  let bestD = Infinity;
  for (const p of AUTO_PALETTE) {
    const d = (L - p.lab[0]) ** 2 + (A - p.lab[1]) ** 2 + (B - p.lab[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}
