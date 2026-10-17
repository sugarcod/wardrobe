import type { BackupFile, Draft, Item, Outfit, Prefs } from '../types';
import { blobToDataUrl, dataUrlToBlob, idb, itemsFromDataUrls } from './db';

/** Ключи старой версии (localStorage) — переносятся в IndexedDB при первом запуске */
export const LEGACY_KEYS = { items: 'wardrobe.items.v1', outfits: 'wardrobe.outfits.v1' };

const K = { draft: 'wardrobe.draft.v1', prefs: 'wardrobe.prefs.v1' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* черновик и настройки не критичны */
  }
}

/** Небольшие данные (черновик образа и настройки) остаются в localStorage */
export const local = {
  loadDraft: () => read<Draft>(K.draft, { layers: [], editingId: null }),
  loadPrefs: () => read<Prefs>(K.prefs, { sceneDark: false }),
  saveDraft: (v: Draft) => write(K.draft, v),
  savePrefs: (v: Prefs) => write(K.prefs, v),
};

/**
 * Переносит вещи и образы из localStorage в IndexedDB.
 * Старые ключи удаляются только после успешной записи.
 */
export async function migrateFromLocalStorage(): Promise<number> {
  const rawItems = localStorage.getItem(LEGACY_KEYS.items);
  const rawOutfits = localStorage.getItem(LEGACY_KEYS.outfits);
  if (rawItems === null && rawOutfits === null) return 0;
  let items: Item[] = [];
  let outfits: Outfit[] = [];
  try {
    items = rawItems ? (JSON.parse(rawItems) as Item[]) : [];
    outfits = rawOutfits ? (JSON.parse(rawOutfits) as Outfit[]) : [];
  } catch {
    /* повреждённые данные — нечего переносить */
  }
  const valid = items.filter((i) => i && typeof i.id === 'string' && typeof i.imageDataUrl === 'string');
  const records = await itemsFromDataUrls(valid);
  await idb.replaceAll(records, Array.isArray(outfits) ? outfits.filter((o) => o && o.id) : [], false);
  localStorage.removeItem(LEGACY_KEYS.items);
  localStorage.removeItem(LEGACY_KEYS.outfits);
  return records.length;
}

export async function makeBackup(items: Item[], outfits: Outfit[]): Promise<BackupFile> {
  const withData: Item[] = [];
  for (const it of items) {
    const url = it.imageDataUrl.startsWith('data:') ? it.imageDataUrl : await blobToDataUrl(await dataUrlToBlob(it.imageDataUrl));
    withData.push({ ...it, imageDataUrl: url });
  }
  return { app: 'wardrobe', version: 1, exportedAt: new Date().toISOString(), items: withData, outfits };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не похож на JSON.');
  }
  const d = data as Partial<BackupFile>;
  if (!d || !Array.isArray(d.items) || !Array.isArray(d.outfits)) {
    throw new Error('В файле нет вещей и образов гардероба.');
  }
  const items = d.items
    .filter((i): i is Item => !!i && typeof i.id === 'string' && typeof i.imageDataUrl === 'string' && i.imageDataUrl.startsWith('data:image/') && typeof i.category === 'string')
    .map((i) => ({ ...i, tags: Array.isArray(i.tags) ? i.tags : [], season: i.season ?? 'all', color: i.color ?? '', name: i.name ?? '' }));
  const outfits = d.outfits.filter((o): o is Outfit => !!o && typeof o.id === 'string' && Array.isArray(o.layers));
  return { app: 'wardrobe', version: 1, exportedAt: d.exportedAt ?? '', items, outfits };
}
