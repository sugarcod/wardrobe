import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { makeBackup, parseBackup } from '../lib/storage';
import { estimateStorage } from '../lib/db';
import { AccountSection } from '../components/Account';
import { useCloud } from '../cloud';
import { formatBytes, pluralRu } from '../lib/util';
import type { BackupFile } from '../types';

export function SettingsScreen() {
  const { items, outfits, perfumes, diary, importData, wipeAll, persisted } = useStore();
  const empty = !items.length && !outfits.length && !perfumes.length && !diary.length;
  const { toast, confirm } = useUI();
  const { user } = useCloud();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [est, setEst] = useState<{ usage: number; quota: number } | null | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    estimateStorage().then(setEst);
  }, [items, outfits]);
  const pct = est && est.quota ? Math.min(100, Math.max(1, Math.round((est.usage / est.quota) * 100))) : 0;

  const exportJson = async () => {
    setExporting(true);
    let backup;
    try {
      backup = await makeBackup(items, outfits, perfumes, diary);
    } catch {
      setExporting(false);
      return toast('Не удалось подготовить копию.', 'error');
    }
    setExporting(false);
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
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
    const np = data.perfumes?.length ?? 0, nd = data.diary?.length ?? 0;
    const summary = [
      `${data.items.length} ${pluralRu(data.items.length, 'вещь', 'вещи', 'вещей')}`,
      `${data.outfits.length} ${pluralRu(data.outfits.length, 'образ', 'образа', 'образов')}`,
      np ? `${np} ${pluralRu(np, 'аромат', 'аромата', 'ароматов')}` : '',
      nd ? `${nd} ${pluralRu(nd, 'запись', 'записи', 'записей')} дневника` : '',
    ].filter(Boolean).join(', ');
    if (mode === 'replace') {
      if (!(await confirm({ title: 'Заменить все данные?', text: `Текущий гардероб будет заменён: ${summary}.`, confirmText: 'Заменить', danger: true }))) return;
      if (await importData(data.items, data.outfits, true, data.perfumes, data.diary)) toast(`Импортировано: ${summary}`, 'success');
    } else {
      if (await importData(data.items, data.outfits, false, data.perfumes, data.diary)) toast(`Добавлено из копии: ${summary}`, 'success');
    }
  };

  const wipe = async () => {
    if (!(await confirm({ title: 'Удалить все данные?', text: user ? 'Все вещи, образы, парфюмы и дневник будут удалены на этом устройстве и в облаке (на всех ваших устройствах). Сначала сделайте резервную копию.' : 'Все вещи, образы, парфюмы и дневник будут удалены из этого браузера. Сначала сделайте резервную копию.', confirmText: 'Удалить всё', danger: true }))) return;
    if (await wipeAll()) toast('Данные удалены');
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-sub">{user ? 'Данные хранятся в браузере и синхронизируются с облаком.' : 'Данные хранятся в этом браузере.'}</p>
        </div>
      </header>

      <AccountSection />

      <section className="panel settings-block">
        <h2 className="panel-title">Хранилище</h2>
        <p className="muted">
          {items.length} {pluralRu(items.length, 'вещь', 'вещи', 'вещей')}, {outfits.length} {pluralRu(outfits.length, 'образ', 'образа', 'образов')}, {perfumes.length} {pluralRu(perfumes.length, 'аромат', 'аромата', 'ароматов')}, {diary.length} {pluralRu(diary.length, 'запись', 'записи', 'записей')} в дневнике
          {est ? <> · занято {formatBytes(est.usage)} из доступных {formatBytes(est.quota)}</> : est === null ? ' · браузер не сообщает объём' : ''}
        </p>
        {est && <div className="meter" data-testid="storage-meter"><div style={{ width: `${pct}%` }} /></div>}
        <p className="muted small">
          Вещи и образы хранятся в IndexedDB этого браузера — места хватит на сотни вещей.{' '}
          {persisted === true && 'Браузер пометил данные как постоянные и не удалит их при нехватке места.'}
          {persisted === false && 'Браузер не разрешил постоянное хранение — при острой нехватке места данные могут быть удалены, поэтому делайте резервные копии.'}
        </p>
      </section>

      <section className="panel settings-block">
        <h2 className="panel-title">Резервная копия</h2>
        <p className="muted">Сохраните вещи, образы, парфюмы и дневник в файл JSON, чтобы перенести на другое устройство или не потерять при очистке браузера.</p>
        <div className="row-gap">
          <button className="btn btn-primary" onClick={exportJson} disabled={exporting || empty}>{exporting ? 'Готовим файл…' : 'Скачать копию (JSON)'}</button>
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
        <p className="muted">{user ? 'Удалить все данные — здесь и в облаке.' : 'Удалить все данные из этого браузера.'}</p>
        <button className="btn btn-danger-ghost" onClick={wipe} disabled={empty}>Удалить все данные</button>
      </section>

      <section className="settings-about muted small">
        <p>Цифровой гардероб · MVP. Фото обрабатываются на вашем устройстве; в облако (Firebase) они попадают, только если вы вошли в аккаунт.</p>
      </section>
    </div>
  );
}
