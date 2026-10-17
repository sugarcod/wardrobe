import { useEffect, useMemo, useState } from 'react';
import { Stage, MAX_OFFSET } from '../components/Stage';
import { CategoryTabs } from '../components/Filters';
import { ItemCard } from '../components/ItemCard';
import { Empty } from '../components/Empty';
import { Modal } from '../components/Modal';
import { OutfitTags, itemTitle } from '../components/OutfitTags';
import { CATEGORY_BY_ID } from '../constants';
import { useStore } from '../store';
import { useApp } from '../nav';
import { useUI } from '../ui';
import { clamp, formatDate, normalizeText } from '../lib/util';
import { colorLabel } from '../lib/colors';
import type { Category } from '../types';
import { PlusIcon } from './WardrobeScreen';

export function BuilderScreen() {
  const { items, itemsById, draft, outfits, prefs, setPrefs, wearItem, updateLayer, removeLayer, clearDraft, saveOutfit } = useStore();
  const { pickFiles, navigate } = useApp();
  const { toast, confirm } = useUI();
  const [cat, setCat] = useState<Category | ''>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editing = draft.editingId ? outfits.find((o) => o.id === draft.editingId) : undefined;
  const worn = new Set(draft.layers.map((l) => l.itemId));
  const layers = draft.layers;
  const wornItems = layers.map((l) => itemsById.get(l.itemId)!).filter(Boolean);
  const sel = layers.find((l) => l.itemId === selected);

  const list = useMemo(() => {
    const nq = normalizeText(q.trim());
    return [...items]
      .filter((i) => !cat || i.category === cat)
      .filter((i) => !nq || normalizeText([i.name, colorLabel(i.color), CATEGORY_BY_ID[i.category].label, ...i.tags].join(' ')).includes(nq))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items, cat, q]);

  useEffect(() => {
    if (selected && !layers.some((l) => l.itemId === selected)) setSelected(null);
  }, [layers, selected]);

  // стрелки клавиатуры двигают выбранный слой
  useEffect(() => {
    if (!sel) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const step = e.shiftKey ? 0.02 : 0.005;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        updateLayer(sel.itemId, { x: clamp(sel.x + d[0], -MAX_OFFSET, MAX_OFFSET), y: clamp(sel.y + d[1], -MAX_OFFSET, MAX_OFFSET) });
      }
      if (e.key === 'Delete' || e.key === 'Backspace') removeLayer(sel.itemId);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [sel, updateLayer, removeLayer]);

  const nudge = (dx: number, dy: number) =>
    sel && updateLayer(sel.itemId, { x: clamp(sel.x + dx, -MAX_OFFSET, MAX_OFFSET), y: clamp(sel.y + dy, -MAX_OFFSET, MAX_OFFSET) });

  const takeOffAll = async () => {
    if (layers.length > 2 && !(await confirm({ title: 'Снять всё?', text: 'Манекен останется пустым. Сохранённые образы не изменятся.', confirmText: 'Снять всё' }))) return;
    clearDraft();
    setSelected(null);
  };

  const startNew = () => {
    clearDraft(false);
    setSelected(null);
  };

  return (
    <div className="builder">
      <aside className="panel builder-wardrobe">
        <div className="panel-head">
          <h2 className="panel-title">Гардероб</h2>
          <button className="icon-btn" title="Добавить вещи" aria-label="Добавить вещи" onClick={pickFiles}><PlusIcon /></button>
        </div>
        {items.length ? (
          <>
            <CategoryTabs items={items} value={cat} onChange={setCat} hideEmpty />
            <input className="input input-sm builder-search" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="builder-items">
              {list.map((it) => (
                <ItemCard key={it.id} item={it} compact active={worn.has(it.id)} onClick={() => { wearItem(it); setSelected(worn.has(it.id) ? null : it.id); }} />
              ))}
              {!list.length && <p className="muted small pad">Ничего не нашлось</p>}
            </div>
          </>
        ) : (
          <Empty title="Пока пусто" text="Добавьте фото вещей без фона — и надевайте их на манекен." action={<button className="btn btn-primary btn-sm" onClick={pickFiles}>Добавить вещи</button>} />
        )}
      </aside>

      <section className="builder-stage">
        <div className="stage-toolbar">
          <div className="stage-title">
            {editing ? (
              <>
                <span className="muted small">Редактирование</span>
                <b>{editing.name}</b>
                <button className="link-btn small" onClick={startNew}>Новый образ</button>
              </>
            ) : (
              <span className="muted small">Новый образ</span>
            )}
          </div>
          <div className="seg" role="group" aria-label="Фон сцены">
            <button className={!prefs.sceneDark ? 'is-on' : ''} onClick={() => setPrefs({ sceneDark: false })}>Светлый</button>
            <button className={prefs.sceneDark ? 'is-on' : ''} onClick={() => setPrefs({ sceneDark: true })}>Тёмный</button>
          </div>
        </div>
        <div className={`stage-frame ${prefs.sceneDark ? 'is-dark' : ''}`}>
          <Stage
            layers={layers}
            itemsById={itemsById}
            dark={prefs.sceneDark}
            interactive
            selectedId={selected}
            onSelect={setSelected}
            onMove={(id, x, y) => updateLayer(id, { x, y })}
          />
          {!layers.length && (
            <div className="stage-hint">
              {items.length ? 'Нажмите на вещь в гардеробе, чтобы надеть её' : 'Сначала добавьте вещи в гардероб'}
            </div>
          )}
        </div>
        <p className="muted small stage-help">Перетаскивайте вещь на манекене, чтобы подвинуть. Стрелки — точная подстройка.</p>
      </section>

      <aside className="panel builder-side">
        <div className="panel-head">
          <h2 className="panel-title">Слои {layers.length ? <span className="count">{layers.length}</span> : null}</h2>
          {layers.length > 0 && <button className="link-btn small" onClick={takeOffAll}>Снять всё</button>}
        </div>
        {layers.length ? (
          <ul className="layers">
            {[...layers].reverse().map((l) => {
              const it = itemsById.get(l.itemId)!;
              const info = CATEGORY_BY_ID[it.category];
              const isSel = selected === l.itemId;
              return (
                <li key={l.itemId} className={`layer ${isSel ? 'is-selected' : ''}`}>
                  <div className="layer-row" onClick={() => setSelected(isSel ? null : l.itemId)}>
                    <div className="checker layer-thumb"><img src={it.imageDataUrl} alt="" /></div>
                    <div className="layer-info">
                      <div className="layer-name">{itemTitle(it)}</div>
                      <div className="muted small">{info.label} · {info.zone}</div>
                    </div>
                    <button className="icon-btn icon-btn-sm" aria-label="Снять" title="Снять" onClick={(e) => { e.stopPropagation(); removeLayer(l.itemId); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                  {isSel && (
                    <div className="layer-controls">
                      <label className="range-row">
                        <span>Размер</span>
                        <input type="range" min={0.5} max={1.6} step={0.01} value={l.scale} onChange={(e) => updateLayer(l.itemId, { scale: Number(e.target.value) })} />
                        <span className="muted">{Math.round(l.scale * 100)}%</span>
                      </label>
                      <div className="layer-btns">
                        <button className={`chip ${l.flip ? 'is-on' : ''}`} onClick={() => updateLayer(l.itemId, { flip: !l.flip })}>⇋ Отразить</button>
                        <div className="nudge">
                          <button aria-label="Влево" onClick={() => nudge(-0.01, 0)}>←</button>
                          <button aria-label="Вверх" onClick={() => nudge(0, -0.01)}>↑</button>
                          <button aria-label="Вниз" onClick={() => nudge(0, 0.01)}>↓</button>
                          <button aria-label="Вправо" onClick={() => nudge(0.01, 0)}>→</button>
                        </div>
                        <button className="link-btn small" onClick={() => updateLayer(l.itemId, { x: 0, y: 0, scale: 1, flip: false })}>Сбросить</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small">На манекене ничего нет. Надетые вещи появятся здесь — сверху вниз по слоям.</p>
        )}

        {wornItems.length > 0 && (
          <>
            <h3 className="panel-sub">Теги образа</h3>
            <OutfitTags items={wornItems} />
          </>
        )}

        <div className="side-actions">
          <button className="btn btn-primary btn-block" disabled={!layers.length} onClick={() => setSaving(true)}>
            {editing ? 'Сохранить образ…' : 'Сохранить образ'}
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => navigate('suggest')}>✦ Что надеть?</button>
        </div>
      </aside>

      {saving && (
        <SaveDialog
          initialName={editing?.name ?? `Образ ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}
          editing={!!editing}
          itemsCount={layers.length}
          names={wornItems.map(itemTitle)}
          onClose={() => setSaving(false)}
          onSave={(name, asNew) => {
            const o = saveOutfit(name, asNew);
            if (o) {
              toast(`Образ «${o.name}» сохранён`, 'success');
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

interface SaveProps {
  initialName: string;
  editing: boolean;
  itemsCount: number;
  names: string[];
  onClose: () => void;
  onSave: (name: string, asNew: boolean) => void;
}

function SaveDialog({ initialName, editing, names, onClose, onSave }: SaveProps) {
  const [name, setName] = useState(initialName);
  const n = name.trim() || 'Без названия';
  return (
    <Modal title={editing ? 'Сохранить изменения' : 'Сохранить образ'} size="sm" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(n, false); }} className="form">
        <label className="field">
          <span className="field-label">Название</span>
          <input autoFocus className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">Дата</span>
          <span>{formatDate(new Date().toISOString())}</span>
        </div>
        <div className="field">
          <span className="field-label">Вещи</span>
          <span className="muted">{names.join(', ')}</span>
        </div>
        <div className="modal-actions">
          {editing && <button type="button" className="btn btn-ghost" onClick={() => onSave(n, true)}>Как новый</button>}
          <button type="submit" className="btn btn-primary">{editing ? 'Обновить' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}
