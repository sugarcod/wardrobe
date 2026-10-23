import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Stage } from './Stage';
import { PerfumePicker } from './PerfumePicker';
import { itemTitle } from './OutfitTags';
import { MOODS, WEATHERS } from '../perfume';
import { useStore } from '../store';
import { useUI } from '../ui';
import type { DiaryInit } from '../nav';
import { formatDay, todayISO } from '../lib/util';
import type { Layer, Mood, Weather } from '../types';

type Source = 'keep' | 'draft' | 'none' | `outfit:${string}`;

export function DiaryEntryDialog({ init, onClose, onOpenPerfumes }: { init: DiaryInit; onClose: () => void; onOpenPerfumes: () => void }) {
  const { draft, outfits, itemsById, saveDiary, prefs } = useStore();
  const { toast } = useUI();
  const e = init.entry;
  const [date, setDate] = useState(e?.date ?? init.date ?? todayISO());
  const initialSource: Source = e ? 'keep' : init.layers ? 'keep' : draft.layers.length ? 'draft' : 'none';
  const [source, setSource] = useState<Source>(initialSource);
  // из календаря аромат с манекена подставляем только для сегодняшней записи
  const [perfumeIds, setPerfumeIds] = useState<string[]>(
    e?.perfumeIds ?? init.perfumeIds ?? (init.source !== 'calendar' || (init.date ?? todayISO()) === todayISO() ? draft.perfumeIds ?? [] : []),
  );
  const [note, setNote] = useState(e?.note ?? '');
  const [mood, setMood] = useState<Mood | undefined>(e?.mood);
  const [weather, setWeather] = useState<Weather | undefined>(e?.weather);
  const [busy, setBusy] = useState(false);

  const { layers, outfitId } = useMemo((): { layers: Layer[]; outfitId?: string } => {
    if (source === 'keep') return { layers: e?.layers ?? init.layers ?? [], outfitId: e?.outfitId ?? init.outfitId };
    if (source === 'draft') return { layers: draft.layers, outfitId: draft.editingId ?? undefined };
    if (source.startsWith('outfit:')) {
      const o = outfits.find((x) => x.id === source.slice(7));
      return { layers: o?.layers ?? [], outfitId: o?.id };
    }
    return { layers: [] };
  }, [source, e, init, draft, outfits]);

  const present = layers.filter((l) => itemsById.has(l.itemId));
  const outfitName = outfitId ? outfits.find((o) => o.id === outfitId)?.name : undefined;
  const keepLabel = e ? 'Как в записи' : outfitName ? `Образ «${outfitName}»` : 'Выбранный образ';

  const save = async () => {
    if (!date) return toast('Укажите дату.', 'error');
    if (!layers.length && !perfumeIds.length && !note.trim()) return toast('Добавьте образ, аромат или заметку.', 'error');
    setBusy(true);
    const saved = await saveDiary({
      id: e?.id,
      date,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      layers: layers.map(({ hidden: _h, ...l }) => l),
      perfumeIds,
      ...(outfitId ? { outfitId } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(mood ? { mood } : {}),
      ...(weather ? { weather } : {}),
    });
    setBusy(false);
    if (saved) {
      toast(e ? 'Запись обновлена' : `Записано в дневник · ${formatDay(saved.date, { short: true })}`, 'success');
      onClose();
    }
  };

  return (
    <Modal title={e ? 'Запись в дневнике' : 'Записать в дневник'} size="lg" onClose={onClose}>
      <div className="diary-form">
        <div className={`diary-form-stage ${prefs.sceneDark ? 'is-dark' : ''}`}>
          <Stage layers={layers} itemsById={itemsById} dark={prefs.sceneDark} />
          {!present.length && <div className="stage-hint">Без образа</div>}
        </div>
        <div className="form">
          <label className="field">
            <span className="field-label">Дата</span>
            <input type="date" className="input" value={date} max="2100-12-31" onChange={(ev) => setDate(ev.target.value)} name="diary-date" />
          </label>
          <label className="field">
            <span className="field-label">Образ</span>
            <select className="input" value={source} onChange={(ev) => setSource(ev.target.value as Source)} name="diary-source">
              {initialSource === 'keep' && <option value="keep">{keepLabel}</option>}
              {draft.layers.length > 0 && <option value="draft">Текущий образ на манекене</option>}
              {outfits.map((o) => (
                <option key={o.id} value={`outfit:${o.id}`}>Образ «{o.name}»</option>
              ))}
              <option value="none">Без образа (только аромат или заметка)</option>
            </select>
            {present.length > 0 && <span className="muted small">{present.map((l) => itemTitle(itemsById.get(l.itemId)!)).join(', ')}</span>}
          </label>
          <div className="field">
            <span className="field-label">Аромат дня</span>
            <PerfumePicker value={perfumeIds} onChange={setPerfumeIds} onEmpty={() => { onClose(); onOpenPerfumes(); }} />
          </div>
          <div className="field">
            <span className="field-label">Настроение</span>
            <div className="chips">
              {MOODS.map((m) => (
                <button type="button" key={m.id} className={`chip chip-sm ${mood === m.id ? 'is-on' : ''}`} onClick={() => setMood(mood === m.id ? undefined : m.id)}>{m.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Погода</span>
            <div className="chips">
              {WEATHERS.map((w) => (
                <button type="button" key={w.id} className={`chip chip-sm ${weather === w.id ? 'is-on' : ''}`} onClick={() => setWeather(weather === w.id ? undefined : w.id)}>{w.label}</button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">Заметка</span>
            <textarea className="input textarea" rows={3} maxLength={500} value={note} placeholder="Куда ходили, что понравилось…" onChange={(ev) => setNote(ev.target.value)} name="diary-note" />
          </label>
        </div>
      </div>
      <div className="modal-actions">
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" disabled={busy} onClick={save} data-testid="diary-save">{e ? 'Сохранить' : 'Записать'}</button>
      </div>
    </Modal>
  );
}
