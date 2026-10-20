/**
 * Правила зон (актов). Детерминированы, без ГСЧ; отключаются RunState.noZoneRules.
 */
import type { ZoneRuleId } from './types';

export const ZONE_RULES: Record<1 | 2 | 3 | 4, ZoneRuleId> = { 1: 'none', 2: 'overheat', 3: 'adaptive', 4: 'distortion' };

/** overheat: каждый N-й ход игрока враги получают Разгон */
export const OVERHEAT_EVERY = 3;
export const OVERHEAT_STRENGTH = 1;
/** adaptive: после стольких одинаковых атак подряд — сопротивление */
export const ADAPT_STREAK = 2;
/** adaptive: множитель урона атакой, к которой есть сопротивление */
export const ADAPT_RESIST_MULT = 0.5;

/** Лимит живых врагов на поле для summon по умолчанию */
export const SUMMON_LIMIT = 5;

export function zoneRuleFor(state: { act: 1 | 2 | 3 | 4; noZoneRules?: boolean }): ZoneRuleId {
  return state.noZoneRules ? 'none' : ZONE_RULES[state.act];
}

/** distortion: скрыто ли намерение обычного врага с индексом index на ходу turn (каждое второе, со сдвигом по ходу) */
export function isIntentDistorted(index: number, turn: number): boolean {
  return (index + turn) % 2 === 0;
}
