/** Тесты чистой логики Edge Function submit-weekly (supabase/functions/_shared/weekly.ts). */
import { weeklySeed } from '@cyberhack/engine';
import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIONS,
  allowedSeeds,
  extractResult,
  isSeedAllowed,
  parsePayload,
  type WeeklyOptions,
  weeklySeedFor,
} from '../../../../supabase/functions/_shared/weekly';

describe('сид недели', () => {
  it('в середине недели принимается только текущая', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(allowedSeeds(now)).toEqual(['2026-W43']);
    expect(isSeedAllowed('2026-W43', now)).toBe(true);
    expect(isSeedAllowed('2026-W42', now)).toBe(false);
    expect(isSeedAllowed('2026-W44', now)).toBe(false);
  });

  it('в первые 2 часа понедельника UTC принимается и прошлая неделя', () => {
    expect(isSeedAllowed('2026-W43', new Date('2026-10-26T01:59:59Z'))).toBe(true);
    expect(isSeedAllowed('2026-W43', new Date('2026-10-26T02:00:00Z'))).toBe(false);
    expect(allowedSeeds(new Date('2027-01-04T00:30:00Z'))).toEqual(['2027-W01', '2026-W53']);
  });

  it('совпадает с weeklySeed движка', () => {
    for (let d = 0; d < 400; d += 3) {
      const date = new Date(Date.UTC(2025, 11, 1) + d * 86_400_000 + 5 * 3600_000);
      expect(weeklySeedFor(date)).toBe(weeklySeed(date));
    }
  });

  it('мусор в seed отвергается', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(isSeedAllowed("2026-W43' or 1=1", now)).toBe(false);
    expect(isSeedAllowed('2026-W43\n', now)).toBe(false);
  });
});

describe('parsePayload', () => {
  const seed = '2026-W43';
  const good = { seed, options: { seed, classId: 'ghost', ascension: 2 }, actions: [{ type: 'end_turn' }] };

  it('собирает параметры забега на сервере (weekly = seed, ascension 0)', () => {
    const r = parsePayload({ ...good, options: { ...good.options, weekly: 'x', extra: 'y' } });
    expect(r).toEqual({
      ok: true,
      value: { seed, options: { seed, classId: 'ghost', ascension: 0, weekly: seed }, actions: good.actions, durationS: null },
    });
  });

  it.each([
    ['не объект', null],
    ['плохой seed', { ...good, seed: 'my-seed' }],
    ['seed в options другой', { ...good, options: { ...good.options, seed: '2026-W42' } }],
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
  const opts: WeeklyOptions = { seed: '2026-W43', classId: 'ghost', ascension: 0, weekly: '2026-W43' };
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
    expect(extractResult(st({ seed: '2026-W42' }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ classId: 'netrunner' }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ score: Number.NaN }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ score: -1 }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
    expect(extractResult(st({ score: 3e9 }), opts)).toEqual({ ok: false, reason: 'invalid_run' });
  });
});
