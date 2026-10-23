import { PerfumeBottle } from './PerfumeBottle';
import { useStore } from '../store';

/** Выбор нескольких ароматов с полки */
export function PerfumePicker({ value, onChange, onEmpty }: { value: string[]; onChange: (ids: string[]) => void; onEmpty?: () => void }) {
  const { perfumes } = useStore();
  if (!perfumes.length) {
    return (
      <p className="muted small">
        Полка парфюмов пуста.{' '}
        {onEmpty && <button type="button" className="link-btn" onClick={onEmpty}>Добавить аромат</button>}
      </p>
    );
  }
  return (
    <div className="perfume-picks" role="group" aria-label="Ароматы">
      {perfumes.map((p) => {
        const on = value.includes(p.id);
        return (
          <button
            type="button"
            key={p.id}
            className={`perfume-pick ${on ? 'is-on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
            title={[p.brand, p.name].filter(Boolean).join(' — ')}
          >
            <PerfumeBottle perfume={p} className="bottle-xs" />
            <span>{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Компактные «чипы» выбранных ароматов */
export function PerfumeChips({ ids, empty }: { ids: string[]; empty?: string }) {
  const { perfumesById } = useStore();
  if (!ids.length) return empty ? <span className="muted small">{empty}</span> : null;
  return (
    <div className="perfume-chips">
      {ids.map((id) => {
        const p = perfumesById.get(id);
        return p ? (
          <span key={id} className="perfume-chip" title={p.brand}>
            <PerfumeBottle perfume={p} className="bottle-xxs" />
            {p.name}
          </span>
        ) : (
          <span key={id} className="perfume-chip is-missing">аромат удалён</span>
        );
      })}
    </div>
  );
}
