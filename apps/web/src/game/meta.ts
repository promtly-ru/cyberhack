/**
 * Метапрогрессия на стороне UI: опции забега из профиля, еженедельный вызов (3 попытки в неделю).
 */
import type { ClassId, Difficulty, NewRunOptions } from './engine';
import { WEEKLY_ATTEMPTS, unlockedOptions, weeklyClass, weeklySeed, weeklyTitle } from './engine';
import type { Profile } from '../net/types';
import { lockableFirmwares, metaUnlockedContent, syncAchievements, type MetaExtraState } from '@cyberhack/engine';

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
  heat = false,
): NewRunOptions {
  return {
    seed: randomSeed(),
    classId,
    ascension,
    difficulty,
    unlocked: metaRunUnlocked(profile, activeMetaExtra),
    ...(mutators.length ? { mutators: [...mutators] } : {}),
    ...(heat ? { heat: true } : {}),
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

// ---------------- Мета-прогресс v2: открытые прошивки, ачивки с наградами, валюта, косметика ----------------

/**
 * Данные, которых нет в старом Profile. Хранятся отдельно (localStorage по пользователю), чтобы
 * net/profile.ts (normalizeProfile отбрасывает незнакомые поля) не терял их. Когда сетевой слой
 * начнёт хранить эти поля в Profile, используйте normalizeMetaExtra/mergeMetaExtra отсюда.
 */
export interface MetaExtra extends MetaExtraState {
  v: typeof META_EXTRA_VERSION;
}

export const META_EXTRA_VERSION = 1;
const META_EXTRA_KEY = 'cyberhack:meta-extra';

export function defaultMetaExtra(): MetaExtra {
  return {
    v: META_EXTRA_VERSION,
    unlockedFirmwares: [],
    achievements: {},
    currency: 0,
    cosmetics: [],
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strList(v: unknown, limit = 500): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) if (typeof x === 'string' && x.length > 0 && x.length <= 64 && out.size < limit) out.add(x);
  return [...out];
}

function nat(v: unknown, max = 1_000_000_000): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
}

/**
 * Привести сохранённые данные к MetaExtra (миграция без потери данных):
 * - нет данных / мусор → значения по умолчанию;
 * - v0: achievements как string[] (забранные), claimedAchievements: string[], firmwares/ownedFirmwares: string[];
 * - старая коллекция прошивок (firmwareCollection, firmwares, ownedFirmwares): закрываемые прошивки из неё
 *   остаются открытыми, уровни и копии отбрасываются — прошивки теперь живут только в забеге.
 */
export function normalizeMetaExtra(raw: unknown): MetaExtra {
  const out = defaultMetaExtra();
  if (!isObj(raw)) return out;
  const lockable = new Set(lockableFirmwares());
  const legacy = [...(isObj(raw.firmwareCollection) ? Object.keys(raw.firmwareCollection) : []), ...strList(raw.firmwares), ...strList(raw.ownedFirmwares)];
  out.unlockedFirmwares = [...new Set([...strList(raw.unlockedFirmwares), ...legacy.filter((id) => lockable.has(id))])];
  if (Array.isArray(raw.achievements)) {
    for (const id of strList(raw.achievements)) out.achievements[id] = { completed: true, claimed: true };
  } else if (isObj(raw.achievements)) {
    for (const [id, r] of Object.entries(raw.achievements)) {
      if (!isObj(r)) continue;
      const claimed = r.claimed === true;
      const completed = claimed || r.completed === true;
      if (completed) out.achievements[id] = { completed, ...(claimed ? { claimed } : {}) };
    }
  }
  for (const id of strList(raw.claimedAchievements)) out.achievements[id] = { completed: true, claimed: true };
  out.currency = nat(raw.currency);
  out.cosmetics = strList(raw.cosmetics);
  return out;
}

/** Слияние двух копий (гость → аккаунт, два устройства): объединение, максимум по числам. */
export function mergeMetaExtra(a: MetaExtra, b: MetaExtra): MetaExtra {
  const out = defaultMetaExtra();
  out.unlockedFirmwares = [...new Set([...a.unlockedFirmwares, ...b.unlockedFirmwares])].sort();
  for (const id of new Set([...Object.keys(a.achievements), ...Object.keys(b.achievements)])) {
    const claimed = !!(a.achievements[id]?.claimed || b.achievements[id]?.claimed);
    out.achievements[id] = { completed: true, ...(claimed ? { claimed } : {}) };
  }
  out.currency = Math.max(a.currency, b.currency);
  out.cosmetics = [...new Set([...a.cosmetics, ...b.cosmetics])].sort();
  return out;
}

/** Миграция из профиля: если поля v2 когда-нибудь окажутся в Profile (сетевой слой), они не потеряются. */
export function metaExtraFromProfile(profile: unknown): MetaExtra | null {
  if (!isObj(profile)) return null;
  const keys = ['unlockedFirmwares', 'firmwareCollection', 'currency', 'cosmetics', 'achievementStates'];
  if (!keys.some((k) => k in profile)) return null;
  return normalizeMetaExtra({ ...profile, achievements: profile.achievementStates });
}

function storageKey(userId: string | null | undefined): string {
  return `${META_EXTRA_KEY}:${userId ?? 'guest'}`;
}

export function loadMetaExtra(userId: string | null | undefined, profile?: unknown): MetaExtra {
  let stored = defaultMetaExtra();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) stored = normalizeMetaExtra(JSON.parse(raw));
  } catch {
    /* нет localStorage (тесты, приватный режим) или битый JSON — начинаем с пустого */
  }
  const fromProfile = metaExtraFromProfile(profile);
  return fromProfile ? mergeMetaExtra(stored, fromProfile) : stored;
}

export function saveMetaExtra(userId: string | null | undefined, extra: MetaExtra): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(extra));
  } catch {
    /* приватный режим — прогресс живёт до перезагрузки */
  }
}

/** Текущие мета-данные игрока для опций забега (ставит store). */
let activeMetaExtra: MetaExtra | null = null;

export function setActiveMetaExtra(extra: MetaExtra | null): void {
  activeMetaExtra = extra;
}

/** Открытое для забега: профиль + награды выполненных ачивок v2 + открытые прошивки. */
export function metaRunUnlocked(profile: Profile, extra: MetaExtra | null): NonNullable<NewRunOptions['unlocked']> {
  const base = unlockedOptions(profile);
  const meta = metaUnlockedContent(profile, extra ?? defaultMetaExtra());
  return { ...base, cards: [...new Set([...(base.cards ?? []), ...meta.cards])], firmwares: meta.firmwares };
}

/** Отметить выполненные ачивки (липко). */
export function syncMetaAchievements(profile: Profile, extra: MetaExtra): { extra: MetaExtra; newlyCompleted: string[] } {
  return syncAchievements(profile, extra);
}
