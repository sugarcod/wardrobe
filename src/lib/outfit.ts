import { CATEGORY_BY_ID } from '../constants';
import type { Category, Item, Layer, Occasion, Season } from '../types';
import { colorLabel, isNeutral } from './colors';

export function newLayer(itemId: string): Layer {
  return { itemId, x: 0, y: 0, scale: 1, flip: false };
}

export function sortLayers(layers: Layer[], items: Map<string, Item>): Layer[] {
  return [...layers].sort((a, b) => {
    const ca = items.get(a.itemId), cb = items.get(b.itemId);
    const oa = ca ? CATEGORY_BY_ID[ca.category].order : 99;
    const ob = cb ? CATEGORY_BY_ID[cb.category].order : 99;
    return oa - ob;
  });
}

/**
 * Надевает вещь по правилам:
 * - в зоне одна вещь (кроме украшений и «другого»), новая заменяет старую той же категории;
 * - платье снимает верх и низ, верх/низ снимают платье;
 * - повторный клик по надетой вещи снимает её.
 */
export function wear(layers: Layer[], item: Item, items: Map<string, Item>): Layer[] {
  if (layers.some((l) => l.itemId === item.id)) {
    return layers.filter((l) => l.itemId !== item.id);
  }
  const info = CATEGORY_BY_ID[item.category];
  const conflicts = new Set<Category>();
  if (!info.stackable) conflicts.add(item.category);
  if (item.category === 'dress') { conflicts.add('top'); conflicts.add('bottom'); }
  if (item.category === 'top' || item.category === 'bottom') conflicts.add('dress');
  const kept = layers.filter((l) => {
    const it = items.get(l.itemId);
    return it && !conflicts.has(it.category);
  });
  return sortLayers([...kept, newLayer(item.id)], items);
}

export function cleanLayers(layers: Layer[], items: Map<string, Item>) {
  return layers.filter((l) => items.has(l.itemId));
}

// ---------------- «Что надеть?» ----------------

export interface SuggestOptions {
  season: Exclude<Season, 'all'>;
  occasion: Occasion;
}

export interface Suggestion {
  layers: Layer[];
  notes: string[];
  harmony: string;
  signature: string;
}

const ADJACENT: Record<string, string[]> = {
  spring: ['autumn'],
  autumn: ['spring'],
  summer: [],
  winter: [],
};

function seasonScore(it: Item, s: string): number {
  if (it.season === s) return 3;
  if (it.season === 'all') return 2;
  if (ADJACENT[s]?.includes(it.season)) return 0.6;
  return 0;
}

const OCC_COMPAT: Record<Occasion, Occasion[]> = {
  daily: ['work'],
  work: ['daily'],
  evening: [],
  sport: [],
};

function occasionScore(it: Item, o: Occasion): number {
  if (!it.occasion) return 1.5;
  if (it.occasion === o) return 3;
  if (OCC_COMPAT[o].includes(it.occasion)) return 0.5;
  return 0;
}

interface Cand { item: Item; w: number }

function pool(items: Item[], cat: Category, opt: SuggestOptions, relaxed: boolean): Cand[] {
  const out: Cand[] = [];
  for (const it of items) {
    if (it.category !== cat) continue;
    const s = seasonScore(it, opt.season);
    if (s === 0) continue;
    let o = occasionScore(it, opt.occasion);
    if (o === 0) {
      if (!relaxed) continue;
      o = 0.1;
    }
    out.push({ item: it, w: s * o });
  }
  return out;
}

function harmonyAllows(color: string, chosen: Set<string>) {
  if (!color || isNeutral(color)) return true;
  if (chosen.has(color)) return true;
  return chosen.size < 2;
}

function weightedPick(c: Cand[], rnd: () => number): Item | undefined {
  const total = c.reduce((s, x) => s + x.w, 0);
  if (!total) return undefined;
  let r = rnd() * total;
  for (const x of c) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return c[c.length - 1]?.item;
}

const SEASON_IN: Record<string, string> = { spring: 'весны', summer: 'лета', autumn: 'осени', winter: 'зимы' };
const OCC_FOR: Record<Occasion, string> = { daily: 'на каждый день', work: 'для работы', evening: 'на вечер', sport: 'для спорта' };

