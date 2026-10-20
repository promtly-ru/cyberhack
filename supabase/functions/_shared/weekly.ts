/**
 * Чистая логика проверки еженедельного вызова (без Deno/Supabase — тестируется vitest-ом).
 * Используется Edge Function submit-weekly.
 */

export const CLASS_IDS = ['netrunner', 'phreaker', 'ghost', 'samurai', 'engineer', 'biohacker', 'droneop', 'chrono', 'vabanker'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const MAX_ACTIONS = 20_000;
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_ASCENSION = 15;
/** Попыток за неделю; в зачёт идёт лучшая */
export const MAX_ATTEMPTS = 3;
/** Сколько часов после полуночи пн UTC ещё принимается прошлая неделя */
export const GRACE_HOURS = 2;

const SEED_RE = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 24 * 3600 * 1000;

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

/** Id ISO-недели (пн-вс, UTC): '2026-W43'. Дублирует weeklySeed движка (тест сверяет). */
export function weeklySeedFor(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const mon = d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS;
  const thu = new Date(mon + 3 * DAY_MS);
  const year = thu.getUTCFullYear();
  const week = Math.floor((thu.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Какие сиды принимаются в момент now: текущая неделя и прошлая в первые GRACE_HOURS часов понедельника. */
export function allowedSeeds(now: Date): string[] {
  const seeds = [weeklySeedFor(now)];
  if (now.getUTCDay() === 1 && now.getUTCHours() < GRACE_HOURS) seeds.push(weeklySeedFor(new Date(now.getTime() - DAY_MS)));
  return seeds;
}

export function isSeedAllowed(seed: string, now: Date): boolean {
  return SEED_RE.test(seed) && allowedSeeds(now).includes(seed);
}

export interface WeeklyOptions {
  seed: string;
  classId: ClassId;
  ascension: number;
  weekly: string;
}

export interface WeeklyPayload {
  seed: string;
  options: WeeklyOptions;
  actions: Record<string, unknown>[];
  /** Длительность забега в секундах (со слов клиента, только для отображения) */
  durationS: number | null;
}

export type ParseResult = { ok: true; value: WeeklyPayload } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Проверить тело запроса. Параметры забега собираются заново на сервере:
 * seed — из запроса (после проверки), weekly = seed, classId/ascension — из белого списка.
 */
export function parsePayload(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, error: 'body must be an object' };
  const { seed, options, actions, durationS } = body;
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
      options: { seed, classId: classId as ClassId, ascension: 0, weekly: seed },
      actions: actions as Record<string, unknown>[],
      durationS: typeof durationS === 'number' && Number.isInteger(durationS) && durationS >= 0 && durationS <= 86_400 ? durationS : null,
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

export interface WeeklyResult {
  classId: ClassId;
  score: number;
  floor: number;
  victory: boolean;
}

export type ResultCheck = { ok: true; value: WeeklyResult } | { ok: false; reason: 'run_not_finished' | 'invalid_run' };

/** Результат берётся ТОЛЬКО из пересчитанного состояния, клиентским числам не доверяем. */
export function extractResult(state: ReplayedState, expected: WeeklyOptions): ResultCheck {
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
