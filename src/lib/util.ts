export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} МБ`;
  return `${(n / 1024 ** 3).toFixed(1)} ГБ`;
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function normalizeText(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е');
}

// ---------- даты дневника (локальные, YYYY-MM-DD) ----------
const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** «17 октября 2026» (год опускается для текущего, если short) */
export function formatDay(iso: string, opts: { short?: boolean; weekday?: boolean } = {}): string {
  const d = parseISODate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear && (opts.short || opts.weekday) ? {} : { year: 'numeric' }),
    ...(opts.weekday ? { weekday: 'long' } : {}),
  });
}

/** «сегодня», «вчера» или дата */
export function relativeDay(iso: string): string {
  const t = todayISO();
  if (iso === t) return 'сегодня';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === toISODate(y)) return 'вчера';
  return formatDay(iso, { short: true });
}

/** Сетка месяца с понедельника: 6 недель × 7 дней */
export function monthGrid(year: number, month: number): { iso: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7; // пн = 0
  const start = new Date(year, month, 1 - shift);
  const out: { iso: string; inMonth: boolean }[] = [];
  const weeks = Math.ceil((shift + new Date(year, month + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({ iso: toISODate(d), inMonth: d.getMonth() === month });
  }
  return out;
}
