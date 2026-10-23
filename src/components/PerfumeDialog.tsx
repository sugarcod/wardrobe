import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { BgFixer } from './BgFixer';
import { PerfumeBottle } from './PerfumeBottle';
import { TagInput } from './TagInput';
import { OCCASIONS, SEASONS } from '../constants';
import { PERFUME_FAMILIES } from '../perfume';
import { validateFile } from '../lib/image';
import { processFile, type Processed } from '../lib/process';
import { pluralRu, relativeDay, uid } from '../lib/util';
import { useStore } from '../store';
import { useUI } from '../ui';
import type { Occasion, Perfume, PerfumeFamily, Season } from '../types';

export function PerfumeDialog({ perfume, onClose }: { perfume?: Perfume; onClose: () => void }) {
  const { savePerfume, deletePerfume, wearStats, diary } = useStore();
  const { toast, confirm } = useUI();
  const [name, setName] = useState(perfume?.name ?? '');
  const [brand, setBrand] = useState(perfume?.brand ?? '');
  const [family, setFamily] = useState<PerfumeFamily>(perfume?.family ?? 'other');
  const [season, setSeason] = useState<Season>(perfume?.season ?? 'all');
  const [occasion, setOccasion] = useState<Occasion | ''>(perfume?.occasion ?? '');
  const [tags, setTags] = useState<string[]>(perfume?.tags ?? []);
  const [image, setImage] = useState<string | undefined>(perfume?.imageDataUrl);
  const [bg, setBg] = useState<Processed | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stat = perfume ? wearStats.get(perfume.id) : undefined;

  const onFile = async (f?: File) => {
    if (!f) return;
    const e = validateFile(f);
    if (e) return toast(e, 'error');
    try {
      const p = await processFile(f);
      setBg(p.needsBg ? p : null);
      setImage(p.dataUrl);
    } catch {
      toast('Не удалось прочитать изображение.', 'error');
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setErr(true);
      return;
    }
    setBusy(true);
    const p: Perfume = {
      id: perfume?.id ?? uid(),
      name: name.trim(),
      brand: brand.trim(),
      family,
      season,
      tags,
      createdAt: perfume?.createdAt ?? new Date().toISOString(),
      ...(occasion ? { occasion } : {}),
      ...(image ? { imageDataUrl: image } : {}),
      ...(perfume?.imageRev && image === perfume.imageDataUrl ? { imageRev: perfume.imageRev } : {}),
    };
    const saved = await savePerfume(p);
    setBusy(false);
    if (saved) {
      toast(perfume ? 'Аромат сохранён' : `«${saved.name}» на полке`, 'success');
      onClose();
    }
  };

  const remove = async () => {
    if (!perfume) return;
    const used = diary.filter((e) => e.perfumeIds.includes(perfume.id)).length;
    const ok = await confirm({
      title: 'Убрать аромат с полки?',
      text: used ? `Он упоминается в ${used} ${pluralRu(used, 'записи', 'записях', 'записях')} дневника — там останется пометка «аромат удалён».` : 'Действие нельзя отменить.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    await deletePerfume(perfume.id);
    toast('Аромат удалён');
    onClose();
  };

  return (
    <Modal title={perfume ? perfume.name : 'Новый аромат'} size="lg" onClose={onClose}>
      <div className="detail">
        <div className="detail-media">
          <div className="checker detail-preview perfume-preview">
            <PerfumeBottle perfume={{ id: perfume?.id ?? 'new', name: name || 'Аромат', brand, family, imageDataUrl: image }} />
          </div>
          <div className="detail-media-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>{image ? 'Заменить фото' : 'Добавить фото'}</button>
            {image && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setImage(undefined); setBg(null); }}>Без фото</button>}
            <input ref={fileRef} type="file" hidden accept="image/png,image/webp,image/jpeg" data-testid="perfume-file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {bg && <BgFixer key={bg.sourceDataUrl.length} sourceDataUrl={bg.sourceDataUrl} onChange={(r) => setImage(r.dataUrl)} />}
          <p className="muted small">Фото необязательно: PNG без фона смотрится на полке лучше всего. Без фото нарисуем флакон.</p>
          {perfume && (
            <p className="wear-stat small" data-testid="perfume-wear-stat">
              {stat ? <>Носили {stat.count} {pluralRu(stat.count, 'раз', 'раза', 'раз')}, последний — {relativeDay(stat.last)}</> : 'В дневнике пока не отмечен'}
            </p>
          )}
        </div>
        <form className="form detail-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="field">
            <span className="field-label">Название <span className="req">*</span></span>
            <input className="input" autoFocus={!perfume} value={name} maxLength={60} placeholder="Например, Santal 33" onChange={(e) => setName(e.target.value)} name="perfume-name" />
            {err && !name.trim() && <span className="field-error">Введите название</span>}
          </label>
          <label className="field">
            <span className="field-label">Бренд</span>
            <input className="input" value={brand} maxLength={60} placeholder="Le Labo" onChange={(e) => setBrand(e.target.value)} name="perfume-brand" />
          </label>
          <div className="field">
            <span className="field-label">Семейство</span>
            <div className="chips">
              {PERFUME_FAMILIES.map((f) => (
                <button type="button" key={f.id} className={`chip ${family === f.id ? 'is-on' : ''}`} onClick={() => setFamily(f.id)}>
                  <span className="family-dot" style={{ background: f.color }} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Сезон</span>
            <div className="chips">
              {SEASONS.map((s) => (
                <button type="button" key={s.id} className={`chip ${season === s.id ? 'is-on' : ''}`} onClick={() => setSeason(s.id)}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Повод</span>
            <div className="chips">
              <button type="button" className={`chip ${!occasion ? 'is-on' : ''}`} onClick={() => setOccasion('')}>Любой</button>
              {OCCASIONS.map((o) => (
                <button type="button" key={o.id} className={`chip ${occasion === o.id ? 'is-on' : ''}`} onClick={() => setOccasion(o.id)}>{o.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Свои теги</span>
            <TagInput value={tags} onChange={setTags} placeholder="ваниль, на свидание…" />
          </div>
          <button type="submit" hidden />
        </form>
      </div>
      <div className="modal-actions">
        {perfume && <button className="btn btn-danger-ghost" onClick={remove}>Удалить</button>}
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{perfume ? 'Сохранить' : 'Поставить на полку'}</button>
      </div>
    </Modal>
  );
}
