/**
 * Подтипы вещей и зоны манекена.
 * Каждая вещь попадает в «слот» (зону): в обычном слоте — одна вещь, в стековом — до max штук.
 * Координаты зон — доли сцены (viewBox манекена 300×600).
 */
import type { ZoneBox } from './constants';
import type { Category, Item } from './types';

export type Level = 'base' | 'mid' | 'outer';
export const LEVEL_LABEL: Record<Level, string> = { base: 'базовый слой', mid: 'средний слой', outer: 'верхний слой' };

export interface SlotInfo {
  slot: string;
  zone: string;
  order: number; // порядок наложения снизу вверх
  box: ZoneBox;
  max: number; // сколько вещей в слоте одновременно
  stepX?: number; // смещение каждой следующей вещи в стеке
  stepY?: number;
  level?: Level;
}

export interface SubtypeInfo extends SlotInfo {
  id: string;
  label: string;
  category: Category;
}

const B = (l: number, t: number, w: number, h: number, px = 0.5, py = 0): ZoneBox => ({ l, t, w, h, px, py });

// Торс: базовый → средний → верхний; каждый следующий слой чуть шире и длиннее
const TORSO_BASE: SlotInfo = { slot: 'torso-base', zone: 'Торс', order: 20, box: B(0.24, 0.165, 0.52, 0.3), max: 1, level: 'base' };
const TORSO_MID: SlotInfo = { slot: 'torso-mid', zone: 'Торс', order: 30, box: B(0.225, 0.16, 0.55, 0.335), max: 1, level: 'mid' };
const TORSO_OUTER: SlotInfo = { slot: 'torso-outer', zone: 'Торс', order: 40, box: B(0.2, 0.155, 0.6, 0.43), max: 1, level: 'outer' };
const BAG_HAND: SlotInfo = { slot: 'bag', zone: 'Рука', order: 60, box: B(0.64, 0.5, 0.3, 0.2, 0.5, 0.5), max: 1 };
const HEAD_FIT: SlotInfo = { slot: 'head', zone: 'Голова', order: 75, box: B(0.335, 0.005, 0.33, 0.095, 0.5, 1), max: 1 };
const HEAD_BRIM: SlotInfo = { slot: 'head', zone: 'Голова', order: 75, box: B(0.27, 0.0, 0.46, 0.1, 0.5, 1), max: 1 };
const NECK: SlotInfo = { slot: 'neck', zone: 'Шея', order: 35, box: B(0.4, 0.14, 0.2, 0.1), max: 3, stepY: 0.018 };

const st = (id: string, label: string, category: Category, s: SlotInfo, extra: Partial<SlotInfo> = {}): SubtypeInfo => ({ id, label, category, ...s, ...extra });

