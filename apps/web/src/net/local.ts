/**
 * Гостевой режим без сервера: всё хранится в localStorage этого браузера.
 * Используется, когда не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,
 * а в supabase-режиме — для невошедшего игрока и как локальный кэш.
 */
import { replay as engineReplay } from '@cyberhack/engine';
import type { Action, NewRunOptions, RunState } from '@cyberhack/engine';
import type { AuthApi, Backend, LeaderboardApi, LeaderboardEntry, Profile, SavedRun, SavesApi, User } from './types';
import { BackendNotConfiguredError } from './errors';
import { CLASS_IDS, MAX_ASCENSION, defaultProfile, normalizeProfile, normalizeSavedRun } from './profile';
import { browserStorage, isRecord, readJson, removeKey, writeJson, type KeyValueStorage } from './storage';

export type ReplayFn = (opts: NewRunOptions, actions: Action[]) => RunState;

export const GUEST_PREFIX = 'cyberhack:guest:';
export const GUEST_ID_KEY = `${GUEST_PREFIX}id`;
export const DAILY_SEED_RE = /^daily-\d{4}-\d{2}-\d{2}$/;
/** Ограничения, общие с сервером (Edge Function отвергнет больше) */
export const MAX_DAILY_ACTIONS = 20_000;

const LOCAL_DAILY_LIMIT = 300;

export interface LocalBackendOptions {
  storage?: KeyValueStorage;
  replay?: ReplayFn;
  now?: () => Date;
  randomId?: () => string;
}

function defaultRandomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // запасной вариант для старых браузеров: не криптостойкий, но id гостя — не секрет
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- Auth ----------

export function guestUser(storage: KeyValueStorage, randomId: () => string = defaultRandomId): User {
  let id: string | null = null;
  try {
    id = storage.getItem(GUEST_ID_KEY);
  } catch {
    id = null;
  }
  if (!id || !/^guest-[\w-]{8,64}$/.test(id)) {
    id = `guest-${randomId()}`;
    try {
      storage.setItem(GUEST_ID_KEY, id);
    } catch {
      // без хранилища id стабилен только в рамках сессии
    }
  }
  return { id, email: null, displayName: 'Гость', provider: 'guest' };
}

export function createLocalAuth(storage: KeyValueStorage, randomId?: () => string): AuthApi {
  let cached: User | null = null;
  const user = () => (cached ??= guestUser(storage, randomId));
  return {
    async getUser() {
      return user();
    },
    onChange(cb) {
      let active = true;
      // как onAuthStateChange в Supabase: сразу сообщаем текущего пользователя
      queueMicrotask(() => {
        if (active) cb(user());
      });
      return () => {
        active = false;
      };
    },
    async signInWithEmail() {
      throw new BackendNotConfiguredError();
    },
    async signInWithOAuth() {
      throw new BackendNotConfiguredError();
    },
    async signOut() {
      // гость не может выйти
    },
  };
}

// ---------- Saves ----------

export interface LocalSaves extends SavesApi {
  /** Синхронные версии — для слияния гостевого прогресса и офлайн-кэша */
  readRun(): SavedRun | null;
  readProfile(): Profile;
}

/** Сохранения в хранилище под префиксом (гость: 'cyberhack:guest:', кэш пользователя: 'cyberhack:user:<id>:'). */
export function createLocalSaves(storage: KeyValueStorage, prefix: string = GUEST_PREFIX): LocalSaves {
  const runKey = `${prefix}run`;
  const profileKey = `${prefix}profile`;
  const readRun = () => normalizeSavedRun(readJson(storage, runKey));
  const readProfile = () => {
    const raw = readJson(storage, profileKey);
    return raw === null ? defaultProfile() : normalizeProfile(raw);
  };
  return {
    readRun,
    readProfile,
    async loadRun() {
      return readRun();
    },
    async saveRun(run) {
      writeJson(storage, runKey, run);
    },
    async clearRun() {
      removeKey(storage, runKey);
    },
    async loadProfile() {
      return readProfile();
    },
    async saveProfile(profile) {
      writeJson(storage, profileKey, normalizeProfile(profile));
    },
  };
}

