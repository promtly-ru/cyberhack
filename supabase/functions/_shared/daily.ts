/**
 * Чистая логика проверки ежедневного забега (без Deno/Supabase — тестируется vitest-ом).
 * Используется Edge Function submit-daily.
 */

export const CLASS_IDS = ['netrunner', 'phreaker', 'ghost'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const MAX_ACTIONS = 20_000;
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_ASCENSION = 15;
/** Сколько часов после полуночи UTC ещё принимается вчерашний daily */
export const GRACE_HOURS = 2;

const SEED_RE = /^daily-(\d{4})-(\d{2})-(\d{2})$/;

const ACTION_TYPES = new Set([
  'choose_node',
  'play_card',
  'end_turn',
  'take_reward',
  'pick_card',
  'leave_reward',
  'shop_buy',
  'leave_shop',
  'rest_heal',
  'rest_upgrade',
  'select_deck_card',
  'event_choice',
]);

export function dailySeedFor(date: Date): string {
  return `daily-${date.toISOString().slice(0, 10)}`;
}

/** Какие сиды принимаются в момент now: сегодняшний (UTC) и вчерашний в первые GRACE_HOURS часов. */
export function allowedSeeds(now: Date): string[] {
  const seeds = [dailySeedFor(now)];
  if (now.getUTCHours() < GRACE_HOURS) seeds.push(dailySeedFor(new Date(now.getTime() - 24 * 3600 * 1000)));
  return seeds;
}

export function isSeedAllowed(seed: string, now: Date): boolean {
  return SEED_RE.test(seed) && allowedSeeds(now).includes(seed);
}

export interface DailyOptions {
  seed: string;
  classId: ClassId;
  ascension: number;
  daily: true;
}

export interface DailyPayload {
  seed: string;
  options: DailyOptions;
  actions: Record<string, unknown>[];
}

export type ParseResult = { ok: true; value: DailyPayload } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Проверить тело запроса. Параметры забега собираются заново на сервере:
 * seed — из запроса (после проверки), daily — всегда true, classId/ascension — из белого списка.
 */
export function parsePayload(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, error: 'body must be an object' };
  const { seed, options, actions } = body;
  if (typeof seed !== 'string' || !SEED_RE.test(seed)) return { ok: false, error: 'bad seed' };
  if (!isRecord(options)) return { ok: false, error: 'bad options' };
  if (options.seed !== undefined && options.seed !== seed) return { ok: false, error: 'options.seed mismatch' };
  const classId = options.classId;
  if (typeof classId !== 'string' || !(CLASS_IDS as readonly string[]).includes(classId)) {
    return { ok: false, error: 'bad classId' };
  }
  const asc = options.ascension ?? 0;
  if (typeof asc !== 'number' || !Number.isInteger(asc) || asc < 0 || asc > MAX_ASCENSION) {
    return { ok: false, error: 'bad ascension' };
  }
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_ACTIONS) {
    return { ok: false, error: 'bad actions' };
  }
  for (const a of actions) {
    if (!isRecord(a) || typeof a.type !== 'string' || !ACTION_TYPES.has(a.type)) {
      return { ok: false, error: 'bad action' };
    }
  }
  return {
    ok: true,
    value: {
      seed,
      options: { seed, classId: classId as ClassId, ascension: asc, daily: true },
      actions: actions as Record<string, unknown>[],
    },
  };
}

/** Минимум полей RunState, который нужен серверу */
export interface ReplayedState {
  seed: string;
  classId: string;
  status: 'active' | 'won' | 'lost';
  score: number;
  floor: number;
}

export interface DailyResult {
  classId: ClassId;
  score: number;
  floor: number;
  victory: boolean;
}

export type ResultCheck = { ok: true; value: DailyResult } | { ok: false; reason: 'run_not_finished' | 'invalid_run' };

/** Результат берётся ТОЛЬКО из пересчитанного состояния, клиентским числам не доверяем. */
export function extractResult(state: ReplayedState, expected: DailyOptions): ResultCheck {
  if (!isRecord(state)) return { ok: false, reason: 'invalid_run' };
  if (state.seed !== expected.seed || state.classId !== expected.classId) return { ok: false, reason: 'invalid_run' };
  if (state.status === 'active') return { ok: false, reason: 'run_not_finished' };
  if (state.status !== 'won' && state.status !== 'lost') return { ok: false, reason: 'invalid_run' };
  const { score, floor } = state;
  if (!Number.isFinite(score) || !Number.isFinite(floor) || score < 0 || floor < 0) {
    return { ok: false, reason: 'invalid_run' };
  }
  // integer в БД: отсекаем переполнение
  if (score > 2_000_000_000 || floor > 10_000) return { ok: false, reason: 'invalid_run' };
  return {
    ok: true,
    value: { classId: expected.classId, score: Math.floor(score), floor: Math.floor(floor), victory: state.status === 'won' },
  };
}