export const SUBTYPES: SubtypeInfo[] = [
  // верх — базовый слой
  st('tshirt', 'Футболка', 'top', TORSO_BASE),
  st('tank', 'Майка', 'top', TORSO_BASE),
  st('shirt', 'Рубашка', 'top', TORSO_BASE),
  st('blouse', 'Блузка', 'top', TORSO_BASE),
  st('longsleeve', 'Лонгслив', 'top', TORSO_BASE),
  st('croptop', 'Топ', 'top', TORSO_BASE),
  // верх — средний слой
  st('sweater', 'Свитер', 'top', TORSO_MID),
  st('jumper', 'Джемпер', 'top', TORSO_MID),
  st('hoodie', 'Худи', 'top', TORSO_MID),
  st('sweatshirt', 'Свитшот', 'top', TORSO_MID),
  st('cardigan', 'Кардиган', 'top', TORSO_MID),
  st('vest', 'Жилет', 'top', TORSO_MID),
  st('blazer', 'Пиджак', 'top', TORSO_MID),
  // верхняя одежда
  st('jacket', 'Куртка', 'outerwear', TORSO_OUTER),
  st('coat', 'Пальто', 'outerwear', TORSO_OUTER, { box: B(0.2, 0.155, 0.6, 0.5) }),
  st('puffer', 'Пуховик', 'outerwear', TORSO_OUTER),
  st('trench', 'Тренч', 'outerwear', TORSO_OUTER, { box: B(0.2, 0.155, 0.6, 0.5) }),
  st('windbreaker', 'Ветровка', 'outerwear', TORSO_OUTER),
  // сумки
  st('handbag', 'Сумка', 'bag', BAG_HAND),
  st('briefcase', 'Портфель', 'bag', BAG_HAND, { zone: 'Рука', box: B(0.6, 0.55, 0.36, 0.19, 0.5, 0) }),
  st('backpack', 'Рюкзак', 'bag', BAG_HAND, { zone: 'Спина', order: 5, box: B(0.05, 0.16, 0.36, 0.3, 0.5, 0) }),
  st('clutch', 'Клатч', 'bag', BAG_HAND, { box: B(0.68, 0.54, 0.2, 0.1, 0.5, 0.5) }),
  // головные уборы
  st('beanie', 'Шапка', 'hat', HEAD_FIT),
  st('cap', 'Кепка', 'hat', HEAD_FIT),
  st('hat', 'Шляпа', 'hat', HEAD_BRIM),
  st('panama', 'Панама', 'hat', HEAD_BRIM),
  // украшения и часы
  st('watch', 'Часы', 'jewelry', { slot: 'watch', zone: 'Запястье', order: 62, box: B(0.205, 0.507, 0.08, 0.04, 0.5, 0.5), max: 1 }),
  st('ring', 'Кольцо', 'jewelry', { slot: 'ring', zone: 'Пальцы', order: 64, box: B(0.2, 0.566, 0.04, 0.02, 0.5, 0.5), max: 5, stepY: 0.01 }),
  st('necklace', 'Ожерелье / цепочка', 'jewelry', NECK),
  st('earrings', 'Серьги', 'jewelry', { slot: 'ears', zone: 'Уши', order: 70, box: B(0.4, 0.085, 0.2, 0.05, 0.5, 0.5), max: 1 }),
  st('bracelet', 'Браслет', 'jewelry', { slot: 'bracelet', zone: 'Запястье', order: 63, box: B(0.715, 0.507, 0.08, 0.04, 0.5, 0.5), max: 4, stepY: 0.012 }),
  st('jewel', 'Другое украшение', 'jewelry', NECK, { slot: 'jewel', order: 66, max: 3 }),
  // аксессуары
  st('glasses', 'Очки', 'other', { slot: 'face', zone: 'Лицо', order: 72, box: B(0.405, 0.062, 0.19, 0.045, 0.5, 0.5), max: 1 }),
  st('belt', 'Ремень', 'other', { slot: 'waist', zone: 'Талия', order: 25, box: B(0.33, 0.365, 0.34, 0.045, 0.5, 0.5), max: 1 }),
  st('scarf', 'Шарф', 'other', { slot: 'scarf', zone: 'Шея', order: 45, box: B(0.34, 0.13, 0.32, 0.22), max: 1 }),
  st('accessory', 'Другое', 'other', { slot: 'other', zone: 'Торс', order: 80, box: B(0.33, 0.3, 0.34, 0.18, 0.5, 0.5), max: 3, stepY: 0.03 }),
];

export const SUBTYPE_BY_ID: Record<string, SubtypeInfo> = Object.fromEntries(SUBTYPES.map((s) => [s.id, s]));

/** Слот по умолчанию для вещей без подтипа */
const CATEGORY_DEFAULT: Record<Category, SlotInfo> = {
  top: TORSO_BASE,
  bottom: { slot: 'bottom', zone: 'Ноги', order: 10, box: B(0.27, 0.37, 0.46, 0.56), max: 1 },
  dress: { slot: 'dress', zone: 'Торс и ноги', order: 22, box: B(0.24, 0.165, 0.52, 0.55), max: 1 },
  outerwear: TORSO_OUTER,
  shoes: { slot: 'feet', zone: 'Стопы', order: 50, box: B(0.33, 0.9, 0.34, 0.095, 0.5, 1), max: 1 },
  bag: BAG_HAND,
  hat: { ...HEAD_FIT, box: B(0.31, 0.0, 0.38, 0.1, 0.5, 1) },
  jewelry: { ...NECK, slot: 'jewel', order: 66, max: 3 },
  other: { slot: 'other', zone: 'Торс', order: 80, box: B(0.33, 0.3, 0.34, 0.18, 0.5, 0.5), max: 3, stepY: 0.03 },
};

export function subtypesOf(category: Category | ''): SubtypeInfo[] {
  return category ? SUBTYPES.filter((s) => s.category === category) : [];
}

export function validSubtype(item: Pick<Item, 'category' | 'subtype'>): SubtypeInfo | undefined {
  const s = item.subtype ? SUBTYPE_BY_ID[item.subtype] : undefined;
  return s && s.category === item.category ? s : undefined;
}

export function slotOf(item: Pick<Item, 'category' | 'subtype'>): SlotInfo {
  return validSubtype(item) ?? CATEGORY_DEFAULT[item.category];
}

export function levelOf(item: Pick<Item, 'category' | 'subtype'>): Level | undefined {
  return slotOf(item).level;
}

/** Короткое название вида вещи: «Свитер», иначе категория */
export function kindLabel(item: Pick<Item, 'category' | 'subtype'>, categoryLabel: string): string {
  return validSubtype(item)?.label ?? categoryLabel;
}
