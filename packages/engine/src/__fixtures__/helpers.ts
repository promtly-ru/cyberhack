/**
 * Хелперы для тестов: вход в бой, ручная настройка руки/врагов, случайный бот.
 */
import { afterAll, beforeEach } from 'vitest';
import { resetContent, setContentForTests, type ContentData } from '../content';
import { mulberry32 } from '../rng';
import { applyAction, getLegalActions, newRun } from '../run';
import type { Action, CardInstance, EnemyState, NewRunOptions, RunState } from '../types';
import { fixtureContent } from './content';

export function useContent(factory: () => ContentData = fixtureContent): void {
  beforeEach(() => setContentForTests(factory()));
  afterAll(() => resetContent());
}

export const OPTS: NewRunOptions = { seed: 'test-seed', classId: 'netrunner' };

/** Новый забег и вход в первый бой (ряд 0 всегда combat). */
export function enterCombat(opts: NewRunOptions = OPTS): RunState {
  const s = newRun(opts);
  const first = getLegalActions(s)[0];
  if (!first) throw new Error('no legal actions');
  return applyAction(s, first).state;
}

let uidSeq = 0;
export function inst(defId: string, upgraded = false): CardInstance {
  uidSeq += 1;
  return { uid: `t${uidSeq}`, defId, upgraded };
}

/**
 * Настроить бой: рука, добор, сброс, враги (по умолчанию один «манекен» с большим HP,
 * чьё намерение — guard/защита, чтобы не мешать).
 */
export function setupCombat(
  s: RunState,
  opts: {
    hand?: string[];
    draw?: string[];
    discard?: string[];
    energy?: number;
    enemyHp?: number[];
    enemyDefId?: string;
    playerHp?: number;
  } = {},
): RunState {
  const c = s.combat;
  if (!c) throw new Error('not in combat');
  c.hand = (opts.hand ?? []).map((d) => inst(d));
  c.drawPile = (opts.draw ?? []).map((d) => inst(d));
  c.discardPile = (opts.discard ?? []).map((d) => inst(d));
  c.exhaustPile = [];
  if (opts.energy !== undefined) c.energy = opts.energy;
  if (opts.playerHp !== undefined) {
    c.player.hp = opts.playerHp;
    s.hp = opts.playerHp;
  }
  c.player.block = 0;
  c.player.statuses = {};
  const hps = opts.enemyHp ?? [100];
  c.enemies = hps.map(
    (hp, i): EnemyState => ({
      uid: `en${i}`,
      defId: opts.enemyDefId ?? 'a1_firewall',
      hp,
      maxHp: hp,
      block: 0,
      statuses: {},
      intent: { kind: 'attack', moveId: 'hit' },
      moveHistory: [],
    }),
  );
  return s;
}

export function play(s: RunState, cardUid: string, targetUid?: string): RunState {
  const action: Action = targetUid ? { type: 'play_card', cardUid, targetUid } : { type: 'play_card', cardUid };
  return applyAction(s, action).state;
}

/** Детерминированный случайный бот. */
export function runBot(
  opts: NewRunOptions,
  botSeed: number,
  maxSteps = 20000,
): { state: RunState; actions: Action[]; steps: number } {
  let s = newRun(opts);
  let rs = botSeed >>> 0;
  const rand = (): number => {
    const [v, n] = mulberry32(rs);
    rs = n;
    return v;
  };
  const actions: Action[] = [];
  let steps = 0;
  while (s.status === 'active' && steps < maxSteps) {
    const legal = getLegalActions(s);
    if (legal.length === 0) throw new Error(`No legal actions on screen ${s.screen.kind}`);
    // Небольшой перекос в пользу розыгрыша карт, чтобы бои шли быстрее.
    const plays = legal.filter((a) => a.type === 'play_card');
    const pool = plays.length > 0 && rand() < 0.8 ? plays : legal;
    const a = pool[Math.floor(rand() * pool.length)] as Action;
    actions.push(a);
    s = applyAction(s, a).state;
    steps++;
  }
  return { state: s, actions, steps };
}
