import { describe, expect, it } from 'vitest';
import { defaultContent } from './content';
import { enterCombat, OPTS, runBot, setupCombat, useContent } from './__fixtures__/helpers';
import { mechanicsContent } from './__fixtures__/mechanics';
import { getPotion, POTION_SLOTS, POTIONS, rollPotion } from './potions';
import { buildCombatRewards, buildShop, SHOP_POTIONS } from './rewards';
import { rngOf } from './rng';
import { applyAction, getLegalActions, modsOf, newRun, replay } from './run';
import { InvalidActionError, type RunState } from './types';

useContent(mechanicsContent);

const c0 = (s: RunState) => s.combat!;
const enemy = (s: RunState, i = 0) => s.combat!.enemies[i]!;

const EFFECT_TYPES = new Set([
  'damage', 'block', 'apply_status', 'draw', 'gain_energy', 'heal', 'lose_hp', 'add_card', 'exhaust_random_hand', 'gain_gold',
  'scry', 'discard_hand_draw', 'upgrade_random_hand', 'gain_max_hp', 'heal_pct', 'double_next', 'cleanse', 'gain_potion',
]);

describe('определения расходников', () => {
  it('14+ штук, уникальные id, тексты на русском, эффекты и статусы существуют в контенте', () => {
    expect(POTIONS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(POTIONS.map((p) => p.id)).size).toBe(POTIONS.length);
    const statusIds = new Set(defaultContent.statuses.map((s) => s.id));
    for (const p of POTIONS) {
      expect(p.name).toMatch(/[А-Яа-яЁё]/);
      expect(p.description).toMatch(/[А-Яа-яЁё]/);
      expect(p.effects.length).toBeGreaterThan(0);
      for (const e of p.effects) {
        expect(EFFECT_TYPES.has(e.type)).toBe(true);
        if (e.type === 'apply_status') expect(statusIds.has(e.status)).toBe(true);
      }
      // вне боя — только лечебные
      if (p.outOfCombat) expect(p.kind).toBe('heal');
      if (p.target === 'enemy') expect(p.effects.some((e) => 'target' in e && e.target === 'enemy')).toBe(true);
    }
  });

  it('rollPotion детерминирован и не трогает основные потоки ГСЧ', () => {
    const a = newRun(OPTS);
    const b = newRun(OPTS);
    const rngBefore = { ...a.rng };
    const xs = Array.from({ length: 10 }, () => rollPotion(a));
    const ys = Array.from({ length: 10 }, () => rollPotion(b));
    expect(xs).toEqual(ys);
    expect(a.rng).toEqual(rngBefore);
    for (const id of xs) expect(getPotion(id)).toBeDefined();
  });
});

describe('расходники в бою', () => {
  it('щит: блок, слот освобождается, событие potion_used', () => {
    const s = setupCombat(enterCombat());
    s.potions = ['pot_block', 'pot_virus'];
    const r = applyAction(s, { type: 'use_potion', slot: 0 });
    expect(c0(r.state).player.block).toBe(10);
    expect(r.state.potions).toEqual(['pot_virus']);
    expect(r.events).toContainEqual({ type: 'potion_used', potionId: 'pot_block', slot: 0 });
    expect(s.potions).toEqual(['pot_block', 'pot_virus']); // вход не мутирован
  });

  it('расходник на врага требует цель; getLegalActions — по действию на живого врага', () => {
    const s = setupCombat(enterCombat(), { enemyHp: [30, 0, 30] });
    s.potions = ['pot_virus'];
    expect(() => applyAction(s, { type: 'use_potion', slot: 0 })).toThrow(InvalidActionError);
    expect(() => applyAction(s, { type: 'use_potion', slot: 0, targetUid: 'en1' })).toThrow(InvalidActionError);
    const legal = getLegalActions(s).filter((a) => a.type === 'use_potion' || a.type === 'discard_potion');
    expect(legal).toEqual([
      { type: 'use_potion', slot: 0, targetUid: 'en0' },
      { type: 'use_potion', slot: 0, targetUid: 'en2' },
      { type: 'discard_potion', slot: 0 },
    ]);
    const r = applyAction(s, { type: 'use_potion', slot: 0, targetUid: 'en2' }).state;
    expect(enemy(r, 2).statuses.virus).toBe(6);
    expect(() => applyAction(s, { type: 'use_potion', slot: 3 })).toThrow(InvalidActionError);
  });

  it('бомба бьёт всех, учитывая Брешь, но не Разгон игрока; может выиграть бой', () => {
    const s = setupCombat(enterCombat(), { enemyHp: [30, 30] });
    c0(s).player.statuses.strength = 5;
    enemy(s, 1).statuses.vulnerable = 1;
    s.potions = ['pot_bomb'];
    let r = applyAction(s, { type: 'use_potion', slot: 0 }).state;
    expect(enemy(r, 0).hp).toBe(22);
    expect(enemy(r, 1).hp).toBe(18);
    const w = setupCombat(enterCombat(), { enemyHp: [5, 8] });
    w.potions = ['pot_bomb'];
    r = applyAction(w, { type: 'use_potion', slot: 0 }).state;
    expect(r.screen.kind).toBe('reward');
  });

  it('Эхо-модуль и барьер работают как статусы', () => {
    const s = setupCombat(enterCombat());
    s.potions = ['pot_echo', 'pot_barrier'];
    let r = applyAction(s, { type: 'use_potion', slot: 1 }).state;
    expect(c0(r).player.statuses.barrier).toBe(1);
    expect(c0(r).player.block).toBe(4);
    r = applyAction(r, { type: 'use_potion', slot: 0 }).state;
    expect(c0(r).player.statuses.echo).toBe(1);
    expect(r.potions).toEqual([]);
  });

  it('discard_potion выбрасывает без эффекта', () => {
    const s = setupCombat(enterCombat());
    s.potions = ['pot_block', 'pot_draw'];
    const r = applyAction(s, { type: 'discard_potion', slot: 1 });
    expect(r.state.potions).toEqual(['pot_block']);
    expect(r.events).toContainEqual({ type: 'potion_discarded', potionId: 'pot_draw', slot: 1 });
    expect(c0(r.state).hand).toEqual(c0(s).hand);
  });
});

