import { useEffect, useMemo, useRef, useState } from 'react';
import { PerfumeBottle } from '../components/PerfumeBottle';
import { PerfumeDialog } from '../components/PerfumeDialog';
import { PERFUME_FAMILIES, FAMILY_BY_ID } from '../perfume';
import { SEASON_LABEL } from '../constants';
import { useStore } from '../store';
import { pluralRu, relativeDay } from '../lib/util';
import type { Perfume, PerfumeFamily } from '../types';
import { PlusIcon } from './WardrobeScreen';

function usePerRow(ref: React.RefObject<HTMLElement | null>, cell: number) {
  const [n, setN] = useState(6);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setN(Math.max(2, Math.floor((el.clientWidth - 24) / cell))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, cell]);
  return n;
}

export function PerfumesScreen() {
  const { perfumes, wearStats } = useStore();
  const [family, setFamily] = useState<PerfumeFamily | ''>('');
  const [open, setOpen] = useState<Perfume | 'new' | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const perRow = usePerRow(wrap, 124);

  const list = useMemo(() => perfumes.filter((p) => !family || p.family === family), [perfumes, family]);
  const rows: Perfume[][] = [];
  for (let i = 0; i < list.length; i += perRow) rows.push(list.slice(i, i + perRow));
  if (!rows.length) rows.push([]);
  const used = new Set(perfumes.map((p) => p.family));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Полка парфюмов</h1>
          <p className="page-sub">
            {perfumes.length ? `${perfumes.length} ${pluralRu(perfumes.length, 'аромат', 'аромата', 'ароматов')}` : 'Добавьте ароматы, чтобы отмечать их в дневнике вместе с образом'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen('new')}><PlusIcon /> Добавить аромат</button>
      </header>

      {perfumes.length > 0 && used.size > 1 && (
        <div className="chips shelf-filter">
          <button className={`chip ${!family ? 'is-on' : ''}`} onClick={() => setFamily('')}>Все</button>
          {PERFUME_FAMILIES.filter((f) => used.has(f.id)).map((f) => (
            <button key={f.id} className={`chip ${family === f.id ? 'is-on' : ''}`} onClick={() => setFamily(f.id)}>
              <span className="family-dot" style={{ background: f.color }} />
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="shelves" ref={wrap} data-testid="perfume-shelf">
        {rows.map((row, i) => (
          <div className="shelf" key={i} style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
            {row.map((p) => {
              const st = wearStats.get(p.id);
              return (
                <button key={p.id} className="shelf-item" onClick={() => setOpen(p)} title={[p.brand, p.name].filter(Boolean).join(' — ')} data-testid="perfume">
                  <div className="shelf-bottle"><PerfumeBottle perfume={p} /></div>
                  <div className="shelf-label">
                    <b>{p.name}</b>
                    {p.brand && <span>{p.brand}</span>}
                    <span className="shelf-meta">
                      <span className="family-dot" style={{ background: FAMILY_BY_ID[p.family]?.color }} />
                      {st ? `${st.count} ${pluralRu(st.count, 'раз', 'раза', 'раз')} · ${relativeDay(st.last)}` : p.season !== 'all' ? SEASON_LABEL[p.season] : FAMILY_BY_ID[p.family]?.label}
                    </span>
                  </div>
                </button>
              );
            })}
            {i === rows.length - 1 && row.length < perRow && (
              <button className="shelf-item shelf-add" onClick={() => setOpen('new')} aria-label="Добавить аромат">
                <div className="shelf-bottle"><span className="shelf-add-slot"><PlusIcon /></span></div>
                <div className="shelf-label"><span>{perfumes.length ? 'Ещё аромат' : 'Первый аромат'}</span></div>
              </button>
            )}
            <div className="shelf-plank" aria-hidden="true" />
          </div>
        ))}
      </div>

      {open && <PerfumeDialog perfume={open === 'new' ? undefined : open} onClose={() => setOpen(null)} />}
    </div>
  );
}
