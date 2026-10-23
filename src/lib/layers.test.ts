import { describe, expect, it } from 'vitest';
import { recencyWeight, wear } from './outfit';
import { kindFromName, hintsFromFilename } from './suggest';
import { slotOf } from '../catalog';
import { monthGrid } from './util';
import type { Category, Item, Layer } from '../types';

const mk = (id: string, category: Category, subtype?: string): Item => ({
  id, name: id, category, subtype, tags: [], color: 'black', season: 'all', imageDataUrl: '', createdAt: '2026-01-01',
});

function wearAll(list: Item[]): Layer[] {
  const map = new Map(list.map((i) => [i.id, i]));
  return list.reduce<Layer[]>((ls, it) => wear(ls, it, map), []);
}

describe('torso layering', () => {
  it('stacks t-shirt, sweater and jacket in order', () => {
    const ls = wearAll([mk('jacket', 'outerwear', 'jacket'), mk('tee', 'top', 'tshirt'), mk('sweater', 'top', 'sweater')]);
    expect(ls.map((l) => l.itemId)).toEqual(['tee', 'sweater', 'jacket']);
  });
  it('one item per level', () => {
    const ls = wearAll([mk('tee', 'top', 'tshirt'), mk('shirt', 'top', 'shirt')]);
    expect(ls.map((l) => l.itemId)).toEqual(['shirt']);
  });
  it('dress removes base top and bottom but keeps mid/outer', () => {
    const ls = wearAll([mk('tee', 'top', 'tshirt'), mk('cardi', 'top', 'cardigan'), mk('jeans', 'bottom'), mk('coat', 'outerwear', 'coat'), mk('dress', 'dress')]);
    expect(ls.map((l) => l.itemId).sort()).toEqual(['cardi', 'coat', 'dress']);
  });
  it('legacy top without subtype is base', () => {
    expect(slotOf(mk('x', 'top')).slot).toBe('torso-base');
    expect(slotOf(mk('x', 'outerwear')).slot).toBe('torso-outer');
  });
});

describe('accessory stacking', () => {
  it('only one watch', () => {
    const ls = wearAll([mk('w1', 'jewelry', 'watch'), mk('w2', 'jewelry', 'watch')]);
    expect(ls.map((l) => l.itemId)).toEqual(['w2']);
  });
  it('several rings and bracelets, offset', () => {
    const ls = wearAll([mk('r1', 'jewelry', 'ring'), mk('r2', 'jewelry', 'ring'), mk('b1', 'jewelry', 'bracelet'), mk('b2', 'jewelry', 'bracelet')]);
    expect(ls).toHaveLength(4);
    const r2 = ls.find((l) => l.itemId === 'r2')!;
    expect(r2.y).toBeGreaterThan(0);
  });
  it('up to 3 necklaces', () => {
    const ls = wearAll(['n1', 'n2', 'n3', 'n4'].map((id) => mk(id, 'jewelry', 'necklace')));
    expect(ls.map((l) => l.itemId)).toEqual(['n2', 'n3', 'n4']);
  });
  it('watch and bracelet coexist', () => {
    expect(wearAll([mk('w', 'jewelry', 'watch'), mk('b', 'jewelry', 'bracelet')])).toHaveLength(2);
  });
});

describe('name hints', () => {
  it.each([
    ['gold-watch.png', 'jewelry', 'watch'],
    ['часы.png', 'jewelry', 'watch'],
    ['silver ring.png', 'jewelry', 'ring'],
    ['кольцо.webp', 'jewelry', 'ring'],
    ['pearl_necklace.png', 'jewelry', 'necklace'],
    ['цепочка.png', 'jewelry', 'necklace'],
    ['earrings.png', 'jewelry', 'earrings'],
    ['серьги.png', 'jewelry', 'earrings'],
    ['bracelet.png', 'jewelry', 'bracelet'],
    ['браслет.png', 'jewelry', 'bracelet'],
    ['backpack.png', 'bag', 'backpack'],
    ['портфель.png', 'bag', 'briefcase'],
    ['шапка.png', 'hat', 'beanie'],
    ['свитер серый.png', 'top', 'sweater'],
    ['футболка.png', 'top', 'tshirt'],
    ['пальто.png', 'outerwear', 'coat'],
  ])('%s → %s/%s', (file, cat, sub) => {
    const h = hintsFromFilename(file);
    expect(h.category).toBe(cat);
    expect(h.subtype).toBe(sub);
  });
  it('kindFromName empty for unknown', () => {
    expect(kindFromName('что-то')).toBeUndefined();
  });
});

describe('diary helpers', () => {
  it('recency weight', () => {
    expect(recencyWeight(undefined, '2026-10-17')).toBe(1);
    expect(recencyWeight('2026-10-16', '2026-10-17')).toBe(0.3);
    expect(recencyWeight('2026-10-12', '2026-10-17')).toBe(0.6);
    expect(recencyWeight('2026-09-01', '2026-10-17')).toBe(1);
  });
  it('month grid is Monday-first whole weeks', () => {
    const g = monthGrid(2026, 9); // октябрь 2026, 1-е — четверг
    expect(g.length % 7).toBe(0);
    expect(g[0].iso).toBe('2026-09-28');
    expect(g.find((c) => c.inMonth)!.iso).toBe('2026-10-01');
  });
});
