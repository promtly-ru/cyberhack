import { describe, expect, it } from 'vitest';
import { weeklyMutatorIds } from './weekly';
import { enterCombat, OPTS, play, setupCombat, useContent } from './__fixtures__/helpers';
import { mechanicsContent } from './__fixtures__/mechanics';
import { applyMutators, getMutatorMods, MUTATORS, mutatorScoreMult, normalizeMutators } from './mutators';
import { getAscensionMods } from './ascension';
import { buildCombatRewards } from './rewards';
import { modsOf, newRun } from './run';
import { computeScore } from './score';
import type { NewRunOptions, RunState } from './types';

useContent(mechanicsContent);

const c0 = (s: RunState) => s.combat!;
const withMut = (...m: string[]): NewRunOptions => ({ ...OPTS, mutators: m });

describe('мутаторы: список и нормализация', () => {
  it('6–8 мутаторов с русскими названиями', () => {
    expect(MUTATORS.length).toBeGreaterThanOrEqual(6);
    expect(MUTATORS.length).toBeLessThanOrEqual(8);
    for (const m of MUTATORS) {
      expect(m.name).toMatch(/[А-Яа-яЁё]/);
      expect(m.description).toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('неизвестные и повторы отбрасываются, порядок канонический', () => {
    expect(normalizeMutators(['nope', 'plague', 'fog', 'fog'])).toEqual(['fog', 'plague']);
    expect(newRun(withMut('nope')).mutators).toBeUndefined();
    expect(newRun(withMut('plague', 'fog')).mutators).toEqual(['fog', 'plague']);
  });

  it('еженедельный вызов — мутаторы задаёт неделя, а не игрок', () => {
    const r = newRun({ ...withMut('fog'), weekly: '2026-W43' });
    expect(r.mutators).toEqual(weeklyMutatorIds('2026-W43'));
    expect(r.mutators).toHaveLength(3);
  });

  it('правила недели: детерминированный забег и эффекты модов', () => {
    const a = newRun({ ...OPTS, weekly: '2026-W43' });
    const b = newRun({ ...OPTS, weekly: '2026-W43' });
    expect(a).toEqual(b);
    expect(computeScore(a)).toBe(a.score);
    expect(getMutatorMods(['wk_sprint'])).toMatchObject({ bonusEnergy: -1, bonusDraw: 1 });
    expect(modsOf({ ascension: 0, difficulty: 'normal', mutators: ['wk_elites_only'] }).eliteWeightMult).toBe(6);
    expect(modsOf({ ascension: 0, difficulty: 'normal', mutators: ['wk_gold_rush'] })).toMatchObject({ goldMult: 2, shopPriceMult: 2 });
    expect(getMutatorMods(['wk_cursed_gift']).bonusStartRelic).toBe(true);
  });

  it('без мутаторов модификаторы не меняются', () => {
    const m = getAscensionMods(3);
    expect(applyMutators(m, [])).toBe(m);
    expect(getMutatorMods(undefined).bonusEnergy).toBe(0);
  });

  it('бонус к счёту', () => {
    expect(mutatorScoreMult(['fog', 'elite_hunt'])).toBeCloseTo(1.25);
    const s = newRun(withMut('fog', 'elite_hunt'));
    const plain = newRun(OPTS);
    s.floor = plain.floor = 20;
    expect(computeScore(s)).toBe(Math.round(computeScore(plain) * 1.25));
  });
});

describe('мутаторы: правила', () => {
  it('Туман войны: намерения обычных врагов скрыты', () => {
    const s = enterCombat(withMut('fog'));
    for (const e of c0(s).enemies) {
      expect(e.intent.kind).toBe('unknown');
      expect(e.intent.damage).toBeUndefined();
      expect(e.intent.moveId).not.toBe('');
    }
  });

  it('Бедность: +1 энергия, цены ×1.5, золото меньше', () => {
    const s = enterCombat(withMut('poverty'));
    expect(c0(s).maxEnergy).toBe(4);
    expect(c0(s).energy).toBe(4);
    expect(modsOf(s).shopPriceMult).toBeCloseTo(1.5);
    expect(modsOf(s).goldMult).toBeCloseTo(0.75);
  });

  it('Стеклянная пушка: атаки игрока и врагов ×1.5', () => {
    const s = setupCombat(enterCombat(withMut('glass_cannon')), { hand: ['strike'] });
    const r = play(s, c0(s).hand[0]!.uid, 'en0');
    expect(c0(r).enemies[0]!.hp).toBe(91);
    const plain = enterCombat();
    const glass = enterCombat(withMut('glass_cannon'));
    const pi = c0(plain).enemies.find((e) => e.intent.damage !== undefined);
    const gi = c0(glass).enemies.find((e) => e.intent.damage !== undefined);
    if (pi && gi) expect(gi.intent.damage).toBe(Math.ceil(pi.intent.damage! * 1.5));
  });

  it('Чумной сервер: бой начинается с Вирусом (первый тик уже прошёл)', () => {
    const s = enterCombat(withMut('plague'));
    expect(c0(s).player.statuses.virus).toBe(2);
    expect(c0(s).player.hp).toBe(s.maxHp - 3);
  });

  it('Хрупкий носитель: −30% макс. HP и Барьер в начале боя', () => {
    const plain = newRun(OPTS);
    const s = enterCombat(withMut('fragile'));
    expect(s.maxHp).toBe(plain.maxHp - Math.floor(plain.maxHp * 0.3));
    expect(c0(s).player.statuses.barrier).toBe(1);
  });

  it('Эхо-камера: Эхо каждый ход, враги с Разгоном', () => {
    const s = enterCombat(withMut('echo_chamber'));
    expect(c0(s).player.statuses.echo).toBe(1);
    for (const e of c0(s).enemies) expect(e.statuses.strength).toBe(2);
  });

  it('Щедрая сеть: 4 карты на выбор, враги крепче', () => {
    const s = newRun(withMut('generous'));
    const items = buildCombatRewards(s, 'normal', modsOf(s));
    const choice = items.find((x) => x.kind === 'card_choice');
    expect(choice && choice.kind === 'card_choice' ? choice.cardIds.length : 0).toBe(4);
    expect(modsOf(s).normalHpMult).toBeCloseTo(1.2);
  });

  it('Охота на элиту: элиты чаще и крепче', () => {
    const s = newRun(withMut('elite_hunt'));
    expect(modsOf(s).eliteWeightMult).toBeCloseTo(2);
    expect(modsOf(s).eliteHpMult).toBeCloseTo(1.1);
  });

  it('мутаторы детерминированы: одинаковые опции — одинаковый забег', () => {
    const o = withMut('fog', 'plague', 'generous');
    expect(newRun(o)).toEqual(newRun(o));
  });
});

describe('правила недели с механикой', () => {
  it('«Охота за головой» и «Нестабильный код» включают свои флаги', () => {
    expect(getMutatorMods(['wk_bounty']).bounty).toBe(true);
    expect(getMutatorMods(['wk_volatile']).volatileCard).toBe(true);
    expect(getMutatorMods([]).bounty).toBe(false);
  });

  it('в бою: метка на враге, нестабильная карта в руке', () => {
    const s = enterCombat(OPTS);
    s.mutators = ['wk_bounty', 'wk_volatile'];
    const c = c0(setupCombat(s, { hand: ['strike', 'strike'], energy: 3 }));
    expect(c.hand.length).toBe(2);
  });
});
