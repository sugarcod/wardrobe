import { useMemo, useState } from 'react';
import { CATEGORY_BY_ID, CATEGORY_DISPLAY_ORDER } from '../constants';
import { kindLabel } from '../catalog';
import { FAMILY_BY_ID } from '../perfume';
import { PerfumeBottle } from '../components/PerfumeBottle';
import { Empty } from '../components/Empty';
import { useStore } from '../store';
import { useApp } from '../nav';
import { MONTHS_RU, formatDay, pluralRu, relativeDay, todayISO } from '../lib/util';
import { computeUsage, toCSV, type ExportRow, type Period, type PeriodKind, type UsageRow } from '../lib/stats';
import type { Category, Item, Perfume } from '../types';

type Sort = 'most' | 'least' | 'recent' | 'name';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'most', label: 'Чаще' },
  { id: 'least', label: 'Реже' },
  { id: 'recent', label: 'Недавние' },
  { id: 'name', label: 'По названию' },
];
const PERIODS: { id: PeriodKind; label: string }[] = [
  { id: 'all', label: 'Всё время' },
  { id: 'year', label: 'Этот год' },
  { id: '30d', label: '30 дней' },
  { id: 'month', label: 'Месяц' },
];

const rowName = (r: UsageRow) => (r.item ? r.item.name || kindLabel(r.item, CATEGORY_BY_ID[r.item.category].label) : r.perfume ? [r.perfume.brand, r.perfume.name].filter(Boolean).join(' — ') : '');
const times = (n: number) => `${n} ${pluralRu(n, 'раз', 'раза', 'раз')}`;

function sortRows(rows: UsageRow[], s: Sort) {
  const r = [...rows];
  if (s === 'least') r.sort((a, b) => a.count - b.count || a.last.localeCompare(b.last));
  if (s === 'recent') r.sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count);
  if (s === 'name') r.sort((a, b) => rowName(a).localeCompare(rowName(b), 'ru'));
  return r;
}

