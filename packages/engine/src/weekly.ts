/**
 * Еженедельный вызов: ISO-неделя (пн-вс, UTC). Из id недели ('2026-W43') детерминированно
 * выводятся класс, мутаторы, правило недели и множитель очков — одинаково у всех игроков и на сервере.
 */
import { MUTATORS, WEEKLY_RULES, getWeeklyRule, type MutatorDef } from './mutators';
import { hashString } from './rng';

export const WEEKLY_ATTEMPTS = 3;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 24 * 3600 * 1000;

export function isWeeklyId(id: string): boolean {
  const m = WEEK_RE.exec(id);
  if (!m) return false;
  const w = Number(m[2]);
  return w >= 1 && w <= 53;
}

/** Понедельник 00:00 UTC ISO-недели, в которую попадает date. */
function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // пн=0
  return new Date(d.getTime() - dow * DAY_MS);
}

/** Id ISO-недели по дате UTC: '2026-W43'. Он же сид забега. */
export function weeklySeed(date: Date): string {
  const mon = weekStart(date);
  const thu = new Date(mon.getTime() + 3 * DAY_MS); // год недели определяется четвергом
  const year = thu.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thu.getTime() - jan1) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Начало следующей недели (момент сброса таблицы), UTC. */
export function weeklyResetAt(date: Date): Date {
  return new Date(weekStart(date).getTime() + 7 * DAY_MS);
}

/** Id предыдущей недели. */
export function prevWeeklySeed(date: Date): string {
  return weeklySeed(new Date(weekStart(date).getTime() - DAY_MS));
}

export function weeklyClassId(seed: string, classIds: readonly string[]): string {
  if (classIds.length === 0) throw new Error('Content has no classes');
  return classIds[hashString(`${seed}:class`) % classIds.length]!;
}

/** Два разных мутатора недели (в каноническом порядке MUTATORS). */
export function weeklyMutatorPair(seed: string): [string, string] {
  const n = MUTATORS.length;
  const a = hashString(`${seed}:mut1`) % n;
  const b = (a + 1 + (hashString(`${seed}:mut2`) % (n - 1))) % n;
  const [i, j] = a < b ? [a, b] : [b, a];
  return [MUTATORS[i]!.id, MUTATORS[j]!.id];
}

export function weeklyRule(seed: string): MutatorDef {
  const r = WEEKLY_RULES[hashString(`${seed}:rule`) % WEEKLY_RULES.length]!;
  return getWeeklyRule(r.id)!;
}

/** Все модификаторы недели для RunState.mutators: 2 мутатора + правило. */
export function weeklyMutatorIds(seed: string): string[] {
  return [...weeklyMutatorPair(seed), weeklyRule(seed).id];
}

/** Множитель очков недели: 1.00..1.20 шагом 0.05. */
export function weeklyScoreMult(seed: string): number {
  return 1 + (hashString(`${seed}:score`) % 5) * 0.05;
}

/** Титул за участие в неделе: 'Чемпион W43'. */
export function weeklyTitle(seed: string): string {
  const m = WEEK_RE.exec(seed);
  return `Чемпион W${m ? m[2] : seed}`;
}