export function harmonyText(colors: string[]): string {
  const accents = [...new Set(colors.filter((c) => c && !isNeutral(c)))];
  if (!colors.length) return '';
  if (accents.length === 0) return 'Спокойная нейтральная гамма — сочетается всё.';
  if (accents.length === 1) return `Нейтральная база и один акцент: ${colorLabel(accents[0]).toLowerCase()}.`;
  if (accents.length === 2) return `Два цвета на нейтральной базе: ${colorLabel(accents[0]).toLowerCase()} и ${colorLabel(accents[1]).toLowerCase()}.`;
  return `Много цветов (${accents.length}) — смелый вариант.`;
}

export function suggestOutfit(allItems: Item[], opt: SuggestOptions, avoidSignature?: string, rnd: () => number = Math.random): Suggestion | null {
  if (!allItems.length) return null;
  let best: { picked: Item[]; notes: string[]; score: number } | null = null;

  for (let attempt = 0; attempt < 40; attempt++) {
    const picked: Item[] = [];
    const notes: string[] = [];
    const colors = new Set<string>();
    let score = 0;

    const take = (cat: Category, required: boolean): boolean => {
      let cands = pool(allItems, cat, opt, false);
      let relaxed = false;
      if (!cands.length && required) {
        cands = pool(allItems, cat, opt, true);
        relaxed = cands.length > 0;
      }
      const allowed = cands.filter((c) => harmonyAllows(c.item.color, colors) && !picked.includes(c.item));
      const it = weightedPick(allowed, rnd);
      if (!it) {
        if (required) {
          const label = CATEGORY_BY_ID[cat].label.toLowerCase();
          notes.push(cands.length ? `Не удалось подобрать «${label}» по цвету — попробуйте ещё вариант.` : `Нет подходящей вещи «${label}» для ${SEASON_IN[opt.season]}.`);
        }
        return false;
      }
      if (relaxed) notes.push(`«${it.name || CATEGORY_BY_ID[cat].label}» отмечена для другого повода — взята как запасной вариант.`);
      picked.push(it);
      if (it.color && !isNeutral(it.color)) colors.add(it.color);
      score += relaxed ? 1 : 3;
      return true;
    };

    // база: платье или верх+низ
    const dresses = pool(allItems, 'dress', opt, false).length;
    const tops = pool(allItems, 'top', opt, false).length;
    const bottoms = pool(allItems, 'bottom', opt, false).length;
    const canSeparates = tops > 0 && bottoms > 0;
    let useDress = false;
    if (dresses && canSeparates) {
      let p = dresses / (dresses + Math.min(tops, bottoms));
      p = Math.min(0.6, Math.max(0.2, p));
      if (opt.occasion === 'sport') p = 0.08;
      if (opt.occasion === 'evening') p = Math.max(p, 0.5);
      useDress = rnd() < p;
    } else if (dresses) {
      useDress = true;
    }

    if (useDress) {
      take('dress', true);
    } else {
      // если для сезона нет верха/низа — пробуем ослабленный пул
      take('bottom', true);
      take('top', true);
    }

    const outerP = { winter: 1, autumn: 0.85, spring: 0.6, summer: 0.08 }[opt.season];
    if (rnd() < outerP) take('outerwear', opt.season === 'winter');
    take('shoes', true);
    if (rnd() < (opt.occasion === 'sport' ? 0.3 : 0.65)) take('bag', false);
    const hatP = { winter: 0.75, summer: 0.35, spring: 0.2, autumn: 0.25 }[opt.season];
    if (rnd() < hatP) take('hat', false);
    const jewP = { evening: 0.9, work: 0.5, daily: 0.4, sport: 0.05 }[opt.occasion];
    if (rnd() < jewP) take('jewelry', false);
    if (opt.occasion === 'evening' && rnd() < 0.4) take('jewelry', false);

    const signature = picked.map((p) => p.id).sort().join('|');
    if (avoidSignature && signature === avoidSignature && attempt < 39) continue;
    if (!best || score > best.score) best = { picked, notes, score };
    // полный базовый комплект найден — достаточно
    if (!notes.length) break;
  }

  if (!best || !best.picked.length) return null;
  const map = new Map(allItems.map((i) => [i.id, i]));
  const layers = sortLayers(best.picked.map((p) => newLayer(p.id)), map);
  const colors = best.picked.map((p) => p.color);
  const notes = [...new Set(best.notes)];
  return {
    layers,
    notes,
    harmony: harmonyText(colors),
    signature: best.picked.map((p) => p.id).sort().join('|'),
  };
}

export function suggestionTitle(opt: SuggestOptions) {
  const nom: Record<string, string> = { spring: 'весна', summer: 'лето', autumn: 'осень', winter: 'зима' };
  return `Образ ${OCC_FOR[opt.occasion]} · ${nom[opt.season]}`;
}
