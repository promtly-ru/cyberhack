import { describe, expect, it } from 'vitest';
import { createLocalBackend, createLocalSaves, GUEST_ID_KEY, GUEST_PREFIX } from './local';
import { ACTIVE_PROFILE_KEY, PROFILES_KEY, checkPin, hashPin, localPrefix, validateName } from './device';
import { LocalProfileError } from './errors';
import { MemoryStorage } from './storage';
import { defaultProfile } from './profile';
import type { Backend, Profile, User } from './types';
import { FullStorage, fakeReplay, fakeRun } from './test-helpers';

const SEED = '2026-W43';
const progress = (over: Partial<Profile> = {}): Profile => ({
  ...defaultProfile(),
  totalRuns: 5,
  unlockedCards: ['zap'],
  ...over,
});

function setup(storage = new MemoryStorage()) {
  let n = 0;
  const make = () =>
    createLocalBackend({
      storage,
      randomId: () => `id-${String(++n).padStart(8, '0')}`,
      replay: fakeReplay({ status: 'won', score: 100 }),
      now: () => new Date(Date.UTC(2026, 9, 18, 12, 0, n)),
    });
  const backend = make();
  const profiles = backend.profiles!;
  return { storage, backend, profiles, reopen: make };
}

async function err(p: Promise<unknown>): Promise<LocalProfileError> {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(LocalProfileError);
  return e as LocalProfileError;
}

const user = (b: Backend) => b.auth.getUser() as Promise<User>;

describe('офлайн-профили: создание и вход', () => {
  it('гость по умолчанию; создание профиля сразу входит в него', async () => {
    const { backend, profiles, reopen } = setup();
    expect((await user(backend)).provider).toBe('guest');
    expect(profiles.current()).toBeNull();

    const u = await profiles.create({ name: '  Нео   Андерсон ' });
    expect(u).toMatchObject({
      provider: 'local',
      displayName: 'Нео Андерсон',
      email: null,
    });
    expect(u.id).toMatch(/^local-/);
    expect(await user(backend)).toEqual(u);
    expect(profiles.list()).toEqual([
      {
        id: u.id,
        name: 'Нео Андерсон',
        hasPin: false,
        createdAt: expect.any(String),
      },
    ]);

    // после перезагрузки страницы игрок остаётся в профиле
    expect(await user(reopen())).toEqual(u);
  });

  it('вход без PIN и с PIN, неверный PIN', async () => {
    const { storage, backend, profiles } = setup();
    const trin = await profiles.create({ name: 'Тринити', pin: '1234' });
    const morph = await profiles.create({ name: 'Морфеус' });

    // PIN не хранится открытым текстом
    const raw = storage.getItem(PROFILES_KEY)!;
    expect(raw).not.toContain('1234');
    expect(profiles.list().find((p) => p.id === trin.id)!.hasPin).toBe(true);

    expect((await err(profiles.signIn(trin.id))).code).toBe('pin_required');
    const wrong = await err(profiles.signIn(trin.id, '4321'));
    expect(wrong.code).toBe('pin_wrong');
    expect(wrong.message).toBe('Неверный PIN');
    expect((await err(profiles.signIn(trin.id, 'abcd'))).message).toBe('Неверный PIN');
    expect((await user(backend)).id).toBe(morph.id); // неудачная попытка не меняет игрока

    await profiles.signIn(trin.id, '1234');
    expect((await user(backend)).id).toBe(trin.id);
    await profiles.signIn(morph.id); // без PIN — просто вход
    expect((await user(backend)).id).toBe(morph.id);
    expect((await err(profiles.signIn('local-missing-0000'))).code).toBe('not_found');
  });

  it('ник: длина, символы, занятость без учёта регистра', async () => {
    const { profiles } = setup();
    expect((await err(profiles.create({ name: 'Я' }))).code).toBe('name_length');
    expect((await err(profiles.create({ name: 'x'.repeat(21) }))).message).toBe('Ник — от 2 до 20 символов');
    expect((await err(profiles.create({ name: '<script>' }))).code).toBe('name_chars');
    expect((await err(profiles.create({ name: 'Нео', pin: '12' }))).message).toBe('PIN — ровно 4 цифры');
    await profiles.create({ name: 'Нео' });
    const taken = await err(profiles.create({ name: '  нЕо ' }));
    expect(taken.code).toBe('name_taken');
    expect(taken.message).toBe('Такой ник уже есть на этом устройстве — войди в него');
    expect(validateName('ghost_01.x')).toBe('ghost_01.x');
  });

  it('хеш PIN с солью: одинаковые PIN дают разные хеши', async () => {
    const a = await hashPin('0000');
    const b = await hashPin('0000');
    expect(a.algo).toBe('sha256');
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toBe(b.hash);
    expect(await checkPin(a, '0000')).toBe(true);
    expect(await checkPin(a, '0001')).toBe(false);
  });
});

