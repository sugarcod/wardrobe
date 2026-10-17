import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { emulatorHost, firebaseConfig, isFirebaseConfigured } from './firebaseConfig';
import { useStore } from './store';
import { useUI } from './ui';
import type { CloudApi, CloudSync, CloudUser, SyncStatus } from './lib/cloud';

const LAST_UID_KEY = 'wardrobe.cloud.lastUid';

interface CloudCtx {
  /** Firebase настроен — можно показывать вход */
  available: boolean;
  /** undefined — ещё проверяем вход */
  user: CloudUser | null | undefined;
  status: SyncStatus | 'local';
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<CloudCtx>({ available: false, user: null, status: 'local', signIn: async () => {}, signOut: async () => {} });

export function CloudProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { toast, choose } = useUI();
  const [api, setApi] = useState<CloudApi | null>(null);
  const [user, setUser] = useState<CloudUser | null | undefined>(isFirebaseConfigured ? undefined : null);
  const [status, setStatus] = useState<SyncStatus | 'local'>('local');
  const syncRef = useRef<CloudSync | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let unsub: (() => void) | undefined;
    let alive = true;
    import('./lib/cloud')
      .then((m) => {
        if (!alive) return;
        const a = m.initCloud(firebaseConfig, emulatorHost || undefined);
        setApi(a);
        unsub = a.onUser(setUser);
        a.redirectError.then((code) => code && code !== 'auth/no-auth-event' && toast(`Не удалось войти: ${code}`, 'error'));
        if (emulatorHost) (window as unknown as Record<string, unknown>).__wardrobeEmulatorSignIn = a.emulatorSignIn;
      })
      .catch((e) => {
        console.warn('Firebase недоступен', e);
        setUser(null);
      });
    return () => {
      alive = false;
      unsub?.();
    };
  }, [toast]);

  // запуск/остановка синхронизации при смене пользователя
  useEffect(() => {
    if (!api || !user) {
      setStatus('local');
      return;
    }
    let cancelled = false;
    (async () => {
      const s = storeRef.current;
      const lastUid = localStorage.getItem(LAST_UID_KEY);
      if (lastUid && lastUid !== user.uid && (s.items.length || s.outfits.length)) {
        const ans = await choose({
          title: 'На устройстве данные другого аккаунта',
          text: 'Объединить их с этим аккаунтом или заменить данными из облака?',
          options: [
            { id: 'merge', label: 'Объединить' },
            { id: 'replace', label: 'Заменить данными из облака', kind: 'ghost' },
          ],
        });
        if (ans === 'replace') await s.wipeLocal();
      }
      if (cancelled) return;
      localStorage.setItem(LAST_UID_KEY, user.uid);
      const sync = api.createSync(user.uid, s.syncAdapter, setStatus);
      syncRef.current = sync;
      s.attachSync(sync);
      await sync.start();
    })().catch((e) => {
      console.warn(e);
      setStatus('error');
    });
    return () => {
      cancelled = true;
      syncRef.current?.stop();
      syncRef.current = null;
      storeRef.current.attachSync(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user?.uid]);

  const signIn = useCallback(async () => {
    if (!api) return;
    try {
      await api.signIn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      toast(code === 'auth/unauthorized-domain' ? 'Этот домен не разрешён для входа — добавьте его в Firebase → Authentication → Settings → Authorized domains.' : `Не удалось войти${code ? `: ${code}` : ''}`, 'error');
    }
  }, [api, toast]);

  const signOut = useCallback(async () => {
    if (!api) return;
    const ans = await choose({
      title: 'Выйти из аккаунта?',
      text: 'Данные останутся в облаке. Оставить копию на этом устройстве?',
      options: [
        { id: 'keep', label: 'Выйти и оставить на устройстве' },
        { id: 'clear', label: 'Выйти и удалить с устройства', kind: 'danger' },
        { id: 'cancel', label: 'Отмена', kind: 'ghost' },
      ],
    });
    if (ans !== 'keep' && ans !== 'clear') return;
    syncRef.current?.stop();
    syncRef.current = null;
    storeRef.current.attachSync(null);
    await api.signOut();
    if (ans === 'clear') {
      await storeRef.current.wipeLocal();
      localStorage.removeItem(LAST_UID_KEY);
      toast('Вы вышли. Данные на устройстве удалены, в облаке они сохранены.');
    } else {
      toast('Вы вышли. Данные остались на устройстве.');
    }
  }, [api, choose, toast]);

  return <Ctx.Provider value={{ available: isFirebaseConfigured && !!api, user, status, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useCloud() {
  return useContext(Ctx);
}

export const STATUS_LABEL: Record<SyncStatus | 'local', string> = {
  local: 'Только на устройстве',
  syncing: 'Синхронизация…',
  synced: 'Синхронизировано',
  offline: 'Офлайн',
  error: 'Ошибка синхронизации',
};
