import { describe, expect, it } from 'vitest';
import { BOSS_ROW, bossNodeId, generateMap, MAP_COLS, MAP_ROWS, REST_ROW, SECTOR_LENGTH, SHOP_ROW, TREASURE_ROW } from './map';
import { createRngStore, Rng } from './rng';
import type { MapNode } from './types';

function mapFor(seed: string, act: 1 | 2 | 3 | 4 = 1, eliteMult = 1): MapNode[] {
  return generateMap(act, new Rng(createRngStore(seed), 'map'), eliteMult);
}

const RISK = ['elite', 'ambush', 'blackbox', 'event'];

function checkMap(nodes: MapNode[], act: 1 | 2 | 3 | 4): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const row = (r: number) => nodes.filter((n) => n.row === r);
  const boss = nodes.filter((n) => n.kind === 'boss');
  expect(boss).toHaveLength(1);
  expect(boss[0]!.id).toBe(bossNodeId(act));
  expect(boss[0]!.row).toBe(BOSS_ROW);
  expect(boss[0]!.next).toEqual([]);
  expect(MAP_ROWS).toBeGreaterThanOrEqual(14);
  expect(MAP_ROWS).toBeLessThanOrEqual(16);

  for (const n of nodes) {
    expect(n.id).toBe(`${act}-${n.row}-${n.col}`);
    expect(n.act).toBe(act);
    expect(n.col).toBeGreaterThanOrEqual(0);
    expect(n.col).toBeLessThan(MAP_COLS);
    if (n.kind === 'boss') continue;
    expect(n.sector).toBe(Math.floor(n.row / SECTOR_LENGTH) + 1);
    for (const id of n.next) expect(byId.get(id)!.row).toBe(n.row + 1);
    if (n.row < MAP_ROWS - 1) {
      // Выбор из 2–3 узлов, не все одного типа
      expect(n.next.length).toBeGreaterThanOrEqual(2);
      expect(n.next.length).toBeLessThanOrEqual(3);
      expect(new Set(n.next.map((id) => byId.get(id)!.kind)).size).toBeGreaterThan(1);
    } else expect(n.next).toEqual([boss[0]!.id]);
  }

  for (let r = 0; r < MAP_ROWS; r++) {
    const kinds = row(r).map((n) => n.kind);
    expect(kinds.length).toBeGreaterThanOrEqual(2);
    expect(kinds.length).toBeLessThanOrEqual(3);
    expect(new Set(kinds).size).toBeGreaterThan(1);
    expect(kinds.filter((k) => k === 'elite').length).toBeLessThanOrEqual(1);
    const pos = r % SECTOR_LENGTH;
    if (pos === 0) expect(kinds).toContain('combat');
    if (pos === 2) expect(kinds.some((k) => RISK.includes(k))).toBe(true);
    if (pos === SECTOR_LENGTH - 1) expect([...kinds].sort()).toEqual(['rest', 'shop']);
  }
  expect(row(0)[0]!.kind).toBe('combat');
  expect(row(TREASURE_ROW).map((n) => n.kind)).toContain('treasure');
  // Перед боссом: магазин, затем отдых
  const shop = row(SHOP_ROW).find((n) => n.kind === 'shop')!;
  expect(shop).toBeDefined();
  expect(shop.next.some((id) => byId.get(id)!.kind === 'rest')).toBe(true);
  expect(row(REST_ROW).map((n) => n.kind)).toContain('rest');

  // Все узлы достижимы из ряда 0, и из каждого достижим босс.
  const reach = new Set<string>();
  const stack = row(0).map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id)) continue;
    reach.add(id);
    stack.push(...byId.get(id)!.next);
  }
  expect(reach.size).toBe(nodes.length);
  for (const n of nodes) {
    let cur: MapNode = n;
    for (let guard = 0; cur.kind !== 'boss'; guard++) {
      expect(guard).toBeLessThan(BOSS_ROW + 1);
      cur = byId.get(cur.next[0]!)!;
    }
  }
}

describe('генерация карты', () => {
  it('детерминирована по seed', () => {
    expect(mapFor('abc')).toEqual(mapFor('abc'));
    expect(mapFor('abc')).not.toEqual(mapFor('abd'));
  });

  for (let i = 0; i < 40; i++) {
    const act = ((i % 4) + 1) as 1 | 2 | 3 | 4;
    it(`секторы, гарантии и связность (map-${i}, акт ${act})`, () => checkMap(mapFor(`map-${i}`, act), act));
  }

  it('1000 seed без ошибок', () => {
    for (let i = 0; i < 1000; i++) {
      const act = ((i % 4) + 1) as 1 | 2 | 3 | 4;
      checkMap(mapFor(`bulk-${i}`, act, i % 3 === 0 ? 1.6 : 1), act);
    }
  });

  it('бои преобладают в обычных шагах; A1 даёт больше элит', () => {
    const count = (mult: number) => {
      const t: Record<string, number> = {};
      for (let i = 0; i < 200; i++)
        for (const n of mapFor(`dist-${i}`, 2, mult)) if (n.kind !== 'boss') t[n.kind] = (t[n.kind] ?? 0) + 1;
      return t;
    };
    const base = count(1);
    const total = Object.values(base).reduce((a, b) => a + b, 0);
    expect(base.combat! / total).toBeGreaterThan(0.2);
    expect(base.event! / total).toBeGreaterThan(0.08);
    expect(count(1.6).elite!).toBeGreaterThan(base.elite!);
  });
});
