import { describe, expect, it } from 'vitest';
import { computeUsage, periodRange, toCSV } from './stats';
import type { DiaryEntry, Item, Perfume } from '../types';

const item = (id: string, category: Item['category'] = 'top'): Item => ({ id, name: id, category, tags: [], color: '', season: 'all', imageDataUrl: '', createdAt: '2026-01-01' });
const perf = (id: string): Perfume => ({ id, name: id, brand: '', family: 'woody', season: 'all', tags: [], createdAt: '2026-01-01' });
const L = (itemId: string) => ({ itemId, x: 0, y: 0, scale: 1, flip: false });
const e = (id: string, date: string, ids: string[], perfumeIds: string[] = [], outfitId?: string): DiaryEntry => ({ id, date, layers: ids.map(L), perfumeIds, outfitId, createdAt: date });

describe('computeUsage', () => {
  const items = [item('a'), item('b', 'bottom'), item('c', 'shoes')];
  const perfumes = [perf('p1'), perf('p2')];
  const diary = [
    e('1', '2026-10-01', ['a', 'b'], ['p1']),
    e('2', '2026-10-01', ['a'], ['p1']), // тот же день — не удваивает
    e('3', '2026-10-05', ['a', 'gone'], ['p1', 'p-gone']),
    e('4', '2025-12-31', ['b'], []),
    e('5', '2026-10-10', [], [], 'o1'), // пустой снимок — берём образ
  ];
  const outfits = [{ id: 'o1', name: 'o', createdAt: '', layers: [L('c')] }];
  const now = new Date(2026, 9, 23);

  it('один день — одно использование; удалённые отдельно', () => {
    const s = computeUsage(diary, items, perfumes, outfits, { kind: 'all' }, now);
    expect(s.items.map((r) => [r.id, r.count])).toEqual([['a', 2], ['b', 2], ['c', 1]]);
    expect(s.items[0].last).toBe('2026-10-05');
    expect(s.perfumes.map((r) => [r.id, r.count])).toEqual([['p1', 2]]);
    expect(s.neverPerfumes.map((p) => p.id)).toEqual(['p2']);
    expect(s.deletedItemWears).toBe(1);
    expect(s.deletedPerfumeWears).toBe(1);
    expect(s.days).toBe(4);
  });
  it('период: этот год', () => {
    const s = computeUsage(diary, items, perfumes, outfits, { kind: 'year' }, now);
    expect(s.items.find((r) => r.id === 'b')?.count).toBe(1);
  });
  it('период: месяц и 30 дней', () => {
    expect(periodRange({ kind: 'month', month: '2026-02' })).toEqual({ from: '2026-02-01', to: '2026-02-31' });
    expect(periodRange({ kind: '30d' }, now)).toEqual({ from: '2026-09-24', to: '2026-10-23' });
    const s = computeUsage(diary, items, perfumes, outfits, { kind: 'month', month: '2025-12' }, now);
    expect(s.items.map((r) => r.id)).toEqual(['b']);
    expect(s.neverItems.map((i) => i.id)).toEqual(['a', 'c']);
  });
});

describe('toCSV', () => {
  it('BOM, «;» и экранирование', () => {
    const csv = toCSV([{ type: 'Вещь', name: 'Свитер "серый"; тёплый', category: 'Верх', count: 3, first: '2026-01-01', last: '2026-02-01' }]);
    expect(csv.startsWith('\uFEFFТип;Название')).toBe(true);
    expect(csv).toContain('"Свитер ""серый""; тёплый"');
  });
});
