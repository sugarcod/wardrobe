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
}

export interface Layer {
  itemId: string;
  /** Смещение относительно зоны, доля ширины сцены */
  x: number;
  /** Смещение относительно зоны, доля высоты сцены */
  y: number;
  scale: number;
  flip: boolean;
}

export interface Outfit {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  layers: Layer[];
}

/** Отметка об удалении — нужна, чтобы удаление дошло до других устройств */
export interface Tombstone {
  key: string; // `${kind}:${id}`
  kind: 'item' | 'outfit';
  id: string;
  updatedAt: string;
}

export interface Draft {
  layers: Layer[];
  editingId: string | null;
}

export interface Prefs {
  sceneDark: boolean;
}

export interface BackupFile {
  app: 'wardrobe';
  version: 1;
  exportedAt: string;
  items: Item[];
  outfits: Outfit[];
}
