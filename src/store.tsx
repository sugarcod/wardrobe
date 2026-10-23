import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DiaryEntry, Draft, Item, Layer, Outfit, Perfume, Prefs, SyncKind, Tombstone } from './types';
import { local, migrateFromLocalStorage } from './lib/storage';
import { StorageFullError, blobToDataUrl, dataUrlToBlob, idb, itemsFromDataUrls, perfumesFromDataUrls, requestPersistence } from './lib/db';
import { cleanLayers, sortLayers, wear } from './lib/outfit';
import { nextStamp } from './lib/syncMerge';
import { entryItemIds } from './lib/stats';
import { uid, pluralRu } from './lib/util';
import { useUI } from './ui';
import type { LocalAdapter, RemoteChanges, SyncHandle, SyncRecord } from './lib/cloud';

export interface WearStat {
  count: number;
  /** YYYY-MM-DD */
  last: string;
}

export type DiaryInput = Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

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
  perfumes: Perfume[];
  perfumesById: Map<string, Perfume>;
  /** imageDataUrl: data: — новое фото, undefined — без фото */
  savePerfume: (p: Perfume) => Promise<Perfume | null>;
  deletePerfume: (id: string) => Promise<void>;
  diary: DiaryEntry[];
  saveDiary: (e: DiaryInput) => Promise<DiaryEntry | null>;
  deleteDiary: (id: string) => Promise<void>;
  /** сколько раз и когда последний раз надевали (по дневнику) — для вещей и парфюмов */
  wearStats: Map<string, WearStat>;
  setDraftPerfumes: (ids: string[]) => void;
  /** импорт из резервной копии (картинки — data URL) */
  importData: (items: Item[], outfits: Outfit[], replace: boolean, perfumes?: Perfume[], diary?: DiaryEntry[]) => Promise<boolean>;
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
const byCreatedAsc = <T extends { createdAt: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt);
/** дневник: новые дни сверху, внутри дня — по времени записи */
const byDiary = (a: DiaryEntry, b: DiaryEntry) => b.date.localeCompare(a.date) || a.createdAt.localeCompare(b.createdAt);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useUI();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [items, setItemsState] = useState<Item[]>([]);
  const [outfits, setOutfitsState] = useState<Outfit[]>([]);
  const [perfumes, setPerfumesState] = useState<Perfume[]>([]);
  const [diary, setDiaryState] = useState<DiaryEntry[]>([]);
  const [draft, setDraft] = useState<Draft>(() => local.loadDraft());
  const [prefs, setPrefsState] = useState<Prefs>(() => local.loadPrefs());
  const [syncAttached, setSyncAttached] = useState(false);
  const urls = useRef(new Set<string>());
  // refs — источник истины для асинхронной синхронизации (состояние React обновляется следом)
  const itemsRef = useRef<Item[]>([]);
  const outfitsRef = useRef<Outfit[]>([]);
  const perfumesRef = useRef<Perfume[]>([]);
  const diaryRef = useRef<DiaryEntry[]>([]);
  const syncRef = useRef<SyncHandle | null>(null);

  const setItems = useCallback((fn: (cur: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItemsState(itemsRef.current);
  }, []);
  const setOutfits = useCallback((fn: (cur: Outfit[]) => Outfit[]) => {
    outfitsRef.current = fn(outfitsRef.current);
    setOutfitsState(outfitsRef.current);
  }, []);

  const setPerfumes = useCallback((fn: (cur: Perfume[]) => Perfume[]) => {
    perfumesRef.current = fn(perfumesRef.current);
    setPerfumesState(perfumesRef.current);
  }, []);
  const setDiary = useCallback((fn: (cur: DiaryEntry[]) => DiaryEntry[]) => {
    diaryRef.current = fn(diaryRef.current).sort(byDiary);
    setDiaryState(diaryRef.current);
  }, []);

  const perfumesById = useMemo(() => new Map(perfumes.map((p) => [p.id, p])), [perfumes]);
  const wearStats = useMemo(() => {
    const m = new Map<string, WearStat>();
    // один день = одно использование, даже если записей за день несколько
    const seen = new Set<string>();
    const outfitsById = new Map(outfits.map((o) => [o.id, o]));
    const bump = (id: string, date: string) => {
      const k = `${id}|${date}`;
      if (seen.has(k)) return;
      seen.add(k);
      const s = m.get(id);
      if (!s) m.set(id, { count: 1, last: date });
      else { s.count++; if (date > s.last) s.last = date; }
    };
    for (const e of diary) {
      entryItemIds(e, outfitsById).forEach((id) => bump(id, e.date));
      (e.perfumeIds ?? []).forEach((id) => bump(id, e.date));
    }
    return m;
  }, [diary, outfits]);

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
    data.perfumes.forEach((p) => p.imageDataUrl && urls.current.add(p.imageDataUrl));
    setItems(() => data.items);
    setOutfits(() => data.outfits);
    setPerfumes(() => data.perfumes);
    setDiary(() => data.diary);
  }, [setItems, setOutfits, setPerfumes, setDiary]);

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
      const of = (k: SyncKind) => c.upserts.filter((u) => u.kind === k);
      const del = (k: SyncKind) => c.deletes.filter((d) => d.kind === k);

      const itemUps = of('item');
      if (itemUps.length) {
        const blobs = new Map<string, Blob>();
        for (const { rec, imageDataUrl } of itemUps) if (imageDataUrl) blobs.set(rec.id, await dataUrlToBlob(imageDataUrl));
        const list = itemUps.map((u) => ({ ...(u.rec as Item), imageDataUrl: u.rec.imageDataUrl ?? '' }));
        await idb.putItems(list, blobs);
        const nextItems = new Map(list.map((item) => {
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
      for (const d of del('item')) {
        await idb.deleteItem(d.id, { key: `item:${d.id}`, kind: 'item', id: d.id, updatedAt: d.updatedAt });
        setItems((cur) => {
          const it = cur.find((i) => i.id === d.id);
          if (it) revoke(it.imageDataUrl);
          return cur.filter((i) => i.id !== d.id);
        });
        setDraft((dr) => ({ ...dr, layers: dr.layers.filter((l) => l.itemId !== d.id) }));
      }
      for (const { rec } of of('outfit')) {
        const o = rec as unknown as Outfit;
        await idb.putOutfit(o);
        setOutfits((cur) => [...cur.filter((x) => x.id !== o.id), o].sort(byCreatedDesc));
      }
      for (const d of del('outfit')) {
        await idb.deleteOutfit(d.id, { key: `outfit:${d.id}`, kind: 'outfit', id: d.id, updatedAt: d.updatedAt });
        setOutfits((cur) => cur.filter((o) => o.id !== d.id));
        setDraft((dr) => (dr.editingId === d.id ? { ...dr, editingId: null } : dr));
      }
      for (const u of of('perfume')) {
        const prev = perfumesRef.current.find((p) => p.id === u.rec.id);
        const blob = u.imageDataUrl ? await dataUrlToBlob(u.imageDataUrl) : u.removeImage ? null : undefined;
        const next = { ...(u.rec as unknown as Perfume) };
        if (blob) {
          next.imageDataUrl = URL.createObjectURL(blob);
          urls.current.add(next.imageDataUrl);
        } else if (blob === null) {
          delete next.imageDataUrl;
        } else {
          next.imageDataUrl = prev?.imageDataUrl;
        }
        await idb.putPerfume(next, blob);
        if (prev?.imageDataUrl && prev.imageDataUrl !== next.imageDataUrl) revoke(prev.imageDataUrl);
        setPerfumes((cur) => [...cur.filter((p) => p.id !== next.id), next].sort(byCreatedAsc));
      }
      for (const d of del('perfume')) {
        await idb.deletePerfume(d.id, { key: `perfume:${d.id}`, kind: 'perfume', id: d.id, updatedAt: d.updatedAt });
        setPerfumes((cur) => {
          const p = cur.find((x) => x.id === d.id);
          if (p?.imageDataUrl) revoke(p.imageDataUrl);
          return cur.filter((x) => x.id !== d.id);
        });
        setDraft((dr) => ({ ...dr, perfumeIds: (dr.perfumeIds ?? []).filter((x) => x !== d.id) }));
      }
      for (const { rec } of of('diary')) {
        const e = rec as unknown as DiaryEntry;
        await idb.putDiary(e);
        setDiary((cur) => [...cur.filter((x) => x.id !== e.id), e]);
      }
      for (const d of del('diary')) {
        await idb.deleteDiary(d.id, { key: `diary:${d.id}`, kind: 'diary', id: d.id, updatedAt: d.updatedAt });
        setDiary((cur) => cur.filter((x) => x.id !== d.id));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setItems, setOutfits, setPerfumes, setDiary],
  );

  const syncAdapter = useMemo<LocalAdapter>(
    () => ({
      getLocal: async () => ({
        records: {
          item: itemsRef.current,
          outfit: outfitsRef.current,
          perfume: perfumesRef.current,
          diary: diaryRef.current,
        } as unknown as Record<SyncKind, SyncRecord[]>,
        tombstones: await idb.getTombstones(),
      }),
      imageToDataUrl: async (_kind, rec) => {
        const url = rec.imageDataUrl ?? '';
        return url.startsWith('data:') ? url : blobToDataUrl(await dataUrlToBlob(url));
      },
      applyRemote,
    }),
    [applyRemote],
  );

  const push = (kind: SyncKind, rec: unknown, imageChanged = false) => syncRef.current?.push(kind, rec as SyncRecord, imageChanged);

  const wipeLocal = async () => {
    await idb.replaceAll([], [], true);
    await reload();
    setDraft({ layers: [], editingId: null });
  };

  const deleteRecord = async (kind: 'perfume' | 'diary', t: Tombstone) => {
    if (kind === 'perfume') await idb.deletePerfume(t.id, t);
    else await idb.deleteDiary(t.id, t);
  };
  const deleteAny = async (t: Tombstone) => {
    if (t.kind === 'item') await idb.deleteItem(t.id, t);
    else if (t.kind === 'outfit') await idb.deleteOutfit(t.id, t);
    else await deleteRecord(t.kind, t);
  };

  const value: StoreCtx = {
    ready,
    persisted,
    items,
    itemsById,
    outfits,
    perfumes,
    perfumesById,
    diary,
    wearStats,
    draft: { ...draft, layers: cleanLayers(draft.layers, itemsById), perfumeIds: (draft.perfumeIds ?? []).filter((id) => perfumesById.has(id)) },
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
        live.forEach((it) => push('item', it, true));
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
        push('item', next, imageChanged);
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
    clearDraft: (keepEditing = true) => setDraft((d) => ({ layers: [], editingId: keepEditing ? d.editingId : null, perfumeIds: d.perfumeIds })),
    setDraftPerfumes: (ids) => setDraft((d) => ({ ...d, perfumeIds: ids })),
    loadOutfit: (o) => setDraft((d) => ({ layers: sortLayers(cleanLayers(o.layers, itemsById), itemsById), editingId: o.id, perfumeIds: d.perfumeIds })),

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
      push('outfit', saved);
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

    savePerfume: async (p) => {
      const prev = perfumesRef.current.find((x) => x.id === p.id);
      const now = nextStamp(prev?.updatedAt ?? prev?.createdAt);
      let next: Perfume = { ...p, createdAt: prev?.createdAt ?? p.createdAt ?? now, updatedAt: now };
      let blob: Blob | null | undefined;
      let imageChanged = false;
      try {
        if (p.imageDataUrl?.startsWith('data:')) {
          blob = await dataUrlToBlob(p.imageDataUrl);
          next = { ...next, imageDataUrl: URL.createObjectURL(blob), imageRev: uid() };
          urls.current.add(next.imageDataUrl!);
          imageChanged = true;
        } else if (!p.imageDataUrl && prev?.imageDataUrl) {
          blob = null;
          delete next.imageRev;
          imageChanged = true;
        }
        await idb.putPerfume(next, blob);
      } catch (e) {
        fail(e);
        return null;
      }
      if (prev?.imageDataUrl && prev.imageDataUrl !== next.imageDataUrl) revoke(prev.imageDataUrl);
      setPerfumes((cur) => (prev ? cur.map((x) => (x.id === next.id ? next : x)) : [...cur, next]));
      push('perfume', next, imageChanged || !prev);
      return next;
    },

    deletePerfume: async (id) => {
      try {
        const prev = perfumesRef.current.find((x) => x.id === id);
        const t = tomb('perfume', id, prev?.updatedAt ?? prev?.createdAt);
        await idb.deletePerfume(id, t);
        if (prev?.imageDataUrl) revoke(prev.imageDataUrl);
        setPerfumes((cur) => cur.filter((x) => x.id !== id));
        setDraft((d) => ({ ...d, perfumeIds: (d.perfumeIds ?? []).filter((x) => x !== id) }));
        syncRef.current?.pushDelete('perfume', id, t.updatedAt);
      } catch (e) {
        fail(e);
      }
    },

    saveDiary: async (input) => {
      const prev = input.id ? diaryRef.current.find((x) => x.id === input.id) : undefined;
      const now = nextStamp(prev?.updatedAt ?? prev?.createdAt);
      const entry: DiaryEntry = {
        ...input,
        id: prev?.id ?? uid(),
        layers: input.layers.map((l) => ({ ...l })),
        perfumeIds: [...new Set(input.perfumeIds)],
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      try {
        await idb.putDiary(entry);
      } catch (e) {
        fail(e);
        return null;
      }
      setDiary((cur) => [...cur.filter((x) => x.id !== entry.id), entry]);
      push('diary', entry);
      return entry;
    },

    deleteDiary: async (id) => {
      try {
        const prev = diaryRef.current.find((x) => x.id === id);
        const t = tomb('diary', id, prev?.updatedAt ?? prev?.createdAt);
        await idb.deleteDiary(id, t);
        setDiary((cur) => cur.filter((x) => x.id !== id));
        syncRef.current?.pushDelete('diary', id, t.updatedAt);
      } catch (e) {
        fail(e);
      }
    },

    importData: async (newItems, newOutfits, replace, newPerfumes = [], newDiary = []) => {
      try {
        const now = Date.now();
        const stampedItems = newItems.map((it, i) => ({ ...it, updatedAt: new Date(now + i).toISOString(), imageRev: uid() }));
        const stampedOutfits = newOutfits.map((o, i) => ({ ...o, updatedAt: new Date(now + i).toISOString() }));
        const removedItems = replace ? itemsRef.current.filter((i) => !newItems.some((n) => n.id === i.id)) : [];
        const removedOutfits = replace ? outfitsRef.current.filter((o) => !newOutfits.some((n) => n.id === o.id)) : [];
        const stampedPerfumes = newPerfumes.map((p, i) => ({ ...p, updatedAt: new Date(now + i).toISOString(), imageRev: p.imageDataUrl ? uid() : undefined }));
        const stampedDiary = newDiary.map((e, i) => ({ ...e, updatedAt: new Date(now + i).toISOString() }));
        const removedPerfumes = replace ? perfumesRef.current.filter((p) => !newPerfumes.some((n) => n.id === p.id)) : [];
        const removedDiary = replace ? diaryRef.current.filter((e) => !newDiary.some((n) => n.id === e.id)) : [];
        const records = await itemsFromDataUrls(stampedItems);
        const precords = await perfumesFromDataUrls(stampedPerfumes);
        await idb.replaceAll(records, stampedOutfits, replace, precords, stampedDiary);
        const tombs = [
          ...removedItems.map((i) => tomb('item', i.id, i.updatedAt)),
          ...removedOutfits.map((o) => tomb('outfit', o.id, o.updatedAt)),
          ...removedPerfumes.map((p) => tomb('perfume', p.id, p.updatedAt)),
          ...removedDiary.map((e) => tomb('diary', e.id, e.updatedAt)),
        ];
        for (const t of tombs) await deleteAny(t);
        await reload();
        if (replace) setDraft({ layers: [], editingId: null });
        const s = syncRef.current;
        if (s) {
          itemsRef.current.filter((i) => stampedItems.some((n) => n.id === i.id)).forEach((i) => s.push('item', i as unknown as SyncRecord, true));
          stampedOutfits.forEach((o) => s.push('outfit', o as unknown as SyncRecord));
          perfumesRef.current.filter((p) => stampedPerfumes.some((n) => n.id === p.id)).forEach((p) => s.push('perfume', p as unknown as SyncRecord, true));
          stampedDiary.forEach((e) => s.push('diary', e as unknown as SyncRecord));
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
        const tombs = s
          ? [
              ...itemsRef.current.map((i) => tomb('item', i.id, i.updatedAt)),
              ...outfitsRef.current.map((o) => tomb('outfit', o.id, o.updatedAt)),
              ...perfumesRef.current.map((p) => tomb('perfume', p.id, p.updatedAt)),
              ...diaryRef.current.map((e) => tomb('diary', e.id, e.updatedAt)),
            ]
          : [];
        await idb.replaceAll([], [], true);
        for (const t of tombs) await deleteAny(t);
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
