/** Общие заготовки для тестов сетевого слоя (в прод-бандл не попадает: импортируется только из *.test.ts). */
import { SAVE_VERSION, type Action, type NewRunOptions, type RunState } from '@cyberhack/engine';
import type { SavedRun } from './types';
import type { ReplayFn } from './local';
import { MemoryStorage } from './storage';

export function fakeState(over: Partial<RunState> = {}): RunState {
  return {
    version: SAVE_VERSION,
    seed: '2026-W43',
    classId: 'ghost',
    ascension: 0,
    weekly: '2026-W43',
    act: 1,
    floor: 7,
    hp: 40,
    maxHp: 70,
    gold: 99,
    deck: [],
    relics: [],
    map: [],
    currentNodeId: null,
    visited: [],
    screen: { kind: 'map' },
    combat: null,
    rng: { map: 1, combat: 2, cards: 3, rewards: 4, events: 5, shop: 6, ai: 7 },
    uidCounter: 0,
    status: 'active',
    score: 0,
    stats: { enemiesKilled: 0, elitesKilled: 0, bossesKilled: 0, damageDealt: 0, cardsPlayed: 0 },
    ...over,
  };
}

export function fakeRun(updatedAt: string, over: Partial<RunState> = {}): SavedRun {
  const state = fakeState(over);
  return {
    options: { seed: state.seed, classId: state.classId },
    actions: [{ type: 'end_turn' }],
    state,
    updatedAt,
  };
}

/** replay-заглушка: итог забега задаётся тестом */
export function fakeReplay(result: Partial<RunState>): ReplayFn & { calls: Array<[NewRunOptions, Action[]]> } {
  const calls: Array<[NewRunOptions, Action[]]> = [];
  const fn = ((opts: NewRunOptions, actions: Action[]) => {
    calls.push([opts, actions]);
    return fakeState({ seed: opts.seed, classId: opts.classId, ...result });
  }) as ReplayFn & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

/** Хранилище, которое бросает QuotaExceededError на запись */
export class FullStorage extends MemoryStorage {
  override setItem(): void {
    const e = new Error('quota');
    e.name = 'QuotaExceededError';
    throw e;
  }
}
