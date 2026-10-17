import { describe, expect, it } from 'vitest';
import { nextStamp, planMerge, shouldApplyRemote, stamp } from './syncMerge';

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

describe('planMerge (первичное слияние при входе)', () => {
  it('локальные вещи, которых нет в облаке, отправляются; облачные — скачиваются', () => {
    const p = planMerge([{ id: 'a', updatedAt: t(1) }], [{ id: 'b', updatedAt: t(1) }]);
    expect(p).toEqual({ upload: ['a'], download: ['b'] });
  });
  it('last-write-wins по updatedAt', () => {
    const p = planMerge(
      [{ id: 'new-local', updatedAt: t(5) }, { id: 'old-local', updatedAt: t(1) }, { id: 'same', updatedAt: t(3) }],
      [{ id: 'new-local', updatedAt: t(2) }, { id: 'old-local', updatedAt: t(4) }, { id: 'same', updatedAt: t(3) }],
    );
    expect(p.upload).toEqual(['new-local']);
    expect(p.download).toEqual(['old-local']);
  });
  it('локальное удаление новее облачной записи — отправляем tombstone', () => {
    expect(planMerge([{ id: 'x', updatedAt: t(9), deleted: true }], [{ id: 'x', updatedAt: t(2) }])).toEqual({ upload: ['x'], download: [] });
  });
  it('облачное удаление новее локальной записи — удаляем локально', () => {
    expect(planMerge([{ id: 'x', updatedAt: t(2) }], [{ id: 'x', updatedAt: t(9), deleted: true }])).toEqual({ upload: [], download: ['x'] });
  });
  it('правка после удаления на другом устройстве «воскрешает» вещь', () => {
    expect(planMerge([{ id: 'x', updatedAt: t(10) }], [{ id: 'x', updatedAt: t(9), deleted: true }])).toEqual({ upload: ['x'], download: [] });
  });
  it('облачные tombstones без локальной записи игнорируются', () => {
    expect(planMerge([], [{ id: 'gone', updatedAt: t(1), deleted: true }])).toEqual({ upload: [], download: [] });
  });
  it('оба удалены — ничего не делаем', () => {
    expect(planMerge([{ id: 'x', updatedAt: t(1), deleted: true }], [{ id: 'x', updatedAt: t(5), deleted: true }])).toEqual({ upload: [], download: [] });
  });
  it('одинаковое время, разное состояние — побеждает удаление', () => {
    expect(planMerge([{ id: 'x', updatedAt: t(1) }], [{ id: 'x', updatedAt: t(1), deleted: true }]).download).toEqual(['x']);
    expect(planMerge([{ id: 'x', updatedAt: t(1), deleted: true }], [{ id: 'x', updatedAt: t(1) }]).upload).toEqual(['x']);
  });
  it('пустые наборы', () => {
    expect(planMerge([], [])).toEqual({ upload: [], download: [] });
  });
});

describe('shouldApplyRemote (изменения из onSnapshot)', () => {
  it('новая вещь из облака применяется, новый tombstone без локальной — нет', () => {
    expect(shouldApplyRemote(undefined, { id: 'a', updatedAt: t(1) })).toBe(true);
    expect(shouldApplyRemote(undefined, { id: 'a', updatedAt: t(1), deleted: true })).toBe(false);
  });
  it('эхо собственной записи (то же время) игнорируется', () => {
    expect(shouldApplyRemote({ id: 'a', updatedAt: t(3) }, { id: 'a', updatedAt: t(3) })).toBe(false);
  });
  it('более новая запись применяется, более старая — нет', () => {
    expect(shouldApplyRemote({ id: 'a', updatedAt: t(3) }, { id: 'a', updatedAt: t(4) })).toBe(true);
    expect(shouldApplyRemote({ id: 'a', updatedAt: t(5) }, { id: 'a', updatedAt: t(4) })).toBe(false);
  });
  it('удаление из облака применяется к более старой локальной вещи', () => {
    expect(shouldApplyRemote({ id: 'a', updatedAt: t(3) }, { id: 'a', updatedAt: t(4), deleted: true })).toBe(true);
  });
  it('локальный tombstone новее облачной записи — не воскрешаем', () => {
    expect(shouldApplyRemote({ id: 'a', updatedAt: t(6), deleted: true }, { id: 'a', updatedAt: t(4) })).toBe(false);
  });
});

describe('stamp / nextStamp', () => {
  it('stamp берёт updatedAt, иначе createdAt', () => {
    expect(stamp({ createdAt: t(2) })).toBe(Date.parse(t(2)));
    expect(stamp({ createdAt: t(2), updatedAt: t(7) })).toBe(Date.parse(t(7)));
    expect(stamp(undefined)).toBe(0);
  });
  it('nextStamp всегда строго больше предыдущего', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(Date.parse(nextStamp(future))).toBe(Date.parse(future) + 1);
    expect(Date.parse(nextStamp())).toBeGreaterThan(0);
  });
});
