/**
 * Метапрогрессия на стороне UI: опции забега из профиля, еженедельный вызов (3 попытки в неделю).
 */
import type { ClassId, Difficulty, NewRunOptions } from './engine';
import { WEEKLY_ATTEMPTS, unlockedOptions, weeklyClass, weeklySeed, weeklyTitle } from './engine';
import type { Profile } from '../net/types';

const WEEKLY_KEY = 'cyberhack:weekly-attempts';

/** Фиксированный сид из адреса (?seed=ABC) — для e2e-тестов и воспроизведения багов. */
function urlSeed(): string | null {
  try {
    const s = new URLSearchParams(globalThis.location?.search ?? '').get('seed');
    return s && /^[\w-]{1,32}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

export function randomSeed(): string {
  const fixed = urlSeed();
  if (fixed) return fixed;
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/** Обычный забег: открытые карты/реликвии из профиля. */
export function regularRunOptions(
  profile: Profile,
  classId: ClassId,
  ascension: number,
  difficulty: Difficulty = 'normal',
  mutators: readonly string[] = [],
): NewRunOptions {
  return {
    seed: randomSeed(),
    classId,
    ascension,
    difficulty,
    unlocked: unlockedOptions(profile),
    ...(mutators.length ? { mutators: [...mutators] } : {}),
  };
}

/** Еженедельный вызов: сид = id ISO-недели, класс/мутаторы/правило по неделе, A0, всё содержимое открыто. */
export function weeklyRunOptions(date: Date = new Date()): NewRunOptions {
  const seed = weeklySeed(date);
  return { seed, classId: weeklyClass(seed), ascension: 0, weekly: seed };
}

/** Сколько попыток недели уже начато. */
export function weeklyAttemptsUsed(profile: Profile, seed: string): number {
  const used = profile.weekly?.seed === seed ? profile.weekly.attempts : 0;
  return Math.max(used, readLocalWeekly(seed));
}

export function weeklyAttemptsLeft(profile: Profile, seed: string): number {
  return Math.max(0, WEEKLY_ATTEMPTS - weeklyAttemptsUsed(profile, seed));
}

function readLocalWeekly(seed: string): number {
  try {
    const [s, n] = (localStorage.getItem(WEEKLY_KEY) ?? '').split('|');
    return s === seed ? Math.min(WEEKLY_ATTEMPTS, Math.max(0, Number(n) || 0)) : 0;
  } catch {
    return 0;
  }
}

export function markWeeklyLocal(seed: string, attempts: number): void {
  try {
    localStorage.setItem(WEEKLY_KEY, `${seed}|${attempts}`);
  } catch {
    /* приватный режим — счётчик останется в профиле */
  }
}

/** Профиль с учтённой начатой попыткой недели. */
export function withWeeklyAttempt(profile: Profile, seed: string): Profile {
  return { ...profile, weekly: { seed, attempts: Math.min(WEEKLY_ATTEMPTS, weeklyAttemptsUsed(profile, seed) + 1) } };
}

/** Профиль с титулом недели (эксклюзив за участие в зачёте). */
export function withWeeklyTitle(profile: Profile, seed: string): Profile {
  const title = weeklyTitle(seed);
  return profile.titles?.includes(title) ? profile : { ...profile, titles: [...(profile.titles ?? []), title].sort() };
}
