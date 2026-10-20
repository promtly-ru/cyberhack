/**
 * Supabase-реализация Backend: вход (magic link, Google, GitHub), облачные сохранения
 * с офлайн-очередью, перенос гостевого прогресса, ежедневный лидерборд через Edge Function.
 *
 * Невошедший в облако игрок в этом режиме работает как в local-режиме (net/device.ts):
 * гость или офлайн-профиль устройства, сохранения в браузере, свой локальный результат дня.
 * Чужие таблицы лидеров при этом читать можно. При первом входе в облако туда переносится
 * прогресс того, кто играл на устройстве (гостя или активного офлайн-профиля).
 */
import type { Session, SupabaseClient, User as SbUser } from '@supabase/supabase-js';
import type { Action, NewRunOptions } from '@cyberhack/engine';
import type { AuthApi, Backend, DeviceProfilesApi, LeaderboardApi, LeaderboardEntry, Profile, SavedRun, SavesApi, User } from './types';
import { AuthRequiredError, BackendError, NetworkError } from './errors';
import { GUEST_PREFIX, MAX_WEEKLY_ACTIONS, createLocalSaves, type LocalSaves, type ReplayFn } from './local';
import { isNativeApp, resolveRedirect } from './platform';
import { createDeviceAccounts } from './device';
import { CLASS_IDS, compareIso, hasProgress, mergeProfiles, normalizeProfile, normalizeSavedRun } from './profile';
import { browserStorage, isRecord, readJson, removeKey, writeJson, type KeyValueStorage } from './storage';

export const GUEST_MIGRATED_KEY = `${GUEST_PREFIX}migratedTo`;
export const userPrefix = (uid: string) => `cyberhack:user:${uid}:`;
export const outboxKey = (uid: string) => `${userPrefix(uid)}outbox`;

export interface SupabaseBackendOptions {
  client: SupabaseClient;
  storage?: KeyValueStorage;
  /** Для локального результата дня невошедшего игрока */
  replay?: ReplayFn;
  now?: () => Date;
  /** Куда вернуть после входа. По умолчанию — текущий origin + path */
  redirectTo?: () => string;
  /** Подписка на появление сети. По умолчанию — событие window 'online' */
  onOnline?: (cb: () => void) => () => void;
}

// ---------- Офлайн-очередь ----------

export type QueuedRunOp = { kind: 'upsert'; run: SavedRun } | { kind: 'delete'; at: string };
export interface Outbox {
  run?: QueuedRunOp;
  profile?: { profile: Profile; updatedAt: string };
}

const opTime = (op: QueuedRunOp) => (op.kind === 'upsert' ? op.run.updatedAt : op.at);

export function readOutbox(storage: KeyValueStorage, uid: string): Outbox {
  const raw = readJson(storage, outboxKey(uid));
  if (!isRecord(raw)) return {};
  const out: Outbox = {};
  const run = raw.run;
  if (isRecord(run)) {
    if (run.kind === 'upsert') {
      const saved = normalizeSavedRun(run.run);
      if (saved) out.run = { kind: 'upsert', run: saved };
    } else if (run.kind === 'delete' && typeof run.at === 'string' && !Number.isNaN(Date.parse(run.at))) {
      out.run = { kind: 'delete', at: run.at };
    }
  }
  const prof = raw.profile;
  if (isRecord(prof) && typeof prof.updatedAt === 'string' && !Number.isNaN(Date.parse(prof.updatedAt))) {
    out.profile = { profile: normalizeProfile(prof.profile), updatedAt: prof.updatedAt };
  }
  return out;
}

function writeOutbox(storage: KeyValueStorage, uid: string, box: Outbox): void {
  if (!box.run && !box.profile) {
    removeKey(storage, outboxKey(uid));
    return;
  }
  writeJson(storage, outboxKey(uid), box);
}

/** Положить операцию в очередь. На сущность хранится одна операция: побеждает более поздняя по времени. */
export function enqueueRun(storage: KeyValueStorage, uid: string, op: QueuedRunOp): void {
  const box = readOutbox(storage, uid);
  if (box.run && compareIso(opTime(box.run), opTime(op)) > 0) return;
  box.run = op;
  writeOutbox(storage, uid, box);
}