describe('офлайн-профили: выход и onChange', () => {
  it('выход возвращает того же гостя', async () => {
    const { backend, profiles, storage } = setup();
    const guest = await user(backend);
    await profiles.create({ name: 'Нео' });
    await backend.auth.signOut();
    expect(await user(backend)).toEqual(guest);
    expect(storage.getItem(ACTIVE_PROFILE_KEY)).toBeNull();
    await backend.auth.signOut(); // гость остаётся гостем
    expect(await user(backend)).toEqual(guest);
  });

  it('onChange сообщает о входе, переключении и выходе', async () => {
    const { backend, profiles } = setup();
    const seen: string[] = [];
    const off = backend.auth.onChange((u) => seen.push(`${u?.provider}:${u?.displayName}`));
    await Promise.resolve();
    await profiles.create({ name: 'Нео' });
    await profiles.create({ name: 'Тринити' });
    await backend.auth.signOut();
    off();
    await profiles.create({ name: 'Морфеус' });
    expect(seen).toEqual(['guest:Гость', 'local:Нео', 'local:Тринити', 'guest:Гость']);
  });
});

describe('офлайн-профили: прогресс', () => {
  it('у каждого профиля свой забег, профиль и результаты дня', async () => {
    const { backend, profiles } = setup();
    const { saves, leaderboard } = backend;
    await saves.saveProfile(progress({ totalRuns: 1 }));
    await saves.saveRun(fakeRun('2026-10-18T10:00:00.000Z', { floor: 1 }));

    const neo = await profiles.create({ name: 'Нео' });
    expect(await saves.loadProfile()).toEqual(defaultProfile());
    expect(await saves.loadRun()).toBeNull();
    await saves.saveProfile(progress({ totalRuns: 7 }));
    await saves.saveRun(fakeRun('2026-10-18T11:00:00.000Z', { floor: 9 }));
    await leaderboard.submitWeekly(SEED, { seed: SEED, classId: 'ghost' }, []);
    expect(await leaderboard.getWeekly(SEED)).toHaveLength(1);

    await profiles.create({ name: 'Тринити' });
    expect((await saves.loadProfile()).totalRuns).toBe(0);
    expect(await saves.loadRun()).toBeNull();
    expect(await leaderboard.getWeekly(SEED)).toEqual([]);

    await backend.auth.signOut();
    expect((await saves.loadProfile()).totalRuns).toBe(1);
    expect((await saves.loadRun())!.state.floor).toBe(1);
    expect(await leaderboard.getWeekly(SEED)).toEqual([]);

    await profiles.signIn(neo.id);
    expect((await saves.loadProfile()).totalRuns).toBe(7);
    expect((await saves.loadRun())!.state.floor).toBe(9);
    expect(await leaderboard.getWeekly(SEED)).toHaveLength(1);
  });

  it('другая вкладка переключила профиль — эта пишет своему игроку до перезагрузки', async () => {
    const { profiles, backend, reopen } = setup();
    const neo = await profiles.create({ name: 'Нео' });
    const other = reopen();
    await other.profiles!.create({ name: 'Тринити' });
    await backend.saves.saveProfile(progress({ totalRuns: 3 }));
    expect((await user(backend)).id).toBe(neo.id);
    expect((await other.saves.loadProfile()).totalRuns).toBe(0);
  });

  it('перенос прогресса гостя: всё переезжает в профиль, у гостя чистый лист', async () => {
    const { storage, backend, profiles } = setup();
    await backend.saves.saveProfile(progress({ totalRuns: 4 }));
    const run = fakeRun('2026-10-18T10:00:00.000Z', { floor: 6 });
    await backend.saves.saveRun(run);
    await backend.leaderboard.submitWeekly(SEED, { seed: SEED, classId: 'ghost' }, []);
    expect(profiles.guestHasProgress()).toBe(true);

    await profiles.create({ name: 'Нео', importGuest: true });
    expect((await backend.saves.loadProfile()).totalRuns).toBe(4);
    expect(await backend.saves.loadRun()).toEqual(run);
    expect(await backend.leaderboard.getWeekly(SEED)).toHaveLength(1);

    await backend.auth.signOut();
    expect(profiles.guestHasProgress()).toBe(false);
    expect(await backend.saves.loadProfile()).toEqual(defaultProfile());
    expect(await backend.saves.loadRun()).toBeNull();
    expect(storage.getItem(GUEST_ID_KEY)).toMatch(/^guest-/); // id гостя на месте
  });

  it('без галочки прогресс гостя остаётся у гостя', async () => {
    const { backend, profiles } = setup();
    await backend.saves.saveProfile(progress({ totalRuns: 4 }));
    await profiles.create({ name: 'Нео', importGuest: false });
    expect((await backend.saves.loadProfile()).totalRuns).toBe(0);
    await backend.auth.signOut();
    expect((await backend.saves.loadProfile()).totalRuns).toBe(4);
  });

  it('нет места в хранилище — профиль не создаётся, гость не теряет прогресс', async () => {
    const storage = new FullStorage();
    const { profiles, backend } = setup(storage);
    await expect(profiles.create({ name: 'Нео', importGuest: true })).rejects.toThrow(/места/);
    expect(profiles.list()).toEqual([]);
    expect((await user(backend)).provider).toBe('guest');
  });
});

