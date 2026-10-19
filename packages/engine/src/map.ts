/**
 * Генерация карты акта: 15 рядов × 7 колонок, 6 путей без пересечений, затем босс (ряд 15).
 */
import type { Rng } from './rng';
import type { MapNode, MapNodeKind } from './types';

export const MAP_ROWS = 15;
export const MAP_COLS = 7;
export const MAP_PATHS = 6;
export const BOSS_ROW = 15;
export const TREASURE_ROW = 8;
export const REST_ROW = 14;
export const MIN_ELITE_ROW = 5;
export const MIN_REST_ROW = 5;

export const NODE_WEIGHTS: Record<'combat' | 'event' | 'elite' | 'rest' | 'shop', number> = {
  combat: 45,
  event: 22,
  elite: 8,
  rest: 12,
  shop: 5,
};

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

  for (let p = 0; p < MAP_PATHS; p++) {
    let c = rng.int(0, MAP_COLS - 1);
    // Первые два пути стартуют из разных колонок, чтобы был выбор.
    if (p === 1) while (c === firstStart) c = rng.int(0, MAP_COLS - 1);
    if (p === 0) firstStart = c;
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
    node.kind = pickKind(node, parentsOf(node.id), rng, eliteWeightMult);
  }

  const boss: MapNode = { id: bossId, act, row: BOSS_ROW, col: 3, kind: 'boss', next: [] };
  nodes.push(boss);
  return nodes;
}

function pickKind(node: MapNode, parents: MapNode[], rng: Rng, eliteWeightMult: number): MapNodeKind {
  if (node.row === 0) return 'combat';
  if (node.row === TREASURE_ROW) return 'treasure';
  if (node.row === REST_ROW) return 'rest';
  const weights: [MapNodeKind, number][] = [
    ['combat', NODE_WEIGHTS.combat],
    ['event', NODE_WEIGHTS.event],
    ['shop', NODE_WEIGHTS.shop],
  ];
  if (node.row >= MIN_ELITE_ROW) weights.push(['elite', NODE_WEIGHTS.elite * eliteWeightMult]);
  // Отдых: не раньше ряда 5, не после отдыха и не перед обязательным отдыхом ряда 14.
  const parentRest = parents.some((p) => p.kind === 'rest');
  if (node.row >= MIN_REST_ROW && node.row !== REST_ROW - 1 && !parentRest) weights.push(['rest', NODE_WEIGHTS.rest]);
  return rng.weighted(weights);
}