describe('расходники вне боя', () => {
  it('на карте можно выпить только лечебные', () => {
    const s = newRun(OPTS);
    s.potions = ['pot_heal', 'pot_block', 'pot_gene'];
    s.hp = 20;
    const legal = getLegalActions(s).filter((a) => a.type === 'use_potion');
    expect(legal).toEqual([
      { type: 'use_potion', slot: 0 },
      { type: 'use_potion', slot: 2 },
    ]);
    expect(() => applyAction(s, { type: 'use_potion', slot: 1 })).toThrow(/only be used in combat/);
    let r = applyAction(s, { type: 'use_potion', slot: 0 }).state;
    expect(r.hp).toBe(20 + Math.floor(s.maxHp * 0.2));
    expect(r.screen.kind).toBe('map');
    r = applyAction(r, { type: 'use_potion', slot: 1 }).state; // Ген-апгрейд сдвинулся в слот 1
    expect(r.maxHp).toBe(s.maxHp + 5);
    expect(r.potions).toEqual(['pot_block']);
  });
});

describe('выдача расходников', () => {
  it('элита — всегда расходник; обычный бой — около 25%; босс — без расходника', () => {
    let normal = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const s = newRun({ ...OPTS, seed: `pot-${i}` });
      const elite = buildCombatRewards(s, 'elite', modsOf(s));
      expect(elite.filter((x) => x.kind === 'potion')).toHaveLength(1);
      if (buildCombatRewards(s, 'normal', modsOf(s)).some((x) => x.kind === 'potion')) normal++;
      expect(buildCombatRewards(s, 'boss', modsOf(s)).some((x) => x.kind === 'potion')).toBe(false);
    }
    expect(normal / N).toBeGreaterThan(0.17);
    expect(normal / N).toBeLessThan(0.33);
  });

  it('награда-расходник: забрать можно только при свободном слоте', () => {
    const s = newRun(OPTS);
    s.screen = { kind: 'reward', items: [{ kind: 'gold', amount: 5 }, { kind: 'potion', potionId: 'pot_draw' }] };
    s.potions = ['pot_block', 'pot_block', 'pot_block'];
    expect(getLegalActions(s).filter((a) => a.type === 'take_reward')).toEqual([{ type: 'take_reward', index: 0 }]);
    expect(() => applyAction(s, { type: 'take_reward', index: 1 })).toThrow(InvalidActionError);
    s.potions = ['pot_block'];
    const r = applyAction(s, { type: 'take_reward', index: 1 });
    expect(r.state.potions).toEqual(['pot_block', 'pot_draw']);
    expect(r.events).toContainEqual({ type: 'potion_obtained', potionId: 'pot_draw' });
  });

  it('магазин: 2 расходника с ценой, покупка тратит золото, при полных слотах нельзя', () => {
    const s = newRun(OPTS);
    const items = buildShop(s, rngOf(s, 'shop'), modsOf(s));
    const pots = items.filter((x) => x.kind === 'potion');
    expect(pots).toHaveLength(SHOP_POTIONS);
    for (const p of pots) {
      expect(getPotion(p.id!)).toBeDefined();
      expect(p.price).toBeGreaterThan(0);
    }
    s.screen = { kind: 'shop', items };
    s.gold = 999;
    const idx = items.findIndex((x) => x.kind === 'potion');
    const r = applyAction(s, { type: 'shop_buy', index: idx }).state;
    expect(r.potions).toEqual([items[idx]!.id]);
    expect(r.gold).toBe(999 - items[idx]!.price);
    s.potions = Array(POTION_SLOTS).fill('pot_block');
    expect(getLegalActions(s).some((a) => a.type === 'shop_buy' && a.index === idx)).toBe(false);
    expect(() => applyAction(s, { type: 'shop_buy', index: idx })).toThrow(InvalidActionError);
  });
});

describe('совместимость и детерминизм', () => {
  it('старое сохранение без potions/rngExt продолжает работать', () => {
    const s = enterCombat();
    delete s.potions;
    delete s.rngExt;
    expect(() => getLegalActions(s)).not.toThrow();
    const r = applyAction(s, { type: 'end_turn' }).state;
    expect(r.potions).toBeUndefined();
  });

  it('случайный бот с расходниками: replay по журналу даёт то же состояние', () => {
    for (let i = 0; i < 6; i++) {
      const opts = { seed: `pot-replay-${i}`, classId: 'netrunner' as const, ascension: i };
      const { state, actions } = runBot(opts, 77 + i);
      expect(replay(opts, actions)).toEqual(state);
    }
  });
});
