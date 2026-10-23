import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { ItemForm, type Hints, type ItemFields } from './ItemForm';
import { BgFixer } from './BgFixer';
import { validateFile } from '../lib/image';
import { processFile, type Processed } from '../lib/process';
import { hintsFromFilename } from '../lib/suggest';
import { uid, pluralRu } from '../lib/util';
import { useStore } from '../store';
import { useUI } from '../ui';
import type { Item } from '../types';

interface Draft {
  key: string;
  fileName: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  processed?: Processed;
  dataUrl?: string;
  fields: ItemFields;
  hints: Hints;
}

const emptyFields = (): ItemFields => ({ name: '', category: '', subtype: '', color: '', season: 'all', occasion: '', tags: [] });

export function UploadDialog({ files, onClose }: { files: File[]; onClose: () => void }) {
  const { addItems } = useStore();
  const { toast } = useUI();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    files.map((f) => {
      const err = validateFile(f);
      return { key: uid(), fileName: f.name, status: err ? 'error' : 'loading', error: err ?? undefined, fields: emptyFields(), hints: {} };
    }),
  );
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < files.length; i++) {
        if (cancelled) return;
        const key = drafts[i].key;
        if (drafts[i].status === 'error') continue;
        try {
          const p = await processFile(files[i]);
          const h = hintsFromFilename(files[i].name);
          const hints: Hints = { category: h.category, subtype: h.subtype, season: h.season, occasion: h.occasion, color: h.color ?? (p.color || undefined) };
          const fields: ItemFields = {
            name: h.name,
            category: h.category ?? '',
            subtype: h.subtype ?? '',
            color: hints.color ?? '',
            season: h.season ?? 'all',
            occasion: h.occasion ?? '',
            tags: [],
          };
          if (!cancelled) setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, status: 'ready', processed: p, dataUrl: p.dataUrl, fields, hints } : d)));
        } catch {
          if (!cancelled) setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, status: 'error', error: `«${d.fileName}»: не удалось прочитать изображение.` } : d)));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const ready = drafts.filter((d) => d.status === 'ready');
  const loading = drafts.some((d) => d.status === 'loading');

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (ready.some((d) => !d.fields.category)) {
      setShowErrors(true);
      toast('У каждой вещи должна быть категория.', 'error');
      return;
    }
    const base = Date.now();
    const items: Item[] = ready.map((d, i) => ({
      id: uid(),
      name: d.fields.name.trim(),
      category: d.fields.category as Item['category'],
      ...(d.fields.subtype ? { subtype: d.fields.subtype } : {}),
      tags: d.fields.tags,
      color: d.fields.color,
      season: d.fields.season,
      ...(d.fields.occasion ? { occasion: d.fields.occasion } : {}),
      imageDataUrl: d.dataUrl!,
      createdAt: new Date(base + (ready.length - i)).toISOString(),
    }));
    setSaving(true);
    const ok = await addItems(items);
    setSaving(false);
    if (ok) {
      toast(`Добавлено: ${items.length} ${pluralRu(items.length, 'вещь', 'вещи', 'вещей')}`, 'success');
      onClose();
    }
  };

  return (
    <Modal title="Новые вещи" size="lg" onClose={onClose}>
      <p className="muted small">
        Подсказки по имени файла и цвету картинки — только черновик. Проверьте категорию и теги, затем сохраните.
      </p>
      <div className="upload-list">
        {drafts.map((d) => (
          <div key={d.key} className={`upload-row ${d.status === 'error' ? 'is-error' : ''}`}>
            {d.status === 'error' ? (
              <div className="upload-error">
                <span>{d.error}</span>
                <button className="link-btn" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>Убрать</button>
              </div>
            ) : (
              <>
                <div className="upload-preview">
                  <div className="checker preview-box">
                    {d.dataUrl ? <img src={d.dataUrl} alt="" /> : <div className="spinner" />}
                  </div>
                  <div className="upload-file muted small" title={d.fileName}>{d.fileName}</div>
                  <button className="link-btn small" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>Не добавлять</button>
                </div>
                <div className="upload-form">
                  {d.processed?.needsBg && (
                    <BgFixer
                      sourceDataUrl={d.processed.sourceDataUrl}
                      onChange={(r) =>
                        update(d.key, {
                          dataUrl: r.dataUrl,
                          ...(r.color && !d.fields.color ? { fields: { ...d.fields, color: r.color } } : {}),
                        })
                      }
                    />
                  )}
                  {d.status === 'ready' ? (
                    <ItemForm value={d.fields} hints={d.hints} showErrors={showErrors} onChange={(f) => update(d.key, { fields: f })} />
                  ) : (
                    <p className="muted">Обработка изображения…</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {!drafts.length && <p className="muted">Нет файлов для добавления.</p>}
      </div>
      <div className="modal-actions sticky-actions">
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" disabled={!ready.length || loading || saving} onClick={save}>
          {loading ? 'Обработка…' : `Сохранить ${ready.length ? ready.length : ''} ${pluralRu(ready.length, 'вещь', 'вещи', 'вещей')}`}
        </button>
      </div>
    </Modal>
  );
}
