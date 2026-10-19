import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, enqueueRun, outboxKey, readOutbox, GUEST_MIGRATED_KEY } from './supabase';
import { createLocalSaves } from './local';
import { localPrefix } from './device';
import { AuthRequiredError, BackendError, NetworkError } from './errors';
import { MemoryStorage } from './storage';
import { defaultProfile } from './profile';
import type { Profile } from './types';
import { fakeReplay, fakeRun } from './test-helpers';

// ---------- Фейковый Supabase: таблицы в памяти + имитация RLS и LWW-триггера ----------

type Row = Record<string, unknown>;
type Filter = [col: string, op: 'eq' | 'lte', val: unknown];
type AuthCb = (event: string, session: unknown) => void;

const NET_ERR = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };

class FakeSupabase {
  saved_runs = new Map<string, Row>();
  profiles = new Map<string, Row>();
  leaderboard: Row[] = [];
  offline = false;
  /** Принудительный ответ-ошибка сервера (не сетевая) */
  failWith: { status: number; code: string } | null = null;
  requests = 0;
  session: { user: Row } | null = null;
  private listeners = new Set<AuthCb>();
  clock = Date.parse('2026-10-18T12:00:00.000Z');

  auth = {
    getSession: async () => ({ data: { session: this.session }, error: null }),
    onAuthStateChange: (cb: AuthCb) => {
      this.listeners.add(cb);
      queueMicrotask(() => cb('INITIAL_SESSION', this.session));
      return { data: { subscription: { unsubscribe: () => this.listeners.delete(cb) } } };
    },
    signInWithOtp: vi.fn(async (_args: unknown) => ({ data: {}, error: null })),
    signInWithOAuth: vi.fn(async (_args: unknown) => ({ data: {}, error: null })),
    signOut: vi.fn(async (_args: unknown) => {
      this.session = null;
      this.emit('SIGNED_OUT');
      return { error: null };
    }),
  };

  functions = {
    invoke: vi.fn(async (_name: string, _opts: unknown): Promise<{ data: unknown; error: unknown }> => ({
      data: { accepted: true, rank: 3 },
      error: null,
    })),
  };

  signIn(id: string, meta: Row = {}, provider = 'email'): void {
    this.session = {
      user: { id, email: `${id}@test.local`, app_metadata: { provider }, user_metadata: meta },
    };
    if (!this.profiles.has(id)) {
      // как триггер handle_new_user
      this.profiles.set(id, { user_id: id, data: {}, updated_at: new Date(this.clock).toISOString() });
    }
    this.emit('SIGNED_IN');
  }

  emit(event: string): void {
    for (const cb of this.listeners) cb(event, this.session);
  }

