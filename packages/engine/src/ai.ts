/**
 * ИИ врагов: 'cycle' — по кругу order; 'random' — взвешенно, без трёх одинаковых ходов подряд;
 * 'phased' — фазы по порогам HP; 'scripted' — скрипт с условиями (ход, HP, число врагов, карты игрока).
 */
import type { Rng } from './rng';
import type { AiCondition, EnemyDef } from './types';
import { getContent } from './content';

export interface AiContext {
  /** HP врага в процентах 0..100 */
  hpPct: number;
  /** Живых врагов, включая себя */
  enemies: number;
  /** id карт, разыгранных игроком в прошлом ходу */
  played: readonly string[];
}

/** Память фаз ('phased'), хранится в EnemyState */
export interface AiMemory {
  aiPhase?: number;
  aiPhaseStart?: number;
}

const DEFAULT_CTX: AiContext = { hpPct: 100, enemies: 1, played: [] };

function cycle(order: readonly string[], moveIds: Set<string>, n: number): string | undefined {
  const valid = order.filter((id) => moveIds.has(id));
  return valid.length === 0 ? undefined : valid[n % valid.length];
}

function weightedNoTriple(weights: Record<string, number>, moveIds: Set<string>, history: readonly string[], rng: Rng): string | undefined {
  const entries = Object.entries(weights).filter(([id, w]) => moveIds.has(id) && w > 0);
  if (entries.length === 0) return undefined;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const banned = last !== undefined && last === prev ? last : undefined;
  const allowed = entries.filter(([id]) => id !== banned);
  return rng.weighted(allowed.length > 0 ? allowed : entries);
}

function playedCount(played: readonly string[], what: string): number {
  const cards = getContent().cards;
  return played.filter((id) => id === what || cards.get(id)?.type === what).length;
}

export function matchesCondition(cond: AiCondition | undefined, turn: number, ctx: AiContext): boolean {
  if (!cond) return true;
  if (cond.turn !== undefined && turn !== cond.turn) return false;
  if (cond.every !== undefined && (cond.every <= 0 || turn % cond.every !== 0)) return false;
  if (cond.hpBelow !== undefined && !(ctx.hpPct < cond.hpBelow)) return false;
  if (cond.hpAtLeast !== undefined && ctx.hpPct < cond.hpAtLeast) return false;
  if (cond.enemiesAtMost !== undefined && ctx.enemies > cond.enemiesAtMost) return false;
  if (cond.enemiesAtLeast !== undefined && ctx.enemies < cond.enemiesAtLeast) return false;
  if (cond.playerPlayed !== undefined && playedCount(ctx.played, cond.playerPlayed) < (cond.playerPlayedCount ?? 1)) return false;
  return true;
}

/** Индекс активной фазы: наименьший порог hpAtMost, под который попадает HP (иначе фаза с наибольшим порогом). */
export function activePhase(phases: readonly { hpAtMost: number }[], hpPct: number): number {
  let best = -1;
  let top = 0;
  phases.forEach((p, i) => {
    if (p.hpAtMost > phases[top]!.hpAtMost) top = i;
    if (hpPct <= p.hpAtMost && (best < 0 || p.hpAtMost < phases[best]!.hpAtMost)) best = i;
  });
  return best < 0 ? top : best;
}

/**
 * Выбрать следующий ход. history — ходы врага в этом бою; ctx — условия боя; memory мутируется (фазы).
 */
export function chooseMove(def: EnemyDef, history: readonly string[], rng: Rng, ctx: AiContext = DEFAULT_CTX, memory: AiMemory = {}): string {
  const moveIds = new Set(def.moves.map((m) => m.id));
  const fallback = def.moves[0]?.id;
  if (fallback === undefined) throw new Error(`Enemy ${def.id} has no moves`);
  const ai = def.ai;
  const turn = history.length + 1;

  switch (ai.kind) {
    case 'cycle':
      return cycle(ai.order, moveIds, history.length) ?? fallback;
    case 'random':
      return weightedNoTriple(ai.weights, moveIds, history, rng) ?? fallback;
    case 'phased': {
      if (ai.phases.length === 0) return fallback;
      const idx = activePhase(ai.phases, ctx.hpPct);
      const phase = ai.phases[idx]!;
      // Фазы не откатываются назад при лечении: только переход в фазу с меньшим порогом
      const cur = memory.aiPhase;
      if (cur === undefined || (cur !== idx && phase.hpAtMost < (ai.phases[cur]?.hpAtMost ?? Infinity))) {
        const entering = cur !== undefined;
        memory.aiPhase = idx;
        memory.aiPhaseStart = history.length;
        if (entering && phase.onEnter && moveIds.has(phase.onEnter)) {
          memory.aiPhaseStart = history.length + 1;
          return phase.onEnter;
        }
      }
      const active = ai.phases[memory.aiPhase!]!;
      const n = history.length - (memory.aiPhaseStart ?? 0);
      if (active.order) return cycle(active.order, moveIds, n) ?? fallback;
      if (active.weights) return weightedNoTriple(active.weights, moveIds, history, rng) ?? fallback;
      return fallback;
    }
    case 'scripted': {
      for (const step of ai.script) {
        if (!moveIds.has(step.move)) continue;
        if (step.once && history.includes(step.move)) continue;
        if (matchesCondition(step.when, turn, ctx)) return step.move;
      }
      return cycle(ai.fallback, moveIds, history.length) ?? fallback;
    }
  }
}
