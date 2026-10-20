/** Режим «Перегрев»: константы и чистые функции шкалы Heat (0..100). Логика боя — в combat.ts. */
export const HEAT_MAX = 100;
export const HEAT_START = 20;
export const HEAT_PER_CARD = 4;
export const HEAT_PER_TURN = 6;
export const HEAT_COOL_AMOUNT = 30;
export const HEAT_COOL_HP = 6;
export const HEAT_IDLE_COOL = 15;
export const HEAT_AFTER_MELTDOWN = 40;
export const HEAT_MELTDOWN_HP_PCT = 0.15;
export const HEAT_SCORE_MULT = 1.15;

export interface HeatThreshold {
  at: number;
  name: string;
  text: string;
}

export const HEAT_THRESHOLDS: readonly HeatThreshold[] = [
  { at: 25, name: 'Разогрев', text: '+25% урона игрока' },
  { at: 50, name: 'Форсаж', text: '+1 карта в начале хода; враги бьют на 20% сильнее' },
  { at: 75, name: 'Критическая масса', text: 'первая карта хода бесплатна, +50% урона; враги бьют на 40% сильнее' },
];

/** Активный порог (0 — ни одного). */
export function heatLevel(heat: number): 0 | 1 | 2 | 3 {
  return heat >= 75 ? 3 : heat >= 50 ? 2 : heat >= 25 ? 1 : 0;
}

export function heatPlayerDamageMult(heat: number): number {
  const l = heatLevel(heat);
  return l === 3 ? 1.5 : l >= 1 ? 1.25 : 1;
}

export function heatEnemyDamageMult(heat: number): number {
  const l = heatLevel(heat);
  return l === 3 ? 1.4 : l === 2 ? 1.2 : 1;
}
