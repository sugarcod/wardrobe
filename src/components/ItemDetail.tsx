import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { ItemForm, type ItemFields } from './ItemForm';
import { BgFixer } from './BgFixer';
import { validateFile } from '../lib/image';
import { processFile, type Processed } from '../lib/process';
import { CATEGORY_BY_ID } from '../constants';
import { formatDate, pluralRu } from '../lib/util';
import { useStore } from '../store';
import { useUI } from '../ui';
import type { Item } from '../types';

interface Props {
  item: Item;
  onClose: () => void;
  onWear: (item: Item) => void;
}

export function ItemDetail({ item, onClose, onWear }: Props) {
  const { updateItem, deleteItem, outfits, draft } = useStore();
  const { toast, confirm } = useUI();
  const [fields, setFields] = useState<ItemFields>({
    name: item.name,
    category: item.category,
    color: item.color,
    season: item.season,
    occasion: item.occasion ?? '',
    tags: item.tags,
  });
  const [image, setImage] = useState(item.imageDataUrl);
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
      color: fields.color,
      season: fields.season,
      tags: fields.tags,
      imageDataUrl: image,
    };
    if (fields.occasion) next.occasion = fields.occasion;
    else delete next.occasion;
    setBusy(true);
    const ok = await updateItem(next);
    setBusy(false);
    if (ok) {
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
          <div className="checker detail-preview">
            <img src={image} alt={item.name} />
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
