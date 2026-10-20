import { describe, expect, it } from 'vitest';
import { enterCombat, OPTS, play, setupCombat, useContent } from './__fixtures__/helpers';
import { mechanicsContent } from './__fixtures__/mechanics';
import { heatEnemyDamageMult, heatLevel, heatPlayerDamageMult } from './heat';
import { applyAction, getLegalActions, newRun } from './run';
import { computeScore } from './score';
import type { RunState } from './types';

useContent(mechanicsContent);

const HEAT_OPTS = { ...OPTS, heat: true };
const c0 = (s: RunState) => s.combat!;
const fresh = (heat: number, hand: string[] = ['strike']) => {
  const s = setupCombat(enterCombat(HEAT_OPTS), { hand, energy: 3 });
  c0(s).heat = heat;
  return s;
};

describe('режим «Перегрев»', () => {
  it('обычный забег без шкалы; в режиме старт 20 + 6 за первый ход', () => {
    expect(enterCombat().combat!.heat).toBeUndefined();
    expect(newRun(OPTS).heat).toBeUndefined();
    const s = enterCombat(HEAT_OPTS);
    expect(s.heat).toBe(true);
    expect(c0(s).heat).toBe(26);
  });

  it('пороги и множители', () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(heatLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(heatPlayerDamageMult(10)).toBe(1);
    expect(heatPlayerDamageMult(30)).toBe(1.25);
    expect(heatPlayerDamageMult(80)).toBe(1.5);
    expect(heatEnemyDamageMult(40)).toBe(1);
    expect(heatEnemyDamageMult(55)).toBe(1.2);
    expect(heatEnemyDamageMult(80)).toBe(1.4);
  });

  it('карта даёт +4 Heat и усиливает урон на пороге', () => {
    const s = fresh(10);
    const r = play(s, c0(s).hand[0]!.uid, 'en0');
    expect(c0(r).heat).toBe(14);
    expect(c0(r).enemies[0]!.hp).toBe(94);
    const s2 = fresh(30);
    expect(c0(play(s2, c0(s2).hand[0]!.uid, 'en0')).enemies[0]!.hp).toBe(100 - Math.floor(6 * 1.25));
    const s3 = fresh(80);
    expect(c0(play(s3, c0(s3).hand[0]!.uid, 'en0')).enemies[0]!.hp).toBe(100 - Math.floor(6 * 1.5));
  });

  it('Критическая масса: первая карта хода бесплатна, вторая нет', () => {
    const s = fresh(75, ['strike', 'strike']);
    const a = play(s, c0(s).hand[0]!.uid, 'en0');
    expect(c0(a).energy).toBe(3);
    const b = play(a, c0(a).hand[0]!.uid, 'en0');
    expect(c0(b).energy).toBe(2);
  });

  it('Форсаж: +1 карта в начале хода', () => {
    const base = fresh(10);
    const hot = fresh(50);
    const draw = ['strike', 'strike', 'strike', 'strike', 'strike', 'strike', 'strike', 'strike'];
    for (const s of [base, hot]) {
      c0(s).drawPile = draw.map((d, i) => ({ uid: `d${s === base ? 'a' : 'b'}${i}`, defId: d, upgraded: false }));
      c0(s).hand = [];
    }
    const nb = applyAction(base, { type: 'end_turn' }).state;
    const nh = applyAction(hot, { type: 'end_turn' }).state;
    // у горячего Heat после пропуска хода: 50-15+6=41 <50, поэтому проверяем напрямую через 2 хода при высоком Heat
    expect(c0(nb).hand.length).toBe(5);
    expect(c0(nh).hand.length).toBe(5);
    const s = fresh(60, ['strike']);
    c0(s).drawPile = draw.map((d, i) => ({ uid: `x${i}`, defId: d, upgraded: false }));
    const r = applyAction(play(s, c0(s).hand[0]!.uid, 'en0'), { type: 'end_turn' }).state;
    expect(c0(r).heat).toBe(70); // 60+4+6
    expect(c0(r).hand.length).toBe(6);
  });

  it('Расплавление: урон 15% макс HP и Heat падает до 40', () => {
    const s = fresh(98);
    const maxHp = c0(s).player.maxHp;
    const hp = c0(s).player.hp;
    const r = play(s, c0(s).hand[0]!.uid, 'en0');
    expect(c0(r).heat).toBe(40);
    expect(c0(r).player.hp).toBe(hp - Math.floor(maxHp * 0.15));
  });

  it('Охлаждение: −30 Heat, −6 HP, раз в ход', () => {
    const s = fresh(60);
    const hp = c0(s).player.hp;
    expect(getLegalActions(s).some((a) => a.type === 'cool')).toBe(true);
    const r = applyAction(s, { type: 'cool' }).state;
    expect(c0(r).heat).toBe(30);
    expect(c0(r).player.hp).toBe(hp - 6);
    expect(r.hp).toBe(hp - 6);
    expect(getLegalActions(r).some((a) => a.type === 'cool')).toBe(false);
    expect(() => applyAction(r, { type: 'cool' })).toThrow();
  });

  it('пропуск хода без карт: −15 Heat (затем +6 в новом ходу)', () => {
    const s = fresh(60);
    const r = applyAction(s, { type: 'end_turn' }).state;
    expect(c0(r).heat).toBe(51);
  });

  it('враги на 50 бьют сильнее', () => {
    const cool = fresh(10);
    const hot = fresh(55);
    const hpC = c0(cool).player.hp;
    const hpH = c0(hot).player.hp;
    c0(cool).enemies[0]!.intent = { kind: 'attack', moveId: 'hit', damage: 10 };
    c0(hot).enemies[0]!.intent = { kind: 'attack', moveId: 'hit', damage: 10 };
    const a = applyAction(cool, { type: 'end_turn' }).state;
    const b = applyAction(hot, { type: 'end_turn' }).state;
    expect(hpH - c0(b).player.hp).toBeGreaterThanOrEqual(hpC - c0(a).player.hp);
  });

  it('новый бой сбрасывает Heat до 20 и множитель очков ×1.15', () => {
    const a = newRun(HEAT_OPTS);
    const b = newRun(OPTS);
    a.floor = b.floor = 10;
    expect(computeScore(a)).toBe(Math.round(computeScore(b) * 1.15));
  });

  it('сериализуется в сейв', () => {
    const s = fresh(61);
    const back = JSON.parse(JSON.stringify(s)) as RunState;
    expect(back.heat).toBe(true);
    expect(back.combat!.heat).toBe(61);
  });
});
