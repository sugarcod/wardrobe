import type { BackupFile, Draft, Item, Outfit, Prefs } from '../types';

const K = {
  items: 'wardrobe.items.v1',
  outfits: 'wardrobe.outfits.v1',
  draft: 'wardrobe.draft.v1',
  prefs: 'wardrobe.prefs.v1',
};

export class StorageFullError extends Error {
  constructor() {
    super('Хранилище браузера заполнено');
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isQuota(e: unknown) {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
  );
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (isQuota(e)) throw new StorageFullError();
    throw e;
  }
}

export const storage = {
  loadItems: () => read<Item[]>(K.items, []),
  loadOutfits: () => read<Outfit[]>(K.outfits, []),
  loadDraft: () => read<Draft>(K.draft, { layers: [], editingId: null }),
  loadPrefs: () => read<Prefs>(K.prefs, { sceneDark: false }),
  saveItems: (v: Item[]) => write(K.items, v),
  saveOutfits: (v: Outfit[]) => write(K.outfits, v),
  saveDraft: (v: Draft) => {
    try { write(K.draft, v); } catch { /* черновик не критичен */ }
  },
  savePrefs: (v: Prefs) => {
    try { write(K.prefs, v); } catch { /* ignore */ }
  },
  clearAll: () => Object.values(K).forEach((k) => localStorage.removeItem(k)),
  usageBytes(): number {
    let n = 0;
    for (const k of Object.values(K)) n += (localStorage.getItem(k)?.length ?? 0) * 2;
    return n;
  },
};

export function makeBackup(items: Item[], outfits: Outfit[]): BackupFile {
  return { app: 'wardrobe', version: 1, exportedAt: new Date().toISOString(), items, outfits };
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
  const items = d.items.filter(
    (i): i is Item => !!i && typeof i.id === 'string' && typeof i.imageDataUrl === 'string' && typeof i.category === 'string',
  ).map((i) => ({ ...i, tags: Array.isArray(i.tags) ? i.tags : [], season: i.season ?? 'all', color: i.color ?? '', name: i.name ?? '' }));
  const outfits = d.outfits.filter((o): o is Outfit => !!o && typeof o.id === 'string' && Array.isArray(o.layers));
  return { app: 'wardrobe', version: 1, exportedAt: d.exportedAt ?? '', items, outfits };
}
