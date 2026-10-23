export type Category =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'bag'
  | 'hat'
  | 'jewelry'
  | 'other';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'all';
export type Occasion = 'daily' | 'work' | 'evening' | 'sport';

export interface Item {
  id: string;
  name: string;
  category: Category;
  /** Свои (пользовательские) теги */
  tags: string[];
  /** Ключ цвета из палитры (см. lib/colors.ts) */
  color: string;
  season: Season;
  occasion?: Occasion;
  imageDataUrl: string;
  createdAt: string;
  /** время последнего изменения (для синхронизации, last-write-wins) */
  updatedAt?: string;
  /** версия картинки — меняется при замене фото */
  imageRev?: string;
  /** подтип: футболка, свитер, рюкзак, часы… (см. catalog.ts) */
  subtype?: string;
}

export interface Layer {
  itemId: string;
  /** Смещение относительно зоны, доля ширины сцены */
  x: number;
  /** Смещение относительно зоны, доля высоты сцены */
  y: number;
  scale: number;
  flip: boolean;
  /** временно скрыт на манекене (чтобы заглянуть под куртку) */
  hidden?: boolean;
}

export interface Outfit {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  layers: Layer[];
}

export type SyncKind = 'item' | 'outfit' | 'perfume' | 'diary';

export type PerfumeFamily = 'citrus' | 'woody' | 'floral' | 'oriental' | 'fresh' | 'gourmand' | 'other';

export interface Perfume {
  id: string;
  name: string;
  brand: string;
  /** необязательное фото флакона (в памяти — object URL) */
  imageDataUrl?: string;
  imageRev?: string;
  family: PerfumeFamily;
  season: Season;
  occasion?: Occasion;
  tags: string[];
  createdAt: string;
  updatedAt?: string;
}

export type Mood = 'great' | 'good' | 'ok' | 'meh';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'hot' | 'cold' | 'wind';

/** Запись дневника: что было надето в этот день */
export interface DiaryEntry {
  id: string;
  /** YYYY-MM-DD (локальная дата) */
  date: string;
  /** копия слоёв на момент записи — последующие правки образа не меняют историю */
  layers: Layer[];
  outfitId?: string;
  perfumeIds: string[];
  note?: string;
  mood?: Mood;
  weather?: Weather;
  createdAt: string;
  updatedAt?: string;
}

/** Отметка об удалении — нужна, чтобы удаление дошло до других устройств */
export interface Tombstone {
  key: string; // `${kind}:${id}`
  kind: SyncKind;
  id: string;
  updatedAt: string;
}

export interface Draft {
  layers: Layer[];
  editingId: string | null;
  /** «аромат дня» в конструкторе */
  perfumeIds?: string[];
}

export interface Prefs {
  sceneDark: boolean;
  /** скрыть ячейки аксессуаров и ароматов на сцене */
  hideAccessories?: boolean;
  /** скрыть ячейку верхней одежды на сцене */
  hideOuter?: boolean;
}

export interface BackupFile {
  app: 'wardrobe';
  version: 1 | 2;
  exportedAt: string;
  items: Item[];
  outfits: Outfit[];
  perfumes?: Perfume[];
  diary?: DiaryEntry[];
}