  get uid(): string | null {
    return (this.session?.user.id as string | undefined) ?? null;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; status: number }> {
  private op: 'select' | 'upsert' | 'delete' = 'select';
  private payload: Row = {};
  private filters: Filter[] = [];
  private single = false;
  private limitN = Infinity;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(_cols?: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, 'eq', val]);
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push([col, 'lte', val]);
    return this;
  }
  order(_col: string, _o?: unknown) {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  upsert(row: Row, _o?: unknown) {
    this.op = 'upsert';
    this.payload = row;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  then<A = { data: unknown; error: unknown; status: number }, B = never>(
    ok?: ((v: { data: unknown; error: unknown; status: number }) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.exec())
      .then(ok, fail);
  }

  private match(row: Row): boolean {
    return this.filters.every(([c, op, v]) =>
      op === 'eq' ? row[c] === v : Date.parse(String(row[c])) <= Date.parse(String(v)),
    );
  }

  private exec(): { data: unknown; error: unknown; status: number } {
    const db = this.db;
    db.requests++;
    if (db.offline) return { data: null, error: NET_ERR, status: 0 };
    if (db.failWith) {
      return { data: null, error: { message: 'violates check constraint', code: db.failWith.code }, status: db.failWith.status };
    }
    if (this.table === 'daily_leaderboard') {
      const rows = db.leaderboard.filter((r) => this.match(r)).slice(0, this.limitN);
      return { data: rows, error: null, status: 200 };
    }
    const map = this.table === 'saved_runs' ? db.saved_runs : db.profiles;
    const uid = db.uid;
    if (this.op === 'select') {
      // RLS: только свои строки
      const rows = [...map.values()].filter((r) => r.user_id === uid && this.match(r));
      return { data: this.single ? (rows[0] ?? null) : rows, error: null, status: 200 };
    }
    if (this.op === 'upsert') {
      if (!uid || this.payload.user_id !== uid) return { data: null, error: { message: 'RLS', code: '42501' }, status: 403 };
      const prev = map.get(uid);
      const row = { ...prev, ...this.payload };
      if (this.table === 'saved_runs') {
        // LWW-триггер saved_runs_lww
        if (prev && Date.parse(String(row.updated_at)) < Date.parse(String(prev.updated_at))) {
          return { data: null, error: null, status: 201 };
        }
      } else {
        row.updated_at = new Date(db.clock).toISOString(); // profiles_touch
      }
      map.set(uid, row);
      return { data: null, error: null, status: 201 };
    }
    for (const [k, r] of map) if (r.user_id === uid && this.match(r)) map.delete(k);
    return { data: null, error: null, status: 204 };
  }
}

// ---------- helpers ----------

function setup(opts: { signedIn?: string } = {}) {
  const fake = new FakeSupabase();
  if (opts.signedIn) fake.signIn(opts.signedIn);
  const storage = new MemoryStorage();
  let online: (() => void) | null = null;
  const backend = createSupabaseBackend({
    client: fake.asClient(),
    storage,
    now: () => new Date(fake.clock),
    redirectTo: () => 'https://game.test/cyberhack/',
    onOnline: (cb) => {
      online = cb;
      return () => (online = null);
    },
    replay: fakeReplay({ status: 'won', score: 10 }),
  });
  return { fake, storage, backend, goOnline: () => online?.() };
}

const iso = (s: string) => `2026-10-18T${s}.000Z`;
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------- tests ----------

describe('supabase auth', () => {
  it('маппит пользователя и провайдера', async () => {
    const { fake, backend } = setup();
    expect(await backend.auth.getUser()).toBeNull();
    fake.signIn('u1', { user_name: 'neo' }, 'github');
    expect(await backend.auth.getUser()).toEqual({
      id: 'u1',
      email: 'u1@test.local',
      displayName: 'neo',
      provider: 'github',
    });
  });

  it('magic link и OAuth получают redirect на текущую страницу', async () => {
    const { fake, backend } = setup();
    await backend.auth.signInWithEmail('  neo@matrix.io ');
    expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'neo@matrix.io',
      options: { emailRedirectTo: 'https://game.test/cyberhack/', shouldCreateUser: true },
    });
    await backend.auth.signInWithOAuth('google');
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://game.test/cyberhack/' },
    });
    await expect(backend.auth.signInWithEmail('not-an-email')).rejects.toBeInstanceOf(BackendError);
  });

  it('onChange получает вход и выход, отписка работает', async () => {
    const { fake, backend } = setup();
    const seen: Array<string | null> = [];
    const off = backend.auth.onChange((u) => seen.push(u?.id ?? null));
    await tick();
    fake.signIn('u1');
    await backend.auth.signOut();
    off();
    fake.signIn('u2');
    expect(seen).toEqual([null, 'u1', null]);
  });
});

describe('supabase saves: онлайн', () => {
  it('невошедший игрок сохраняется локально, как гость', async () => {
    const { fake, storage, backend } = setup();
    const run = fakeRun(iso('10:00:00'));
    await backend.saves.saveRun(run);
    expect(fake.saved_runs.size).toBe(0);
    expect(await createLocalSaves(storage).loadRun()).toEqual(run);
  });

  it('сохраняет и загружает забег из облака', async () => {
    const { fake, backend } = setup({ signedIn: 'u1' });
    const run = fakeRun(iso('10:00:00'));
    await backend.saves.saveRun(run);
    expect(fake.saved_runs.get('u1')).toMatchObject({ user_id: 'u1', updated_at: run.updatedAt });
    expect(await backend.saves.loadRun()).toEqual(run);
    await backend.saves.clearRun();
    expect(fake.saved_runs.size).toBe(0);
    expect(await backend.saves.loadRun()).toBeNull();
  });

  it('ошибка сервера (не сеть) пробрасывается и не попадает в очередь', async () => {
    const { fake, storage, backend } = setup({ signedIn: 'u1' });
    await backend.saves.loadRun(); // дождаться первичной синхронизации
    fake.failWith = { status: 400, code: '23514' };
    await expect(backend.saves.saveRun(fakeRun(iso('10:00:00')))).rejects.toBeInstanceOf(BackendError);
    expect(storage.getItem(outboxKey('u1'))).toBeNull();
  });

  it('профиль при сохранении сливается с серверным (не теряет разблокировки с другого устройства)', async () => {
    const { fake, backend } = setup({ signedIn: 'u1' });
    fake.profiles.set('u1', {
      user_id: 'u1',
      data: { ...defaultProfile(), unlockedCards: ['from_phone'], totalRuns: 9 },
      updated_at: iso('09:00:00'),
    });
    await backend.saves.saveProfile({ ...defaultProfile(), unlockedCards: ['from_pc'], totalRuns: 3 });
    const data = fake.profiles.get('u1')!.data as Profile;
    expect(data.unlockedCards).toEqual(['from_pc', 'from_phone']);
    expect(data.totalRuns).toBe(9);
  });
});

