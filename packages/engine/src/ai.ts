/**
 * ИИ врагов: 'cycle' — по кругу order; 'random' — взвешенно, без трёх одинаковых ходов подряд.
 */
import type { Rng } from './rng';
import type { EnemyDef } from './types';

export function chooseMove(def: EnemyDef, history: readonly string[], rng: Rng): string {
  const moveIds = new Set(def.moves.map((m) => m.id));
  const fallback = def.moves[0]?.id;
  if (fallback === undefined) throw new Error(`Enemy ${def.id} has no moves`);

  if (def.ai.kind === 'cycle') {
    const order = def.ai.order.filter((id) => moveIds.has(id));
    if (order.length === 0) return fallback;
    return order[history.length % order.length] as string;
  }

  const entries = Object.entries(def.ai.weights).filter(([id, w]) => moveIds.has(id) && w > 0);
  if (entries.length === 0) return fallback;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const banned = last !== undefined && last === prev ? last : undefined;
  const allowed = entries.filter(([id]) => id !== banned);
  return rng.weighted(allowed.length > 0 ? allowed : entries);
}
