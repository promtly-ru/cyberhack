/**
 * Офлайн-профили на устройстве: несколько игроков в одном браузере, без сервера.
 *
 * Ключи localStorage:
 *   cyberhack:guest:*            — гость (как и раньше, ничего не переезжает)
 *   cyberhack:profiles           — список профилей [{ id, name, createdAt, pin? }]
 *   cyberhack:profiles:active    — id активного профиля (нет ключа — гость)
 *   cyberhack:local:<id>:*       — прогресс профиля: run, profile, daily
 *
 * ВАЖНО: PIN — защита от случайного входа брата/сестры, а НЕ криптографическая защита.
 * 4 цифры перебираются за доли секунды, а данные лежат в localStorage открыто.
 * Хеш (SHA-256 с солью) нужен лишь затем, чтобы PIN не лежал в хранилище как есть.
 */
import { replay as engineReplay } from '@cyberhack/engine';
import type { DeviceProfile, DeviceProfilesApi, LeaderboardApi, User } from './types';
import { LocalProfileError } from './errors';
import { hasProgress } from './profile';
import { isRecord, readJson, removeKey, writeJson, type KeyValueStorage } from './storage';
import { GUEST_PREFIX, createLocalLeaderboard, createLocalSaves, guestUser, type LocalSaves, type ReplayFn } from './local';

export const PROFILES_KEY = 'cyberhack:profiles';
export const ACTIVE_PROFILE_KEY = 'cyberhack:profiles:active';
export const localPrefix = (id: string) => `cyberhack:local:${id}:`;

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const MAX_PROFILES = 20;
/** Части прогресса, которые хранятся под префиксом игрока */
const DATA_SUFFIXES = ['profile', 'run', 'daily'] as const;

const ID_RE = /^local-[\w-]{8,64}$/;
const PIN_RE = /^\d{4}$/;
const NAME_CHARS_RE = /^[\p{L}\p{N} _.-]+$/u;

interface PinHash {
  algo: 'sha256' | 'fnv';
  salt: string;
  hash: string;
}

interface StoredProfile {
  id: string;
  name: string;
  createdAt: string;
  pin?: PinHash;
}

export interface DeviceAccountsOptions {
  storage: KeyValueStorage;
  replay?: ReplayFn;
  now?: () => Date;
  randomId?: () => string;
}

/** Всё, что нужно бэкендам: текущий игрок устройства и его хранилище. */
export interface DeviceAccounts {
  api: DeviceProfilesApi;
  /** Текущий игрок устройства: офлайн-профиль или гость (никогда не null) */
  user(): User;
  /** Офлайн-профиль как пользователь; null — гость */
  activeUser(): User | null;
  /** Префикс ключей текущего игрока */
  prefix(): string;
  /** Сохранения текущего игрока (префикс берётся в момент каждого вызова) */
  saves: LocalSaves;
  leaderboard: LeaderboardApi;
  /** Сообщает о входе/выходе/переключении (синхронно, после записи в хранилище) */
  subscribe(cb: (user: User) => void): () => void;
}

// ---------- Ник и PIN ----------

/** Привести ник к виду для хранения: обрезать края, схлопнуть пробелы. */
export function cleanName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Проверить ник. Возвращает очищенный ник или бросает LocalProfileError. */
export function validateName(raw: string): string {
  const name = cleanName(raw);
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) {
    throw new LocalProfileError('name_length', `Ник — от ${NAME_MIN} до ${NAME_MAX} символов`);
  }
  if (!NAME_CHARS_RE.test(name)) {
    throw new LocalProfileError('name_chars', 'В нике можно использовать буквы, цифры, пробел и знаки «-», «_», «.»');
  }
  return name;
}

const nameKey = (name: string) => cleanName(name).toLocaleLowerCase('ru-RU');

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes);
}

/** Запасной хеш (FNV-1a, 2×32 бита) — если crypto.subtle недоступен (страница открыта по http не с localhost). */
function fnvHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function subtle(): SubtleCrypto | null {
  const s = globalThis.crypto?.subtle;
  return s && typeof s.digest === 'function' ? s : null;
}

async function digest(algo: PinHash['algo'], salt: string, pin: string): Promise<string> {
  const text = `${salt}:${pin}`;
  if (algo === 'fnv') return fnvHash(text);
  const s = subtle();
  if (!s) throw new LocalProfileError('pin_wrong', 'Этот браузер не может проверить PIN');
  const buf = await s.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(buf));
}

