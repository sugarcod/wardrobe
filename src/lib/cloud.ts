/**
 * Облако: Firebase Auth (Google) + Cloud Firestore.
 * Модуль загружается динамически, только если Firebase настроен.
 *
 * Структура:
 *   users/{uid}/items/{id}    — метаданные вещи + updatedAt, deleted, imageRev
 *   users/{uid}/images/{id}   — { dataUrl (base64 WebP, ≤ ~700 КБ), rev, updatedAt }
 *   users/{uid}/outfits/{id}  — образ + updatedAt, deleted
 *   users/{uid}/perfumes/{id} — парфюм; фото (если есть) — в users/{uid}/perfumeImages/{id}
 *   users/{uid}/diary/{id}    — запись дневника (копия слоёв, парфюмы, заметка)
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
import type { SyncKind, Tombstone } from '../types';
import { planMerge, shouldApplyRemote, type SyncRec } from './syncMerge';
import { fitDataUrl } from './image';

export interface CloudUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
}

export type SyncStatus = 'syncing' | 'synced' | 'offline' | 'error';

/** Любая синхронизируемая запись (вещь, образ, парфюм, запись дневника) */
export interface SyncRecord {
  id: string;
  createdAt: string;
  updatedAt?: string;
  imageRev?: string;
  imageDataUrl?: string;
}

interface KindCfg {
  kind: SyncKind;
  col: string;
  /** коллекция с картинками (base64), если у записей бывают фото */
  imageCol?: string;
  /** без картинки запись не имеет смысла (вещь) */
  imageRequired?: boolean;
}

export const KINDS: KindCfg[] = [
  { kind: 'item', col: 'items', imageCol: 'images', imageRequired: true },
  { kind: 'outfit', col: 'outfits' },
  { kind: 'perfume', col: 'perfumes', imageCol: 'perfumeImages' },
  { kind: 'diary', col: 'diary' },
];
const CFG = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<SyncKind, KindCfg>;

export interface RemoteUpsert {
  kind: SyncKind;
  rec: SyncRecord;
  /** новая картинка (data URL), если она изменилась */
  imageDataUrl?: string;
  /** картинку удалили на другом устройстве */
  removeImage?: boolean;
}

export interface RemoteChanges {
  upserts: RemoteUpsert[];
  deletes: { kind: SyncKind; id: string; updatedAt: string }[];
}

export interface LocalAdapter {
  getLocal(): Promise<{ records: Record<SyncKind, SyncRecord[]>; tombstones: Tombstone[] }>;
  imageToDataUrl(kind: SyncKind, rec: SyncRecord): Promise<string>;
  applyRemote(c: RemoteChanges): Promise<void>;
}

export interface SyncHandle {
  push(kind: SyncKind, rec: SyncRecord, imageChanged?: boolean): void;
  pushDelete(kind: SyncKind, id: string, updatedAt: string): void;
}