/** Профиль в очереди не заменяется, а сливается: прогресс только растёт. */
export function enqueueProfile(storage: KeyValueStorage, uid: string, profile: Profile, updatedAt: string): void {
  const box = readOutbox(storage, uid);
  const prev = box.profile;
  box.profile = prev
    ? {
        profile: mergeProfiles(prev.profile, profile),
        updatedAt: compareIso(prev.updatedAt, updatedAt) > 0 ? prev.updatedAt : updatedAt,
      }
    : { profile, updatedAt };
  writeOutbox(storage, uid, box);
}

// ---------- Ошибки сети ----------

interface PgResult {
  error: { message?: string; code?: string } | null;
  status?: number;
}

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|econnrefused|enotfound|etimedout|timeout/i;

/** Временный сбой (нет сети, таймаут, 5xx) — операцию стоит повторить позже. */
export function isTransient(res: PgResult): boolean {
  if (!res.error) return false;
  const s = res.status ?? 0;
  if (s === 0 || s === 408 || s === 429 || s >= 500) return true;
  return NETWORK_RE.test(res.error.message ?? '');
}

function isThrownNetworkError(e: unknown): boolean {
  if (e instanceof NetworkError) return true;
  if (e instanceof TypeError) return true; // fetch бросает TypeError без сети
  const name = (e as { name?: string } | null)?.name;
  return name === 'FunctionsFetchError' || name === 'FunctionsRelayError' || name === 'AuthRetryableFetchError';
}

/** Выполнить запрос; брошенную сетевую ошибку превратить в NetworkError. */
async function exec<T>(q: PromiseLike<T>): Promise<T> {
  try {
    return await q;
  } catch (e) {
    if (isThrownNetworkError(e)) throw new NetworkError();
    throw e;
  }
}

/** Транзитный сбой → NetworkError, остальное → BackendError. */
function check(res: PgResult, what: string): void {
  if (!res.error) return;
  if (isTransient(res)) throw new NetworkError();
  throw new BackendError(`${what}: ${res.error.message ?? 'ошибка сервера'}`);
}

// ---------- Пользователь ----------