export async function hashPin(pin: string): Promise<PinHash> {
  const salt = randomSalt();
  const algo: PinHash['algo'] = subtle() ? 'sha256' : 'fnv';
  return { algo, salt, hash: await digest(algo, salt, pin) };
}

export async function checkPin(stored: PinHash, pin: string): Promise<boolean> {
  return (await digest(stored.algo, stored.salt, pin)) === stored.hash;
}

function validatePin(pin: string | undefined): string | undefined {
  if (pin === undefined || pin === '') return undefined;
  if (!PIN_RE.test(pin)) throw new LocalProfileError('pin_format', 'PIN — ровно 4 цифры');
  return pin;
}

// ---------- Хранилище списка ----------

function isPinHash(v: unknown): v is PinHash {
  return (
    isRecord(v) &&
    (v.algo === 'sha256' || v.algo === 'fnv') &&
    typeof v.salt === 'string' &&
    typeof v.hash === 'string' &&
    v.salt.length > 0 &&
    v.hash.length > 0
  );
}

/** Прочитать список профилей; мусор и дубликаты отбрасываются. */
export function readProfiles(storage: KeyValueStorage): StoredProfile[] {
  const raw = readJson(storage, PROFILES_KEY);
  if (!Array.isArray(raw)) return [];
  const out: StoredProfile[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isRecord(r) || typeof r.id !== 'string' || !ID_RE.test(r.id) || typeof r.name !== 'string') continue;
    const name = cleanName(r.name).slice(0, 40);
    if (!name || seen.has(r.id) || seen.has(nameKey(name))) continue;
    seen.add(r.id);
    seen.add(nameKey(name));
    const createdAt = typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt)) ? r.createdAt : new Date(0).toISOString();
    out.push({
      id: r.id,
      name,
      createdAt,
      ...(isPinHash(r.pin) ? { pin: r.pin } : {}),
    });
  }
  return out;
}

function publicInfo(p: StoredProfile): DeviceProfile {
  return { id: p.id, name: p.name, hasPin: !!p.pin, createdAt: p.createdAt };
}

function profileUser(p: StoredProfile): User {
  return { id: p.id, email: null, displayName: p.name, provider: 'local' };
}

function defaultRandomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Скопировать данные игрока from → to (только существующие ключи). Возвращает записанные ключи. */
function copyData(storage: KeyValueStorage, from: string, to: string): string[] {
  const written: string[] = [];
  try {
    for (const s of DATA_SUFFIXES) {
      const v = readJson(storage, `${from}${s}`);
      if (v === null) continue;
      writeJson(storage, `${to}${s}`, v);
      written.push(`${to}${s}`);
    }
  } catch (e) {
    for (const k of written) removeKey(storage, k);
    throw e;
  }
  return written;
}

function removeData(storage: KeyValueStorage, prefix: string): void {
  for (const s of DATA_SUFFIXES) removeKey(storage, `${prefix}${s}`);
}

// ---------- Менеджер ----------

