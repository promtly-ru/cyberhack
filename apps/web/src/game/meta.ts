/**
 * Метапрогрессия на стороне UI: опции забега из профиля, ежедневный забег (одна попытка в день).
 */
import type { ClassId, Difficulty, NewRunOptions } from './engine';
import { dailyClassId, dailySeed, unlockedOptions } from './engine';
import type { Profile } from '../net/types';

const DAILY_KEY = 'cyberhack:daily-played';

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
    daily: false,
    unlocked: unlockedOptions(profile),
    ...(mutators.length ? { mutators: [...mutators] } : {}),
  };
}

/** Ежедневный забег: сид дня, класс по дате, A0, всё содержимое открыто (одинаково для всех). */
export function dailyRunOptions(date: Date = new Date()): NewRunOptions {
  const seed = dailySeed(date);
  return { seed, classId: dailyClassId(seed), ascension: 0, daily: true };
}

export function todayDailyClass(date: Date = new Date()): ClassId | null {
  try {
    return dailyClassId(dailySeed(date));
  } catch {
    return null;
  }
}

function readLocalDaily(): string | null {
  try {
    return localStorage.getItem(DAILY_KEY);
  } catch {
    return null;
  }
}

export function markDailyLocal(seed: string): void {
  try {
    localStorage.setItem(DAILY_KEY, seed);
  } catch {
    /* приватный режим — флаг останется в профиле */
  }
}

/** Попытка на этот сид уже использована (флаг в профиле или локально). */
export function hasPlayedDaily(profile: Profile, seed: string): boolean {
  return profile.dailyPlayed === seed || readLocalDaily() === seed;
}
