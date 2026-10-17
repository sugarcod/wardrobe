import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from './components/Modal';

type ToastKind = 'info' | 'error' | 'success';
interface Toast { id: number; text: string; kind: ToastKind }

interface ConfirmOpts {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface UICtx {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
}

const Ctx = createContext<UICtx | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6500 : 3200);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
      {confirmState && (
        <Modal onClose={() => close(false)} size="sm" title={confirmState.title}>
          {confirmState.text && <p className="muted">{confirmState.text}</p>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => close(false)}>{confirmState.cancelText ?? 'Отмена'}</button>
            <button autoFocus className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
              {confirmState.confirmText ?? 'Подтвердить'}
            </button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useUI() {
  const c = useContext(Ctx);
  if (!c) throw new Error('UIProvider missing');
  return c;
}
