import type { Category, Occasion, Season } from './types';

export interface ZoneBox {
  /** left/top/width/height — доли сцены */
  l: number;
  t: number;
  w: number;
  h: number;
  /** object-position: доли по X и Y (0 — лево/верх, 1 — право/низ) */
  px: number;
  py: number;
}

export interface CategoryInfo {
  id: Category;
  label: string;
  plural: string;
  zone: string;
  /** можно надеть несколько вещей этой категории одновременно */
  stackable: boolean;
  order: number;
  box: ZoneBox;
}

// Порядок слоёв снизу вверх: низ → верх → платье → верхняя одежда → обувь → сумка → головной убор → украшения
export const CATEGORIES: CategoryInfo[] = [
  { id: 'top', label: 'Верх', plural: 'Верх', zone: 'Торс', stackable: false, order: 1, box: { l: 0.24, t: 0.165, w: 0.52, h: 0.3, px: 0.5, py: 0 } },
  { id: 'bottom', label: 'Низ', plural: 'Низ', zone: 'Ноги', stackable: false, order: 0, box: { l: 0.27, t: 0.37, w: 0.46, h: 0.56, px: 0.5, py: 0 } },
  { id: 'dress', label: 'Платье / комбинезон', plural: 'Платья', zone: 'Торс и ноги', stackable: false, order: 2, box: { l: 0.24, t: 0.165, w: 0.52, h: 0.55, px: 0.5, py: 0 } },
  { id: 'outerwear', label: 'Верхняя одежда', plural: 'Верхняя одежда', zone: 'Торс', stackable: false, order: 3, box: { l: 0.2, t: 0.16, w: 0.6, h: 0.42, px: 0.5, py: 0 } },
  { id: 'shoes', label: 'Обувь', plural: 'Обувь', zone: 'Стопы', stackable: false, order: 4, box: { l: 0.33, t: 0.9, w: 0.34, h: 0.095, px: 0.5, py: 1 } },
  { id: 'bag', label: 'Сумка', plural: 'Сумки', zone: 'Рука', stackable: false, order: 5, box: { l: 0.64, t: 0.5, w: 0.3, h: 0.2, px: 0.5, py: 0.5 } },
  { id: 'hat', label: 'Головной убор', plural: 'Головные уборы', zone: 'Голова', stackable: false, order: 6, box: { l: 0.34, t: 0.0, w: 0.32, h: 0.11, px: 0.5, py: 1 } },
  { id: 'jewelry', label: 'Украшение', plural: 'Украшения', zone: 'Шея', stackable: true, order: 7, box: { l: 0.4, t: 0.13, w: 0.2, h: 0.1, px: 0.5, py: 0 } },
  { id: 'other', label: 'Другое', plural: 'Другое', zone: 'Торс', stackable: true, order: 8, box: { l: 0.33, t: 0.3, w: 0.34, h: 0.18, px: 0.5, py: 0.5 } },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<Category, CategoryInfo>;

/** Порядок отображения в фильтрах (логичный для пользователя) */
export const CATEGORY_DISPLAY_ORDER: Category[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'hat', 'jewelry', 'other'];

export const SEASONS: { id: Season; label: string }[] = [
  { id: 'spring', label: 'Весна' },
  { id: 'summer', label: 'Лето' },
  { id: 'autumn', label: 'Осень' },
  { id: 'winter', label: 'Зима' },
  { id: 'all', label: 'Всесезон' },
];
export const SEASON_LABEL = Object.fromEntries(SEASONS.map((s) => [s.id, s.label])) as Record<Season, string>;

export const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: 'daily', label: 'Каждый день' },
  { id: 'work', label: 'Работа' },
  { id: 'evening', label: 'Вечер' },
  { id: 'sport', label: 'Спорт' },
];
export const OCCASION_LABEL = Object.fromEntries(OCCASIONS.map((s) => [s.id, s.label])) as Record<Occasion, string>;

export const MAX_FILE_MB = 8;
export const MAX_IMAGE_SIDE = 1200;

export function currentSeason(date = new Date()): Exclude<Season, 'all'> {
  const m = date.getMonth() + 1;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}
