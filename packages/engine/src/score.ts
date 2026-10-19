/**
 * Счёт забега: этажи ×5 + элиты ×25 + боссы ×100 + победа 300 + ascension ×50
 * + бонус за HP при победе (1 очко за единицу HP).
 */
import { mutatorScoreMult } from './mutators';
import { weeklyScoreMult } from './weekly';
import type { RunState } from './types';

export const SCORE = {
  perFloor: 5,
  perElite: 25,
  perBoss: 100,
  victory: 300,
  perAscension: 50,
  perHpOnVictory: 1,
} as const;

export function computeScore(s: RunState): number {
  const won = s.status === 'won';
  const mult = mutatorScoreMult(s.mutators) * (s.weekly ? weeklyScoreMult(s.weekly) : 1);
  const base =
    s.floor * SCORE.perFloor +
    s.stats.elitesKilled * SCORE.perElite +
    s.stats.bossesKilled * SCORE.perBoss +
    (won ? SCORE.victory + Math.max(0, s.hp) * SCORE.perHpOnVictory : 0) +
    s.ascension * SCORE.perAscension;
  // Мутаторы забега дают бонус к счёту (см. mutators.ts)
  return mult === 1 ? base : Math.round(base * mult);
}
