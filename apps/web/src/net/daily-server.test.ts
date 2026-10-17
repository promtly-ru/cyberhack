/** Тесты чистой логики Edge Function submit-daily (supabase/functions/_shared/daily.ts). */
import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIONS,
  allowedSeeds,
  extractResult,
  isSeedAllowed,
  parsePayload,
  type DailyOptions,
} from '../../../../supabase/functions/_shared/daily';

describe('сид дня', () => {
  it('днём принимается только сегодняшний', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    expect(allowedSeeds(now)).toEqual(['daily-2026-10-18']);
    expect(isSeedAllowed('daily-2026-10-18', now)).toBe(true);
    expect(isSeedAllowed('daily-2026-10-17', now)).toBe(false);
    expect(isSeedAllowed('daily-2026-10-19', now)).toBe(false);
  });

  it('в первые 2 часа UTC принимается и вчерашний', () => {
    expect(isSeedAllowed('daily-2026-10-17', new Date('2026-10-18T01:59:59Z'))).toBe(true);
    expect(isSeedAllowed('daily-2026-10-17', new Date('2026-10-18T02:00:00Z'))).toBe(false);
    // переход через месяц/год
    expect(allowedSeeds(new Date('2027-01-01T00:30:00Z'))).toEqual(['daily-2027-01-01', 'daily-2026-12-31']);
  });

  it('мусор в seed отвергается', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    expect(isSeedAllowed("daily-2026-10-18' or 1=1", now)).toBe(false);
    expect(isSeedAllowed('daily-2026-10-18\n', now)).toBe(false);
  });
});

describe('parsePayload', () => {
  const seed = 'daily-2026-10-18';
  const good = { seed, options: { seed, classId: 'ghost', ascension: 2 }, actions: [{ type: 'end_turn' }] };

  it('собирает параметры забега на сервере (daily всегда true)', () => {
    const r = parsePayload({ ...good, options: { ...good.options, daily: false, extra: 'x' } });
    expect(r).toEqual({
      ok: true,
      value: { seed, options: { seed, classId: 'ghost', ascension: 2, daily: true }, actions: good.actions },
    });
  });

  it.each([
    ['не объект', null],
    ['плохой seed', { ...good, seed: 'my-seed' }],
    ['seed в options другой', { ...good, options: { ...good.options, seed: 'daily-2026-10-17' } }],
    ['неизвестный класс', { ...good, options: { ...good.options, classId: 'admin' } }],
    ['ascension вне диапазона', { ...good, options: { ...good.options, ascension: 16 } }],
    ['дробный ascension', { ...good, options: { ...good.options, ascension: 1.5 } }],
    ['пустой журнал', { ...good, actions: [] }],
    ['журнал не массив', { ...good, actions: 'end_turn' }],
    ['неизвестное действие', { ...good, actions: [{ type: 'set_score', score: 1e9 }] }],
    ['слишком длинный журнал', { ...good, actions: Array.from({ length: MAX_ACTIONS + 1 }, () => ({ type: 'end_turn' })) }],
  ])('отвергает: %s', (_name, body) => {
    expect(parsePayload(body).ok).toBe(false);
  });
});

describe('extractResult', () => {
  const opts: DailyOptions = { seed: 'daily-2026-10-18', classId: 'ghost', ascension: 0, daily: true };
  const st = (over: object) => ({ seed: opts.seed, classId: 'ghost', status: 'won' as const, score: 100, floor: 51, ...over });

  it('берёт результат из пересчитанного состояния', () => {
    expect(extractResult(st({ score: 1234.9 }), opts)).toEqual({
      ok: true,
      value: { classId: 'ghost', score: 1234, floor: 51, victory: true },
    });
    expect(extractResult(st({ status: 'lost', floor: 9 }), opts)).toMatchObject({ ok: true, value: { victory: false } });
  });

  it('незавершённый или чужой забег отвергается', () => {
    expect(extractResult(st({ status: 'active' }), opts)).toEqual({ ok: false, reason: 'run_not_finished' });
    expect(extractResult(st({ seed: 'daily-2026-10-17' }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ classId: 'netrunner' }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ score: Number.NaN }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ score: -1 }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ score: 3e9 }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
  });
});