type CloudRec = SyncRecord & { updatedAt: string; deleted?: boolean };

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

  private col(name: string) {
    return collection(this.db, 'users', this.uid, name);
  }
  private ref(name: string, id: string) {
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
    for (const cfg of KINDS) {
      this.unsubs.push(
        onSnapshot(this.col(cfg.col), (snap) => this.enqueue(() => this.onSnap(cfg, snap)), (e) => { this.failed = true; this.emit(); console.warn(e); }),
      );
    }
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
    const snaps = await Promise.all(KINDS.map((k) => getDocs(this.col(k.col))));
    const { records, tombstones } = await this.local.getLocal();
    const changes: RemoteChanges = { upserts: [], deletes: [] };
    const uploads: (() => Promise<unknown>)[] = [];

    for (let i = 0; i < KINDS.length; i++) {
      const cfg = KINDS[i];
      const remote = new Map(snaps[i].docs.map((d) => [d.id, { ...(d.data() as CloudRec), id: d.id }]));
      const live = records[cfg.kind];
      const localById = new Map(live.map((r) => [r.id, r]));
      const tombs = tombstones.filter((t) => t.kind === cfg.kind);
      const localRecs: SyncRec[] = [
        ...live.map((r) => ({ id: r.id, updatedAt: r.updatedAt ?? r.createdAt })),
        ...tombs.filter((t) => !localById.has(t.id)).map((t) => ({ id: t.id, updatedAt: t.updatedAt, deleted: true })),
      ];
      const remoteRecs: SyncRec[] = [...remote.values()].map((r) => ({ id: r.id, updatedAt: r.updatedAt ?? r.createdAt ?? '', deleted: !!r.deleted }));
      const plan = planMerge(localRecs, remoteRecs);

      for (const id of plan.download) {
        const r = remote.get(id)!;
        if (r.deleted) changes.deletes.push({ kind: cfg.kind, id, updatedAt: r.updatedAt });
        else {
          const c = await this.remoteChange(cfg, r, localById.get(id));
          if (c) changes.upserts.push(c);
        }
      }
      for (const id of plan.upload) {
        const rec = localById.get(id);
        if (rec) {
          const imageChanged = !!cfg.imageCol && (remote.get(id)?.imageRev !== rec.imageRev || !remote.has(id));
          uploads.push(() => this.write(cfg, rec, imageChanged));
        } else {
          const t = tombs.find((x) => x.id === id)!;
          uploads.push(() => this.writeDelete(cfg.kind, id, t.updatedAt));
        }
      }
    }
    await this.local.applyRemote(changes);
    // не ждём подтверждения сервера в офлайне — записи стоят в очереди Firestore
    uploads.forEach((w) => this.track(w()).catch(() => {}));
  }

  private async remoteChange(cfg: KindCfg, r: CloudRec, local?: SyncRecord): Promise<RemoteUpsert | null> {
    const base = stripCloud(r) as SyncRecord;
    if (!cfg.imageCol) return { kind: cfg.kind, rec: base };
    const rec: SyncRecord = { ...base, imageDataUrl: local?.imageDataUrl };
    if (!r.imageRev) {
      // у записи нет фото (парфюм без картинки)
      if (cfg.imageRequired) return local ? { kind: cfg.kind, rec: { ...rec, imageRev: local.imageRev } } : null;
      return { kind: cfg.kind, rec: { ...rec, imageDataUrl: undefined, imageRev: undefined }, removeImage: !!local?.imageRev };
    }
    if (local && local.imageRev && local.imageRev === r.imageRev) return { kind: cfg.kind, rec };
    const img = await getDoc(this.ref(cfg.imageCol, r.id));
    const data = img.data() as { dataUrl?: string; rev?: string } | undefined;
    if (!data?.dataUrl) {
      // картинка ещё не пришла
      if (local) return { kind: cfg.kind, rec: { ...rec, imageRev: local.imageRev } };
      return cfg.imageRequired ? null : { kind: cfg.kind, rec: { ...rec, imageRev: undefined, imageDataUrl: undefined } };
    }
    return { kind: cfg.kind, rec: { ...rec, imageRev: data.rev ?? r.imageRev }, imageDataUrl: data.dataUrl };
  }

  // ---------- изменения из облака ----------
  private async onSnap(cfg: KindCfg, snap: QuerySnapshot<DocumentData>) {
    const relevant = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites);
    if (!relevant.length) return;
    const { records, tombstones } = await this.local.getLocal();
    const byId = new Map(records[cfg.kind].map((r) => [r.id, r]));
    const changes: RemoteChanges = { upserts: [], deletes: [] };
    for (const c of relevant) {
      const r = { ...(c.doc.data() as CloudRec), id: c.doc.id };
      const l = byId.get(r.id);
      const t = tombstones.find((x) => x.kind === cfg.kind && x.id === r.id);
      const localRec: SyncRec | undefined = l ? { id: l.id, updatedAt: l.updatedAt ?? l.createdAt } : t ? { id: t.id, updatedAt: t.updatedAt, deleted: true } : undefined;
      if (!shouldApplyRemote(localRec, { id: r.id, updatedAt: r.updatedAt ?? r.createdAt, deleted: !!r.deleted })) continue;
      if (r.deleted) changes.deletes.push({ kind: cfg.kind, id: r.id, updatedAt: r.updatedAt });
      else {
        const ch = await this.remoteChange(cfg, r, l);
        if (ch) changes.upserts.push(ch);
      }
    }
    if (changes.upserts.length || changes.deletes.length) await this.local.applyRemote(changes);
  }

  // ---------- запись в облако ----------
  private async write(cfg: KindCfg, rec: SyncRecord, imageChanged: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { imageDataUrl: _img, ...meta } = rec;
    const updatedAt = rec.updatedAt ?? rec.createdAt;
    const writes: Promise<void>[] = [];
    if (cfg.imageCol && imageChanged) {
      if (rec.imageDataUrl && (rec.imageRev || cfg.imageRequired)) {
        const dataUrl = await fitDataUrl(await this.local.imageToDataUrl(cfg.kind, rec));
        writes.push(setDoc(this.ref(cfg.imageCol, rec.id), { dataUrl, rev: rec.imageRev ?? '', updatedAt }));
      } else {
        writes.push(deleteDoc(this.ref(cfg.imageCol, rec.id)));
      }
    }
    writes.push(setDoc(this.ref(cfg.col, rec.id), { ...meta, updatedAt, deleted: false }));
    await Promise.all(writes);
  }

  private async writeDelete(kind: SyncKind, id: string, updatedAt: string) {
    const cfg = CFG[kind];
    const writes: Promise<void>[] = [setDoc(this.ref(cfg.col, id), { id, updatedAt, deleted: true })];
    if (cfg.imageCol) writes.push(deleteDoc(this.ref(cfg.imageCol, id)));
    await Promise.all(writes);
  }

  // ---------- SyncHandle ----------
  push(kind: SyncKind, rec: SyncRecord, imageChanged = false) {
    if (!this.stopped) this.track(this.write(CFG[kind], rec, imageChanged)).catch(() => {});
  }
  pushDelete(kind: SyncKind, id: string, updatedAt: string) {
    if (!this.stopped) this.track(this.writeDelete(kind, id, updatedAt)).catch(() => {});
  }
}

function stripCloud<T extends { deleted?: boolean }>(r: T): Omit<T, 'deleted'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { deleted: _d, ...rest } = r;
  return rest;
}
