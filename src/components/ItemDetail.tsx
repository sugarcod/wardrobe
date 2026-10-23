import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { ItemForm, type ItemFields } from './ItemForm';
import { BgFixer } from './BgFixer';
import { ZoomViewer } from './ZoomViewer';
import { SCALE_MAX, SCALE_MIN, clampScale, stepScale } from '../lib/outfit';
import { validateFile } from '../lib/image';
import { processFile, type Processed } from '../lib/process';
import { CATEGORY_BY_ID } from '../constants';
import { relativeDay, formatDate, pluralRu } from '../lib/util';
import { useStore } from '../store';
import { useUI } from '../ui';
import type { Item } from '../types';

interface Props {
  item: Item;
  onClose: () => void;
  onWear: (item: Item) => void;
}

export function ItemDetail({ item, onClose, onWear }: Props) {
  const { updateItem, deleteItem, outfits, draft, wearStats, updateLayer } = useStore();
  const stat = wearStats.get(item.id);
  const { toast, confirm } = useUI();
  const [fields, setFields] = useState<ItemFields>({
    name: item.name,
    category: item.category,
    subtype: item.subtype ?? '',
    color: item.color,
    season: item.season,
    occasion: item.occasion ?? '',
    tags: item.tags,
  });
  const [image, setImage] = useState(item.imageDataUrl);
  const [defScale, setDefScale] = useState(item.defaultScale ?? 1);
  const [replacement, setReplacement] = useState<Processed | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const worn = draft.layers.some((l) => l.itemId === item.id);

  const onReplace = async (f: File | undefined) => {
    if (!f) return;
    const err = validateFile(f);
    if (err) return toast(err, 'error');
    try {
      const p = await processFile(f);
      setReplacement(p.needsBg ? p : null);
      setImage(p.dataUrl);
    } catch {
      toast('Не удалось прочитать изображение.', 'error');
    }
  };

  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!fields.category) return toast('Выберите категорию.', 'error');
    const next: Item = {
      ...item,
      name: fields.name.trim(),
      category: fields.category,
      subtype: fields.subtype || undefined,
      color: fields.color,
      season: fields.season,
      tags: fields.tags,
      imageDataUrl: image,
    };
    if (!next.subtype) delete next.subtype;
    if (defScale !== 1) next.defaultScale = clampScale(defScale);
    else delete next.defaultScale;
    if (fields.occasion) next.occasion = fields.occasion;
    else delete next.occasion;
    setBusy(true);
    const ok = await updateItem(next);
    setBusy(false);
    if (ok) {
      // новый размер по умолчанию сразу применяется к вещи на манекене
      const prev = item.defaultScale ?? 1;
      const onDraft = draft.layers.find((l) => l.itemId === item.id);
      if (onDraft && defScale !== prev && Math.abs(onDraft.scale - prev) < 0.005) updateLayer(item.id, { scale: clampScale(defScale) });
      toast('Изменения сохранены', 'success');
      onClose();
    }
  };

  const remove = async () => {
    const used = outfits.filter((o) => o.layers.some((l) => l.itemId === item.id)).length;
    const ok = await confirm({
      title: 'Удалить вещь?',
      text: used
        ? `Вещь используется в ${used} ${pluralRu(used, 'образе', 'образах', 'образах')} — из них она пропадёт. Действие нельзя отменить.`
        : 'Действие нельзя отменить.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (ok) {
      await deleteItem(item.id);
      toast('Вещь удалена');
      onClose();
    }
  };

  return (
    <Modal title={item.name || CATEGORY_BY_ID[item.category].label} size="lg" onClose={onClose}>
      <div className="detail">
        <div className="detail-media">
          <ZoomViewer key={image.length} src={image} alt={item.name} className="checker detail-preview" />
          <div className="range-row zoom-row default-scale" data-testid="default-scale">
            <span title="С этим размером вещь надевается на манекен">Размер на манекене</span>
            <button type="button" className="zoom-btn zoom-btn-sm" aria-label="Меньше на манекене" disabled={defScale <= SCALE_MIN} onClick={() => setDefScale(stepScale(defScale, -1))}>−</button>
            <input type="range" min={SCALE_MIN} max={SCALE_MAX} step={0.05} value={defScale} aria-label="Размер на манекене" onChange={(e) => setDefScale(clampScale(Number(e.target.value)))} />
            <button type="button" className="zoom-btn zoom-btn-sm" aria-label="Больше на манекене" disabled={defScale >= SCALE_MAX} onClick={() => setDefScale(stepScale(defScale, 1))}>+</button>
            <button type="button" className="link-btn small zoom-val" title="Вернуть 100%" onClick={() => setDefScale(1)} data-testid="default-scale-val">{Math.round(defScale * 100)}%</button>
          </div>
          <div className="detail-media-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Заменить фото</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { onWear(item); onClose(); }}>
              {worn ? 'Открыть на манекене' : 'Надеть на манекен'}
            </button>
            <input ref={fileRef} type="file" hidden accept="image/png,image/webp,image/jpeg" onChange={(e) => { onReplace(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {replacement && (
            <BgFixer key={replacement.sourceDataUrl.length} sourceDataUrl={replacement.sourceDataUrl} onChange={(r) => setImage(r.dataUrl)} />
          )}
          <p className="muted small">Добавлено {formatDate(item.createdAt)}</p>
          <p className="wear-stat small" data-testid="item-wear-stat">
            {stat ? <>Надевали {stat.count} {pluralRu(stat.count, 'раз', 'раза', 'раз')}, последний — {relativeDay(stat.last)}</> : 'В дневнике пока не отмечена'}
          </p>
        </div>
        <div className="detail-form">
          <ItemForm value={fields} onChange={setFields} showErrors />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-danger-ghost" onClick={remove}>Удалить</button>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>Сохранить</button>
      </div>
    </Modal>
  );
}
