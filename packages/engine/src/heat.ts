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

/** «Слив ядра»: доступен с этого Heat, сбрасывает до HEAT_AFTER_VENT и бьёт всех врагов на heat × HEAT_VENT_DMG_PER_HEAT. */
export const HEAT_VENT_MIN = 50;
export const HEAT_AFTER_VENT = 15;
export const HEAT_VENT_DMG_PER_HEAT = 0.4;
/** Расплавление при 100: тот же взрыв по врагам (множитель слабее слива), но игрок теряет HP. */
export const HEAT_MELTDOWN_BLAST = 0.3;

/** Урон по каждому врагу от слива/расплавления при данном Heat. */
export function heatBlastDamage(heat: number, perHeat: number): number {
  return Math.max(1, Math.floor(heat * perHeat));
}

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
