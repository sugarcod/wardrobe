/**
 * Облако: Firebase Auth (Google) + Cloud Firestore.
 * Модуль загружается динамически, только если Firebase настроен.
 *
 * Структура:
 *   users/{uid}/items/{id}    — метаданные вещи + updatedAt, deleted, imageRev
 *   users/{uid}/images/{id}   — { dataUrl (base64 WebP, ≤ ~700 КБ), rev, updatedAt }
 *   users/{uid}/outfits/{id}  — образ + updatedAt, deleted
 */
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import type { Item, Outfit, Tombstone } from '../types';
import { planMerge, shouldApplyRemote, type SyncRec } from './syncMerge';
import { fitDataUrl } from './image';

export interface CloudUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
}

export type SyncStatus = 'syncing' | 'synced' | 'offline' | 'error';

export interface RemoteChanges {
  /** imageDataUrl — новая картинка (data URL), если она изменилась */
  items: { item: Item; imageDataUrl?: string }[];
  outfits: Outfit[];
  deletedItems: { id: string; updatedAt: string }[];
  deletedOutfits: { id: string; updatedAt: string }[];
}

export interface LocalAdapter {
  getLocal(): Promise<{ items: Item[]; outfits: Outfit[]; tombstones: Tombstone[] }>;
  imageToDataUrl(item: Item): Promise<string>;
  applyRemote(c: RemoteChanges): Promise<void>;
}

export interface SyncHandle {
  pushItem(item: Item, imageChanged: boolean): void;
  pushOutfit(o: Outfit): void;
  pushDelete(kind: 'item' | 'outfit', id: string, updatedAt: string): void;
}

type CloudItem = Omit<Item, 'imageDataUrl'> & { updatedAt: string; deleted?: boolean };
type CloudOutfit = Outfit & { updatedAt: string; deleted?: boolean };

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function initCloud(config: FirebaseOptions, emulatorHost?: string) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  if (emulatorHost) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
  }
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  // ошибки входа через redirect (если был)
  const redirectError = getRedirectResult(auth).then(
    () => null,
    (e: { code?: string }) => e?.code ?? 'unknown',
  );

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const toUser = (u: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): CloudUser => ({
    uid: u.uid,
    name: u.displayName || u.email || 'Пользователь',
    email: u.email || '',
    photoURL: u.photoURL || '',
  });

  return {
    redirectError,
    onUser(cb: (u: CloudUser | null) => void) {
      return onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null));
    },
    async signIn() {
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || isMobile()) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw e;
      }
    },
    async signOut() {
      await fbSignOut(auth);
    },
    /** только для эмулятора: вход тестовым Google-аккаунтом без окна */
    async emulatorSignIn(sub: string, email: string, name: string) {
      if (!emulatorHost) throw new Error('emulator only');
      const token = JSON.stringify({ sub, email, name, email_verified: true });
      await signInWithCredential(auth, GoogleAuthProvider.credential(token));
    },
    createSync(uid: string, local: LocalAdapter, onStatus: (s: SyncStatus) => void) {
      return new CloudSync(db, uid, local, onStatus);
    },
  };
}

export type CloudApi = ReturnType<typeof initCloud>;

export class CloudSync implements SyncHandle {
  private unsubs: (() => void)[] = [];
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private ready = false;
  private failed = false;
  private stopped = false;
  private online = navigator.onLine;
  private lastStatus: SyncStatus | null = null;
  private onOnline = () => { this.online = true; this.emit(); };
  private onOffline = () => { this.online = false; this.emit(); };
  private db: Firestore;
  private uid: string;
  private local: LocalAdapter;
  private onStatus: (s: SyncStatus) => void;

  constructor(db: Firestore, uid: string, local: LocalAdapter, onStatus: (s: SyncStatus) => void) {
    this.db = db;
    this.uid = uid;
    this.local = local;
    this.onStatus = onStatus;
  }

  private col(name: 'items' | 'images' | 'outfits') {
    return collection(this.db, 'users', this.uid, name);
  }
  private ref(name: 'items' | 'images' | 'outfits', id: string) {
    return doc(this.db, 'users', this.uid, name, id);
  }

  private emit() {
    const s: SyncStatus = !this.online ? 'offline' : this.failed ? 'error' : this.pending > 0 || !this.ready ? 'syncing' : 'synced';
    if (s !== this.lastStatus) {
      this.lastStatus = s;
      this.onStatus(s);
    }
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.pending++;
    this.emit();
    return p.then(
      (v) => { this.failed = false; return v; },
      (e) => { this.failed = true; console.warn('Синхронизация:', e); throw e; },
    ).finally(() => { this.pending--; this.emit(); });
  }

