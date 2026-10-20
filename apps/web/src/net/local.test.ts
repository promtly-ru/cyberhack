import { describe, expect, it } from 'vitest';
import { createLocalBackend, GUEST_ID_KEY } from './local';
import { BackendNotConfiguredError } from './errors';
import { MemoryStorage, StorageWriteError, type KeyValueStorage } from './storage';
import { defaultProfile } from './profile';
import { FullStorage, fakeReplay, fakeRun } from './test-helpers';

const SEED = '2026-W43';

describe('local auth', () => {
  it('гость со стабильным id из хранилища', async () => {
    const storage = new MemoryStorage();
    const a = await createLocalBackend({ storage }).auth.getUser();
    const b = await createLocalBackend({ storage }).auth.getUser();
    expect(a).toMatchObject({ provider: 'guest', email: null });
    expect(a!.id).toMatch(/^guest-/);
    expect(b!.id).toBe(a!.id);
    expect(storage.getItem(GUEST_ID_KEY)).toBe(a!.id);
  });

  it('повреждённый id перегенерируется', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GUEST_ID_KEY, '<script>');
    const u = await createLocalBackend({ storage, randomId: () => 'abcdef12-3456' }).auth.getUser();
    expect(u!.id).toBe('guest-abcdef12-3456');
  });

  it('вход бросает понятную ошибку «Сервер не настроен»', async () => {
    const { auth } = createLocalBackend({ storage: new MemoryStorage() });
    await expect(auth.signInWithEmail('a@b.c')).rejects.toBeInstanceOf(BackendNotConfiguredError);
    await expect(auth.signInWithOAuth('github')).rejects.toThrow(/Сервер не настроен/);
    await expect(auth.signOut()).resolves.toBeUndefined();
  });

  it('onChange сообщает гостя и отписывается', async () => {
    const { auth } = createLocalBackend({ storage: new MemoryStorage() });
    const seen: unknown[] = [];
    auth.onChange((u) => seen.push(u?.provider));
    const off = auth.onChange((u) => seen.push(`second:${u?.provider}`));
    off();
    await Promise.resolve();
    expect(seen).toEqual(['guest']);
  });

  it('работает без доступного хранилища', async () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const b = createLocalBackend({ storage: broken });
    expect((await b.auth.getUser())!.provider).toBe('guest');
    expect(await b.saves.loadRun()).toBeNull();
    expect(await b.saves.loadProfile()).toEqual(defaultProfile());
    await expect(b.saves.clearRun()).resolves.toBeUndefined();
  });
});

describe('local saves', () => {
  it('сохраняет и загружает забег, clearRun удаляет', async () => {
    const { saves } = createLocalBackend({ storage: new MemoryStorage() });
    expect(await saves.loadRun()).toBeNull();
    const run = fakeRun('2026-10-18T10:00:00.000Z');
    await saves.saveRun(run);
    expect(await saves.loadRun()).toEqual(run);
    await saves.clearRun();
    expect(await saves.loadRun()).toBeNull();
  });

  it('повреждённый JSON → null / профиль по умолчанию', async () => {
    const storage = new MemoryStorage();
    storage.setItem('cyberhack:guest:run', '{"options":');
    storage.setItem('cyberhack:guest:profile', 'not json');
    const { saves } = createLocalBackend({ storage });
    expect(await saves.loadRun()).toBeNull();
    expect(await saves.loadProfile()).toEqual(defaultProfile());
  });

  it('JSON неверной формы → null', async () => {
    const storage = new MemoryStorage();
    storage.setItem('cyberhack:guest:run', JSON.stringify({ options: { seed: 1 }, actions: 'x', state: null }));
    expect(await createLocalBackend({ storage }).saves.loadRun()).toBeNull();
    storage.setItem('cyberhack:guest:run', JSON.stringify([1, 2, 3]));
    expect(await createLocalBackend({ storage }).saves.loadRun()).toBeNull();
  });

  it('переполнение квоты → StorageWriteError с понятным текстом', async () => {
    const { saves } = createLocalBackend({ storage: new FullStorage() });
    const err = await saves.saveRun(fakeRun('2026-10-18T10:00:00.000Z')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageWriteError);
    expect((err as StorageWriteError).quotaExceeded).toBe(true);
    expect((err as Error).message).toMatch(/места/);
  });

  it('профиль: мусор отбрасывается, корректное сохраняется', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'cyberhack:guest:profile',
      JSON.stringify({
        unlockedClasses: ['ghost', 'hacker9000', 5],
        unlockedCards: ['zap', 'zap', null],
        maxAscension: { ghost: 99, netrunner: -3, phreaker: 'x' },
        totalRuns: 12.7,
        totalWins: 'many',
      }),
    );
    const { saves } = createLocalBackend({ storage });
    const p = await saves.loadProfile();
    expect(p.unlockedClasses.sort()).toEqual(['ghost', 'netrunner']);
    expect(p.unlockedCards).toEqual(['zap']);
    expect(p.maxAscension).toEqual({ netrunner: 0, phreaker: 0, ghost: 15, samurai: 0, engineer: 0, biohacker: 0, droneop: 0, chrono: 0, vabanker: 0 });
    expect(p.totalRuns).toBe(12);
    expect(p.totalWins).toBe(0);
    await saves.saveProfile({ ...p, totalWins: 3 });
    expect((await saves.loadProfile()).totalWins).toBe(3);
  });
});

