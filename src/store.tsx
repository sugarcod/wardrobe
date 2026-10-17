import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Draft, Item, Layer, Outfit, Prefs } from './types';
import { storage, StorageFullError } from './lib/storage';
import { cleanLayers, sortLayers, wear } from './lib/outfit';
import { uid } from './lib/util';
import { useUI } from './ui';

interface StoreCtx {
  items: Item[];
  itemsById: Map<string, Item>;
  outfits: Outfit[];
  draft: Draft;
  prefs: Prefs;
  addItems: (items: Item[]) => boolean;
  updateItem: (item: Item) => boolean;
  deleteItem: (id: string) => void;
  wearItem: (item: Item) => void;
  setLayers: (layers: Layer[]) => void;
  updateLayer: (itemId: string, patch: Partial<Layer>) => void;
  removeLayer: (itemId: string) => void;
  clearDraft: (keepEditing?: boolean) => void;
  loadOutfit: (o: Outfit) => void;
  saveOutfit: (name: string, asNew: boolean) => Outfit | null;
  deleteOutfit: (id: string) => void;
  replaceAll: (items: Item[], outfits: Outfit[]) => boolean;
  setPrefs: (p: Partial<Prefs>) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useUI();
  const [items, setItems] = useState<Item[]>(() => storage.loadItems());
  const [outfits, setOutfits] = useState<Outfit[]>(() => storage.loadOutfits());
  const [draft, setDraft] = useState<Draft>(() => storage.loadDraft());
  const [prefs, setPrefsState] = useState<Prefs>(() => storage.loadPrefs());

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => storage.saveDraft(draft), [draft]);
  useEffect(() => storage.savePrefs(prefs), [prefs]);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof StorageFullError) {
        toast('Хранилище браузера заполнено. Удалите лишние вещи или сделайте резервную копию в «Настройках» — фото занимают много места.', 'error');
      } else {
        toast('Не удалось сохранить данные.', 'error');
        console.warn(e);
      }
      return false;
    },
    [toast],
  );

  const commitItems = useCallback(
    (next: Item[]) => {
      try {
        storage.saveItems(next);
        setItems(next);
        return true;
      } catch (e) {
        return fail(e);
      }
    },
    [fail],
  );

  const commitOutfits = useCallback(
    (next: Outfit[]) => {
      try {
        storage.saveOutfits(next);
        setOutfits(next);
        return true;
      } catch (e) {
        return fail(e);
      }
    },
    [fail],
  );

  const value: StoreCtx = {
    items,
    itemsById,
    outfits,
    draft: { ...draft, layers: cleanLayers(draft.layers, itemsById) },
    prefs,
    addItems: (newItems) => commitItems([...newItems, ...items]),
    updateItem: (item) => commitItems(items.map((i) => (i.id === item.id ? item : i))),
    deleteItem: (id) => {
      if (commitItems(items.filter((i) => i.id !== id))) {
        setDraft((d) => ({ ...d, layers: d.layers.filter((l) => l.itemId !== id) }));
      }
    },
    wearItem: (item) => setDraft((d) => ({ ...d, layers: wear(cleanLayers(d.layers, itemsById), item, itemsById) })),
    setLayers: (layers) => setDraft((d) => ({ ...d, layers: sortLayers(layers, itemsById) })),
    updateLayer: (itemId, patch) =>
      setDraft((d) => ({ ...d, layers: d.layers.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) })),
    removeLayer: (itemId) => setDraft((d) => ({ ...d, layers: d.layers.filter((l) => l.itemId !== itemId) })),
    clearDraft: (keepEditing = true) => setDraft((d) => ({ layers: [], editingId: keepEditing ? d.editingId : null })),
    loadOutfit: (o) => setDraft({ layers: sortLayers(cleanLayers(o.layers, itemsById), itemsById), editingId: o.id }),
    saveOutfit: (name, asNew) => {
      const layers = cleanLayers(draft.layers, itemsById);
      const now = new Date().toISOString();
      const existing = !asNew && draft.editingId ? outfits.find((o) => o.id === draft.editingId) : undefined;
      let saved: Outfit;
      let next: Outfit[];
      if (existing) {
        saved = { ...existing, name, layers, updatedAt: now };
        next = outfits.map((o) => (o.id === existing.id ? saved : o));
      } else {
        saved = { id: uid(), name, createdAt: now, layers };
        next = [saved, ...outfits];
      }
      if (!commitOutfits(next)) return null;
      setDraft((d) => ({ ...d, editingId: saved.id }));
      return saved;
    },
    deleteOutfit: (id) => {
      if (commitOutfits(outfits.filter((o) => o.id !== id))) {
        setDraft((d) => (d.editingId === id ? { ...d, editingId: null } : d));
      }
    },
    replaceAll: (newItems, newOutfits) => {
      const prevItems = items;
      if (!commitItems(newItems)) return false;
      if (!commitOutfits(newOutfits)) {
        commitItems(prevItems);
        return false;
      }
      setDraft({ layers: [], editingId: null });
      return true;
    },
    setPrefs: (p) => setPrefsState((s) => ({ ...s, ...p })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
