import { CATEGORY_BY_ID, OCCASION_LABEL, SEASON_LABEL } from '../constants';
import { colorLabel, swatchStyle } from '../lib/colors';
import { harmonyText } from '../lib/outfit';
import type { Item } from '../types';

export function OutfitTags({ items }: { items: Item[] }) {
  if (!items.length) return null;
  const colors = [...new Set(items.map((i) => i.color).filter(Boolean))];
  const seasons = [...new Set(items.map((i) => i.season).filter((s) => s !== 'all'))];
  const occ = [...new Set(items.map((i) => i.occasion).filter(Boolean))] as NonNullable<Item['occasion']>[];
  const custom = [...new Set(items.flatMap((i) => i.tags))];
  return (
    <div className="outfit-tags">
      {colors.length > 0 && (
        <div className="kv">
          <span className="kv-k">Цвета</span>
          <div className="tag-row">
            {colors.map((c) => (
              <span key={c} className="tag"><span className="swatch swatch-xs" style={swatchStyle(c)} />{colorLabel(c)}</span>
            ))}
          </div>
        </div>
      )}
      <div className="kv">
        <span className="kv-k">Сезон</span>
        <div className="tag-row">
          {seasons.length ? seasons.map((s) => <span key={s} className="tag">{SEASON_LABEL[s]}</span>) : <span className="tag">Всесезон</span>}
        </div>
      </div>
      {occ.length > 0 && (
        <div className="kv">
          <span className="kv-k">Повод</span>
          <div className="tag-row">{occ.map((o) => <span key={o} className="tag">{OCCASION_LABEL[o]}</span>)}</div>
        </div>
      )}
      {custom.length > 0 && (
        <div className="kv">
          <span className="kv-k">Теги</span>
          <div className="tag-row">{custom.map((t) => <span key={t} className="tag">{t}</span>)}</div>
        </div>
      )}
      <p className="muted small harmony">{harmonyText(items.map((i) => i.color))}</p>
    </div>
  );
}

export function itemTitle(it: Item) {
  return it.name || CATEGORY_BY_ID[it.category].label;
}