  private enqueue(fn: () => Promise<void>) {
    this.queue = this.queue.then(() => (this.stopped ? undefined : fn())).catch((e) => {
      this.failed = true;
      this.emit();
      console.warn('Синхронизация:', e);
    });
    return this.queue;
  }

  async start() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.emit();
    await this.enqueue(() => this.track(this.initialMerge()));
    if (this.stopped) return;
    this.ready = true;
    this.emit();
    this.unsubs.push(
      onSnapshot(this.col('items'), (snap) => this.enqueue(() => this.onItems(snap)), (e) => { this.failed = true; this.emit(); console.warn(e); }),
      onSnapshot(this.col('outfits'), (snap) => this.enqueue(() => this.onOutfits(snap)), (e) => { this.failed = true; this.emit(); console.warn(e); }),
    );
  }

  stop() {
    this.stopped = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  // ---------- первичное слияние ----------
  private async initialMerge() {
    const [ri, ro] = await Promise.all([getDocs(this.col('items')), getDocs(this.col('outfits'))]);
    const { items, outfits, tombstones } = await this.local.getLocal();
    const remoteItems = new Map(ri.docs.map((d) => [d.id, { ...(d.data() as CloudItem), id: d.id }]));
    const remoteOutfits = new Map(ro.docs.map((d) => [d.id, { ...(d.data() as CloudOutfit), id: d.id }]));
    const localItems = new Map(items.map((i) => [i.id, i]));
    const localOutfits = new Map(outfits.map((o) => [o.id, o]));
    const tombItems = tombstones.filter((t) => t.kind === 'item');
    const tombOutfits = tombstones.filter((t) => t.kind === 'outfit');

    const recs = (live: { id: string; updatedAt?: string; createdAt: string }[], tombs: Tombstone[]): SyncRec[] => [
      ...live.map((r) => ({ id: r.id, updatedAt: r.updatedAt ?? r.createdAt })),
      ...tombs.filter((t) => !live.some((l) => l.id === t.id)).map((t) => ({ id: t.id, updatedAt: t.updatedAt, deleted: true })),
    ];
    const asRemote = (m: Map<string, { id: string; updatedAt: string; deleted?: boolean; createdAt?: string }>): SyncRec[] =>
      [...m.values()].map((r) => ({ id: r.id, updatedAt: r.updatedAt ?? r.createdAt ?? '', deleted: !!r.deleted }));

    const pi = planMerge(recs(items, tombItems), asRemote(remoteItems));
    const po = planMerge(recs(outfits, tombOutfits), asRemote(remoteOutfits));

    // скачать
    const changes: RemoteChanges = { items: [], outfits: [], deletedItems: [], deletedOutfits: [] };
    for (const id of pi.download) {
      const r = remoteItems.get(id)!;
      if (r.deleted) changes.deletedItems.push({ id, updatedAt: r.updatedAt });
      else {
        const c = await this.remoteItemChange(r, localItems.get(id));
        if (c) changes.items.push(c);
      }
    }
    for (const id of po.download) {
      const r = remoteOutfits.get(id)!;
      if (r.deleted) changes.deletedOutfits.push({ id, updatedAt: r.updatedAt });
      else changes.outfits.push(stripCloud(r));
    }
    await this.local.applyRemote(changes);

    // отправить
    const writes: Promise<unknown>[] = [];
    for (const id of pi.upload) {
      const it = localItems.get(id);
      if (it) writes.push(this.writeItem(it, remoteItems.get(id)?.imageRev !== it.imageRev || !remoteItems.has(id)));
      else {
        const t = tombItems.find((x) => x.id === id)!;
        writes.push(this.writeDelete('item', id, t.updatedAt));
      }
    }
    for (const id of po.upload) {
      const o = localOutfits.get(id);
      if (o) writes.push(this.writeOutfit(o));
      else {
        const t = tombOutfits.find((x) => x.id === id)!;
        writes.push(this.writeDelete('outfit', id, t.updatedAt));
      }
    }
    // не ждём подтверждения сервера в офлайне — записи стоят в очереди Firestore
    writes.forEach((w) => this.track(w).catch(() => {}));
  }

  private async remoteItemChange(r: CloudItem, local?: Item): Promise<{ item: Item; imageDataUrl?: string } | null> {
    const item = { ...stripCloud(r), imageDataUrl: local?.imageDataUrl ?? '' } as Item;
    if (local && local.imageRev && local.imageRev === r.imageRev) return { item };
    const img = await getDoc(this.ref('images', r.id));
    const data = img.data() as { dataUrl?: string; rev?: string } | undefined;
    if (!data?.dataUrl) return local ? { item: { ...item, imageRev: local.imageRev } } : null; // картинка ещё не пришла
    return { item: { ...item, imageRev: data.rev ?? r.imageRev }, imageDataUrl: data.dataUrl };
  }

  // ---------- изменения из облака ----------
  private async onItems(snap: QuerySnapshot<DocumentData>) {
    const relevant = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites);
    if (!relevant.length) return;
    const { items, tombstones } = await this.local.getLocal();
    const byId = new Map(items.map((i) => [i.id, i]));
    const changes: RemoteChanges = { items: [], outfits: [], deletedItems: [], deletedOutfits: [] };
    for (const c of relevant) {
      const r = { ...(c.doc.data() as CloudItem), id: c.doc.id };
      const l = byId.get(r.id);
      const t = tombstones.find((x) => x.kind === 'item' && x.id === r.id);
      const localRec: SyncRec | undefined = l ? { id: l.id, updatedAt: l.updatedAt ?? l.createdAt } : t ? { id: t.id, updatedAt: t.updatedAt, deleted: true } : undefined;
      if (!shouldApplyRemote(localRec, { id: r.id, updatedAt: r.updatedAt ?? r.createdAt, deleted: !!r.deleted })) continue;
      if (r.deleted) changes.deletedItems.push({ id: r.id, updatedAt: r.updatedAt });
      else {
        const ch = await this.remoteItemChange(r, l);
        if (ch) changes.items.push(ch);
      }
    }
    if (changes.items.length || changes.deletedItems.length) await this.local.applyRemote(changes);
  }

  private async onOutfits(snap: QuerySnapshot<DocumentData>) {
    const relevant = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites);
    if (!relevant.length) return;
    const { outfits, tombstones } = await this.local.getLocal();
    const byId = new Map(outfits.map((o) => [o.id, o]));
    const changes: RemoteChanges = { items: [], outfits: [], deletedItems: [], deletedOutfits: [] };
    for (const c of relevant) {
      const r = { ...(c.doc.data() as CloudOutfit), id: c.doc.id };
      const l = byId.get(r.id);
      const t = tombstones.find((x) => x.kind === 'outfit' && x.id === r.id);
      const localRec: SyncRec | undefined = l ? { id: l.id, updatedAt: l.updatedAt ?? l.createdAt } : t ? { id: t.id, updatedAt: t.updatedAt, deleted: true } : undefined;
      if (!shouldApplyRemote(localRec, { id: r.id, updatedAt: r.updatedAt ?? r.createdAt, deleted: !!r.deleted })) continue;
      if (r.deleted) changes.deletedOutfits.push({ id: r.id, updatedAt: r.updatedAt });
      else changes.outfits.push(stripCloud(r));
    }
    if (changes.outfits.length || changes.deletedOutfits.length) await this.local.applyRemote(changes);
  }

  // ---------- запись в облако ----------
  private async writeItem(item: Item, imageChanged: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { imageDataUrl: _img, ...meta } = item;
    const updatedAt = item.updatedAt ?? item.createdAt;
    const writes: Promise<void>[] = [];
    if (imageChanged) {
      const dataUrl = await fitDataUrl(await this.local.imageToDataUrl(item));
      writes.push(setDoc(this.ref('images', item.id), { dataUrl, rev: item.imageRev ?? '', updatedAt }));
    }
    writes.push(setDoc(this.ref('items', item.id), { ...meta, updatedAt, deleted: false } satisfies CloudItem));
    await Promise.all(writes);
  }

  private async writeOutfit(o: Outfit) {
    await setDoc(this.ref('outfits', o.id), { ...o, updatedAt: o.updatedAt ?? o.createdAt, deleted: false } satisfies CloudOutfit);
  }

  private async writeDelete(kind: 'item' | 'outfit', id: string, updatedAt: string) {
    const name = kind === 'item' ? 'items' : 'outfits';
    const writes: Promise<void>[] = [setDoc(this.ref(name, id), { id, updatedAt, deleted: true })];
    if (kind === 'item') writes.push(deleteDoc(this.ref('images', id)));
    await Promise.all(writes);
  }

  // ---------- SyncHandle ----------
  pushItem(item: Item, imageChanged: boolean) {
    if (!this.stopped) this.track(this.writeItem(item, imageChanged)).catch(() => {});
  }
  pushOutfit(o: Outfit) {
    if (!this.stopped) this.track(this.writeOutfit(o)).catch(() => {});
  }
  pushDelete(kind: 'item' | 'outfit', id: string, updatedAt: string) {
    if (!this.stopped) this.track(this.writeDelete(kind, id, updatedAt)).catch(() => {});
  }
}

function stripCloud<T extends { deleted?: boolean }>(r: T): Omit<T, 'deleted'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { deleted: _d, ...rest } = r;
  return rest;
}