describe('офлайн-профили: удаление', () => {
  it('удаление с PIN стирает прогресс; удалённый активный профиль → гость', async () => {
    const { storage, backend, profiles } = setup();
    const neo = await profiles.create({ name: 'Нео', pin: '1111' });
    await backend.saves.saveProfile(progress());
    await backend.saves.saveRun(fakeRun('2026-10-18T10:00:00.000Z'));
    expect(storage.getItem(`${localPrefix(neo.id)}run`)).not.toBeNull();

    expect((await err(profiles.remove(neo.id))).code).toBe('pin_required');
    expect((await err(profiles.remove(neo.id, '2222'))).code).toBe('pin_wrong');
    expect(profiles.list()).toHaveLength(1);

    await profiles.remove(neo.id, '1111');
    expect(profiles.list()).toEqual([]);
    expect(storage.getItem(`${localPrefix(neo.id)}run`)).toBeNull();
    expect(storage.getItem(`${localPrefix(neo.id)}profile`)).toBeNull();
    expect((await user(backend)).provider).toBe('guest');
    expect((await err(profiles.remove(neo.id, '1111'))).code).toBe('not_found');
  });

  it('удаление неактивного профиля без PIN не трогает текущего игрока', async () => {
    const { backend, profiles } = setup();
    const neo = await profiles.create({ name: 'Нео' });
    const trin = await profiles.create({ name: 'Тринити' });
    await profiles.remove(neo.id);
    expect((await user(backend)).id).toBe(trin.id);
    expect(profiles.list().map((p) => p.name)).toEqual(['Тринити']);
  });
});

describe('миграция: старые данные гостя', () => {
  it('ключи cyberhack:guest:* из прошлой версии читаются как раньше и не теряются', async () => {
    const storage = new MemoryStorage();
    // так данные лежали до появления офлайн-профилей
    storage.setItem(GUEST_ID_KEY, 'guest-0123abcd-old');
    storage.setItem(`${GUEST_PREFIX}profile`, JSON.stringify(progress({ totalRuns: 12, totalWins: 2 })));
    const oldRun = fakeRun('2026-10-17T10:00:00.000Z', { floor: 14 });
    storage.setItem(`${GUEST_PREFIX}run`, JSON.stringify(oldRun));
    storage.setItem(
      `${GUEST_PREFIX}weekly`,
      JSON.stringify([
        {
          seed: SEED,
          classId: 'ghost',
          score: 50,
          floor: 3,
          victory: false,
          createdAt: '2026-10-18T09:00:00.000Z',
        },
      ]),
    );

    const { backend, profiles } = setup(storage);
    expect(await user(backend)).toMatchObject({
      id: 'guest-0123abcd-old',
      provider: 'guest',
    });
    expect((await backend.saves.loadProfile()).totalRuns).toBe(12);
    expect(await backend.saves.loadRun()).toEqual(oldRun);
    expect(await backend.leaderboard.getWeekly(SEED)).toHaveLength(1);
    expect(profiles.list()).toEqual([]);

    // профиль без переноса не трогает старые ключи гостя
    await profiles.create({ name: 'Нео' });
    await backend.auth.signOut();
    expect(await createLocalSaves(storage).loadRun()).toEqual(oldRun);
    expect((await backend.saves.loadProfile()).totalWins).toBe(2);
  });

  it('повреждённый список профилей и активный id на несуществующий профиль → гость', async () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILES_KEY, JSON.stringify([{ id: 'bad' }, 5, { id: 'local-abcdefgh-1', name: 'Нео', createdAt: 'x' }]));
    storage.setItem(ACTIVE_PROFILE_KEY, 'local-zzzzzzzz-9');
    const { backend, profiles } = setup(storage);
    expect((await user(backend)).provider).toBe('guest');
    expect(profiles.list().map((p) => p.name)).toEqual(['Нео']);
    storage.setItem(PROFILES_KEY, '{oops');
    expect(profiles.list()).toEqual([]);
  });
});
