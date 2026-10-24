/**
 * Генерация карты зоны: 3 сектора по 5 шагов (ряды 0..14), затем босс (ряд 15).
 * На каждом шаге 2–3 узла; из каждого узла (кроме последнего ряда) минимум 2 варианта.
 * Сектор: начало — бой, середина — развилка с риском, конец — магазин/отдых.
 */
import type { Rng } from './rng';
import type { MapNode, MapNodeKind } from './types';

export const SECTORS = 3;
export const SECTOR_LENGTH = 5;
export const MAP_ROWS = SECTORS * SECTOR_LENGTH;
export const MAP_COLS = 7;
export const BOSS_ROW = MAP_ROWS;
/** Тайник — в развилке среднего сектора */
export const TREASURE_ROW = SECTOR_LENGTH + 2;
/** Последний ряд перед боссом: отдых и магазин */
export const REST_ROW = MAP_ROWS - 1;
/** Гарантированный магазин за шаг до последнего ряда */
export const SHOP_ROW = MAP_ROWS - 2;

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
    // Импланты v2 — веса выставляет движок (feat/implants-engine)
    signal: 0,
    synth: 0,
    ripperdoc: 0,
    quarantine: 0,
    beacon: 0,
  };
}

const REGULAR: readonly RollKind[] = ['combat', 'event', 'lab', 'relay'];
const RISK: readonly RollKind[] = ['elite', 'ambush', 'blackbox'];

export function nodeId(act: number, row: number, col: number): string {
  return `${act}-${row}-${col}`;
}

export function bossNodeId(act: number): string {
  return nodeId(act, BOSS_ROW, 3);
}

/** Сектор ряда (1..3); позиция в секторе 0..SECTOR_LENGTH-1. */
export function sectorOf(row: number): 1 | 2 | 3 {
  return (Math.min(SECTORS - 1, Math.floor(row / SECTOR_LENGTH)) + 1) as 1 | 2 | 3;
}

const COLS: Record<number, number[]> = { 2: [2, 4], 3: [1, 3, 5] };

/** Типы узлов ряда. Неболевые типы не повторяются; бой не стоит рядом с боем — любой выбор из соседних узлов разнороден. */
function rowKinds(row: number, act: number, rng: Rng, eliteMult: number): MapNodeKind[] {
  const pos = row % SECTOR_LENGTH;
  const w = nodeWeights(act);
  const weight = (k: RollKind) => (k === 'elite' ? w[k] * eliteMult : w[k]);
  if (pos === SECTOR_LENGTH - 1) return rng.shuffle<MapNodeKind>(['rest', 'shop']);

  const size = rng.int(2, 3);
  const kinds: (MapNodeKind | null)[] = Array.from({ length: size }, () => null);
  const free = () => kinds.flatMap((k, i) => (k === null ? [i] : []));
  const place = (k: MapNodeKind) => (kinds[rng.pick(free())] = k);

  let pool: readonly RollKind[] = REGULAR;
  if (pos === 0) kinds[0] = 'combat';
  if (row === SHOP_ROW) place('shop');
  if (pos === 2) {
    const risks = RISK.map((k) => [k, weight(k)] as const).filter(([, x]) => x > 0);
    place(risks.length > 0 ? rng.weighted(risks) : 'event');
    if (row === TREASURE_ROW) place('treasure');
    pool = [...REGULAR, ...RISK];
  }
  for (const i of free()) {
    const options = pool
      .filter((k) => (k === 'combat' ? kinds[i - 1] !== 'combat' && kinds[i + 1] !== 'combat' : !kinds.includes(k)))
      .map((k) => [k, weight(k)] as const);
    kinds[i] = rng.weighted(options);
  }
  return kinds as MapNodeKind[];
}

/** Рёбра между рядами размеров a и b: каждый узел ведёт в 2 соседних, каждый узел ряда b достижим. */
function linkRows(a: number, b: number, rng: Rng): number[][] {
  const straight = (i: number) => (a === 1 ? 0 : Math.round((i * (b - 1)) / (a - 1)));
  const out: number[][] = [];
  for (let i = 0; i < a; i++) {
    const s = straight(i);
    const side = [s - 1, s + 1].filter((j) => j >= 0 && j < b);
    out.push(side.length > 0 ? [s, rng.pick(side)] : [s]);
  }
  for (let j = 0; j < b; j++) {
    if (out.some((t) => t.includes(j))) continue;
    let best = 0;
    for (let i = 1; i < a; i++) if (Math.abs(straight(i) - j) < Math.abs(straight(best) - j)) best = i;
    out[best]!.push(j);
  }
  return out.map((t) => [...new Set(t)].sort((x, y) => x - y));
}

export function generateMap(act: 1 | 2 | 3 | 4, rng: Rng, eliteWeightMult = 1): MapNode[] {
  const bossId = bossNodeId(act);
  const rows: MapNode[][] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const kinds = rowKinds(r, act, rng, eliteWeightMult);
    const cols = COLS[kinds.length]!;
    rows.push(kinds.map((kind, i) => ({ id: nodeId(act, r, cols[i]!), act, row: r, col: cols[i]!, kind, next: [], sector: sectorOf(r) })));
  }
  for (let r = 0; r < MAP_ROWS; r++) {
    const cur = rows[r]!;
    const nxt = rows[r + 1];
    if (!nxt) {
      for (const n of cur) n.next = [bossId];
      continue;
    }
    const links = linkRows(cur.length, nxt.length, rng);
    cur.forEach((n, i) => (n.next = links[i]!.map((j) => nxt[j]!.id)));
  }
  const boss: MapNode = { id: bossId, act, row: BOSS_ROW, col: 3, kind: 'boss', next: [] };
  return [...rows.flat(), boss];
}
