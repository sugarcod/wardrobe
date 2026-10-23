import { useMemo, useState } from 'react';
import { Look } from '../components/Look';
import { PerfumeChips } from '../components/PerfumePicker';
import { PerfumeBottle } from '../components/PerfumeBottle';
import { itemTitle } from '../components/OutfitTags';
import { Empty } from '../components/Empty';
import { MOOD_LABEL, WEATHER_LABEL } from '../perfume';
import { useStore } from '../store';
import { useApp } from '../nav';
import { useUI } from '../ui';
import { MONTHS_RU, WEEKDAYS_RU, formatDay, monthGrid, parseISODate, pluralRu, todayISO } from '../lib/util';
import type { DiaryEntry } from '../types';
import { PlusIcon } from './WardrobeScreen';

type View = 'calendar' | 'feed';

export function DiaryScreen() {
  const { diary, itemsById, perfumesById, prefs } = useStore();
  const { recordDiary } = useApp();
  const today = todayISO();
  const [view, setView] = useState<View>('calendar');
  const [selected, setSelected] = useState(today);
  const [ym, setYm] = useState(() => {
    const d = parseISODate(today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [feedLimit, setFeedLimit] = useState(20);

  const byDate = useMemo(() => {
    const m = new Map<string, DiaryEntry[]>();
    for (const e of diary) {
      const list = m.get(e.date);
      if (list) list.push(e);
      else m.set(e.date, [e]);
    }
    return m;
  }, [diary]);

  const grid = monthGrid(ym.y, ym.m);
  const shift = (d: number) => setYm(({ y, m }) => {
    const n = new Date(y, m + d, 1);
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const goToday = () => {
    const d = parseISODate(today);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  };
  const monthCount = grid.filter((c) => c.inMonth).reduce((s, c) => s + (byDate.get(c.iso)?.length ?? 0), 0);
  const dayEntries = byDate.get(selected) ?? [];
  const days = [...byDate.keys()].sort().reverse();

  return (
    <div className="page diary-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Дневник</h1>
          <p className="page-sub">
            {diary.length ? `${diary.length} ${pluralRu(diary.length, 'запись', 'записи', 'записей')} · что было надето и каким ароматом` : 'Отмечайте, что надели и каким ароматом — по дням'}
          </p>
        </div>
        <div className="row-gap">
          <div className="seg" role="group" aria-label="Вид">
            <button className={view === 'calendar' ? 'is-on' : ''} onClick={() => setView('calendar')}>Календарь</button>
            <button className={view === 'feed' ? 'is-on' : ''} onClick={() => setView('feed')}>Лента</button>
          </div>
          <button className="btn btn-primary" onClick={() => recordDiary({ date: today, source: 'calendar' })}><PlusIcon /> Сегодня</button>
        </div>
      </header>

      {view === 'calendar' ? (
        <div className="diary-cal-layout">
          <section className="panel calendar" data-testid="calendar">
            <div className="cal-head">
              <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => shift(-1)}>‹</button>
              <div className="cal-title">
                <b>{MONTHS_RU[ym.m]} {ym.y}</b>
                <span className="muted small">{monthCount ? `${monthCount} ${pluralRu(monthCount, 'запись', 'записи', 'записей')}` : 'нет записей'}</span>
              </div>
              <button className="icon-btn" aria-label="Следующий месяц" onClick={() => shift(1)}>›</button>
              <button className="link-btn small cal-today" onClick={goToday}>Сегодня</button>
            </div>
            <div className="cal-grid">
              {WEEKDAYS_RU.map((w, i) => <div key={w} className={`cal-wd ${i >= 5 ? 'is-weekend' : ''}`}>{w}</div>)}
              {grid.map((c) => {
                const es = byDate.get(c.iso) ?? [];
                const first = es.find((e) => e.layers.some((l) => itemsById.has(l.itemId))) ?? es[0];
                const pf = first?.perfumeIds.map((id) => perfumesById.get(id)).find(Boolean);
                return (
                  <button
                    key={c.iso}
                    className={`cal-day ${c.inMonth ? '' : 'is-out'} ${c.iso === today ? 'is-today' : ''} ${c.iso === selected ? 'is-selected' : ''} ${es.length ? 'has-entries' : ''}`}
                    onClick={() => {
                      setSelected(c.iso);
                      if (!c.inMonth) { const d = parseISODate(c.iso); setYm({ y: d.getFullYear(), m: d.getMonth() }); }
                    }}
                    aria-label={`${formatDay(c.iso)}${es.length ? `, ${es.length} ${pluralRu(es.length, 'запись', 'записи', 'записей')}` : ''}`}
                    data-date={c.iso}
                  >
                    <span className="cal-num">{parseISODate(c.iso).getDate()}</span>
                    {first && (first.layers.some((l) => itemsById.has(l.itemId)) ? (
                      <span className="cal-thumb"><Look variant="compact" layers={first.layers} itemsById={itemsById} maxCells={2} /></span>
                    ) : pf ? (
                      <span className="cal-thumb cal-thumb-perfume"><PerfumeBottle perfume={pf} className="bottle-xs" /></span>
                    ) : (
                      <span className="cal-dot" />
                    ))}
                    {es.length > 1 && <span className="cal-count">{es.length}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel day-panel" data-testid="day-panel">
            <div className="panel-head">
              <h2 className="panel-title day-title">{formatDay(selected, { weekday: true })}</h2>
              <button className="btn btn-sm btn-ghost" onClick={() => recordDiary({ date: selected, source: 'calendar' })}><PlusIcon /> Добавить</button>
            </div>
            {dayEntries.length ? (
              <div className="day-entries">
                {dayEntries.map((e) => <DiaryCard key={e.id} entry={e} dark={prefs.sceneDark} />)}
              </div>
            ) : (
              <p className="muted small">В этот день записей нет. Нажмите «Добавить», чтобы отметить образ и аромат.</p>
            )}
          </section>
        </div>
      ) : diary.length ? (
        <div className="feed">
          {days.slice(0, feedLimit).map((d) => (
            <section key={d} className="feed-day">
              <h2 className="feed-date">{formatDay(d, { weekday: true, short: true })}</h2>
              <div className="day-entries feed-entries">
                {byDate.get(d)!.map((e) => <DiaryCard key={e.id} entry={e} dark={prefs.sceneDark} />)}
              </div>
            </section>
          ))}
          {days.length > feedLimit && <button className="btn btn-ghost" onClick={() => setFeedLimit((n) => n + 20)}>Показать ещё</button>}
        </div>
      ) : (
        <Empty
          title="Дневник пуст"
          text="Соберите образ и нажмите «Записать в дневник» — или отметьте сохранённый образ кнопкой «Носил(а) сегодня»."
          action={<button className="btn btn-primary" onClick={() => recordDiary({ date: today, source: 'calendar' })}>Записать сегодня</button>}
        />
      )}
    </div>
  );
}

function DiaryCard({ entry, dark }: { entry: DiaryEntry; dark: boolean }) {
  const { itemsById, outfits, deleteDiary, clearDraft, setLayers, setDraftPerfumes } = useStore();
  const { recordDiary, navigate } = useApp();
  const { confirm, toast } = useUI();
  const present = entry.layers.filter((l) => itemsById.has(l.itemId));
  const missing = entry.layers.length - present.length;
  const outfit = entry.outfitId ? outfits.find((o) => o.id === entry.outfitId) : undefined;

  const remove = async () => {
    if (!(await confirm({ title: 'Удалить запись?', text: `${formatDay(entry.date)}. Вещи и ароматы останутся.`, confirmText: 'Удалить', danger: true }))) return;
    await deleteDiary(entry.id);
    toast('Запись удалена');
  };
  const wearAgain = () => {
    clearDraft(false);
    setLayers(present);
    setDraftPerfumes(entry.perfumeIds);
    navigate('builder');
  };

  return (
    <article className="diary-card" data-testid="diary-entry">
      {present.length > 0 && (
        <button className={`diary-thumb ${dark ? 'is-dark' : ''}`} onClick={wearAgain} title="Надеть снова">
          <Look variant="compact" layers={present} itemsById={itemsById} dark={dark} maxCells={4} />
        </button>
      )}
      <div className="diary-body">
        {outfit && <div className="diary-outfit">{outfit.name}</div>}
        {present.length > 0 && (
          <p className="diary-items">
            {present.map((l) => itemTitle(itemsById.get(l.itemId)!)).join(' · ')}
            {missing > 0 && <span className="muted"> · {missing} {pluralRu(missing, 'вещь удалена', 'вещи удалены', 'вещей удалено')}</span>}
          </p>
        )}
        <PerfumeChips ids={entry.perfumeIds} />
        {(entry.mood || entry.weather) && (
          <div className="tag-row">
            {entry.mood && <span className="tag">{MOOD_LABEL[entry.mood]}</span>}
            {entry.weather && <span className="tag">{WEATHER_LABEL[entry.weather]}</span>}
          </div>
        )}
        {entry.note && <p className="diary-note">{entry.note}</p>}
        <div className="diary-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => recordDiary({ entry })}>Изменить</button>
          {present.length > 0 && <button className="btn btn-sm btn-ghost" onClick={wearAgain}>Надеть снова</button>}
          <button className="icon-btn icon-btn-sm" aria-label="Удалить запись" title="Удалить" onClick={remove}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
          </button>
        </div>
      </div>
    </article>
  );
}
