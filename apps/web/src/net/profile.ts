/**
 * Профиль метапрогрессии: значение по умолчанию, валидация «сырых» данных и слияние
 * (перенос гостевого прогресса в облако, конфликт двух устройств).
 */
import type { ClassId } from '@cyberhack/engine';
import type { Profile, SavedRun } from './types';
import { isRecord } from './storage';

export const CLASS_IDS: readonly ClassId[] = ['netrunner', 'phreaker', 'ghost'];
export const MAX_ASCENSION = 15;

function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && (CLASS_IDS as readonly string[]).includes(v);
}

export function defaultProfile(): Profile {
  return {
    unlockedClasses: ['netrunner'],
    unlockedCards: [],
    unlockedRelics: [],
    maxAscension: { netrunner: 0, phreaker: 0, ghost: 0 },
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
  };
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
