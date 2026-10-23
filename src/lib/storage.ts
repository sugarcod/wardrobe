import type { BackupFile, DiaryEntry, Draft, Item, Outfit, Perfume, Prefs } from '../types';
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

const toDataUrl = async (url: string) => (url.startsWith('data:') ? url : blobToDataUrl(await dataUrlToBlob(url)));

export async function makeBackup(items: Item[], outfits: Outfit[], perfumes: Perfume[] = [], diary: DiaryEntry[] = []): Promise<BackupFile> {
  const withData: Item[] = [];
  for (const it of items) withData.push({ ...it, imageDataUrl: await toDataUrl(it.imageDataUrl) });
  const pf: Perfume[] = [];
  for (const p of perfumes) pf.push(p.imageDataUrl ? { ...p, imageDataUrl: await toDataUrl(p.imageDataUrl) } : p);
  return { app: 'wardrobe', version: 2, exportedAt: new Date().toISOString(), items: withData, outfits, perfumes: pf, diary };
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
  const perfumes = (Array.isArray(d.perfumes) ? d.perfumes : [])
    .filter((p): p is Perfume => !!p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({
      ...p,
      brand: p.brand ?? '',
      family: p.family ?? 'other',
      season: p.season ?? 'all',
      tags: Array.isArray(p.tags) ? p.tags : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
      imageDataUrl: typeof p.imageDataUrl === 'string' && p.imageDataUrl.startsWith('data:image/') ? p.imageDataUrl : undefined,
    }));
  const diary = (Array.isArray(d.diary) ? d.diary : [])
    .filter((e): e is DiaryEntry => !!e && typeof e.id === 'string' && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .map((e) => ({ ...e, layers: Array.isArray(e.layers) ? e.layers : [], perfumeIds: Array.isArray(e.perfumeIds) ? e.perfumeIds : [], createdAt: e.createdAt ?? new Date().toISOString() }));
  return { app: 'wardrobe', version: 2, exportedAt: d.exportedAt ?? '', items, outfits, perfumes, diary };
}
