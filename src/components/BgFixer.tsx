import { useEffect, useRef, useState } from 'react';
import { removeBg } from '../lib/process';

interface Props {
  sourceDataUrl: string;
  onChange: (r: { dataUrl: string; color?: string; removed: boolean }) => void;
}

/** Предупреждение «фон не убран» + грубое удаление светлого фона */
export function BgFixer({ sourceDataUrl, onChange }: Props) {
  const [mode, setMode] = useState<'ask' | 'removed' | 'kept'>('ask');
  const [tol, setTol] = useState(40);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const run = async (t: number) => {
    setBusy(true);
    try {
      const r = await removeBg(sourceDataUrl, t);
      onChange({ ...r, removed: true });
      setMode('removed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (mode === 'kept') {
    return (
      <div className="notice">
        Фото сохранится с фоном.{' '}
        <button type="button" className="link-btn" onClick={() => setMode('ask')}>Убрать фон</button>
      </div>
    );
  }

  return (
    <div className="notice notice-warn">
      {mode === 'ask' ? (
        <>
          <b>Похоже, фон не убран.</b> Лучше всего загружать PNG/WebP уже без фона. Можно попробовать грубо убрать светлый фон прямо здесь.
          <div className="notice-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(tol)}>
              {busy ? 'Обработка…' : 'Убрать светлый фон'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMode('kept'); onChange({ dataUrl: sourceDataUrl, removed: false }); }}>
              Оставить как есть
            </button>
          </div>
        </>
      ) : (
        <>
          <b>Светлый фон убран.</b> Если задело вещь или остались края — подвиньте ползунок.
          <label className="range-row">
            <span>Чувствительность</span>
            <input
              type="range"
              min={10}
              max={110}
              value={tol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTol(v);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => run(v), 250);
              }}
            />
            <span className="muted">{busy ? '…' : tol}</span>
          </label>
          <button type="button" className="link-btn" onClick={() => { setMode('ask'); onChange({ dataUrl: sourceDataUrl, removed: false }); }}>
            Вернуть оригинал
          </button>
        </>
      )}
    </div>
  );
}
