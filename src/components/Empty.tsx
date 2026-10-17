import type { ReactNode } from 'react';

export function Empty({ title, text, action, icon }: { title: string; text?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <HangerIcon />}</div>
      <h3 className="empty-title">{title}</h3>
      {text && <p className="empty-text">{text}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function HangerIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 14a4 4 0 1 1 4-4" />
      <path d="M24 14v3L6 31a2 2 0 0 0 1.2 3.6h33.6A2 2 0 0 0 42 31L24 17" />
    </svg>
  );
}
