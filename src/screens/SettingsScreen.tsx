import { useRef, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { makeBackup, parseBackup, storage } from '../lib/storage';
import { formatBytes, pluralRu } from '../lib/util';
import type { BackupFile } from '../types';

const APPROX_LIMIT = 5 * 1024 * 1024 * 2; // ~5 млн символов UTF-16

export function SettingsScreen() {
  const { items, outfits, replaceAll } = useStore();
  const { toast, confirm } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const used = storage.usageBytes();
  const pct = Math.min(100, Math.round((used / APPROX_LIMIT) * 100));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(makeBackup(items, outfits))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `garderob-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    let data: BackupFile;
    try {
      data = parseBackup(await f.text());
    } catch (e) {
      return toast((e as Error).message, 'error');
    }
    const summary = `${data.items.length} ${pluralRu(data.items.length, 'вещь', 'вещи', 'вещей')} и ${data.outfits.length} ${pluralRu(data.outfits.length, 'образ', 'образа', 'образов')}`;
    if (mode === 'replace') {
      if (!(await confirm({ title: 'Заменить все данные?', text: `Текущий гардероб будет заменён: ${summary}.`, confirmText: 'Заменить', danger: true }))) return;
      if (replaceAll(data.items, data.outfits)) toast(`Импортировано: ${summary}`, 'success');
    } else {
      const ids = new Set(data.items.map((i) => i.id));
      const oids = new Set(data.outfits.map((o) => o.id));
      const mergedItems = [...data.items, ...items.filter((i) => !ids.has(i.id))];
      const mergedOutfits = [...data.outfits, ...outfits.filter((o) => !oids.has(o.id))];
      if (replaceAll(mergedItems, mergedOutfits)) toast(`Добавлено из копии: ${summary}`, 'success');
    }
  };

  const wipe = async () => {
    if (!(await confirm({ title: 'Удалить все данные?', text: 'Все вещи и образы будут удалены из этого браузера. Сначала сделайте резервную копию.', confirmText: 'Удалить всё', danger: true }))) return;
    if (replaceAll([], [])) toast('Данные удалены');
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-sub">Данные хранятся только в этом браузере. Аккаунта и облака нет.</p>
        </div>
      </header>

      <section className="panel settings-block">
        <h2 className="panel-title">Хранилище</h2>
        <p className="muted">
          {items.length} {pluralRu(items.length, 'вещь', 'вещи', 'вещей')}, {outfits.length} {pluralRu(outfits.length, 'образ', 'образа', 'образов')} · занято примерно {formatBytes(used)}
        </p>
        <div className="meter"><div style={{ width: `${pct}%` }} /></div>
        <p className="muted small">Обычно браузер даёт около 5 МБ на сайт. Фото уменьшаются до 1200 px и сжимаются, но при большом гардеробе место может закончиться.</p>
      </section>

      <section className="panel settings-block">
        <h2 className="panel-title">Резервная копия</h2>
        <p className="muted">Сохраните все вещи и образы в файл JSON, чтобы перенести на другое устройство или не потерять при очистке браузера.</p>
        <div className="row-gap">
          <button className="btn btn-primary" onClick={exportJson} disabled={!items.length && !outfits.length}>Скачать копию (JSON)</button>
        </div>
        <div className="row-gap">
          <div className="seg">
            <button className={mode === 'merge' ? 'is-on' : ''} onClick={() => setMode('merge')}>Добавить к текущим</button>
            <button className={mode === 'replace' ? 'is-on' : ''} onClick={() => setMode('replace')}>Заменить всё</button>
          </div>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Загрузить копию…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </section>

      <section className="panel settings-block">
        <h2 className="panel-title">Очистка</h2>
        <p className="muted">Удалить все вещи и образы из этого браузера.</p>
        <button className="btn btn-danger-ghost" onClick={wipe} disabled={!items.length && !outfits.length}>Удалить все данные</button>
      </section>

      <section className="settings-about muted small">
        <p>Цифровой гардероб · MVP. Фото обрабатываются только на вашем устройстве и никуда не отправляются.</p>
      </section>
    </div>
  );
}