describe('supabase saves: офлайн-очередь', () => {
  it('без сети saveRun не падает, а кладёт в очередь; при online досылает', async () => {
    const { fake, storage, backend, goOnline } = setup({ signedIn: 'u1' });
    await backend.saves.loadRun();
    fake.offline = true;
    const run = fakeRun(iso('10:00:00'), { floor: 3 });
    await expect(backend.saves.saveRun(run)).resolves.toBeUndefined();
    expect(readOutbox(storage, 'u1').run).toEqual({ kind: 'upsert', run });
    // офлайн loadRun отдаёт неотправленное
    expect(await backend.saves.loadRun()).toEqual(run);

    fake.offline = false;
    goOnline();
    await vi.waitFor(() => expect(fake.saved_runs.get('u1')?.updated_at).toBe(run.updatedAt));
    expect(readOutbox(storage, 'u1').run).toBeUndefined();
    expect(storage.getItem(outboxKey('u1'))).toBeNull();
  });

  it('очередь досылается при следующем успешном вызове', async () => {
    const { fake, storage, backend } = setup({ signedIn: 'u1' });
    await backend.saves.loadProfile();
    fake.offline = true;
    await backend.saves.saveProfile({ ...defaultProfile(), achievements: ['offline_win'] });
    expect(readOutbox(storage, 'u1').profile?.profile.achievements).toEqual(['offline_win']);

    fake.offline = false;
    // любой успешный запрос (здесь — загрузка забега) запускает досылку
    await backend.saves.loadRun();
    await vi.waitFor(() =>
      expect((fake.profiles.get('u1')!.data as Profile).achievements).toEqual(['offline_win']),
    );
    expect(readOutbox(storage, 'u1').profile).toBeUndefined();
  });

  it('последняя запись побеждает: в очереди остаётся более новая операция', () => {
    const storage = new MemoryStorage();
    const newer = fakeRun(iso('11:00:00'));
    enqueueRun(storage, 'u1', { kind: 'upsert', run: newer });
    enqueueRun(storage, 'u1', { kind: 'upsert', run: fakeRun(iso('10:00:00')) });
    expect(readOutbox(storage, 'u1').run).toEqual({ kind: 'upsert', run: newer });
    enqueueRun(storage, 'u1', { kind: 'delete', at: iso('12:00:00') });
    expect(readOutbox(storage, 'u1').run).toEqual({ kind: 'delete', at: iso('12:00:00') });
  });

  it('устаревший сейв из очереди не перетирает более новый с другого устройства', async () => {
    const { fake, storage, backend } = setup({ signedIn: 'u1' });
    await backend.saves.loadRun();
    fake.offline = true;
    await backend.saves.saveRun(fakeRun(iso('10:00:00'), { floor: 1 }));
    // пока мы офлайн, другое устройство сохранило более свежий забег
    fake.offline = false;
    const fromPhone = fakeRun(iso('10:30:00'), { floor: 20 });
    fake.saved_runs.set('u1', {
      user_id: 'u1',
      options: fromPhone.options,
      actions: fromPhone.actions,
      state: fromPhone.state,
      updated_at: fromPhone.updatedAt,
    });
    await backend.flush();
    expect(readOutbox(storage, 'u1').run).toBeUndefined();
    expect(await backend.saves.loadRun()).toEqual(fromPhone);
  });

  it('clearRun офлайн ставит удаление в очередь', async () => {
    const { fake, storage, backend } = setup({ signedIn: 'u1' });
    await backend.saves.saveRun(fakeRun(iso('10:00:00')));
    fake.clock = Date.parse(iso('10:05:00'));
    fake.offline = true;
    await backend.saves.clearRun();
    expect(readOutbox(storage, 'u1').run).toEqual({ kind: 'delete', at: iso('10:05:00') });
    expect(await backend.saves.loadRun()).toBeNull();
    fake.offline = false;
    await backend.flush();
    expect(fake.saved_runs.size).toBe(0);
  });

  it('повреждённая очередь игнорируется', async () => {
    const { storage, backend } = setup({ signedIn: 'u1' });
    storage.setItem(outboxKey('u1'), '{broken');
    expect(readOutbox(storage, 'u1')).toEqual({});
    await expect(backend.flush()).resolves.toBeUndefined();
  });
});

