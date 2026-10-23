import { useState } from 'react';
import { CATEGORIES, CATEGORY_DISPLAY_ORDER, CATEGORY_BY_ID, OCCASIONS, SEASONS } from '../constants';
import { COLORS, colorLabel, swatchStyle } from '../lib/colors';
import type { Category, Occasion, Season } from '../types';
import { LEVEL_LABEL, SUBTYPE_BY_ID, subtypesOf } from '../catalog';

export interface ItemFields {
  name: string;
  category: Category | '';
  subtype: string;
  color: string;
  season: Season;
  occasion: Occasion | '';
  tags: string[];
}

export interface Hints {
  category?: Category;
  subtype?: string;
  color?: string;
  season?: Season;
  occasion?: Occasion;
}

interface Props {
  value: ItemFields;
  onChange: (v: ItemFields) => void;
  hints?: Hints;
  showErrors?: boolean;
}

function HintBadge({ show }: { show: boolean }) {
  return show ? <span className="hint-badge" title="Предложено автоматически — проверьте">подсказка</span> : null;
}

function SubtypeChips({ list, value, onPick, caption }: { list: { id: string; label: string }[]; value: string; onPick: (v: string) => void; caption?: string }) {
  return (
    <div className="subtype-group">
      {caption && <span className="muted small">{caption}</span>}
      <div className="chips">
        {list.map((s) => (
          <button type="button" key={s.id} className={`chip chip-sm ${value === s.id ? 'is-on' : ''}`} onClick={() => onPick(value === s.id ? '' : s.id)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ItemForm({ value, onChange, hints, showErrors }: Props) {
  const set = <K extends keyof ItemFields>(k: K, v: ItemFields[K]) => onChange({ ...value, [k]: v });
  const [tagText, setTagText] = useState('');

  const addTag = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    set('tags', [...new Set([...value.tags, ...parts])]);
    setTagText('');
  };

  const ordered = CATEGORY_DISPLAY_ORDER.map((id) => CATEGORIES.find((c) => c.id === id)!);

  return (
    <div className="form">
      <label className="field">
        <span className="field-label">Название</span>
        <input className="input" value={value.name} placeholder="Например, льняная рубашка" maxLength={60} onChange={(e) => set('name', e.target.value)} />
      </label>

      <div className="field">
        <span className="field-label">
          Категория <span className="req">*</span>
          <HintBadge show={!!hints?.category && hints.category === value.category} />
        </span>
        <div className="chips">
          {ordered.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${value.category === c.id ? 'is-on' : ''}`}
              onClick={() => value.category !== c.id && onChange({ ...value, category: c.id, subtype: hints?.category === c.id && hints.subtype ? hints.subtype : '' })}
            >
              {c.label}
            </button>
          ))}
        </div>
        {showErrors && !value.category && <span className="field-error">Выберите категорию</span>}
        {hints?.category && hints.category !== value.category && (
          <button type="button" className="link-btn" onClick={() => onChange({ ...value, category: hints.category!, subtype: hints.subtype ?? '' })}>
            Подсказка по имени файла: {hints.subtype ? SUBTYPE_BY_ID[hints.subtype]?.label : CATEGORY_BY_ID[hints.category].label}
          </button>
        )}
      </div>

      {subtypesOf(value.category).length > 0 && (
        <div className="field" data-testid="subtype-field">
          <span className="field-label">
            Вид
            {value.subtype && SUBTYPE_BY_ID[value.subtype] && (
              <b className="field-value">
                · {SUBTYPE_BY_ID[value.subtype].level ? LEVEL_LABEL[SUBTYPE_BY_ID[value.subtype].level!] : SUBTYPE_BY_ID[value.subtype].zone.toLowerCase()}
              </b>
            )}
            <HintBadge show={!!hints?.subtype && hints.subtype === value.subtype} />
          </span>
          {value.category === 'top' ? (
            <>
              <SubtypeChips list={subtypesOf('top').filter((s) => s.level === 'base')} value={value.subtype} onPick={(v) => set('subtype', v)} caption="Базовый слой" />
              <SubtypeChips list={subtypesOf('top').filter((s) => s.level === 'mid')} value={value.subtype} onPick={(v) => set('subtype', v)} caption="Средний слой — поверх футболки" />
            </>
          ) : (
            <SubtypeChips list={subtypesOf(value.category)} value={value.subtype} onPick={(v) => set('subtype', v)} />
          )}
        </div>
      )}

      <div className="field">
        <span className="field-label">
          Цвет {value.color && <b className="field-value">· {colorLabel(value.color)}</b>}
          <HintBadge show={!!hints?.color && hints.color === value.color} />
        </span>
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`swatch ${value.color === c.id ? 'is-on' : ''}`}
              style={swatchStyle(c.id)}
              title={c.label}
              aria-label={c.label}
              onClick={() => set('color', value.color === c.id ? '' : c.id)}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          Сезон <HintBadge show={!!hints?.season && hints.season === value.season} />
        </span>
        <div className="chips">
          {SEASONS.map((s) => (
            <button type="button" key={s.id} className={`chip ${value.season === s.id ? 'is-on' : ''}`} onClick={() => set('season', s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          Повод <HintBadge show={!!hints?.occasion && hints.occasion === value.occasion} />
        </span>
        <div className="chips">
          <button type="button" className={`chip ${!value.occasion ? 'is-on' : ''}`} onClick={() => set('occasion', '')}>Любой</button>
          {OCCASIONS.map((o) => (
            <button type="button" key={o.id} className={`chip ${value.occasion === o.id ? 'is-on' : ''}`} onClick={() => set('occasion', o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Свои теги</span>
        <div className="tag-input">
          {value.tags.map((t) => (
            <span key={t} className="tag tag-removable">
              {t}
              <button type="button" aria-label={`Удалить тег ${t}`} onClick={() => set('tags', value.tags.filter((x) => x !== t))}>×</button>
            </span>
          ))}
          <input
            value={tagText}
            placeholder={value.tags.length ? '' : 'лён, оверсайз, любимое…'}
            onChange={(e) => (e.target.value.endsWith(',') ? addTag(e.target.value) : setTagText(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(tagText); }
              if (e.key === 'Backspace' && !tagText && value.tags.length) set('tags', value.tags.slice(0, -1));
            }}
            onBlur={() => addTag(tagText)}
          />
        </div>
      </div>
    </div>
  );
}
