import { Stage } from '../components/Stage';
import { Empty } from '../components/Empty';
import { useStore } from '../store';
import { useApp } from '../nav';
import { useUI } from '../ui';
import { formatDate, pluralRu } from '../lib/util';
import type { Outfit } from '../types';

export function OutfitsScreen() {
  const { outfits, itemsById, loadOutfit, deleteOutfit, prefs } = useStore();
  const { navigate } = useApp();
  const { confirm, toast } = useUI();

  const open = (o: Outfit) => {
    loadOutfit(o);
    navigate('builder');
  };

  const remove = async (o: Outfit) => {
    if (await confirm({ title: `Удалить образ «${o.name}»?`, text: 'Вещи останутся в гардеробе.', confirmText: 'Удалить', danger: true })) {
      await deleteOutfit(o.id);
      toast('Образ удалён');
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Образы</h1>
          <p className="page-sub">{outfits.length ? `${outfits.length} ${pluralRu(outfits.length, 'сохранённый образ', 'сохранённых образа', 'сохранённых образов')}` : 'Сохранённые образы появятся здесь'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('builder')}>Собрать образ</button>
      </header>
      {!outfits.length ? (
        <Empty
          title="Пока нет образов"
          text="Соберите образ на манекене и нажмите «Сохранить образ»."
          action={<button className="btn btn-primary" onClick={() => navigate('builder')}>Перейти к сбору</button>}
        />
      ) : (
        <div className="outfit-grid">
          {outfits.map((o) => {
            const present = o.layers.filter((l) => itemsById.has(l.itemId)).length;
            const missing = o.layers.length - present;
            return (
              <article key={o.id} className="outfit-card">
                <button className={`outfit-thumb ${prefs.sceneDark ? 'is-dark' : ''}`} onClick={() => open(o)} aria-label={`Открыть ${o.name}`}>
                  <Stage layers={o.layers} itemsById={itemsById} dark={prefs.sceneDark} />
                </button>
                <div className="outfit-meta">
                  <div>
                    <h3 className="outfit-name">{o.name}</h3>
                    <p className="muted small">
                      {formatDate(o.createdAt)} · {present} {pluralRu(present, 'вещь', 'вещи', 'вещей')}
                      {missing > 0 && ` · ${missing} удалено`}
                    </p>
                  </div>
                  <div className="outfit-actions">
                    <button className="btn btn-sm btn-ghost" onClick={() => open(o)}>Открыть</button>
                    <button className="icon-btn icon-btn-sm" aria-label="Удалить образ" title="Удалить" onClick={() => remove(o)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
