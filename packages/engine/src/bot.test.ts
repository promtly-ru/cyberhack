/**
 * Полные забеги случайным ботом на фикстурах: без исключений, до конца.
 */
import { describe, expect, it } from 'vitest';
import { easyContent } from './__fixtures__/content';
import { runBot, useContent } from './__fixtures__/helpers';
import type { ClassId, RunState } from './types';

function checkInvariants(s: RunState): void {
  expect(s.status).not.toBe('active');
  expect(s.screen.kind).toBe('game_over');
  expect(s.hp).toBeGreaterThanOrEqual(0);
  expect(s.hp).toBeLessThanOrEqual(s.maxHp);
  expect(s.gold).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(s.score)).toBe(true);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
}

describe('случайный бот, обычные фикстуры', () => {
  useContent();
  it('100 сидов доигрываются до победы/поражения без исключений', () => {
    let floors = 0;
    for (let i = 0; i < 100; i++) {
      const classId: ClassId = i % 2 === 0 ? 'netrunner' : 'phreaker';
      const { state, steps } = runBot({ seed: `bot-${i}`, classId, ascension: i % 16 }, i + 1);
      expect(steps).toBeLessThan(20000);
      checkInvariants(state);
      floors += state.floor;
    }
    expect(floors).toBeGreaterThan(100);
  });
});

describe('случайный бот, лёгкие фикстуры', () => {
  useContent(easyContent);
  it('бот проходит все 3 акта и побеждает', () => {
    let wins = 0;
    for (let i = 0; i < 20; i++) {
      const { state } = runBot({ seed: `easy-${i}`, classId: 'netrunner', ascension: i % 16 }, 1000 + i);
      checkInvariants(state);
      if (state.status === 'won') {
        wins++;
        expect(state.act).toBe(3);
        expect(state.stats.bossesKilled).toBe(3);
        expect(state.screen).toEqual({ kind: 'game_over', victory: true });
        expect(state.score).toBeGreaterThanOrEqual(state.floor * 5 + 300 + 300);
      }
    }
    expect(wins).toBeGreaterThan(5);
  });
});