describe('перенос гостевого прогресса при первом входе', () => {
  it('сливает профиль и переносит забег, второй аккаунт не получает копию', async () => {
    const { fake, storage, backend } = setup();
    const guest = createLocalSaves(storage);
    await guest.saveProfile({
      ...defaultProfile(),
      unlockedClasses: ['netrunner', 'ghost'],
      unlockedCards: ['guest_card'],
      maxAscension: { netrunner: 2, phreaker: 0, ghost: 0, samurai: 0, engineer: 0 },
      totalWins: 1,
    });
    const guestRun = fakeRun(iso('09:00:00'), { floor: 5 });
    await guest.saveRun(guestRun);

    fake.profiles.set('u1', {
      user_id: 'u1',
      data: { ...defaultProfile(), unlockedCards: ['cloud_card'], maxAscension: { netrunner: 1, phreaker: 3, ghost: 0, samurai: 0, engineer: 0 } },
      updated_at: iso('08:00:00'),
    });
    fake.signIn('u1');

    const profile = await backend.saves.loadProfile();
    expect(profile.unlockedClasses).toEqual(['netrunner', 'ghost']);
    expect(profile.unlockedCards).toEqual(['cloud_card', 'guest_card']);
    expect(profile.maxAscension).toEqual({ netrunner: 2, phreaker: 3, ghost: 0, samurai: 0, engineer: 0 });
    expect(profile.totalWins).toBe(1);
    expect(await backend.saves.loadRun()).toEqual(guestRun);
    expect(storage.getItem(GUEST_MIGRATED_KEY)).toBe('u1');

    // другой аккаунт на этом же устройстве — без повторного переноса
    await backend.auth.signOut();
    fake.signIn('u2');
    expect((await backend.saves.loadProfile()).unlockedCards).toEqual([]);
    expect(await backend.saves.loadRun()).toBeNull();
  });

  it('облачный забег новее гостевого — не перетирается', async () => {
    const { fake, storage, backend } = setup();
    await createLocalSaves(storage).saveRun(fakeRun(iso('09:00:00'), { floor: 2 }));
    const cloud = fakeRun(iso('11:00:00'), { floor: 30 });
    fake.saved_runs.set('u1', {
      user_id: 'u1',
      options: cloud.options,
      actions: cloud.actions,
      state: cloud.state,
      updated_at: cloud.updatedAt,
    });
    fake.signIn('u1');
    expect(await backend.saves.loadRun()).toEqual(cloud);
  });

  it('без сети перенос откладывается и выполняется позже', async () => {
    const { fake, storage, backend } = setup();
    await createLocalSaves(storage).saveProfile({ ...defaultProfile(), achievements: ['guest_ach'] });
    fake.offline = true;
    fake.signIn('u1');
    await backend.saves.loadProfile(); // офлайн: отдаёт кэш, перенос не удался
    expect(storage.getItem(GUEST_MIGRATED_KEY)).toBeNull();
    fake.offline = false;
    expect((await backend.saves.loadProfile()).achievements).toEqual(['guest_ach']);
    expect(storage.getItem(GUEST_MIGRATED_KEY)).toBe('u1');
  });
});

