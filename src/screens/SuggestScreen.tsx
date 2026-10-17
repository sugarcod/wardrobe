import { useCallback, useEffect, useState } from 'react';
import { Stage } from '../components/Stage';
import { Empty } from '../components/Empty';
import { itemTitle } from '../components/OutfitTags';
import { CATEGORY_BY_ID, OCCASIONS, SEASONS, currentSeason } from '../constants';
import { suggestOutfit, suggestionTitle, type SuggestOptions, type Suggestion } from '../lib/outfit';
import { colorLabel, swatchStyle } from '../lib/colors';
import { useStore } from '../store';
import { useApp } from '../nav';
import { useUI } from '../ui';
import type { Occasion } from '../types';

export function SuggestScreen() {
  const { items, itemsById, setLayers, clearDraft, prefs } = useStore();
  const { navigate, pickFiles } = useApp();
  const { toast } = useUI();
  const autoSeason = currentSeason();
  const [opt, setOpt] = useState<SuggestOptions>({ season: autoSeason, occasion: 'daily' });
  const [sug, setSug] = useState<Suggestion | null>(null);

  const generate = useCallback(
    (o: SuggestOptions, avoid?: string) => setSug(suggestOutfit(items, o, avoid)),
    [items],
  );

  useEffect(() => {
    generate(opt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opt, items.length]);

  const apply = () => {
    if (!sug) return;
    clearDraft(false);
    setLayers(sug.layers);
    toast('Образ надет на манекен — можно подправить и сохранить', 'success');
    navigate('builder');
  };

  const picked = sug ? sug.layers.map((l) => itemsById.get(l.itemId)!).filter(Boolean) : [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Что надеть?</h1>
          <p className="page-sub">Подберём образ из ваших вещей с учётом сезона, повода и сочетания цветов.</p>
        </div>
      </header>

      {!items.length ? (
        <Empty title="Нужны вещи" text="Чтобы получить подборку, добавьте в гардероб хотя бы верх, низ (или платье) и обувь." action={<button className="btn btn-primary" onClick={pickFiles}>Добавить вещи</button>} />
      ) : (
        <div className="suggest">
          <div className="suggest-controls panel">
            <div className="field">
              <span className="field-label">Сезон</span>
              <div className="chips">
                {SEASONS.filter((s) => s.id !== 'all').map((s) => (
                  <button key={s.id} className={`chip ${opt.season === s.id ? 'is-on' : ''}`} onClick={() => setOpt({ ...opt, season: s.id as SuggestOptions['season'] })}>
                    {s.label}
                    {s.id === autoSeason && <span className="chip-note">сейчас</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">Повод</span>
              <div className="chips">
                {OCCASIONS.map((o) => (
                  <button key={o.id} className={`chip ${opt.occasion === o.id ? 'is-on' : ''}`} onClick={() => setOpt({ ...opt, occasion: o.id as Occasion })}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted small">
              Правила: платье или верх + низ, обувь, верхняя одежда в холодный сезон, иногда сумка и украшения.
              Нейтральные цвета сочетаются со всем, ярких — не больше двух.
            </p>
          </div>

          {sug ? (
            <div className="suggest-result">
              <div className={`stage-frame stage-frame-sm ${prefs.sceneDark ? 'is-dark' : ''}`}>
                <Stage layers={sug.layers} itemsById={itemsById} dark={prefs.sceneDark} />
              </div>
              <div className="suggest-info panel">
                <h2 className="panel-title serif">{suggestionTitle(opt)}</h2>
                <p className="muted">{sug.harmony}</p>
                <ul className="suggest-items">
                  {picked.map((it) => (
                    <li key={it.id}>
                      <div className="checker layer-thumb"><img src={it.imageDataUrl} alt="" /></div>
                      <div>
                        <div className="layer-name">{itemTitle(it)}</div>
                        <div className="muted small">
                          {CATEGORY_BY_ID[it.category].label}
                          {it.color && <> · <span className="swatch swatch-xs" style={swatchStyle(it.color)} /> {colorLabel(it.color)}</>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {sug.notes.length > 0 && (
                  <div className="notice">
                    {sug.notes.map((n) => <div key={n}>{n}</div>)}
                  </div>
                )}
                <div className="suggest-actions">
                  <button className="btn btn-ghost" onClick={() => generate(opt, sug.signature)}>↻ Ещё вариант</button>
                  <button className="btn btn-primary" onClick={apply}>Надеть на манекен</button>
                </div>
              </div>
            </div>
          ) : (
            <Empty title="Не получилось подобрать" text="Для выбранного сезона и повода не нашлось подходящих вещей. Проверьте теги сезона у вещей или выберите другой повод." />
          )}
        </div>
      )}
    </div>
  );
}
