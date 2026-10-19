import { describe, expect, it } from 'vitest';
import { BOSS_ROW, generateMap, MAP_COLS, MAP_ROWS, MIN_ELITE_ROW, MIN_REST_ROW, REST_ROW, TREASURE_ROW } from './map';
import { createRngStore, Rng } from './rng';
import type { MapNode } from './types';

function mapFor(seed: string, act: 1 | 2 | 3 = 1, eliteMult = 1): MapNode[] {
  return generateMap(act, new Rng(createRngStore(seed), 'map'), eliteMult);
}

describe('генерация карты', () => {
  it('детерминирована по seed', () => {
    expect(mapFor('abc')).toEqual(mapFor('abc'));
    expect(mapFor('abc')).not.toEqual(mapFor('abd'));
  });

  for (let i = 0; i < 40; i++) {
    const seed = `map-${i}`;
    it(`правила рядов и связность (${seed})`, () => {
      const act = ((i % 3) + 1) as 1 | 2 | 3;
      const nodes = mapFor(seed, act);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const boss = nodes.filter((n) => n.kind === 'boss');
      expect(boss).toHaveLength(1);
      expect(boss[0]!.row).toBe(BOSS_ROW);
      expect(boss[0]!.next).toEqual([]);

      for (const n of nodes) {
        expect(n.id).toBe(`${act}-${n.row}-${n.col}`);
        expect(n.act).toBe(act);
        expect(n.col).toBeGreaterThanOrEqual(0);
        expect(n.col).toBeLessThan(MAP_COLS);
        if (n.kind === 'boss') continue;
        expect(n.row).toBeLessThan(MAP_ROWS);
        expect(n.next.length).toBeGreaterThan(0);
        for (const id of n.next) {
          const m = byId.get(id);
          expect(m).toBeDefined();
          expect(m!.row).toBe(n.row + 1);
          if (m!.kind !== 'boss') expect(Math.abs(m!.col - n.col)).toBeLessThanOrEqual(1);
        }
        if (n.row === 0) expect(n.kind).toBe('combat');
        if (n.row === TREASURE_ROW) expect(n.kind).toBe('treasure');
        if (n.row === REST_ROW) expect(n.kind).toBe('rest');
        if (n.row === 13) expect(n.kind).toBe('shop');
        if (n.kind !== 'combat') for (const id of n.next) expect(byId.get(id)!.kind).not.toBe(n.kind);
        if (n.kind === 'elite') expect(n.row).toBeGreaterThanOrEqual(MIN_ELITE_ROW);
        if (n.kind === 'rest' && n.row !== REST_ROW) {
          expect(n.row).toBeGreaterThanOrEqual(MIN_REST_ROW);
          for (const id of n.next) expect(byId.get(id)!.kind).not.toBe('rest');
        }
        expect(['combat', 'elite', 'event', 'shop', 'rest', 'treasure', 'lab', 'blackbox', 'relay', 'ambush']).toContain(n.kind);
      }

      // Каждая строка 0..14 содержит хотя бы один узел; в ряду 0 минимум 2 старта.
      for (let r = 0; r < MAP_ROWS; r++) expect(nodes.some((n) => n.row === r)).toBe(true);
      expect(nodes.filter((n) => n.row === 0).length).toBeGreaterThanOrEqual(2);

      // Все узлы достижимы из ряда 0, и из каждого достижим босс.
      const reach = new Set<string>();
      const stack = nodes.filter((n) => n.row === 0).map((n) => n.id);
      while (stack.length) {
        const id = stack.pop()!;
        if (reach.has(id)) continue;
        reach.add(id);
        stack.push(...byId.get(id)!.next);
      }
      expect(reach.size).toBe(nodes.length);
      for (const n of nodes) {
        let cur: MapNode = n;
        while (cur.kind !== 'boss') cur = byId.get(cur.next[0]!)!;
      }

      // Пути не пересекаются: нет пар рёбер a→b, c→d в одном ряду с a<c и b>d.
      const edges = nodes.flatMap((n) =>
        n.kind === 'boss' || n.row === MAP_ROWS - 1 ? [] : n.next.map((id) => [n.row, n.col, byId.get(id)!.col] as const),
      );
      for (const [r1, a, b] of edges)
        for (const [r2, c, d] of edges) if (r1 === r2) expect(a < c && b > d).toBe(false);
    });
  }

  it('распределение типов примерно по весам; A1 даёт больше элит', () => {
    const count = (mult: number) => {
      const t: Record<string, number> = {};
      for (let i = 0; i < 200; i++)
        for (const n of mapFor(`dist-${i}`, 1, mult)) if (n.row > 0 && n.row !== TREASURE_ROW && n.row !== REST_ROW && n.row !== 13 && n.kind !== 'boss') t[n.kind] = (t[n.kind] ?? 0) + 1;
      return t;
    };
    const base = count(1);
    const total = Object.values(base).reduce((a, b) => a + b, 0);
    expect(base.combat! / total).toBeGreaterThan(0.4);
    expect(base.event! / total).toBeGreaterThan(0.15);
    expect(base.shop! / total).toBeLessThan(0.1);
    expect(count(1.6).elite!).toBeGreaterThan(base.elite!);
  });
});