function mapUser(u: SbUser): User {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = meta[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  const p = u.app_metadata?.provider;
  const provider: User['provider'] = p === 'google' || p === 'github' ? p : 'email';
  const displayName =
    pick('user_name', 'preferred_username', 'full_name', 'name') ?? (u.email ? u.email.split('@')[0]! : 'Хакер');
  return { id: u.id, email: u.email ?? null, displayName: displayName.slice(0, 32), provider };
}

function defaultRedirect(): string {
  return resolveRedirect(globalThis.location, isNativeApp());
}

function defaultOnOnline(cb: () => void): () => void {
  const w = globalThis as { addEventListener?: Window['addEventListener']; removeEventListener?: Window['removeEventListener'] };
  if (typeof w.addEventListener !== 'function') return () => {};
  w.addEventListener('online', cb);
  return () => w.removeEventListener?.('online', cb);
}

// ---------- Строки БД ----------

interface RunRow {
  options: SavedRun['options'];
  actions: SavedRun['actions'];
  state: SavedRun['state'];
  updated_at: string;
}
interface ProfileRow {
  data: unknown;
  updated_at: string;
}
interface LeaderboardRow {
  rank: number;
  display_name: string;
  class_id: string;
  score: number;
  floor: number;
  victory: boolean;
  duration_s?: number | null;
}

function rowToEntry(r: LeaderboardRow): LeaderboardEntry {
  return {
    rank: Number(r.rank),
    displayName: r.display_name,
    classId: r.class_id as LeaderboardEntry['classId'],
    score: r.score,
    floor: r.floor,
    victory: r.victory,
    durationS: r.duration_s ?? null,
  };
}

function rowToRun(row: RunRow | null): SavedRun | null {
  if (!row) return null;
  return normalizeSavedRun({ options: row.options, actions: row.actions, state: row.state, updatedAt: row.updated_at });
}

// ---------- Backend ----------

export interface SupabaseBackend extends Backend {
  /** Дослать офлайн-очередь текущего пользователя (вызывается сам по 'online') */
  flush(): Promise<void>;
  /** Отписаться от событий (для тестов/горячей перезагрузки) */
  dispose(): void;
}

export function createSupabaseBackend(opts: SupabaseBackendOptions): SupabaseBackend {
  const client = opts.client;
  const storage = opts.storage ?? browserStorage();
  const now = opts.now ?? (() => new Date());
  const redirectTo = opts.redirectTo ?? defaultRedirect;
  // Игрок устройства (гость или офлайн-профиль) — когда в облако не вошли
  const device = createDeviceAccounts({ storage, replay: opts.replay, now: opts.now });
  const deviceSaves = device.saves;
  const deviceBoard = device.leaderboard;

  /** Последний известный пользователь: нужен офлайн, когда getSession не может обновить токен */
  let knownUser: User | null = null;
  const caches = new Map<string, LocalSaves>();
  const cacheFor = (uid: string) => {
    let c = caches.get(uid);
    if (!c) caches.set(uid, (c = createLocalSaves(storage, userPrefix(uid))));
    return c;
  };

  async function currentUser(): Promise<User | null> {
    try {
      const { data, error } = await client.auth.getSession();
      if (data.session) {
        knownUser = mapUser(data.session.user);
        return knownUser;
      }
      // ошибка обновления токена без сети: считаем, что игрок всё ещё вошёл
      if (error && isThrownNetworkError(error)) return knownUser;
      return null;
    } catch (e) {
      if (isThrownNetworkError(e)) return knownUser;
      throw e;
    }
  }

  // ----- запросы к таблицам (бросают NetworkError / BackendError) -----

  async function fetchRun(uid: string): Promise<SavedRun | null> {
    const res = await exec(
      client.from('saved_runs').select('options, actions, state, updated_at').eq('user_id', uid).maybeSingle(),
    );
    check(res, 'Загрузка забега');
    return rowToRun(res.data as RunRow | null);
  }

  async function pushRun(uid: string, run: SavedRun): Promise<void> {
    // updated_at задаёт клиент; триггер в БД не даст более старой записи перетереть более новую (LWW)
    const res = await exec(
      client
        .from('saved_runs')
        .upsert(
          { user_id: uid, options: run.options, actions: run.actions, state: run.state, updated_at: run.updatedAt },
          { onConflict: 'user_id' },
        ),
    );
    check(res, 'Сохранение забега');
  }

  async function deleteRun(uid: string, at: string): Promise<void> {
    // удаляем только если на сервере нет более свежего сейва (с другого устройства)
    const res = await exec(client.from('saved_runs').delete().eq('user_id', uid).lte('updated_at', at));
    check(res, 'Удаление забега');
  }

  async function fetchProfile(uid: string): Promise<Profile | null> {
    const res = await exec(client.from('profiles').select('data, updated_at').eq('user_id', uid).maybeSingle());
    check(res, 'Загрузка профиля');
    const row = res.data as ProfileRow | null;
    return row ? normalizeProfile(row.data) : null;
  }

  /**
   * Профиль — монотонный прогресс, поэтому не перетираем, а сливаем с серверным:
   * так не теряются разблокировки, сделанные на другом устройстве. Возвращает итог.
   */
  async function pushProfileMerged(uid: string, profile: Profile): Promise<Profile> {
    const remote = await fetchProfile(uid);
    const merged = remote ? mergeProfiles(remote, profile) : profile;
    // updated_at профиля ставит триггер БД (now())
    const res = await exec(client.from('profiles').upsert({ user_id: uid, data: merged }, { onConflict: 'user_id' }));
    check(res, 'Сохранение профиля');
    await cacheFor(uid)
      .saveProfile(merged)
      .catch(() => {});
    return merged;
  }

  async function pushRunOp(uid: string, op: QueuedRunOp): Promise<void> {
    if (op.kind === 'upsert') await pushRun(uid, op.run);
    else await deleteRun(uid, op.at);
  }

  // ----- досылка очереди -----

  const flushing = new Map<string, Promise<void>>();

  function flushUser(uid: string): Promise<void> {
    const running = flushing.get(uid);
    if (running) return running;
    const p = (async () => {
      const box = readOutbox(storage, uid);
      if (box.run) {
        const sent = box.run;
        try {
          await pushRunOp(uid, sent);
          dropRun(uid, sent);
        } catch (e) {
          if (e instanceof NetworkError) return; // сети всё ещё нет — попробуем позже
          console.warn('[net] сейв из очереди отклонён сервером и удалён:', e);
          dropRun(uid, sent);
        }
      }
      if (box.profile) {
        const sent = box.profile;
        try {
          await pushProfileMerged(uid, sent.profile);
          dropProfile(uid, sent.updatedAt);
        } catch (e) {
          if (e instanceof NetworkError) return;
          console.warn('[net] профиль из очереди отклонён сервером и удалён:', e);
          dropProfile(uid, sent.updatedAt);
        }
      }
    })().finally(() => flushing.delete(uid));
    flushing.set(uid, p);
    return p;
  }

  /** Убрать операцию из очереди, если за время отправки не появилась более новая */
  function dropRun(uid: string, sent: QueuedRunOp): void {
    const box = readOutbox(storage, uid);
    if (box.run && compareIso(opTime(box.run), opTime(sent)) <= 0) {
      delete box.run;
      writeOutbox(storage, uid, box);
    }
  }
  function dropProfile(uid: string, sentAt: string): void {
    const box = readOutbox(storage, uid);
    if (box.profile && compareIso(box.profile.updatedAt, sentAt) <= 0) {
      delete box.profile;
      writeOutbox(storage, uid, box);
    }
  }

  /** После любого успешного запроса — фоном досылаем очередь */
  function afterSuccess(uid: string): void {
    void flushUser(uid).catch(() => {});
  }

  // ----- перенос гостевого прогресса -----

  async function migrateGuest(uid: string): Promise<void> {
    // Переносим прогресс текущего игрока устройства: гостя (cyberhack:guest:migratedTo, как раньше)
    // или активного офлайн-профиля (cyberhack:local:<id>:migratedTo)
    const from = device.prefix();
    const migratedKey = `${from}migratedTo`;
    const source = createLocalSaves(storage, from);
    let migratedTo: string | null;
    try {
      migratedTo = storage.getItem(migratedKey);
    } catch {
      migratedTo = null;
    }
    if (migratedTo) return; // этот прогресс уже перенесён в какой-то аккаунт
    const guestProfile = source.readProfile();
    const guestRun = source.readRun();
    const profileToMove = hasProgress(guestProfile);
    if (!profileToMove && !guestRun) return;

    if (profileToMove) await pushProfileMerged(uid, guestProfile);
    if (guestRun) {
      const remote = await fetchRun(uid);
      if (!remote || compareIso(guestRun.updatedAt, remote.updatedAt) > 0) {
        await pushRun(uid, guestRun);
        cacheFor(uid).saveRun(guestRun).catch(() => {});
      }
    }
    try {
      storage.setItem(migratedKey, uid);
    } catch {
      // не страшно: повторный перенос идемпотентен (merge + LWW)
    }
  }

  /** Один раз за сессию на пользователя: перенос гостя + досылка очереди. Ошибки сети не фатальны. */
  const syncs = new Map<string, Promise<void>>();
  function ensureSynced(uid: string): Promise<void> {
    let p = syncs.get(uid);
    if (!p) {
      p = (async () => {
        try {
          await migrateGuest(uid);
        } catch (e) {
          syncs.delete(uid); // повторим при следующем обращении
          if (!(e instanceof NetworkError)) console.warn('[net] перенос гостевого прогресса не удался:', e);
        }
        await flushUser(uid).catch(() => {});
      })();
      syncs.set(uid, p);
    }
    return p;
  }

  // ----- подписки -----

  const { data: authSub } = client.auth.onAuthStateChange((event, session: Session | null) => {
    knownUser = session ? mapUser(session.user) : null;
    if (event === 'SIGNED_OUT') return;
    const uid = session?.user.id;
    // нельзя ждать запросы Supabase внутри колбэка (дедлок auth-lock) — откладываем
    if (uid) setTimeout(() => void ensureSynced(uid), 0);
  });

  const offOnline = (opts.onOnline ?? defaultOnOnline)(() => {
    void flush();
  });

  async function flush(): Promise<void> {
    const user = await currentUser().catch(() => knownUser);
    if (user) await flushUser(user.id);
  }

  // ----- AuthApi -----

  const auth: AuthApi = {
    async getUser() {
      // не вошёл в облако → офлайн-профиль устройства или null (гость)
      return (await currentUser()) ?? device.activeUser();
    },
    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        cb(session ? mapUser(session.user) : device.activeUser());
      });
      // вход/выход офлайн-профиля виден, только пока не вошли в облако
      const offDevice = device.subscribe((u) => {
        if (!knownUser) cb(u.provider === 'guest' ? null : u);
      });
      return () => {
        data.subscription.unsubscribe();
        offDevice();
      };
    },
    async signInWithEmail(email) {
      const trimmed = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new BackendError('Некорректный email');
      const { error } = await client.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
      });
      if (error) {
        if (isThrownNetworkError(error)) throw new NetworkError();
        throw new BackendError(`Не удалось отправить ссылку: ${error.message}`);
      }
    },
    async signUpWithPassword(email, password) {
      const trimmed = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new BackendError('Некорректный email');
      if (password.length < 8) throw new BackendError('Пароль должен быть не короче 8 символов');
      const { data, error } = await client.auth.signUp({
        email: trimmed,
        password,
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) {
        if (isThrownNetworkError(error)) throw new NetworkError();
        throw new BackendError(`Не удалось зарегистрироваться: ${error.message}`);
      }
      return { confirmEmail: !data.session };
    },
    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (isThrownNetworkError(error)) throw new NetworkError();
        throw new BackendError(`Не удалось войти: ${error.message}`);
      }
    },
    async signInWithOAuth(provider) {
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
      if (error) throw new BackendError(`Не удалось начать вход через ${provider}: ${error.message}`);
    },
    async signOut() {
      // «Выйти» всегда ведёт в гостя: сначала офлайн-профиль (пока вошли в облако, его смена не видна),
      // потом облако. Не вошли в облако — выходим только из офлайн-профиля.
      await device.api.signOut();
      if (!(await currentUser().catch(() => knownUser))) return;
      // scope 'local': выйти на этом устройстве даже без сети
      const { error } = await client.auth.signOut({ scope: 'local' });
      knownUser = null;
      if (error && !isThrownNetworkError(error)) throw new BackendError(`Не удалось выйти: ${error.message}`);
    },
  };

  // ----- SavesApi -----

  const saves: SavesApi = {
    async loadRun() {
      const user = await currentUser();
      if (!user) return deviceSaves.loadRun();
      const uid = user.id;
      await ensureSynced(uid);
      if (readOutbox(storage, uid).run) {
        // есть неотправленное — пробуем дослать; не вышло — это самое свежее состояние устройства
        await flushUser(uid);
        const pending = readOutbox(storage, uid).run;
        if (pending) return pending.kind === 'upsert' ? pending.run : null;
      }
      try {
        const remote = await fetchRun(uid);
        const cache = cacheFor(uid);
        if (remote) await cache.saveRun(remote).catch(() => {});
        else await cache.clearRun();
        afterSuccess(uid);
        return remote;
      } catch (e) {
        if (e instanceof NetworkError) return cacheFor(uid).readRun();
        throw e;
      }
    },

    async saveRun(run) {
      const user = await currentUser();
      if (!user) return deviceSaves.saveRun(run);
      const uid = user.id;
      void ensureSynced(uid);
      await cacheFor(uid)
        .saveRun(run)
        .catch((e: unknown) => console.warn('[net] локальный кэш забега не записан:', e));
      try {
        await pushRun(uid, run);
        dropRun(uid, { kind: 'upsert', run });
        afterSuccess(uid);
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        enqueueRun(storage, uid, { kind: 'upsert', run });
      }
    },

    async clearRun() {
      const user = await currentUser();
      if (!user) return deviceSaves.clearRun();
      const uid = user.id;
      const at = now().toISOString();
      await cacheFor(uid).clearRun();
      const op: QueuedRunOp = { kind: 'delete', at };
      try {
        await deleteRun(uid, at);
        dropRun(uid, op);
        afterSuccess(uid);
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        enqueueRun(storage, uid, op);
      }
    },

    async loadProfile() {
      const user = await currentUser();
      if (!user) return deviceSaves.loadProfile();
      const uid = user.id;
      await ensureSynced(uid);
      const cache = cacheFor(uid);
      if (readOutbox(storage, uid).profile) await flushUser(uid);
      const pending = readOutbox(storage, uid).profile;
      try {
        const remote = await fetchProfile(uid);
        const profile = mergeProfiles(remote ?? cache.readProfile(), pending?.profile ?? cache.readProfile());
        await cache.saveProfile(profile).catch(() => {});
        afterSuccess(uid);
        return profile;
      } catch (e) {
        if (e instanceof NetworkError) {
          const local = cache.readProfile();
          return pending ? mergeProfiles(local, pending.profile) : local;
        }
        throw e;
      }
    },

    async saveProfile(profile) {
      const user = await currentUser();
      if (!user) return deviceSaves.saveProfile(profile);
      const uid = user.id;
      void ensureSynced(uid);
      const clean = normalizeProfile(profile);
      const at = now().toISOString();
      await cacheFor(uid)
        .saveProfile(clean)
        .catch((e: unknown) => console.warn('[net] локальный кэш профиля не записан:', e));
      try {
        await pushProfileMerged(uid, clean);
        dropProfile(uid, at);
        afterSuccess(uid);
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        enqueueProfile(storage, uid, clean, at);
      }
    },
  };

  // ----- LeaderboardApi -----

  const leaderboard: LeaderboardApi = {
    async submitWeekly(seed: string, options: NewRunOptions, actions: Action[], durationS?: number) {
      const user = await currentUser();
      if (!user) return deviceBoard.submitWeekly(seed, options, actions, durationS);
      if (!Array.isArray(actions) || actions.length > MAX_WEEKLY_ACTIONS) return { accepted: false };
      let res: { data: unknown; error: unknown };
      try {
        res = await client.functions.invoke('submit-weekly', { body: { seed, options, actions, ...(durationS !== undefined ? { durationS } : {}) } });
      } catch (e) {
        if (isThrownNetworkError(e)) throw new NetworkError();
        throw e;
      }
      if (res.error) {
        const err = res.error as { name?: string; context?: { status?: number; json?: () => Promise<unknown> } };
        if (isThrownNetworkError(err)) throw new NetworkError();
        const status = err.context?.status ?? 0;
        if (status === 401) throw new AuthRequiredError('Сессия истекла, войдите снова');
        if (status >= 400 && status < 500) return { accepted: false };
        throw new BackendError('Сервер не смог проверить забег, попробуйте позже');
      }
      const data = res.data;
      if (!isRecord(data) || typeof data.accepted !== 'boolean') throw new BackendError('Некорректный ответ сервера');
      return {
        accepted: data.accepted,
        ...(typeof data.rank === 'number' ? { rank: data.rank } : {}),
        ...(typeof data.attempt === 'number' ? { attempt: data.attempt } : {}),
        ...(typeof data.attemptsLeft === 'number' ? { attemptsLeft: data.attemptsLeft } : {}),
        ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
      };
    },

    async getWeeklyMine(seed: string) {
      const user = await currentUser();
      if (!user) return deviceBoard.getWeeklyMine(seed);
      let res: { data: unknown; error: PgResult['error']; status?: number };
      try {
        res = await client.rpc('weekly_my_entry', { p_seed: seed });
      } catch (e) {
        if (isThrownNetworkError(e)) throw new NetworkError();
        throw e;
      }
      check(res, 'Таблица лидеров');
      const row = (Array.isArray(res.data) ? res.data[0] : res.data) as LeaderboardRow | undefined | null;
      return row && (CLASS_IDS as readonly string[]).includes(row.class_id) ? rowToEntry(row) : null;
    },

    async getWeekly(seed: string, limit = 50) {
      const n = Math.min(100, Math.max(1, Math.floor(limit)));
      let res: { data: unknown; error: PgResult['error']; status?: number };
      try {
        res = await client
          .from('weekly_leaderboard')
          .select('rank, display_name, class_id, score, floor, victory, duration_s')
          .eq('seed', seed)
          .order('rank', { ascending: true })
          .limit(n);
      } catch (e) {
        if (isThrownNetworkError(e)) throw new NetworkError();
        throw e;
      }
      check(res, 'Таблица лидеров');
      const rows = Array.isArray(res.data) ? (res.data as LeaderboardRow[]) : [];
      return rows.filter((r) => (CLASS_IDS as readonly string[]).includes(r.class_id)).map(rowToEntry);
    },
  };

  // Офлайн-профиль и облачный аккаунт одновременно не активны: переход в офлайн-профиль = выход из облака на этом устройстве
  const profiles: DeviceProfilesApi = {
    ...device.api,
    async create(input) {
      if (await currentUser().catch(() => knownUser)) await auth.signOut();
      return device.api.create(input);
    },
    async signIn(id, pin) {
      if (await currentUser().catch(() => knownUser)) await auth.signOut();
      return device.api.signIn(id, pin);
    },
  };

  return {
    mode: 'supabase',
    auth,
    saves,
    leaderboard,
    profiles,
    flush,
    dispose() {
      authSub.subscription.unsubscribe();
      offOnline();
    },
  };
}
