/**
 * Статистика носки по дневнику.
 * Правило: каждый день, в который вещь/аромат встречается хотя бы в одной записи, — одно использование.
 */
import type { Category, DiaryEntry, Item, Outfit, Perfume } from '../types';
import { toISODate } from './util';

export type PeriodKind = 'all' | 'year' | '30d' | 'month';
export interface Period {
  kind: PeriodKind;
  /** для kind = 'month': YYYY-MM */
  month?: string;
}

/** Границы периода включительно (YYYY-MM-DD); null — без границы */
export function periodRange(p: Period, now = new Date()): { from: string | null; to: string | null } {
  if (p.kind === 'year') return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  if (p.kind === '30d') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    return { from: toISODate(d), to: toISODate(now) };
  }
  if (p.kind === 'month' && p.month) return { from: `${p.month}-01`, to: `${p.month}-31` };
  return { from: null, to: null };
}

export interface UsageRow {
  id: string;
  kind: 'item' | 'perfume';
  /** вещь/аромат удалены — запись осталась только в дневнике */
  deleted: boolean;
  item?: Item;
  perfume?: Perfume;
  count: number;
  first: string;
  last: string;
}

export interface UsageStats {
  /** дней с записями за период */
  days: number;
  entries: number;
  items: UsageRow[];
  perfumes: UsageRow[];
  /** вещи из гардероба, которые за период ни разу не надевали */
  neverItems: Item[];
  neverPerfumes: Perfume[];
  byCategory: { category: Category; wears: number; items: number; worn: number }[];
  deletedItemWears: number;
  deletedPerfumeWears: number;
}

/** id вещей записи: снимок слоёв, а если он пуст — слои связанного образа */
export function entryItemIds(e: DiaryEntry, outfitsById?: Map<string, Outfit>): string[] {
  let layers = e.layers ?? [];
  if (!layers.length && e.outfitId && outfitsById) layers = outfitsById.get(e.outfitId)?.layers ?? [];
  return [...new Set(layers.map((l) => l.itemId))];
}

const byCount = (a: UsageRow, b: UsageRow) => b.count - a.count || b.last.localeCompare(a.last);

export function computeUsage(
  diary: DiaryEntry[],
  items: Item[],
  perfumes: Perfume[],
  outfits: Outfit[] = [],
  period: Period = { kind: 'all' },
  now = new Date(),
): UsageStats {
  const { from, to } = periodRange(period, now);
  const inRange = diary.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  const outfitsById = new Map(outfits.map((o) => [o.id, o]));
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const perfumesById = new Map(perfumes.map((p) => [p.id, p]));

  const itemDays = new Map<string, Set<string>>();
  const perfDays = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, id: string, date: string) => {
    const s = m.get(id);
    if (s) s.add(date);
    else m.set(id, new Set([date]));
  };
  const days = new Set<string>();
  for (const e of inRange) {
    days.add(e.date);
    entryItemIds(e, outfitsById).forEach((id) => add(itemDays, id, e.date));
    new Set(e.perfumeIds ?? []).forEach((id) => add(perfDays, id, e.date));
  }

  const toRows = (m: Map<string, Set<string>>, kind: 'item' | 'perfume'): UsageRow[] =>
    [...m].map(([id, s]) => {
      const ds = [...s].sort();
      const item = kind === 'item' ? itemsById.get(id) : undefined;
      const perfume = kind === 'perfume' ? perfumesById.get(id) : undefined;
      return { id, kind, deleted: !(item || perfume), item, perfume, count: ds.length, first: ds[0], last: ds[ds.length - 1] };
    }).sort(byCount);

  const itemRows = toRows(itemDays, 'item');
  const perfRows = toRows(perfDays, 'perfume');

  const cat = new Map<Category, { wears: number; items: number; worn: number }>();
  for (const it of items) {
    const c = cat.get(it.category) ?? { wears: 0, items: 0, worn: 0 };
    c.items++;
    const n = itemDays.get(it.id)?.size ?? 0;
    c.wears += n;
    if (n) c.worn++;
    cat.set(it.category, c);
  }

  return {
    days: days.size,
    entries: inRange.length,
    items: itemRows.filter((r) => !r.deleted),
    perfumes: perfRows.filter((r) => !r.deleted),
    neverItems: items.filter((i) => !itemDays.has(i.id)),
    neverPerfumes: perfumes.filter((p) => !perfDays.has(p.id)),
    byCategory: [...cat].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.wears - a.wears || b.items - a.items),
    deletedItemWears: itemRows.filter((r) => r.deleted).reduce((s, r) => s + r.count, 0),
    deletedPerfumeWears: perfRows.filter((r) => r.deleted).reduce((s, r) => s + r.count, 0),
  };
}

// ---------- экспорт ----------
export interface ExportRow {
  type: string;
  name: string;
  category: string;
  count: number;
  first: string;
  last: string;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV для Excel: UTF-8 с BOM, разделитель «;» (русская локаль Excel) */
export function toCSV(rows: ExportRow[]): string {
  const head = ['Тип', 'Название', 'Категория', 'Сколько раз', 'Первый раз', 'Последний раз'];
  const lines = [head, ...rows.map((r) => [r.type, r.name, r.category, r.count, r.first, r.last])].map((l) => l.map(csvCell).join(';'));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