export function createDeviceAccounts(opts: DeviceAccountsOptions): DeviceAccounts {
  const { storage } = opts;
  const randomId = opts.randomId ?? defaultRandomId;
  const listeners = new Set<(u: User) => void>();
  const guestSaves = createLocalSaves(storage, GUEST_PREFIX);

  /**
   * Активный профиль держим в памяти этой вкладки: если в другой вкладке переключат профиль,
   * эта продолжит писать своему игроку до перезагрузки (а не перемешает прогресс).
   */
  let activeId: string | null = (() => {
    let id: string | null = null;
    try {
      id = storage.getItem(ACTIVE_PROFILE_KEY);
    } catch {
      id = null;
    }
    return id && readProfiles(storage).some((p) => p.id === id) ? id : null;
  })();

  const find = (id: string | null) => (id ? (readProfiles(storage).find((p) => p.id === id) ?? null) : null);
  const activeStored = () => find(activeId);
  const prefix = () => {
    const p = activeStored();
    return p ? localPrefix(p.id) : GUEST_PREFIX;
  };
  const user = (): User => {
    const p = activeStored();
    return p ? profileUser(p) : guestUser(storage, opts.randomId);
  };

  function setActive(id: string | null): void {
    activeId = id;
    try {
      if (id) storage.setItem(ACTIVE_PROFILE_KEY, id);
      else storage.removeItem(ACTIVE_PROFILE_KEY);
    } catch {
      // без хранилища вход живёт до перезагрузки
    }
    const u = user();
    for (const cb of [...listeners]) cb(u);
  }

  function writeList(list: StoredProfile[]): void {
    writeJson(storage, PROFILES_KEY, list);
  }

  async function requirePin(p: StoredProfile, pin: string | undefined): Promise<void> {
    if (!p.pin) return;
    if (pin === undefined || pin === '') throw new LocalProfileError('pin_required', 'Введи PIN этого профиля');
    if (!PIN_RE.test(pin) || !(await checkPin(p.pin, pin))) throw new LocalProfileError('pin_wrong', 'Неверный PIN');
  }

  const notFound = () => new LocalProfileError('not_found', 'Профиль не найден — возможно, его уже удалили');

  const api: DeviceProfilesApi = {
    list() {
      return readProfiles(storage)
        .map(publicInfo)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    },
    current() {
      const p = activeStored();
      return p ? publicInfo(p) : null;
    },
    guestHasProgress() {
      return hasProgress(guestSaves.readProfile()) || guestSaves.readRun() !== null || readJson(storage, `${GUEST_PREFIX}daily`) !== null;
    },
    async create({ name: rawName, pin: rawPin, importGuest = false }) {
      const name = validateName(rawName);
      const pin = validatePin(rawPin);
      const list = readProfiles(storage);
      if (list.some((p) => nameKey(p.name) === nameKey(name))) {
        throw new LocalProfileError('name_taken', 'Такой ник уже есть на этом устройстве — войди в него');
      }
      if (list.length >= MAX_PROFILES) {
        throw new LocalProfileError('too_many', `На устройстве уже ${MAX_PROFILES} профилей — удали лишний`);
      }
      const stored: StoredProfile = {
        id: `local-${randomId()}`,
        name,
        createdAt: (opts.now?.() ?? new Date()).toISOString(),
        ...(pin ? { pin: await hashPin(pin) } : {}),
      };
      const target = localPrefix(stored.id);
      // Сначала пишем данные профиля, потом список: если место кончится — гость останется как был
      removeData(storage, target);
      const copied = importGuest ? copyData(storage, GUEST_PREFIX, target) : [];
      try {
        writeList([...readProfiles(storage), stored]);
      } catch (e) {
        for (const k of copied) removeKey(storage, k);
        throw e;
      }
      // «Перенести» = переместить: прогресс теперь принадлежит профилю, у гостя — чистый лист
      if (importGuest) removeData(storage, GUEST_PREFIX);
      setActive(stored.id);
      return profileUser(stored);
    },
    async signIn(id, pin) {
      const p = find(id);
      if (!p) throw notFound();
      await requirePin(p, pin);
      setActive(p.id);
      return profileUser(p);
    },
    async signOut() {
      if (activeId !== null) setActive(null);
    },
    async remove(id, pin) {
      const p = find(id);
      if (!p) throw notFound();
      await requirePin(p, pin);
      writeList(readProfiles(storage).filter((x) => x.id !== id));
      removeData(storage, localPrefix(id));
      // внутренние ключи офлайн-очереди/переноса, если профиль успел войти в облако
      removeKey(storage, `${localPrefix(id)}migratedTo`);
      if (activeId === id) setActive(null);
    },
  };

  const saves: LocalSaves = {
    readRun: () => createLocalSaves(storage, prefix()).readRun(),
    readProfile: () => createLocalSaves(storage, prefix()).readProfile(),
    loadRun: () => createLocalSaves(storage, prefix()).loadRun(),
    saveRun: (run) => createLocalSaves(storage, prefix()).saveRun(run),
    clearRun: () => createLocalSaves(storage, prefix()).clearRun(),
    loadProfile: () => createLocalSaves(storage, prefix()).loadProfile(),
    saveProfile: (profile) => createLocalSaves(storage, prefix()).saveProfile(profile),
  };

  const board = (p: string) => createLocalLeaderboard(storage, opts.replay ?? engineReplay, opts.now, p);
  const leaderboard: LeaderboardApi = {
    submitDaily: (seed, options, actions) => board(prefix()).submitDaily(seed, options, actions),
    getDaily: (seed, limit) => board(prefix()).getDaily(seed, limit),
  };

  return {
    api,
    user,
    activeUser: () => {
      const p = activeStored();
      return p ? profileUser(p) : null;
    },
    prefix,
    saves,
    leaderboard,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
