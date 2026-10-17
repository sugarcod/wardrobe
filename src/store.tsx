import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Draft, Item, Layer, Outfit, Prefs, Tombstone } from './types';
import { local, migrateFromLocalStorage } from './lib/storage';
import { StorageFullError, blobToDataUrl, dataUrlToBlob, idb, itemsFromDataUrls, requestPersistence } from './lib/db';
import { cleanLayers, sortLayers, wear } from './lib/outfit';
import { nextStamp } from './lib/syncMerge';
import { uid, pluralRu } from './lib/util';
import { useUI } from './ui';
import type { LocalAdapter, RemoteChanges, SyncHandle } from './lib/cloud';

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
  /** удалить всё (если включена синхронизация — и в облаке) */
  wipeAll: () => Promise<boolean>;
  /** удалить только локальную копию, без синхронизации (при выходе из аккаунта) */
  wipeLocal: () => Promise<void>;
  setPrefs: (p: Partial<Prefs>) => void;
  /** для облачной синхронизации */
  syncAdapter: LocalAdapter;
  attachSync: (s: SyncHandle | null) => void;
  syncAttached: boolean;
}

const Ctx = createContext<StoreCtx | null>(null);

const byCreatedDesc = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useUI();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [items, setItemsState] = useState<Item[]>([]);
  const [outfits, setOutfitsState] = useState<Outfit[]>([]);
  const [draft, setDraft] = useState<Draft>(() => local.loadDraft());
  const [prefs, setPrefsState] = useState<Prefs>(() => local.loadPrefs());
  const [syncAttached, setSyncAttached] = useState(false);
  const urls = useRef(new Set<string>());
  // refs — источник истины для асинхронной синхронизации (состояние React обновляется следом)
  const itemsRef = useRef<Item[]>([]);
  const outfitsRef = useRef<Outfit[]>([]);
  const syncRef = useRef<SyncHandle | null>(null);

  const setItems = useCallback((fn: (cur: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItemsState(itemsRef.current);
  }, []);
  const setOutfits = useCallback((fn: (cur: Outfit[]) => Outfit[]) => {
    outfitsRef.current = fn(outfitsRef.current);
    setOutfitsState(outfitsRef.current);
  }, []);

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
    setItems(() => data.items);
    setOutfits(() => data.outfits);
  }, [setItems, setOutfits]);

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

  const tomb = (kind: Tombstone['kind'], id: string, prev?: string): Tombstone => ({ key: `${kind}:${id}`, kind, id, updatedAt: nextStamp(prev) });

  /** Применение изменений, пришедших из облака (без обратной отправки) */
  const applyRemote = useCallback(
    async (c: RemoteChanges) => {
      if (c.items.length) {
        const blobs = new Map<string, Blob>();
        for (const { item, imageDataUrl } of c.items) if (imageDataUrl) blobs.set(item.id, await dataUrlToBlob(imageDataUrl));
        await idb.putItems(c.items.map((x) => x.item), blobs);
        const nextItems = new Map(c.items.map(({ item }) => {
          const b = blobs.get(item.id);
          return [item.id, b ? { ...item, imageDataUrl: URL.createObjectURL(b) } : item] as const;
        }));
        track([...nextItems.values()].filter((i) => i.imageDataUrl));
        setItems((cur) => {
          const out = cur.map((i) => {
            const n = nextItems.get(i.id);
            if (!n) return i;
            nextItems.delete(i.id);
            if (n.imageDataUrl !== i.imageDataUrl && n.imageDataUrl) revoke(i.imageDataUrl);
            return { ...n, imageDataUrl: n.imageDataUrl || i.imageDataUrl };
          });
          return [...out, ...[...nextItems.values()].filter((i) => i.imageDataUrl)].sort(byCreatedDesc);
        });
      }
      for (const d of c.deletedItems) {
        await idb.deleteItem(d.id, { key: `item:${d.id}`, kind: 'item', id: d.id, updatedAt: d.updatedAt });
        setItems((cur) => {
          const it = cur.find((i) => i.id === d.id);
          if (it) revoke(it.imageDataUrl);
          return cur.filter((i) => i.id !== d.id);
        });
        setDraft((dr) => ({ ...dr, layers: dr.layers.filter((l) => l.itemId !== d.id) }));
      }
      for (const o of c.outfits) {
        await idb.putOutfit(o);
        setOutfits((cur) => [...cur.filter((x) => x.id !== o.id), o].sort(byCreatedDesc));
      }
      for (const d of c.deletedOutfits) {
        await idb.deleteOutfit(d.id, { key: `outfit:${d.id}`, kind: 'outfit', id: d.id, updatedAt: d.updatedAt });
        setOutfits((cur) => cur.filter((o) => o.id !== d.id));
        setDraft((dr) => (dr.editingId === d.id ? { ...dr, editingId: null } : dr));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setItems, setOutfits],
  );

  const syncAdapter = useMemo<LocalAdapter>(
    () => ({
      getLocal: async () => ({ items: itemsRef.current, outfits: outfitsRef.current, tombstones: await idb.getTombstones() }),
      imageToDataUrl: async (item) => (item.imageDataUrl.startsWith('data:') ? item.imageDataUrl : blobToDataUrl(await dataUrlToBlob(item.imageDataUrl))),
      applyRemote,
    }),
    [applyRemote],
  );

  const wipeLocal = async () => {
    await idb.replaceAll([], [], true);
    await reload();
    setDraft({ layers: [], editingId: null });
  };

  const value: StoreCtx = {
    ready,
    persisted,
    items,
    itemsById,
    outfits,
    draft: { ...draft, layers: cleanLayers(draft.layers, itemsById) },
    prefs,
    syncAdapter,
    syncAttached,
    attachSync: (s) => {
      syncRef.current = s;
      setSyncAttached(!!s);
    },

    addItems: async (newItems) => {
      try {
        const now = Date.now();
        const stamped = newItems.map((it, i) => ({ ...it, updatedAt: new Date(now + i).toISOString(), imageRev: uid() }));
        const blobs = new Map<string, Blob>();
        for (const it of stamped) blobs.set(it.id, await dataUrlToBlob(it.imageDataUrl));
        await idb.putItems(stamped, blobs);
        const live = stamped.map((it) => ({ ...it, imageDataUrl: URL.createObjectURL(blobs.get(it.id)!) }));
        track(live);
        setItems((cur) => [...live, ...cur]);
        live.forEach((it) => syncRef.current?.pushItem(it, true));
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    updateItem: async (item) => {
      try {
        const prev = itemsRef.current.find((i) => i.id === item.id);
        const blobs = new Map<string, Blob>();
        let next: Item = { ...item, updatedAt: nextStamp(prev?.updatedAt ?? prev?.createdAt) };
        const imageChanged = item.imageDataUrl.startsWith('data:');
        if (imageChanged) {
          const b = await dataUrlToBlob(item.imageDataUrl);
          blobs.set(item.id, b);
          next = { ...next, imageDataUrl: URL.createObjectURL(b), imageRev: uid() };
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
        syncRef.current?.pushItem(next, imageChanged);
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    deleteItem: async (id) => {
      try {
        const prev = itemsRef.current.find((i) => i.id === id);
        const t = tomb('item', id, prev?.updatedAt ?? prev?.createdAt);
        await idb.deleteItem(id, t);
        setItems((cur) => {
          const it = cur.find((i) => i.id === id);
          if (it) revoke(it.imageDataUrl);
          return cur.filter((i) => i.id !== id);
        });
        setDraft((d) => ({ ...d, layers: d.layers.filter((l) => l.itemId !== id) }));
        syncRef.current?.pushDelete('item', id, t.updatedAt);
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
      const existing = !asNew && draft.editingId ? outfitsRef.current.find((o) => o.id === draft.editingId) : undefined;
      const now = nextStamp(existing?.updatedAt ?? existing?.createdAt);
      const saved: Outfit = existing ? { ...existing, name, layers, updatedAt: now } : { id: uid(), name, createdAt: now, updatedAt: now, layers };
      try {
        await idb.putOutfit(saved);
      } catch (e) {
        fail(e);
        return null;
      }
      setOutfits((cur) => (existing ? cur.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...cur]));
      setDraft((d) => ({ ...d, editingId: saved.id }));
      syncRef.current?.pushOutfit(saved);
      return saved;
    },

    deleteOutfit: async (id) => {
      try {
        const prev = outfitsRef.current.find((o) => o.id === id);
        const t = tomb('outfit', id, prev?.updatedAt ?? prev?.createdAt);
        await idb.deleteOutfit(id, t);
        setOutfits((cur) => cur.filter((o) => o.id !== id));
        setDraft((d) => (d.editingId === id ? { ...d, editingId: null } : d));
        syncRef.current?.pushDelete('outfit', id, t.updatedAt);
      } catch (e) {
        fail(e);
      }
    },

    importData: async (newItems, newOutfits, replace) => {
      try {
        const now = Date.now();
        const stampedItems = newItems.map((it, i) => ({ ...it, updatedAt: new Date(now + i).toISOString(), imageRev: uid() }));
        const stampedOutfits = newOutfits.map((o, i) => ({ ...o, updatedAt: new Date(now + i).toISOString() }));
        const removedItems = replace ? itemsRef.current.filter((i) => !newItems.some((n) => n.id === i.id)) : [];
        const removedOutfits = replace ? outfitsRef.current.filter((o) => !newOutfits.some((n) => n.id === o.id)) : [];
        const records = await itemsFromDataUrls(stampedItems);
        await idb.replaceAll(records, stampedOutfits, replace);
        const tombs = [...removedItems.map((i) => tomb('item', i.id, i.updatedAt)), ...removedOutfits.map((o) => tomb('outfit', o.id, o.updatedAt))];
        for (const t of tombs) await (t.kind === 'item' ? idb.deleteItem(t.id, t) : idb.deleteOutfit(t.id, t));
        await reload();
        if (replace) setDraft({ layers: [], editingId: null });
        const s = syncRef.current;
        if (s) {
          itemsRef.current.filter((i) => stampedItems.some((n) => n.id === i.id)).forEach((i) => s.pushItem(i, true));
          stampedOutfits.forEach((o) => s.pushOutfit(o));
          tombs.forEach((t) => s.pushDelete(t.kind, t.id, t.updatedAt));
        }
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    wipeAll: async () => {
      try {
        const s = syncRef.current;
        const tombs = s ? [...itemsRef.current.map((i) => tomb('item', i.id, i.updatedAt)), ...outfitsRef.current.map((o) => tomb('outfit', o.id, o.updatedAt))] : [];
        await idb.replaceAll([], [], true);
        for (const t of tombs) await (t.kind === 'item' ? idb.deleteItem(t.id, t) : idb.deleteOutfit(t.id, t));
        await reload();
        setDraft({ layers: [], editingId: null });
        tombs.forEach((t) => s?.pushDelete(t.kind, t.id, t.updatedAt));
        return true;
      } catch (e) {
        return fail(e);
      }
    },

    wipeLocal,
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