// ---------- Leaderboard ----------

interface LocalDailyResult {
  seed: string;
  classId: LeaderboardEntry['classId'];
  score: number;
  floor: number;
  victory: boolean;
  createdAt: string;
}

function readDaily(storage: KeyValueStorage, key: string): LocalDailyResult[] {
  const raw = readJson(storage, key);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is LocalDailyResult =>
      isRecord(r) &&
      typeof r.seed === 'string' &&
      (CLASS_IDS as readonly unknown[]).includes(r.classId) &&
      typeof r.score === 'number' &&
      typeof r.floor === 'number' &&
      typeof r.victory === 'boolean' &&
      typeof r.createdAt === 'string',
  );
}

function sortResults(rs: LocalDailyResult[]): LocalDailyResult[] {
  return [...rs].sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
}

/** Пересчитать забег и вытащить результат. null — забег некорректен или не завершён. */
export function scoreRun(
  replay: ReplayFn,
  seed: string,
  options: NewRunOptions,
  actions: Action[],
): Pick<LocalDailyResult, 'classId' | 'score' | 'floor' | 'victory'> | null {
  if (!DAILY_SEED_RE.test(seed) || options.seed !== seed) return null;
  if (!CLASS_IDS.includes(options.classId)) return null;
  if (!Array.isArray(actions) || actions.length > MAX_DAILY_ACTIONS) return null;
  const ascension = Math.trunc(options.ascension ?? 0);
  if (!(ascension >= 0 && ascension <= MAX_ASCENSION)) return null;
  let state: RunState;
  try {
    state = replay({ seed, classId: options.classId, ascension, daily: true }, actions);
  } catch {
    return null;
  }
  if (state.status === 'active' || state.seed !== seed) return null;
  if (!Number.isFinite(state.score) || !Number.isFinite(state.floor)) return null;
  return {
    classId: state.classId,
    score: Math.max(0, Math.floor(state.score)),
    floor: Math.max(0, Math.floor(state.floor)),
    victory: state.status === 'won',
  };
}

/** Локальная таблица собственных результатов (гость). Несколько попыток на сид разрешены — это тренировка. */
export function createLocalLeaderboard(
  storage: KeyValueStorage,
  replay: ReplayFn = engineReplay,
  now: () => Date = () => new Date(),
  prefix: string = GUEST_PREFIX,
): LeaderboardApi {
  const key = `${prefix}daily`;
  return {
    async submitDaily(seed, options, actions) {
      const result = scoreRun(replay, seed, options, actions);
      if (!result) return { accepted: false };
      const entry: LocalDailyResult = { seed, ...result, createdAt: now().toISOString() };
      const all = [...readDaily(storage, key), entry];
      // храним последние LOCAL_DAILY_LIMIT результатов
      const trimmed = all.slice(-LOCAL_DAILY_LIMIT);
      writeJson(storage, key, trimmed);
      const rank = sortResults(trimmed.filter((r) => r.seed === seed)).indexOf(entry) + 1;
      return { accepted: true, rank };
    },
    async getDaily(seed, limit = 50) {
      return sortResults(readDaily(storage, key).filter((r) => r.seed === seed))
        .slice(0, Math.max(0, limit))
        .map((r, i) => ({
          rank: i + 1,
          displayName: 'Вы',
          classId: r.classId,
          score: r.score,
          floor: r.floor,
          victory: r.victory,
        }));
    },
  };
}

// ---------- Backend ----------

export function createLocalBackend(opts: LocalBackendOptions = {}): Backend {
  const storage = opts.storage ?? browserStorage();
  return {
    mode: 'local',
    auth: createLocalAuth(storage, opts.randomId),
    saves: createLocalSaves(storage),
    leaderboard: createLocalLeaderboard(storage, opts.replay, opts.now),
  };
}
