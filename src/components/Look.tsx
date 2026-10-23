import { CATEGORY_BY_ID } from '../constants';
import { cellRank, kindLabel, placementOf } from '../catalog';
import { useStore } from '../store';
import type { Item, Layer, Perfume } from '../types';
import { Stage } from './Stage';
import { PerfumeBottle } from './PerfumeBottle';

interface Props {
  layers: Layer[];
  itemsById: Map<string, Item>;
  perfumeIds?: string[];
  dark?: boolean;
  /** full — сцена с ячейками по бокам; compact — миниатюра с полоской ячеек */
  variant?: 'full' | 'compact';
  showAccessories?: boolean;
  showOuter?: boolean;
  onRemove?: (itemId: string) => void;
  onRemovePerfume?: (id: string) => void;
  /** своя сцена (интерактивная в конструкторе) вместо обычной */
  stage?: React.ReactNode;
  /** сколько ячеек показать в компактном варианте */
  maxCells?: number;
  className?: string;
  children?: React.ReactNode;
}

type Cell =
  | { kind: 'item'; key: string; item: Item; outer: boolean }
  | { kind: 'perfume'; key: string; perfume: Perfume };

/** Делит слои: одежда на манекене, верхняя одежда и аксессуары — в ячейках */
export function splitLook(layers: Layer[], itemsById: Map<string, Item>) {
  const outer: Item[] = [];
  const cells: Item[] = [];
  for (const l of layers) {
    const it = itemsById.get(l.itemId);
    if (!it) continue;
    const p = placementOf(it);
    if (p === 'outer') outer.push(it);
    else if (p === 'cell') cells.push(it);
  }
  cells.sort((a, b) => cellRank(a) - cellRank(b));
  return { outer, cells };
}

const X = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
);

function CellView({ c, onRemove, onRemovePerfume, label = true }: { c: Cell; onRemove?: (id: string) => void; onRemovePerfume?: (id: string) => void; label?: boolean }) {
  if (c.kind === 'perfume') {
    const p = c.perfume;
    return (
      <div className="look-cell look-cell-perfume" data-testid="look-perfume" title={[p.brand, p.name].filter(Boolean).join(' — ')}>
        <div className="look-cell-img"><PerfumeBottle perfume={p} /></div>
        {label && <span className="look-cell-label">{p.name}</span>}
        {onRemovePerfume && <button className="look-cell-x" aria-label={`Убрать аромат ${p.name}`} onClick={() => onRemovePerfume(p.id)}><X /></button>}
      </div>
    );
  }
  const it = c.item;
  const kind = kindLabel(it, CATEGORY_BY_ID[it.category].label);
  return (
    <div className={`look-cell ${c.outer ? 'look-cell-outer' : ''}`} data-testid={c.outer ? 'look-outer-cell' : 'look-cell'} data-item={it.id} title={it.name || kind}>
      <div className="look-cell-img"><img src={it.imageDataUrl} alt={it.name || kind} draggable={false} /></div>
      {label && <span className="look-cell-label">{kind}</span>}
      {onRemove && <button className="look-cell-x" aria-label={`Снять: ${it.name || kind}`} onClick={() => onRemove(it.id)}><X /></button>}
    </div>
  );
}

export function Look({
  layers, itemsById, perfumeIds = [], dark, variant = 'full', showAccessories = true, showOuter = true,
  onRemove, onRemovePerfume, stage, maxCells = 4, className, children,
}: Props) {
  const { perfumesById } = useStore();
  const { outer, cells } = splitLook(layers, itemsById);
  const perfumes = perfumeIds.map((id) => perfumesById.get(id)).filter((p): p is Perfume => !!p);
  const accCells: Cell[] = showAccessories
    ? [...cells.map((item): Cell => ({ kind: 'item', key: item.id, item, outer: false })), ...perfumes.map((p): Cell => ({ kind: 'perfume', key: 'p:' + p.id, perfume: p }))]
    : [];
  const outerCells: Cell[] = showOuter ? outer.map((item) => ({ kind: 'item', key: item.id, item, outer: true })) : [];
  const theStage = stage ?? <Stage layers={layers} itemsById={itemsById} dark={dark} />;

  if (variant === 'compact') {
    const strip = [...outerCells, ...accCells];
    const shown = strip.slice(0, strip.length > maxCells ? maxCells - 1 : maxCells);
    const more = strip.length - shown.length;
    return (
      <div className={`look look-compact ${strip.length ? 'has-strip' : ''} ${dark ? 'is-dark' : ''} ${className ?? ''}`} data-testid="look">
        <div className="look-stage">{theStage}</div>
        {strip.length > 0 && (
          <div className="look-strip">
            {shown.map((c) => <CellView key={c.key} c={c} label={false} />)}
            {more > 0 && <div className="look-cell look-cell-more">+{more}</div>}
          </div>
        )}
        {children}
      </div>
    );
  }

  const cols = accCells.length > 12 ? 3 : accCells.length > 5 ? 2 : 1;
  const vars = { '--cols': cols, '--acc': accCells.length ? 1 : 0, '--out': outerCells.length ? 1 : 0 } as React.CSSProperties;
  return (
    <div className="look-wrap">
    <div className={`look look-full look-cols-${cols} ${dark ? 'is-dark' : ''} ${className ?? ''}`} style={vars} data-testid="look">
      <div className="look-acc" data-testid="look-acc" hidden={!accCells.length}>
        {accCells.map((c) => <CellView key={c.key} c={c} onRemove={onRemove} onRemovePerfume={onRemovePerfume} />)}
      </div>
      <div className="look-stage">
        {theStage}
        {children}
      </div>
      <div className="look-outer" data-testid="look-outer" hidden={!outerCells.length}>
        {outerCells.map((c) => <CellView key={c.key} c={c} onRemove={onRemove} />)}
      </div>
    </div>
    </div>
  );
}