describe('supabase leaderboard', () => {
  const SEED = 'daily-2026-10-18';
  const opts = { seed: SEED, classId: 'ghost' as const };

  it('submitDaily зовёт Edge Function с журналом действий', async () => {
    const { fake, backend } = setup({ signedIn: 'u1' });
    const actions = [{ type: 'end_turn' as const }];
    expect(await backend.leaderboard.submitDaily(SEED, opts, actions)).toEqual({ accepted: true, rank: 3 });
    expect(fake.functions.invoke).toHaveBeenCalledWith('submit-daily', { body: { seed: SEED, options: opts, actions } });
  });

  it('ошибки функции: 401 → AuthRequiredError, 4xx → отказ, сеть → NetworkError', async () => {
    const { fake, backend } = setup({ signedIn: 'u1' });
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 401 } } });
    await expect(backend.leaderboard.submitDaily(SEED, opts, [])).rejects.toBeInstanceOf(AuthRequiredError);
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 400 } } });
    expect(await backend.leaderboard.submitDaily(SEED, opts, [])).toEqual({ accepted: false });
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsFetchError', context: {} } });
    await expect(backend.leaderboard.submitDaily(SEED, opts, [])).rejects.toBeInstanceOf(NetworkError);
    fake.functions.invoke.mockResolvedValueOnce({ data: { accepted: false, reason: 'already_submitted' }, error: null });
    expect(await backend.leaderboard.submitDaily(SEED, opts, [])).toEqual({ accepted: false });
  });

  it('гость в supabase-режиме пишет результат локально', async () => {
    const { fake, backend } = setup();
    expect(await backend.leaderboard.submitDaily(SEED, opts, [])).toEqual({ accepted: true, rank: 1 });
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });

  it('getDaily читает view и маппит строки', async () => {
    const { fake, backend } = setup();
    fake.leaderboard = [
      { seed: SEED, rank: 1, display_name: 'bob_gh', class_id: 'netrunner', score: 900, floor: 51, victory: true },
      { seed: SEED, rank: 2, display_name: 'Хакер-111111', class_id: 'ghost', score: 500, floor: 20, victory: false },
      { seed: 'daily-2026-10-17', rank: 1, display_name: 'old', class_id: 'ghost', score: 1, floor: 1, victory: false },
    ];
    expect(await backend.leaderboard.getDaily(SEED)).toEqual([
      { rank: 1, displayName: 'bob_gh', classId: 'netrunner', score: 900, floor: 51, victory: true },
      { rank: 2, displayName: 'Хакер-111111', classId: 'ghost', score: 500, floor: 20, victory: false },
    ]);
    fake.offline = true;
    await expect(backend.leaderboard.getDaily(SEED)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('офлайн-профили в supabase-режиме', () => {
  it('без входа в облако работает офлайн-профиль: свой пользователь и свои сохранения', async () => {
    const { fake, storage, backend } = setup();
    const seen: Array<string | null> = [];
    backend.auth.onChange((u) => seen.push(u ? `${u.provider}:${u.displayName}` : null));
    await tick();
    const neo = await backend.profiles!.create({ name: 'Нео' });
    expect(await backend.auth.getUser()).toEqual(neo);
    const run = fakeRun(iso('10:00:00'));
    await backend.saves.saveRun(run);
    expect(fake.saved_runs.size).toBe(0);
    expect(await createLocalSaves(storage, localPrefix(neo.id)).loadRun()).toEqual(run);
    expect(await createLocalSaves(storage).loadRun()).toBeNull();
    await backend.auth.signOut();
    expect(await backend.auth.getUser()).toBeNull();
    expect(seen).toEqual([null, 'local:Нео', null]);
  });

  it('при входе в облако переносится прогресс активного офлайн-профиля, а не гостя', async () => {
    const { fake, storage, backend } = setup();
    await createLocalSaves(storage).saveProfile({ ...defaultProfile(), achievements: ['guest_ach'] });
    const neo = await backend.profiles!.create({ name: 'Нео' });
    await backend.saves.saveProfile({ ...defaultProfile(), achievements: ['neo_ach'] });
    fake.signIn('u1');
    expect((await backend.saves.loadProfile()).achievements).toEqual(['neo_ach']);
    expect(storage.getItem(`${localPrefix(neo.id)}migratedTo`)).toBe('u1');
    expect(storage.getItem(GUEST_MIGRATED_KEY)).toBeNull();
  });

  it('вход в офлайн-профиль выводит из облачного аккаунта на этом устройстве', async () => {
    const { fake, backend } = setup({ signedIn: 'u1' });
    expect((await backend.auth.getUser())!.id).toBe('u1');
    const neo = await backend.profiles!.create({ name: 'Нео' });
    expect(fake.auth.signOut).toHaveBeenCalled();
    expect(await backend.auth.getUser()).toEqual(neo);
  });
});
