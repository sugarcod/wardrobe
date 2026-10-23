import { todayISO } from './util';
import { CATEGORY_BY_ID } from '../constants';
import { levelOf, slotOf } from '../catalog';
import type { Category, Item, Layer, Occasion, Season } from '../types';
import { colorLabel, isNeutral } from './colors';

export function newLayer(itemId: string, x = 0, y = 0, scale = 1): Layer {
  return { itemId, x, y, scale, flip: false };
}

/** Пределы масштаба вещи на манекене и в ячейках */
export const SCALE_MIN = 0.3;
export const SCALE_MAX = 2.5;
export const clampScale = (s: number) => Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, s)) * 100) / 100;
/** шаг кнопок «+»/«−»: 10% */
export const stepScale = (s: number, dir: 1 | -1) => clampScale(Math.round(s * 10 + dir) / 10);

/** Сортировка слоёв снизу вверх по порядку зон; внутри зоны — порядок надевания */
export function sortLayers(layers: Layer[], items: Map<string, Item>): Layer[] {
  return layers
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const ia = items.get(a.l.itemId), ib = items.get(b.l.itemId);
      const oa = ia ? slotOf(ia).order : 999;
      const ob = ib ? slotOf(ib).order : 999;
      return oa - ob || a.i - b.i;
    })
    .map((x) => x.l);
}

/**
 * Надевает вещь по правилам:
 * - в каждой зоне (слоте) своё число вещей: обычно одна, кольца/браслеты/цепочки — несколько;
 *   новая вещь заменяет старую (в стековом слоте — самую раннюю, если места нет);
 * - торс многослойный: базовый (футболка) + средний (свитер) + верхний (куртка) одновременно;
 * - платье снимает базовый верх и низ, базовый верх или низ снимают платье;
 * - повторный клик по надетой вещи снимает её.
 */
export function wear(layers: Layer[], item: Item, items: Map<string, Item>): Layer[] {
  if (layers.some((l) => l.itemId === item.id)) {
    return layers.filter((l) => l.itemId !== item.id);
  }
  const info = slotOf(item);
  const conflictSlots = new Set<string>();
  if (info.slot === 'dress') { conflictSlots.add('torso-base'); conflictSlots.add('bottom'); }
  if (info.slot === 'torso-base' || info.slot === 'bottom') conflictSlots.add('dress');
  let kept = layers.filter((l) => {
    const it = items.get(l.itemId);
    return it && !conflictSlots.has(slotOf(it).slot);
  });
  const same = kept.filter((l) => slotOf(items.get(l.itemId)!).slot === info.slot);
  if (same.length >= info.max) {
    const drop = new Set(same.slice(0, same.length - info.max + 1).map((l) => l.itemId));
    kept = kept.filter((l) => !drop.has(l.itemId));
  }
  // в стеке каждая следующая вещь чуть смещена, чтобы были видны все
  const n = kept.filter((l) => slotOf(items.get(l.itemId)!).slot === info.slot).length;
  const layer = newLayer(item.id, (info.stepX ?? 0) * n, (info.stepY ?? 0) * n, clampScale(item.defaultScale ?? 1));
  return sortLayers([...kept, layer], items);
}

export function cleanLayers(layers: Layer[], items: Map<string, Item>) {
  return layers.filter((l) => items.has(l.itemId));
}

// ---------------- «Что надеть?» ----------------

export interface SuggestOptions {
  season: Exclude<Season, 'all'>;
  occasion: Occasion;
  /** когда вещь надевали последний раз (id → YYYY-MM-DD), чтобы реже повторяться */
  recent?: Map<string, string>;
  today?: string;
}

/** Группа для подбора: верх делится на базовый и средний слой */
type Group = Category | 'mid';
function groupOf(it: Item): Group {
  return it.category === 'top' && levelOf(it) === 'mid' ? 'mid' : it.category;
}

/** Недавно надетые вещи получают меньший вес */
export function recencyWeight(last: string | undefined, today: string): number {
  if (!last) return 1;
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86400000);
  if (!Number.isFinite(days) || days < 0) return 1;
  if (days <= 2) return 0.3;
  if (days <= 6) return 0.6;
  return 1;
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

function pool(items: Item[], cat: Group, opt: SuggestOptions, relaxed: boolean): Cand[] {
  const out: Cand[] = [];
  const today = opt.today ?? todayISO();
  for (const it of items) {
    if (groupOf(it) !== cat) continue;
    const s = seasonScore(it, opt.season);
    if (s === 0) continue;
    let o = occasionScore(it, opt.occasion);
    if (o === 0) {
      if (!relaxed) continue;
      o = 0.1;
    }
    out.push({ item: it, w: s * o * recencyWeight(opt.recent?.get(it.id), today) });
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

    const take = (cat: Group, required: boolean): boolean => {
      let cands = pool(allItems, cat, opt, false);
      let relaxed = false;
      if (!cands.length && required) {
        cands = pool(allItems, cat, opt, true);
        relaxed = cands.length > 0;
      }
      const usedSlots = new Set(picked.map((p) => slotOf(p)).filter((x) => x.max === 1).map((x) => x.slot));
      const allowed = cands.filter((c) => harmonyAllows(c.item.color, colors) && !picked.includes(c.item) && !usedSlots.has(slotOf(c.item).slot));
      const it = weightedPick(allowed, rnd);
      if (!it) {
        if (required) {
          const label = cat === 'mid' ? 'средний слой' : CATEGORY_BY_ID[cat].label.toLowerCase();
          notes.push(cands.length ? `Не удалось подобрать «${label}» по цвету — попробуйте ещё вариант.` : `Нет подходящей вещи «${label}» для ${SEASON_IN[opt.season]}.`);
        }
        return false;
      }
      if (relaxed) notes.push(`«${it.name || CATEGORY_BY_ID[it.category].label}» отмечена для другого повода — взята как запасной вариант.`);
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

    const midP = { winter: 0.85, autumn: 0.65, spring: 0.4, summer: 0.05 }[opt.season];
    if (opt.occasion !== 'sport' && rnd() < midP) take('mid', false);
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
  const layers = best.picked.reduce<Layer[]>((ls, it) => wear(ls, it, map), []);
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
