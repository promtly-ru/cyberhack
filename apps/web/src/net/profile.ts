/**
 * Профиль метапрогрессии: значение по умолчанию, валидация «сырых» данных и слияние
 * (перенос гостевого прогресса в облако, конфликт двух устройств).
 */
import type { ClassId, LifetimeStats } from '@cyberhack/engine';
import type { Profile, SavedRun, WeeklyProgress } from './types';
import { isRecord } from './storage';

export const CLASS_IDS: readonly ClassId[] = ['netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono'];
export const MAX_ASCENSION = 15;

function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && (CLASS_IDS as readonly string[]).includes(v);
}

export function defaultProfile(): Profile {
  return {
    unlockedClasses: ['netrunner'],
    unlockedCards: [],
    unlockedRelics: [],
    maxAscension: { netrunner: 0, phreaker: 0, ghost: 0, samurai: 0, engineer: 0, biohacker: 0, droneop: 0, chrono: 0 },
    achievements: [],
    totalRuns: 0,
    totalWins: 0,
  };
}

function stringList(v: unknown, limit = 1000): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0 && x.length <= 64) out.add(x);
    if (out.size >= limit) break;
  }
  return [...out];
}

function count(v: unknown, max = 1_000_000): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
}

/** Привести что угодно (JSON из localStorage/БД) к корректному Profile. Мусор отбрасывается. */
export function normalizeProfile(raw: unknown): Profile {
  const base = defaultProfile();
  if (!isRecord(raw)) return base;
  const classes = stringList(raw.unlockedClasses).filter(isClassId);
  const maxAsc = { ...base.maxAscension };
  if (isRecord(raw.maxAscension)) {
    for (const id of CLASS_IDS) maxAsc[id] = count(raw.maxAscension[id], MAX_ASCENSION);
  }
  return {
    unlockedClasses: classes.length > 0 ? union(base.unlockedClasses, classes) : base.unlockedClasses,
    unlockedCards: stringList(raw.unlockedCards),
    unlockedRelics: stringList(raw.unlockedRelics),
    maxAscension: maxAsc,
    achievements: stringList(raw.achievements),
    totalRuns: count(raw.totalRuns),
    totalWins: count(raw.totalWins),
    ...optional(normalizeLifetime(raw.lifetime), normalizeWeekly(raw.weekly), normalizeTitles(raw.titles)),
  };
}

/** Опциональные поля добавляются только если есть (старые профили не меняют форму). */
function optional(
  lifetime: LifetimeStats | undefined,
  weekly: WeeklyProgress | undefined,
  titles: string[] | undefined,
): Pick<Profile, 'lifetime' | 'weekly' | 'titles'> {
  return { ...(lifetime ? { lifetime } : {}), ...(weekly ? { weekly } : {}), ...(titles && titles.length > 0 ? { titles } : {}) };
}

const WEEK_RE = /^\d{4}-W\d{2}$/;
const MAX_WEEKLY_ATTEMPTS = 3;

function normalizeWeekly(v: unknown): WeeklyProgress | undefined {
  if (!isRecord(v) || typeof v.seed !== 'string' || !WEEK_RE.test(v.seed)) return undefined;
  const n = typeof v.attempts === 'number' && Number.isFinite(v.attempts) ? Math.trunc(v.attempts) : 0;
  return { seed: v.seed, attempts: Math.min(MAX_WEEKLY_ATTEMPTS, Math.max(0, n)) };
}

function normalizeTitles(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40).slice(0, 200);
  return out.length > 0 ? [...new Set(out)].sort() : undefined;
}

function normalizeLifetime(v: unknown): LifetimeStats | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, number> = {};
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (k.length === 0 || k.length > 64 || typeof x !== 'number' || !Number.isFinite(x)) continue;
    out[k] = count(x, 1_000_000_000);
    if (++n >= 100) break;
  }
  return n > 0 ? (out as LifetimeStats) : undefined;
}

function mergeLifetime(a: LifetimeStats | undefined, b: LifetimeStats | undefined): LifetimeStats | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  const out: Record<string, number> = { ...(a as Record<string, number>) };
  for (const [k, v] of Object.entries(b as Record<string, number>)) out[k] = Math.max(out[k] ?? 0, v);
  return out as LifetimeStats;
}

function mergeWeekly(a: WeeklyProgress | undefined, b: WeeklyProgress | undefined): WeeklyProgress | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  if (a.seed === b.seed) return { seed: a.seed, attempts: Math.max(a.attempts, b.attempts) };
  return { ...(a.seed > b.seed ? a : b) };
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

/** Слияние прогресса: объединение разблокировок, максимум по числам. Коммутативно и идемпотентно. */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  const maxAscension = { ...a.maxAscension };
  for (const id of CLASS_IDS) maxAscension[id] = Math.max(a.maxAscension[id] ?? 0, b.maxAscension[id] ?? 0);
  const sorted = (xs: string[]) => [...xs].sort();
  return {
    unlockedClasses: CLASS_IDS.filter((id) => a.unlockedClasses.includes(id) || b.unlockedClasses.includes(id)),
    unlockedCards: sorted(union(a.unlockedCards, b.unlockedCards)),
    unlockedRelics: sorted(union(a.unlockedRelics, b.unlockedRelics)),
    maxAscension,
    achievements: sorted(union(a.achievements, b.achievements)),
    totalRuns: Math.max(a.totalRuns, b.totalRuns),
    totalWins: Math.max(a.totalWins, b.totalWins),
    ...optional(mergeLifetime(a.lifetime, b.lifetime), mergeWeekly(a.weekly, b.weekly), normalizeTitles([...(a.titles ?? []), ...(b.titles ?? [])])),
  };
}

/** Есть ли в профиле хоть какой-то прогресс сверх стартового. */
export function hasProgress(p: Profile): boolean {
  const d = defaultProfile();
  return JSON.stringify(mergeProfiles(p, d)) !== JSON.stringify(mergeProfiles(d, d));
}

/** Минимальная проверка формы сохранения (повреждённые данные → null). */
export function normalizeSavedRun(raw: unknown): SavedRun | null {
  if (!isRecord(raw)) return null;
  const { options, actions, state, updatedAt } = raw;
  if (!isRecord(options) || typeof options.seed !== 'string' || !isClassId(options.classId)) return null;
  if (!Array.isArray(actions) || !actions.every(isRecord)) return null;
  if (!isRecord(state)) return null;
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) return null;
  return raw as unknown as SavedRun;
}

/** Сравнение ISO-времён: >0 если a новее b. */
export function compareIso(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}