function download(name: string, data: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function StatsScreen() {
  const { diary, items, perfumes, outfits } = useStore();
  const { openItem, navigate } = useApp();
  const [kind, setKind] = useState<PeriodKind>('all');
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [cat, setCat] = useState<Category | ''>('');
  const [sort, setSort] = useState<Sort>('most');
  const [allItems, setAllItems] = useState(false);
  const [allPerf, setAllPerf] = useState(false);
  const [openPerfume, setOpenPerfume] = useState<string | null>(null);

  const period: Period = { kind, month };
  const s = useMemo(() => computeUsage(diary, items, perfumes, outfits, { kind, month }), [diary, items, perfumes, outfits, kind, month]);

  const itemRows = useMemo(() => sortRows(s.items.filter((r) => !cat || r.item!.category === cat), sort), [s, cat, sort]);
  const perfRows = useMemo(() => sortRows(s.perfumes, sort), [s, sort]);
  const never = s.neverItems.filter((i) => !cat || i.category === cat);
  const maxItem = Math.max(1, ...s.items.map((r) => r.count));
  const maxPerf = Math.max(1, ...s.perfumes.map((r) => r.count));
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.wears));
  const usedCats = CATEGORY_DISPLAY_ORDER.filter((c) => s.byCategory.some((x) => x.category === c && x.wears > 0));
  const periodLabel = kind === 'month' ? (() => { const [y, m] = month.split('-').map(Number); return `${MONTHS_RU[m - 1]} ${y}`; })() : PERIODS.find((p) => p.id === kind)!.label;

  const exportRows = (): ExportRow[] => [
    ...[...s.items, ...s.neverItems.map((item) => ({ item, count: 0, first: '', last: '' }))].map((r) => ({
      type: 'Вещь',
      name: r.item!.name || kindLabel(r.item!, CATEGORY_BY_ID[r.item!.category].label),
      category: [...new Set([CATEGORY_BY_ID[r.item!.category].label, kindLabel(r.item!, CATEGORY_BY_ID[r.item!.category].label)])].join(' / '),
      count: r.count, first: r.first, last: r.last,
    })),
    ...[...s.perfumes, ...s.neverPerfumes.map((perfume) => ({ perfume, count: 0, first: '', last: '' }))].map((r) => ({
      type: 'Аромат',
      name: [r.perfume!.brand, r.perfume!.name].filter(Boolean).join(' — '),
      category: (FAMILY_BY_ID[r.perfume!.family] ?? FAMILY_BY_ID.other).label,
      count: r.count, first: r.first, last: r.last,
    })),
  ];
  const fileBase = `garderob-statistika-${kind === 'month' ? month : kind}-${todayISO()}`;
  const exportCSV = () => download(`${fileBase}.csv`, toCSV(exportRows()), 'text/csv;charset=utf-8');
  const exportJSON = () => download(`${fileBase}.json`, JSON.stringify({ app: 'wardrobe', kind: 'usage-stats', period: { ...period, label: periodLabel }, exportedAt: new Date().toISOString(), days: s.days, rows: exportRows() }, null, 2), 'application/json');

  if (!diary.length) {
    return (
      <div className="page">
        <header className="page-head"><div><h1 className="page-title">Статистика</h1><p className="page-sub">Сколько раз и что вы надевали — по записям дневника</p></div></header>
        <Empty title="Пока нечего считать" text="Статистика собирается из дневника: отмечайте, что надели и каким ароматом, — и здесь появятся любимые вещи и забытые." action={<button className="btn btn-primary" onClick={() => navigate('diary')}>Открыть дневник</button>} />
      </div>
    );
  }

  const top = s.items[0];
  const topP = s.perfumes[0];
  const wornCount = items.length - s.neverItems.length;

  return (
    <div className="page stats-page" data-testid="stats">
      <header className="page-head">
        <div>
          <h1 className="page-title">Статистика</h1>
          <p className="page-sub">Один день в дневнике — одно использование вещи или аромата</p>
        </div>
        <div className="row-gap">
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} data-testid="export-csv">⤓ CSV для Excel</button>
          <button className="btn btn-ghost btn-sm" onClick={exportJSON} data-testid="export-json">⤓ JSON</button>
        </div>
      </header>

      <div className="stats-period">
        <div className="seg" role="group" aria-label="Период">
          {PERIODS.map((p) => <button key={p.id} className={kind === p.id ? 'is-on' : ''} onClick={() => setKind(p.id)}>{p.label}</button>)}
        </div>
        {kind === 'month' && <input type="month" className="input input-sm stats-month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Месяц" />}
      </div>

      <div className="stats-tiles">
        <div className="stat-tile"><b>{s.days}</b><span>{pluralRu(s.days, 'день', 'дня', 'дней')} в дневнике</span></div>
        <div className="stat-tile"><b>{wornCount}<small> / {items.length}</small></b><span>вещей надевали</span></div>
        <div className="stat-tile"><b>{perfumes.length - s.neverPerfumes.length}<small> / {perfumes.length}</small></b><span>ароматов использовали</span></div>
        <div className="stat-tile stat-tile-wide">
          {top ? <><span>Любимая вещь</span><b className="stat-fav">{rowName(top)}</b><span>{times(top.count)}{topP ? ` · аромат: ${topP.perfume!.name} (${times(topP.count)})` : ''}</span></> : <span>За период ничего не надевали</span>}
        </div>
      </div>

      <div className="stats-grid">
        <section className="panel stats-panel" data-testid="stats-items">
          <div className="panel-head">
            <h2 className="panel-title">Вещи <span className="count">{itemRows.length}</span></h2>
            <select className="input input-sm stats-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Сортировка">
              {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          {usedCats.length > 1 && (
            <div className="chips stats-cats">
              <button className={`chip chip-sm ${!cat ? 'is-on' : ''}`} onClick={() => setCat('')}>Все</button>
              {usedCats.map((c) => <button key={c} className={`chip chip-sm ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_BY_ID[c].plural}</button>)}
            </div>
          )}
          {itemRows.length ? (
            <ol className="usage-list">
              {(allItems ? itemRows : itemRows.slice(0, 10)).map((r, i) => (
                <UsageLine key={r.id} r={r} rank={sort === 'most' ? i + 1 : undefined} max={maxItem} onClick={() => openItem(r.item!)} />
              ))}
            </ol>
          ) : <p className="muted small">За этот период вещи не отмечены.</p>}
          {itemRows.length > 10 && <button className="link-btn small" onClick={() => setAllItems((v) => !v)}>{allItems ? 'Свернуть' : `Показать все (${itemRows.length})`}</button>}
          {s.deletedItemWears > 0 && <p className="muted small stats-deleted">Ещё {times(s.deletedItemWears)} — удалённые вещи (в списке не показаны).</p>}
        </section>

        <section className="panel stats-panel" data-testid="stats-perfumes">
          <div className="panel-head">
            <h2 className="panel-title">Ароматы <span className="count">{perfRows.length}</span></h2>
          </div>
          {perfRows.length ? (
            <ol className="usage-list">
              {(allPerf ? perfRows : perfRows.slice(0, 8)).map((r, i) => (
                <UsageLine key={r.id} r={r} rank={sort === 'most' ? i + 1 : undefined} max={maxPerf} onClick={() => setOpenPerfume(openPerfume === r.id ? null : r.id)} />
              ))}
            </ol>
          ) : <p className="muted small">{perfumes.length ? 'За этот период ароматы не отмечены.' : 'На полке пока нет ароматов.'}</p>}
          {perfRows.length > 8 && <button className="link-btn small" onClick={() => setAllPerf((v) => !v)}>{allPerf ? 'Свернуть' : `Показать все (${perfRows.length})`}</button>}
          {s.deletedPerfumeWears > 0 && <p className="muted small stats-deleted">Ещё {times(s.deletedPerfumeWears)} — удалённые ароматы.</p>}

          <h3 className="panel-sub">По категориям</h3>
          <div className="cat-bars" data-testid="stats-categories">
            {s.byCategory.map((c) => (
              <button key={c.category} className={`cat-bar ${cat === c.category ? 'is-on' : ''}`} onClick={() => setCat(cat === c.category ? '' : c.category)} title={`${c.worn} из ${c.items} вещей надевали`}>
                <span className="cat-bar-label">{CATEGORY_BY_ID[c.category].plural}</span>
                <span className="cat-bar-track"><span className="cat-bar-fill" style={{ width: `${(c.wears / maxCat) * 100}%` }} /></span>
                <span className="cat-bar-num">{c.wears}</span>
                <span className="cat-bar-sub muted">{c.worn}/{c.items}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="panel never-panel" data-testid="stats-never">
        <div className="panel-head">
          <h2 className="panel-title">Ни разу не надевал <span className="count">{never.length + (cat ? 0 : s.neverPerfumes.length)}</span></h2>
          <span className="muted small">{periodLabel}{cat ? ` · ${CATEGORY_BY_ID[cat].plural}` : ''}</span>
        </div>
        {never.length || (!cat && s.neverPerfumes.length) ? (
          <div className="never-grid">
            {never.map((it) => <NeverTile key={it.id} item={it} onClick={() => openItem(it)} />)}
            {!cat && s.neverPerfumes.map((p) => <NeverTile key={p.id} perfume={p} />)}
          </div>
        ) : <p className="muted small">Всё из гардероба хоть раз надевали — отлично!</p>}
      </section>
    </div>
  );
}

function UsageLine({ r, rank, max, onClick }: { r: UsageRow; rank?: number; max: number; onClick?: () => void }) {
  const it = r.item;
  return (
    <li>
      <button className="usage-row" onClick={onClick} data-testid="usage-row" data-count={r.count}>
        {rank !== undefined && <span className="usage-rank">{rank}</span>}
        <span className={`usage-thumb ${it ? 'checker' : ''}`}>
          {it ? <img src={it.imageDataUrl} alt="" loading="lazy" /> : r.perfume && <PerfumeBottle perfume={r.perfume} className="bottle-xs" />}
        </span>
        <span className="usage-info">
          <span className="usage-name">{rowName(r)}</span>
          <span className="usage-meta muted">
            {it ? kindLabel(it, CATEGORY_BY_ID[it.category].label) : r.perfume ? (FAMILY_BY_ID[r.perfume.family] ?? FAMILY_BY_ID.other).label : ''} · последний — {relativeDay(r.last)}
          </span>
          <span className="usage-bar"><span style={{ width: `${(r.count / max) * 100}%` }} /></span>
        </span>
        <span className="usage-count" title={`с ${formatDay(r.first, { short: true })}`}><b>{r.count}</b><small>{pluralRu(r.count, 'раз', 'раза', 'раз')}</small></span>
      </button>
    </li>
  );
}

function NeverTile({ item, perfume, onClick }: { item?: Item; perfume?: Perfume; onClick?: () => void }) {
  const label = item ? item.name || kindLabel(item, CATEGORY_BY_ID[item.category].label) : perfume!.name;
  return (
    <button className="never-tile" onClick={onClick} title={label} disabled={!onClick}>
      <span className={`never-img ${item ? 'checker' : ''}`}>
        {item ? <img src={item.imageDataUrl} alt="" loading="lazy" /> : <PerfumeBottle perfume={perfume!} className="bottle-xs" />}
      </span>
      <span className="never-name">{label}</span>
    </button>
  );
}
