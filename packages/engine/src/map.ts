/**
 * Генерация карты акта: 15 рядов × 7 колонок, 6 путей без пересечений, затем босс (ряд 15).
 */
import type { Rng } from './rng';
import type { MapNode, MapNodeKind } from './types';

export const MAP_ROWS = 15;
export const MAP_COLS = 7;
export const MAP_PATHS = 7;
export const BOSS_ROW = 15;
export const TREASURE_ROW = 8;
export const REST_ROW = 14;
export const MIN_ELITE_ROW = 5;
export const MIN_REST_ROW = 5;
/** Гарантированный магазин перед отдыхом и боссом */
export const SHOP_ROW = 13;

type RollKind = Exclude<MapNodeKind, 'treasure' | 'boss'>;

/** Базовые веса типов узлов по актам (акт 4 = акт 3). */
export function nodeWeights(act: number): Record<RollKind, number> {
  const a = Math.min(3, Math.max(1, act));
  return {
    combat: 45,
    event: 20,
    elite: [6, 9, 12][a - 1]!,
    rest: 11,
    shop: 4,
    lab: [2, 5, 8][a - 1]!,
    blackbox: [0, 5, 6][a - 1]!,
    relay: 4,
    ambush: [3, 7, 8][a - 1]!,
  };
}

/** Самый ранний ряд для типа узла. */
const MIN_ROW: Partial<Record<MapNodeKind, number>> = { elite: MIN_ELITE_ROW, rest: MIN_REST_ROW, lab: 4, blackbox: 4, ambush: 3, shop: 2, relay: 2 };

export function nodeId(act: number, row: number, col: number): string {
  return `${act}-${row}-${col}`;
}

export function bossNodeId(act: number): string {
  return nodeId(act, BOSS_ROW, 3);
}

interface Edge {
  row: number;
  from: number;
  to: number;
}

/** Ребро (row: c → nc) пересекает существующее ребро того же ряда. */
function crosses(edges: readonly Edge[], row: number, c: number, nc: number): boolean {
  return edges.some((e) => e.row === row && ((e.from < c && e.to > nc) || (e.from > c && e.to < nc)));
}

export function generateMap(act: 1 | 2 | 3 | 4, rng: Rng, eliteWeightMult = 1): MapNode[] {
  const edges: Edge[] = [];
  const edgeKeys = new Set<string>();
  const cells = new Set<string>();
  let firstStart = -1;
  let secondStart = -1;

  for (let p = 0; p < MAP_PATHS; p++) {
    let c = rng.int(0, MAP_COLS - 1);
    // Первые два пути стартуют из разных колонок, чтобы был выбор.
    if (p === 1) while (c === firstStart) c = rng.int(0, MAP_COLS - 1);
    if (p === 2) while (c === firstStart || c === secondStart) c = rng.int(0, MAP_COLS - 1);
    if (p === 0) firstStart = c;
    if (p === 1) secondStart = c;
    cells.add(`0:${c}`);
    for (let r = 0; r < MAP_ROWS - 1; r++) {
      const options = [c - 1, c, c + 1].filter((nc) => nc >= 0 && nc < MAP_COLS && !crosses(edges, r, c, nc));
      const nc = rng.pick(options); // прямой ход никогда не пересекает — options не пуст
      const key = `${r}:${c}:${nc}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ row: r, from: c, to: nc });
      }
      cells.add(`${r + 1}:${nc}`);
      c = nc;
    }
  }

  const bossId = bossNodeId(act);
  const nodes: MapNode[] = [];
  const byId = new Map<string, MapNode>();
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (!cells.has(`${r}:${c}`)) continue;
      const next =
        r === MAP_ROWS - 1
          ? [bossId]
          : edges
              .filter((e) => e.row === r && e.from === c)
              .map((e) => e.to)
              .sort((a, b) => a - b)
              .map((nc) => nodeId(act, r + 1, nc));
      const node: MapNode = { id: nodeId(act, r, c), act, row: r, col: c, kind: 'combat', next };
      nodes.push(node);
      byId.set(node.id, node);
    }
  }

  // Типы узлов — по рядам сверху вниз, родители уже назначены.
  const parentsOf = (id: string): MapNode[] => nodes.filter((n) => n.next.includes(id));
  for (const node of nodes) {
    node.kind = pickKind(node, parentsOf(node.id), rng, eliteWeightMult, act);
  }

  const boss: MapNode = { id: bossId, act, row: BOSS_ROW, col: 3, kind: 'boss', next: [] };
  nodes.push(boss);
  return nodes;
}

function pickKind(node: MapNode, parents: MapNode[], rng: Rng, eliteWeightMult: number, act: number): MapNodeKind {
  if (node.row === 0) return 'combat';
  if (node.row === TREASURE_ROW) return 'treasure';
  if (node.row === SHOP_ROW) return 'shop';
  if (node.row === REST_ROW) return 'rest';
  const w = nodeWeights(act);
  const weights: [MapNodeKind, number][] = [];
  for (const k of Object.keys(w) as RollKind[]) {
    let weight = w[k];
    if (k === 'elite') weight *= eliteWeightMult;
    if (weight <= 0) continue;
    if (node.row < (MIN_ROW[k] ?? 0)) continue;
    // Не подряд одинаковые особые узлы
    if (k !== 'combat' && parents.some((p) => p.kind === k)) continue;
    if (k === 'rest' && node.row === REST_ROW - 1) continue;
    if (k === 'shop' && node.row === SHOP_ROW - 1) continue;
    weights.push([k, weight]);
  }
  return rng.weighted(weights);
}
