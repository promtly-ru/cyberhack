/**
 * Статусы и формулы урона/блока.
 * Набор id фиксирован и общий с контентом.
 */
import type { CombatantState, StatusId } from './types';

export const STATUS = {
  vulnerable: 'vulnerable',
  weak: 'weak',
  frail: 'frail',
  strength: 'strength',
  dexterity: 'dexterity',
  virus: 'virus',
  thorns: 'thorns',
  regen: 'regen',
  ritual: 'ritual',
  plating: 'plating',
  /** Эхо: следующая сыгранная карта срабатывает дважды (−1 за карту) */
  echo: 'echo',
  /** Барьер: следующий удар, пробивший блок, полностью поглощается (−1 за удар) */
  barrier: 'barrier',
  /** Утечка: в начале хода −N HP; не тает, снимается, когда носитель получает блок */
  bleed: 'bleed',
  /** Метка: каждый удар атакой по носителю наносит +N урона; −1 в конце хода */
  mark: 'mark',
} as const;

/**
 * Поведение известных статусов:
 * duration — -1 в конце хода носителя; intensity — не тает;
 * decay — тает на 1 после срабатывания (virus, regen).
 */
export const KNOWN_STATUSES: Record<string, 'duration' | 'intensity' | 'decay'> = {
  vulnerable: 'duration',
  weak: 'duration',
  frail: 'duration',
  strength: 'intensity',
  dexterity: 'intensity',
  virus: 'decay',
  thorns: 'intensity',
  regen: 'decay',
  ritual: 'intensity',
  plating: 'intensity',
  echo: 'intensity',
  barrier: 'intensity',
  bleed: 'intensity',
  mark: 'duration',
};

/** Дебаффы движка (для снятия эффектом cleanse, если контент не знает статус). */
export const DEBUFF_STATUSES: ReadonlySet<string> = new Set(['vulnerable', 'weak', 'frail', 'virus', 'bleed', 'mark']);

export function getStatus(c: CombatantState, id: StatusId): number {
  return c.statuses[id] ?? 0;
}

/** Добавить amount к статусу; 0 удаляет ключ. Возвращает новое значение. */
export function addStatus(c: CombatantState, id: StatusId, amount: number): number {
  const v = getStatus(c, id) + amount;
  if (v === 0) delete c.statuses[id];
  else c.statuses[id] = v;
  return v;
}

/**
 * Урон за удар: (base + strength) × 0.75 при weak атакующего × 1.5 при vulnerable цели,
 * округление вниз, минимум 0. attacker = null — «сырой» источник без strength/weak.
 */
export function calcAttackDamage(base: number, attacker: CombatantState | null, defender: CombatantState | null): number {
  let d = base + (attacker ? getStatus(attacker, STATUS.strength) : 0) + (defender ? Math.max(0, getStatus(defender, STATUS.mark)) : 0);
  if (attacker && getStatus(attacker, STATUS.weak) > 0) d *= 0.75;
  if (defender && getStatus(defender, STATUS.vulnerable) > 0) d *= 1.5;
  return Math.max(0, Math.floor(d));
}

/** Блок: (base + dexterity) × 0.75 при frail, вниз, минимум 0. */
export function calcBlock(base: number, owner: CombatantState): number {
  let b = base + getStatus(owner, STATUS.dexterity);
  if (getStatus(owner, STATUS.frail) > 0) b *= 0.75;
  return Math.max(0, Math.floor(b));
}
