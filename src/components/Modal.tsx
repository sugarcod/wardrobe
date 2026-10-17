import { useEffect, useRef, type ReactNode } from 'react';

const stack: object[] = [];
import { createPortal } from 'react-dom';

interface Props {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ title, onClose, children, size = 'md' }: Props) {
  const token = useRef({});
  useEffect(() => {
    const me = token.current;
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {title ? <h2 className="modal-title">{title}</h2> : <span />}
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
