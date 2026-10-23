import { CategoryTabs, FilterBar, useFilter } from '../components/Filters';
import { ItemCard } from '../components/ItemCard';
import { Empty } from '../components/Empty';
import { MAX_FILE_MB } from '../constants';
import { useStore } from '../store';
import { useApp } from '../nav';
import { pluralRu } from '../lib/util';

export function WardrobeScreen() {
  const { items, draft, wearStats } = useStore();
  const { pickFiles, openItem } = useApp();
  const { filter, setFilter, result } = useFilter(items);
  const worn = new Set(draft.layers.map((l) => l.itemId));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Гардероб</h1>
          <p className="page-sub">
            {items.length ? `${items.length} ${pluralRu(items.length, 'вещь', 'вещи', 'вещей')}` : 'Здесь будут ваши вещи'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={pickFiles}>
          <PlusIcon /> Добавить вещи
        </button>
      </header>

      {!items.length ? (
        <button type="button" className="dropzone" onClick={pickFiles}>
          <Empty
            title="Загрузите первые вещи"
            text={
              <>
                Перетащите сюда фото одежды без фона (PNG или WebP с прозрачностью) или нажмите, чтобы выбрать файлы.
                <br />
                Можно сразу несколько, до {MAX_FILE_MB} МБ каждое.
              </>
            }
            action={<span className="btn btn-primary">Выбрать файлы</span>}
          />
        </button>
      ) : (
        <>
          <CategoryTabs items={items} value={filter.category} onChange={(c) => setFilter({ ...filter, category: c })} />
          <FilterBar filter={filter} setFilter={setFilter} />
          {result.length ? (
            <div className="grid">
              {result.map((it) => (
                <ItemCard key={it.id} item={it} active={worn.has(it.id)} stat={wearStats.get(it.id)} onClick={() => openItem(it)} />
              ))}
            </div>
          ) : (
            <Empty title="Ничего не нашлось" text="Попробуйте изменить фильтры или поиск." />
          )}
          <p className="drop-hint muted small">Подсказка: фото можно просто перетащить в окно.</p>
        </>
      )}
    </div>
  );
}

export function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  );
}
