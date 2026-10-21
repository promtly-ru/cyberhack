/**
 * Режим без сервера: всё хранится в localStorage этого браузера — гость или офлайн-профиль
 * устройства (net/device.ts). Используется, когда не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,
 * а в supabase-режиме — для невошедшего в облако игрока и как локальный кэш.
 */
import { replay as engineReplay } from '@cyberhack/engine';
import type { Action, NewRunOptions, RunState } from '@cyberhack/engine';
import type { AuthApi, Backend, LeaderboardApi, LeaderboardEntry, Profile, SavedRun, SavesApi, User } from './types';
import { BackendNotConfiguredError } from './errors';
import { createDeviceAccounts, type DeviceAccounts } from './device';
import { CLASS_IDS, defaultProfile, normalizeProfile, normalizeSavedRun } from './profile';
import { browserStorage, isRecord, readJson, removeKey, writeJson, type KeyValueStorage } from './storage';

export type ReplayFn = (opts: NewRunOptions, actions: Action[]) => RunState;

export const GUEST_PREFIX = 'cyberhack:guest:';
export const GUEST_ID_KEY = `${GUEST_PREFIX}id`;
export const WEEKLY_SEED_RE = /^\d{4}-W\d{2}$/;
/** Ограничения, общие с сервером (Edge Function отвергнет больше) */
export const MAX_WEEKLY_ACTIONS = 20_000;

const LOCAL_WEEKLY_LIMIT = 300;

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
  let id: string | null;
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

/** Вход без сервера: гость или офлайн-профиль устройства. Почта/OAuth недоступны. */
export function createLocalAuth(device: DeviceAccounts): AuthApi {
  return {
    async getUser() {
      return device.user();
    },
    onChange(cb) {
      let active = true;
      // как onAuthStateChange в Supabase: сразу сообщаем текущего пользователя
      queueMicrotask(() => {
        if (active) cb(device.user());
      });
      const off = device.subscribe((u) => {
        if (active) cb(u);
      });
      return () => {
        active = false;
        off();
      };
    },
    async signInWithEmail() {
      throw new BackendNotConfiguredError();
    },
    async signUpWithPassword() {
      throw new BackendNotConfiguredError();
    },
    async signInWithPassword() {
      throw new BackendNotConfiguredError();
    },
    async verifyEmailCode() {
      throw new BackendNotConfiguredError();
    },
    async setPassword() {
      throw new BackendNotConfiguredError();
    },
    async signInWithOAuth() {
      throw new BackendNotConfiguredError();
    },
    async signOut() {
      // офлайн-профиль → гость; гость остаётся гостем
      await device.api.signOut();
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

interface LocalWeeklyResult {
  seed: string;
  classId: LeaderboardEntry['classId'];
  score: number;
  floor: number;
  victory: boolean;
  durationS: number | null;
  createdAt: string;
}

function readWeekly(storage: KeyValueStorage, key: string): LocalWeeklyResult[] {
  const raw = readJson(storage, key);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is LocalWeeklyResult =>
      isRecord(r) &&
      typeof r.seed === 'string' &&
      (CLASS_IDS as readonly unknown[]).includes(r.classId) &&
      typeof r.score === 'number' &&
      typeof r.floor === 'number' &&
      typeof r.victory === 'boolean' &&
      typeof r.createdAt === 'string',
  ).map((r) => ({ ...r, durationS: typeof r.durationS === 'number' ? r.durationS : null }));
}

function sortResults(rs: LocalWeeklyResult[]): LocalWeeklyResult[] {
  return [...rs].sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
}

/** Пересчитать забег и вытащить результат. null — забег некорректен или не завершён. */
export function scoreRun(
  replay: ReplayFn,
  seed: string,
  options: NewRunOptions,
  actions: Action[],
): Pick<LocalWeeklyResult, 'classId' | 'score' | 'floor' | 'victory'> | null {
  if (!WEEKLY_SEED_RE.test(seed) || options.seed !== seed) return null;
  if (!CLASS_IDS.includes(options.classId)) return null;
  if (!Array.isArray(actions) || actions.length > MAX_WEEKLY_ACTIONS) return null;
  let state: RunState;
  try {
    state = replay({ seed, classId: options.classId, ascension: 0, weekly: seed }, actions);
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

function toEntry(r: LocalWeeklyResult, rank: number): LeaderboardEntry {
  return { rank, displayName: 'Вы', classId: r.classId, score: r.score, floor: r.floor, victory: r.victory, durationS: r.durationS };
}

/** Локальная таблица собственных результатов (гость). В зачёт идёт лучшая попытка недели; лимит попыток держит профиль. */
export function createLocalLeaderboard(
  storage: KeyValueStorage,
  replay: ReplayFn = engineReplay,
  now: () => Date = () => new Date(),
  prefix: string = GUEST_PREFIX,
): LeaderboardApi {
  const key = `${prefix}weekly`;
  const best = (seed: string): LocalWeeklyResult | undefined => sortResults(readWeekly(storage, key).filter((r) => r.seed === seed))[0];
  return {
    async submitWeekly(seed, options, actions, durationS) {
      const result = scoreRun(replay, seed, options, actions);
      if (!result) return { accepted: false };
      const entry: LocalWeeklyResult = {
        seed,
        ...result,
        durationS: typeof durationS === 'number' && Number.isFinite(durationS) && durationS >= 0 ? Math.floor(durationS) : null,
        createdAt: now().toISOString(),
      };
      // храним последние LOCAL_WEEKLY_LIMIT результатов
      writeJson(storage, key, [...readWeekly(storage, key), entry].slice(-LOCAL_WEEKLY_LIMIT));
      return { accepted: true, rank: 1 };
    },
    async getWeekly(seed, limit = 50) {
      const b = best(seed);
      return b && limit > 0 ? [toEntry(b, 1)] : [];
    },
    async getWeeklyMine(seed) {
      const b = best(seed);
      return b ? toEntry(b, 1) : null;
    },
  };
}

// ---------- Backend ----------

export function createLocalBackend(opts: LocalBackendOptions = {}): Backend {
  const storage = opts.storage ?? browserStorage();
  const device = createDeviceAccounts({ storage, replay: opts.replay, now: opts.now, randomId: opts.randomId });
  return {
    mode: 'local',
    auth: createLocalAuth(device),
    saves: device.saves,
    leaderboard: device.leaderboard,
    profiles: device.api,
  };
}