describe('local leaderboard', () => {
  const opts = { seed: SEED, classId: 'ghost' as const };
  let t = 0;
  const now = () => new Date(Date.UTC(2026, 9, 18, 12, 0, t++));

  it('результат считается через replay, а не берётся у клиента', async () => {
    const replay = fakeReplay({ status: 'won', score: 1234, floor: 51 });
    const { leaderboard } = createLocalBackend({ storage: new MemoryStorage(), replay, now });
    const res = await leaderboard.submitWeekly(SEED, { ...opts, ascension: 3 }, [{ type: 'end_turn' }]);
    expect(res).toEqual({ accepted: true, rank: 1 });
    expect(replay.calls[0]![0]).toEqual({ seed: SEED, classId: 'ghost', ascension: 0, weekly: SEED });
    expect(await leaderboard.getWeekly(SEED)).toEqual([
      { rank: 1, displayName: 'Вы', classId: 'ghost', score: 1234, floor: 51, victory: true, durationS: null },
    ]);
  });

  it('незавершённый, сломанный или чужой забег не принимается', async () => {
    const storage = new MemoryStorage();
    const active = createLocalBackend({ storage, replay: fakeReplay({ status: 'active' }), now });
    expect(await active.leaderboard.submitWeekly(SEED, opts, [])).toEqual({ accepted: false });

    const crashing = createLocalBackend({
      storage,
      replay: () => {
        throw new Error('InvalidAction');
      },
      now,
    });
    expect(await crashing.leaderboard.submitWeekly(SEED, opts, [])).toEqual({ accepted: false });

    const ok = createLocalBackend({ storage, replay: fakeReplay({ status: 'lost', score: 5 }), now });
    expect(await ok.leaderboard.submitWeekly('my-seed', { ...opts, seed: 'my-seed' }, [])).toEqual({ accepted: false });
    expect(await ok.leaderboard.submitWeekly(SEED, { ...opts, seed: '2020-W01' }, [])).toEqual({ accepted: false });
    expect(await ok.leaderboard.getWeekly(SEED)).toEqual([]);
  });

  it('несколько своих попыток: в зачёт идёт лучшая', async () => {
    const storage = new MemoryStorage();
    const mk = (score: number) =>
      createLocalBackend({ storage, replay: fakeReplay({ status: 'lost', score }), now }).leaderboard;
    expect(await mk(100).submitWeekly(SEED, opts, [])).toEqual({ accepted: true, rank: 1 });
    expect(await mk(300).submitWeekly(SEED, opts, [])).toEqual({ accepted: true, rank: 1 });
    expect(await mk(200).submitWeekly(SEED, opts, [], 90)).toEqual({ accepted: true, rank: 1 });
    const board = await mk(0).getWeekly(SEED, 5);
    expect(board.map((e) => [e.rank, e.score])).toEqual([[1, 300]]);
    expect((await mk(0).getWeeklyMine(SEED))?.score).toBe(300);
    expect(await mk(0).getWeekly('2026-W42')).toEqual([]);
    expect(await mk(0).getWeeklyMine('2026-W42')).toBeNull();
  });
});
