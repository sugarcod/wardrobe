import { CATEGORY_BY_ID, OCCASION_LABEL, SEASON_LABEL } from '../constants';
import { colorLabel, swatchStyle } from '../lib/colors';
import type { Item } from '../types';

export function itemTags(item: Item): string[] {
  const t: string[] = [];
  if (item.color) t.push(colorLabel(item.color));
  if (item.season) t.push(SEASON_LABEL[item.season]);
  if (item.occasion) t.push(OCCASION_LABEL[item.occasion]);
  return [...t, ...item.tags];
}

interface Props {
  item: Item;
  onClick?: () => void;
  compact?: boolean;
  active?: boolean;
  badge?: string;
}

export function ItemCard({ item, onClick, compact, active, badge }: Props) {
  const tags = itemTags(item).slice(0, compact ? 0 : 3);
  return (
    <button type="button" className={`item-card ${compact ? 'item-card-compact' : ''} ${active ? 'is-active' : ''}`} onClick={onClick} title={item.name || CATEGORY_BY_ID[item.category].label}>
      <div className="checker item-card-img">
        <img src={item.imageDataUrl} alt={item.name} loading="lazy" draggable={false} />
        {active && <span className="item-card-check" aria-label="Надето">✓</span>}
        {badge && <span className="item-card-badge">{badge}</span>}
      </div>
      {!compact && (
        <div className="item-card-meta">
          <div className="item-card-row">
            <span className="item-card-cat">{CATEGORY_BY_ID[item.category].label}</span>
            {item.color && <span className="swatch swatch-sm" style={swatchStyle(item.color)} />}
          </div>
          {item.name && <div className="item-card-name">{item.name}</div>}
          <div className="tag-row">
            {tags.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}
