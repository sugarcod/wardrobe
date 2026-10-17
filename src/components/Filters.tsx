import { useMemo, useState } from 'react';
import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_DISPLAY_ORDER, OCCASIONS, OCCASION_LABEL, SEASONS, SEASON_LABEL } from '../constants';
import { COLORS, colorLabel } from '../lib/colors';
import { normalizeText } from '../lib/util';
import type { Category, Item } from '../types';

export type SortKey = 'new' | 'category' | 'color';

export interface FilterState {
  category: Category | '';
  color: string;
  season: string;
  occasion: string;
  q: string;
  sort: SortKey;
}

export const emptyFilter: FilterState = { category: '', color: '', season: '', occasion: '', q: '', sort: 'new' };

const COLOR_ORDER = Object.fromEntries(COLORS.map((c, i) => [c.id, i]));

export function applyFilter(items: Item[], f: FilterState): Item[] {
  const q = normalizeText(f.q.trim());
  const res = items.filter((it) => {
    if (f.category && it.category !== f.category) return false;
    if (f.color && it.color !== f.color) return false;
    if (f.season && !(it.season === f.season || (f.season !== 'all' && it.season === 'all'))) return false;
    if (f.occasion && it.occasion !== f.occasion) return false;
    if (q) {
      const hay = normalizeText(
        [it.name, CATEGORY_BY_ID[it.category].label, colorLabel(it.color), SEASON_LABEL[it.season], it.occasion ? OCCASION_LABEL[it.occasion] : '', ...it.tags].join(' '),
      );
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const byNew = (a: Item, b: Item) => b.createdAt.localeCompare(a.createdAt);
  if (f.sort === 'new') res.sort(byNew);
  if (f.sort === 'category') res.sort((a, b) => CATEGORY_DISPLAY_ORDER.indexOf(a.category) - CATEGORY_DISPLAY_ORDER.indexOf(b.category) || byNew(a, b));
  if (f.sort === 'color') res.sort((a, b) => (COLOR_ORDER[a.color] ?? 99) - (COLOR_ORDER[b.color] ?? 99) || byNew(a, b));
  return res;
}

export function useFilter(items: Item[], initial: Partial<FilterState> = {}) {
  const [filter, setFilter] = useState<FilterState>({ ...emptyFilter, ...initial });
  const result = useMemo(() => applyFilter(items, filter), [items, filter]);
  return { filter, setFilter, result };
}

export function countByCategory(items: Item[]) {
  const m: Partial<Record<Category, number>> = {};
  for (const it of items) m[it.category] = (m[it.category] ?? 0) + 1;
  return m;
}

interface CatProps {
  items: Item[];
  value: Category | '';
  onChange: (c: Category | '') => void;
  hideEmpty?: boolean;
}

export function CategoryTabs({ items, value, onChange, hideEmpty }: CatProps) {
  const counts = countByCategory(items);
  const cats = CATEGORY_DISPLAY_ORDER.map((id) => CATEGORIES.find((c) => c.id === id)!).filter((c) => !hideEmpty || counts[c.id]);
  return (
    <div className="cat-tabs" role="tablist">
      <button role="tab" className={`cat-tab ${!value ? 'is-on' : ''}`} onClick={() => onChange('')}>
        Все <span className="count">{items.length}</span>
      </button>
      {cats.map((c) => (
        <button role="tab" key={c.id} className={`cat-tab ${value === c.id ? 'is-on' : ''}`} onClick={() => onChange(value === c.id ? '' : c.id)}>
          {c.plural} {counts[c.id] ? <span className="count">{counts[c.id]}</span> : null}
        </button>
      ))}
    </div>
  );
}

interface Props {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  compact?: boolean;
}

export function FilterBar({ filter, setFilter, compact }: Props) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => setFilter({ ...filter, [k]: v });
  const active = filter.color || filter.season || filter.occasion || filter.q;
  return (
    <div className={`filter-bar ${compact ? 'filter-bar-compact' : ''}`}>
      <div className="search">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input className="search-input" placeholder="Поиск по тегам и названию" value={filter.q} onChange={(e) => set('q', e.target.value)} />
      </div>
      <select className="select" aria-label="Цвет" value={filter.color} onChange={(e) => set('color', e.target.value)}>
        <option value="">Цвет: все</option>
        {COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select className="select" aria-label="Сезон" value={filter.season} onChange={(e) => set('season', e.target.value)}>
        <option value="">Сезон: все</option>
        {SEASONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <select className="select" aria-label="Повод" value={filter.occasion} onChange={(e) => set('occasion', e.target.value)}>
        <option value="">Повод: все</option>
        {OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {!compact && (
        <select className="select" aria-label="Сортировка" value={filter.sort} onChange={(e) => set('sort', e.target.value as SortKey)}>
          <option value="new">Сначала новые</option>
          <option value="category">По категории</option>
          <option value="color">По цвету</option>
        </select>
      )}
      {active && (
        <button className="link-btn" onClick={() => setFilter({ ...emptyFilter, category: filter.category, sort: filter.sort })}>Сбросить</button>
      )}
    </div>
  );
}
