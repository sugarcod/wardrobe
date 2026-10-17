import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Item, Outfit, Tombstone } from '../types';

/** Метаданные вещи без картинки — сама картинка лежит отдельно как Blob */
export type ItemMeta = Omit<Item, 'imageDataUrl'>;

interface WardrobeDB extends DBSchema {
  items: { key: string; value: ItemMeta };
  images: { key: string; value: Blob };
  outfits: { key: string; value: Outfit };
  tombstones: { key: string; value: Tombstone };
}

export class StorageFullError extends Error {
  constructor() {
    super('Хранилище браузера заполнено');
  }
}

export function isQuotaError(e: unknown) {
  const err = e as { name?: string; code?: number; inner?: unknown } | null;
  if (!err) return false;
  if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014) return true;
  return false;
}

/** Ждёт завершения транзакции; ошибки отдельных запросов не остаются необработанными */
async function settle(ops: Promise<unknown>[], done: Promise<void>) {
  ops.forEach((p) => p.catch(() => {}));
  await done;
}

let dbp: Promise<IDBPDatabase<WardrobeDB>> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB<WardrobeDB>('wardrobe', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('items', { keyPath: 'id' });
          d.createObjectStore('images');
          d.createObjectStore('outfits', { keyPath: 'id' });
        }
        if (oldVersion < 2) d.createObjectStore('tombstones', { keyPath: 'key' });
      },
    });
  }
  return dbp;
}

/** Обёртка: ошибки квоты превращаются в StorageFullError */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isQuotaError(e) || isQuotaError((e as { target?: { error?: unknown } })?.target?.error)) throw new StorageFullError();
    throw e;
  }
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function stripImage(item: Item): ItemMeta {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imageDataUrl: _omit, ...meta } = item;
  return meta;
}

export interface LoadedData {
  items: Item[];
  outfits: Outfit[];
}

export const idb = {
  /** Загружает всё; картинки превращаются в object URL */
  async loadAll(): Promise<LoadedData> {
    const d = await db();
    const tx = d.transaction(['items', 'images', 'outfits']);
    const metas = await tx.objectStore('items').getAll();
    const outfits = await tx.objectStore('outfits').getAll();
    const images = tx.objectStore('images');
    const items: Item[] = [];
    for (const m of metas) {
      const blob = await images.get(m.id);
      if (!blob) continue;
      items.push({ ...m, imageDataUrl: URL.createObjectURL(blob) });
    }
    await tx.done;
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    outfits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, outfits };
  },

  /** Сохраняет вещи; imageBlobs — картинки для вещей с новым изображением */
  async putItems(items: Item[], imageBlobs: Map<string, Blob>) {
    await guard(async () => {
      const d = await db();
      const tx = d.transaction(['items', 'images', 'tombstones'], 'readwrite');
      const ops: Promise<unknown>[] = [];
      for (const it of items) {
        ops.push(tx.objectStore('items').put(stripImage(it)));
        ops.push(tx.objectStore('tombstones').delete(`item:${it.id}`));
        const b = imageBlobs.get(it.id);
        if (b) ops.push(tx.objectStore('images').put(b, it.id));
      }
      await settle(ops, tx.done);
    });
  },

  /** удаляет вещь; tombstone (если передан) сохраняется для синхронизации */
  async deleteItem(id: string, tomb?: Tombstone) {
    const d = await db();
    const tx = d.transaction(['items', 'images', 'tombstones'], 'readwrite');
    const ops: Promise<unknown>[] = [tx.objectStore('items').delete(id), tx.objectStore('images').delete(id)];
    if (tomb) ops.push(tx.objectStore('tombstones').put(tomb));
    await settle(ops, tx.done);
  },

  async putOutfit(o: Outfit) {
    await guard(async () => {
      const d = await db();
      const tx = d.transaction(['outfits', 'tombstones'], 'readwrite');
      await settle([tx.objectStore('outfits').put(o), tx.objectStore('tombstones').delete(`outfit:${o.id}`)], tx.done);
    });
  },

  async deleteOutfit(id: string, tomb?: Tombstone) {
    const d = await db();
    const tx = d.transaction(['outfits', 'tombstones'], 'readwrite');
    const ops: Promise<unknown>[] = [tx.objectStore('outfits').delete(id)];
    if (tomb) ops.push(tx.objectStore('tombstones').put(tomb));
    await settle(ops, tx.done);
  },

  async getTombstones(): Promise<Tombstone[]> {
    return (await db()).getAll('tombstones');
  },

  async clearTombstones() {
    await (await db()).clear('tombstones');
  },

  /** Полная замена данных (импорт «заменить всё», очистка) */
  async replaceAll(items: { meta: ItemMeta; blob: Blob }[], outfits: Outfit[], clear: boolean) {
    await guard(async () => {
      const d = await db();
      const tx = d.transaction(['items', 'images', 'outfits', 'tombstones'], 'readwrite');
      const ops: Promise<unknown>[] = [];
      if (clear) {
        ops.push(tx.objectStore('items').clear(), tx.objectStore('images').clear(), tx.objectStore('outfits').clear(), tx.objectStore('tombstones').clear());
      }
      for (const { meta, blob } of items) {
        ops.push(tx.objectStore('items').put(meta), tx.objectStore('images').put(blob, meta.id));
      }
      for (const o of outfits) ops.push(tx.objectStore('outfits').put(o));
      await settle(ops, tx.done);
    });
  },
};

/** Вещи с картинками в виде data URL (из JSON или старого localStorage) → записи для IDB */
export async function itemsFromDataUrls(items: Item[]) {
  const out: { meta: ItemMeta; blob: Blob }[] = [];
  for (const it of items) {
    try {
      out.push({ meta: stripImage(it), blob: await dataUrlToBlob(it.imageDataUrl) });
    } catch {
      /* битая картинка — пропускаем */
    }
  }
  return out;
}

export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
