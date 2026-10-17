/**
 * Чистая логика синхронизации (last-write-wins по updatedAt).
 * Без зависимостей от Firebase и браузера — покрыта юнит-тестами.
 */

export interface SyncRec {
  id: string;
  updatedAt: string;
  deleted?: boolean;
}

export function stamp(r: { updatedAt?: string; createdAt?: string } | undefined): number {
  if (!r) return 0;
  const t = Date.parse(r.updatedAt ?? r.createdAt ?? '');
  return Number.isFinite(t) ? t : 0;
}

export interface MergePlan {
  /** id записей, которые нужно отправить в облако (включая удаления) */
  upload: string[];
  /** id записей, которые нужно применить локально из облака (включая удаления) */
  download: string[];
}

/**
 * Первичное слияние при входе: local — живые записи и tombstones устройства,
 * remote — все документы из облака.
 */
export function planMerge(local: SyncRec[], remote: SyncRec[]): MergePlan {
  const L = new Map(local.map((r) => [r.id, r]));
  const R = new Map(remote.map((r) => [r.id, r]));
  const upload: string[] = [];
  const download: string[] = [];
  for (const [id, l] of L) {
    const r = R.get(id);
    if (!r) {
      upload.push(id); // нет в облаке — отправляем (и удаления тоже, чтобы дошли до других устройств)
      continue;
    }
    const lt = stamp(l), rt = stamp(r);
    if (lt > rt) upload.push(id);
    else if (rt > lt && !(l.deleted && r.deleted)) download.push(id);
    else if (rt === lt && !!l.deleted !== !!r.deleted) {
      // одинаковое время, но разное состояние — побеждает удаление (детерминированно на всех устройствах)
      if (r.deleted) download.push(id);
      else upload.push(id);
    }
  }
  for (const [id, r] of R) {
    if (!L.has(id) && !r.deleted) download.push(id);
  }
  return { upload, download };
}

/** Применять ли изменение из облака (onSnapshot) к локальной записи */
export function shouldApplyRemote(local: SyncRec | undefined, remote: SyncRec): boolean {
  if (!local) return !remote.deleted;
  const lt = stamp(local), rt = stamp(remote);
  if (rt > lt) return !(local.deleted && remote.deleted);
  if (rt === lt) return !!remote.deleted && !local.deleted;
  return false;
}

/** Монотонная отметка времени: не меньше текущего updatedAt + 1 мс (защита от одинаковых меток) */
export function nextStamp(prev?: string): string {
  const now = Date.now();
  const p = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(now, (Number.isFinite(p) ? p : 0) + 1)).toISOString();
}
