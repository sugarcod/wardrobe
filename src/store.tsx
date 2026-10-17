import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Draft, Item, Layer, Outfit, Prefs } from './types';
import { local, migrateFromLocalStorage } from './lib/storage';
import { StorageFullError, dataUrlToBlob, idb, itemsFromDataUrls, requestPersistence } from './lib/db';
import { cleanLayers, sortLayers, wear } from './lib/outfit';
import { uid, pluralRu } from './lib/util';
import { useUI } from './ui';

interface StoreCtx {
  ready: boolean;
  /** true/false — ответ navigator.storage.persist(); null — не поддерживается */
  persisted: boolean | null;
  items: Item[];
  itemsById: Map<string, Item>;
  outfits: Outfit[];
  draft: Draft;
  prefs: Prefs;
  /** imageDataUrl у новых вещей — data URL */
  addItems: (items: Item[]) => Promise<boolean>;
  /** если imageDataUrl начинается с data:, картинка заменяется */
  updateItem: (item: Item) => Promise<boolean>;
  deleteItem: (id: string) => Promise<void>;
  wearItem: (item: Item) => void;
  setLayers: (layers: Layer[]) => void;
  updateLayer: (itemId: string, patch: Partial<Layer>) => void;
  removeLayer: (itemId: string) => void;
  clearDraft: (keepEditing?: boolean) => void;
  loadOutfit: (o: Outfit) => void;
  saveOutfit: (name: string, asNew: boolean) => Promise<Outfit | null>;
  deleteOutfit: (id: string) => Promise<void>;
  /** импорт из резервной копии (картинки — data URL) */
  importData: (items: Item[], outfits: Outfit[], replace: boolean) => Promise<boolean>;
  wipeAll: () => Promise<boolean>;
  setPrefs: (p: Partial<Prefs>) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useUI();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [draft, setDraft] = useState<Draft>(() => local.loadDraft());
  const [prefs, setPrefsState] = useState<Prefs>(() => local.loadPrefs());
  const urls = useRef(new Set<string>());

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => { if (ready) local.saveDraft(draft); }, [draft, ready]);
  useEffect(() => local.savePrefs(prefs), [prefs]);

  const track = (list: Item[]) => list.forEach((i) => urls.current.add(i.imageDataUrl));
  const revoke = (url: string) => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    urls.current.delete(url);
  };

  const reload = useCallback(async () => {
    const data = await idb.loadAll();
    urls.current.forEach((u) => revoke(u));
    track(data.items);
    setItems(data.items);
    setOutfits(data.outfits);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      requestPersistence().then((p) => alive && setPersisted(p));
      try {
        const migrated = await migrateFromLocalStorage().catch((e) => {
          console.warn('Миграция из localStorage не удалась', e);
          return 0;
        });
        if (!alive) return;
        await reload();
        if (migrated) toast(`Данные перенесены в новое хранилище: ${migrated} ${pluralRu(migrated, 'вещь', 'вещи', 'вещей')}`, 'success');
        setReady(true);
      } catch (e) {
        console.warn(e);
        if (alive) setLoadError('Не удалось открыть хранилище браузера. Возможно, включён приватный режим.');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof StorageFullError) {
        toast('Хранилище браузера заполнено. Удалите лишние вещи или освободите место на устройстве — и сделайте резервную копию в «Настройках».', 'error');
      } else {
        toast('Не удалось сохранить данные.', 'error');
        console.warn(e);
      }
      return false;
    },
    [toast],
  );

  const value: StoreCtx = {
    ready,
    persisted,
    items,
    itemsById,
    outfits,
    draft: { ...draft, layers: cleanLayers(draft.layers, itemsById) },
    prefs,

    addItems: async (newItems) => {
      try {
        const blobs = new Map<string, Blob>();
        for (const it of newItems) blobs.set(it.id, await dataUrlToBlob(it.imageDataUrl));
        await idb.putItems(newItems, blobs);
        const live = newItems.map((it) => ({ ...it, imageDataUrl: URL.createObjectURL(blobs.get(it.id)!) }));
        track(live);
        setItems((cur) => [...live, ...cur]);
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    updateItem: async (item) => {
      try {
        const blobs = new Map<string, Blob>();
        let next = item;
        if (item.imageDataUrl.startsWith('data:')) {
          const b = await dataUrlToBlob(item.imageDataUrl);
          blobs.set(item.id, b);
          next = { ...item, imageDataUrl: URL.createObjectURL(b) };
          track([next]);
        }
        await idb.putItems([next], blobs);
        setItems((cur) =>
          cur.map((i) => {
            if (i.id !== item.id) return i;
            if (i.imageDataUrl !== next.imageDataUrl) revoke(i.imageDataUrl);
            return next;
          }),
        );
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    deleteItem: async (id) => {
      try {
        await idb.deleteItem(id);
        setItems((cur) => {
          const it = cur.find((i) => i.id === id);
          if (it) revoke(it.imageDataUrl);
          return cur.filter((i) => i.id !== id);
        });
        setDraft((d) => ({ ...d, layers: d.layers.filter((l) => l.itemId !== id) }));
      } catch (e) {
        fail(e);
      }
    },

    wearItem: (item) => setDraft((d) => ({ ...d, layers: wear(cleanLayers(d.layers, itemsById), item, itemsById) })),
    setLayers: (layers) => setDraft((d) => ({ ...d, layers: sortLayers(layers, itemsById) })),
    updateLayer: (itemId, patch) =>
      setDraft((d) => ({ ...d, layers: d.layers.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) })),
    removeLayer: (itemId) => setDraft((d) => ({ ...d, layers: d.layers.filter((l) => l.itemId !== itemId) })),
    clearDraft: (keepEditing = true) => setDraft((d) => ({ layers: [], editingId: keepEditing ? d.editingId : null })),
    loadOutfit: (o) => setDraft({ layers: sortLayers(cleanLayers(o.layers, itemsById), itemsById), editingId: o.id }),

    saveOutfit: async (name, asNew) => {
      const layers = cleanLayers(draft.layers, itemsById);
      const now = new Date().toISOString();
      const existing = !asNew && draft.editingId ? outfits.find((o) => o.id === draft.editingId) : undefined;
      const saved: Outfit = existing ? { ...existing, name, layers, updatedAt: now } : { id: uid(), name, createdAt: now, layers };
      try {
        await idb.putOutfit(saved);
      } catch (e) {
        fail(e);
        return null;
      }
      setOutfits((cur) => (existing ? cur.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...cur]));
      setDraft((d) => ({ ...d, editingId: saved.id }));
      return saved;
    },

    deleteOutfit: async (id) => {
      try {
        await idb.deleteOutfit(id);
        setOutfits((cur) => cur.filter((o) => o.id !== id));
        setDraft((d) => (d.editingId === id ? { ...d, editingId: null } : d));
      } catch (e) {
        fail(e);
      }
    },

    importData: async (newItems, newOutfits, replace) => {
      try {
        const records = await itemsFromDataUrls(newItems);
        await idb.replaceAll(records, newOutfits, replace);
        await reload();
        if (replace) setDraft({ layers: [], editingId: null });
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    wipeAll: async () => {
      try {
        await idb.replaceAll([], [], true);
        await reload();
        setDraft({ layers: [], editingId: null });
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    setPrefs: (p) => setPrefsState((s) => ({ ...s, ...p })),
  };

  if (!ready) {
    return (
      <div className="boot">
        {loadError ? <p className="muted">{loadError}</p> : <div className="spinner" aria-label="Загрузка" />}
      </div>
    );
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
