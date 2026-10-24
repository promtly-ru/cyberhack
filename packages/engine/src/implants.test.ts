/**
 * Импланты v2: веса цветов, Классовый и Маяк, условия, Синтезатор/Рипердок, снятие красных.
 * Свои фикстуры: цветные импланты поверх fixtureContent (не зависят от content/*.json).
 */
import { describe, expect, it } from 'vitest';
import { fixtureContent } from './__fixtures__/content';
import { inst, OPTS, useContent } from './__fixtures__/helpers';
import type { ContentData } from './content';
import {
  CLASS_FULL_BASE,
  IMPLANT_COLOR_WEIGHTS,
  RED_REMOVE_BASE_PRICE,
  RED_REMOVE_PRICE_STEP,
  colorOf,
  rollImplant,
  rollImplantColor,
  type ImplantColor,
  type ImplantDuration,
} from './implants';
import { createRngStore, Rng } from './rng';
import { applyAction, getLegalActions, newRun } from './run';
import type { Action, MapNodeKind, RelicDef, RunState } from './types';

const COLORS = ['red', 'gray', 'green', 'blue', 'purple', 'gold'] as const;

function imp(id: string, color: ImplantColor, duration?: ImplantDuration, extra: Partial<RelicDef> = {}): RelicDef {
  return { id, name: id, rarity: 'common', classId: 'neutral', description: '', trigger: 'combat_start', effects: [], color, ...(duration ? { duration } : {}), ...extra };
}

function implantContent(): ContentData {
  const c = fixtureContent();
  c.relics = [
    imp('weak', 'class', undefined, { rarity: 'starter', classId: 'netrunner', fullId: 'full' }),
    imp('full', 'class', undefined, { rarity: 'starter', classId: 'netrunner', weakId: 'weak' }),
    ...COLORS.flatMap((col) => [1, 2, 3].map((i) => imp(`${col}${i}`, col))),
    imp('t_combats', 'gray', { kind: 'combats', n: 2 }),
    imp('t_rest', 'red', { kind: 'until', event: 'rest' }),
    imp('t_boss', 'red', { kind: 'until', event: 'boss' }),
    imp('t_act', 'green', { kind: 'until', event: 'act_end' }),
    imp('t_attacks', 'red', { kind: 'task', task: { kind: 'play_attacks', n: 2 } }),
    imp('t_nodmg', 'red', { kind: 'task', task: { kind: 'win_no_damage' } }),
    imp('t_elite', 'blue', { kind: 'task', task: { kind: 'win_elite' } }),
    imp('t_hp', 'red', { kind: 'task', task: { kind: 'end_combat_hp_above', pct: 50 } }),
  ];
  c.classes = c.classes.map((k) => (k.id === 'netrunner' ? { ...k, startingRelic: 'weak' } : k));
  return c;
}

useContent(implantContent);

const act = (s: RunState, a: Action) => applyAction(s, a).state;

function enterKind(kind: MapNodeKind, s: RunState = newRun(OPTS)): RunState {
  const node = s.map.find((n) => n.row === 0)!;
  node.kind = kind;
  return act(s, { type: 'choose_node', nodeId: node.id });
}

function winCombat(s: RunState, hp?: number): RunState {
  const c = s.combat!;
  for (const e of c.enemies) {
    e.hp = 1;
    e.block = 0;
  }
  if (hp !== undefined) c.player.hp = hp;
  c.hand = [inst('ddos')];
  c.energy = 3;
  return act(s, { type: 'play_card', cardUid: c.hand[0]!.uid });
}

function withRelics(ids: string[]): RunState {
  const s = newRun(OPTS);
  s.relics = [...ids];
  s.implantState = {};
  return s;
}

describe('роллы', () => {
  it('стартовый — ослабленный Классовый, шанс полной = база', () => {
    const s = newRun(OPTS);
    expect(s.relics).toEqual(['weak']);
    expect(s.classFullChance).toBe(CLASS_FULL_BASE);
    expect(s.implantQueue).toEqual([]);
    expect(colorOf('weak')).toBe('class');
  });

  it('веса цветов на 10k роллов ±1.5%', () => {
    const rng = new Rng(createRngStore('colors'), 'rewards');
    const s = withRelics([]);
    const n = 10_000;
    const byColor: Record<string, number> = {};
    const byImplant: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const c = rollImplantColor(rng);
      byColor[c] = (byColor[c] ?? 0) + 1;
      const id = rollImplant(s, rng)!;
      const ic = colorOf(id);
      byImplant[ic] = (byImplant[ic] ?? 0) + 1;
    }
    const total = Object.values(IMPLANT_COLOR_WEIGHTS).reduce((a, b) => a + b, 0);
    for (const c of COLORS) {
      const want = IMPLANT_COLOR_WEIGHTS[c] / total;
      expect(Math.abs((byColor[c] ?? 0) / n - want)).toBeLessThan(0.015);
      expect(Math.abs((byImplant[c] ?? 0) / n - want)).toBeLessThan(0.015);
    }
  });

  it('пустой цвет → соседний; уже имеющиеся не выпадают', () => {
    const s = withRelics(['gold1', 'gold2', 'gold3']);
    const rng = new Rng(createRngStore('gold'), 'rewards');
    for (let i = 0; i < 2000; i++) expect(s.relics).not.toContain(rollImplant(s, rng));
  });

  it('Классовый: ~1% базы, Маяк +1% за акт, потолок 5%; полная заменяет ослабленную', () => {
    const s = withRelics(['weak']);
    const rng = new Rng(createRngStore('class'), 'rewards');
    const freq = (chance: number) => {
      s.classFullChance = chance;
      let k = 0;
      for (let i = 0; i < 20_000; i++) if (rollImplant(s, rng) === 'full') k++;
      return k / 20_000;
    };
    expect(Math.abs(freq(CLASS_FULL_BASE) - 0.01)).toBeLessThan(0.004);

    // Маяк: раз за акт, 4 акта → 5%
    let r = newRun(OPTS);
    for (const a of [1, 2, 3, 4] as const) {
      r.act = a;
      r = enterKind('beacon', { ...r, screen: { kind: 'map' }, currentNodeId: null });
      expect(r.screen.kind).toBe('implant_node');
      r = act(r, { type: 'node_choice', index: 0 });
      const again = enterKind('beacon', { ...r, screen: { kind: 'map' }, currentNodeId: null });
      expect(again.screen.kind === 'implant_node' && again.screen.options[0]!.disabled).toBe(true);
      expect(getLegalActions(again)).not.toContainEqual({ type: 'node_choice', index: 0 });
    }
    expect(r.classFullChance).toBeCloseTo(0.05);
    expect(Math.abs(freq(r.classFullChance!) - 0.05)).toBeLessThan(0.008);

    // Получение полной: ослабленная снимается
    const g = withRelics(['weak']);
    g.classFullChance = 1;
    g.screen = { kind: 'implant_node', node: 'signal', options: [{ label: 'x' }] };
    const res = applyAction(g, { type: 'node_choice', index: 0 });
    expect(res.state.relics).toEqual(['full']);
    expect(res.events).toContainEqual({ type: 'implant_expired', relicId: 'weak', reason: 'swap' });
    expect(res.state.implantQueue).toEqual(['full']);
    // полная уже есть — ролл обычный
    expect(rollImplant(res.state, rng)).not.toBe('full');
  });
});

describe('выдача и ack_implant', () => {
  it('Сигнал выдаёт имплант в очередь, ack снимает первый', () => {
    const s = enterKind('signal');
    expect(s.screen.kind).toBe('implant_node');
    expect(getLegalActions(s)).toEqual([{ type: 'node_choice', index: 0 }]);
    const r = applyAction(s, { type: 'node_choice', index: 0 });
    const got = r.state.relics.find((id) => id !== 'weak')!;
    expect(r.events).toContainEqual({ type: 'relic_obtained', relicId: got });
    expect(r.state.implantQueue).toEqual([got]);
    expect(r.state.screen.kind).toBe('map');
    expect(getLegalActions(r.state)).toContainEqual({ type: 'ack_implant' });
    const acked = act(r.state, { type: 'ack_implant' });
    expect(acked.implantQueue).toEqual([]);
    expect(() => act(acked, { type: 'ack_implant' })).toThrow();
  });

  it('старое сохранение без implantState работает', () => {
    const s = newRun(OPTS);
    delete s.implantState;
    delete s.classFullChance;
    delete s.implantQueue;
    s.relics = ['r_old_like', 'gray1'].filter((id) => id === 'gray1');
    const won = winCombat(enterKind('combat', s));
    expect(won.relics).toContain('gray1');
  });
});

describe('условия', () => {
  it('combats: −1 за выигранный бой, на 0 снимается', () => {
    let s = withRelics(['t_combats']);
    s.implantState = { t_combats: { combatsLeft: 2 } };
    s = winCombat(enterKind('combat', s));
    expect(s.implantState!.t_combats!.combatsLeft).toBe(1);
    s = { ...s, screen: { kind: 'map' }, currentNodeId: null };
    const r = applyAction(enterKind('combat', s), { type: 'end_turn' }); // бой идёт, счётчик не трогаем
    expect(r.state.relics).toContain('t_combats');
    const done = winCombat(enterKind('combat', s));
    expect(done.relics).not.toContain('t_combats');
    expect(done.implantState!.t_combats).toBeUndefined();
  });

  it('until rest / boss / act_end', () => {
    const rest = enterKind('rest', withRelics(['t_rest', 'gray1']));
    expect(rest.relics).toEqual(['gray1']);

    let s = withRelics(['t_boss', 't_act']);
    const last = s.map.find((n) => n.row === 14)!;
    s.currentNodeId = last.id;
    s = act(s, { type: 'choose_node', nodeId: last.next[0]! });
    s = winCombat(s);
    expect(s.relics).toEqual(['t_act']);
    const r = applyAction(s, { type: 'leave_reward' });
    expect(r.state.act).toBe(2);
    expect(r.state.relics).toEqual([]);
    expect(r.events).toContainEqual({ type: 'implant_expired', relicId: 't_act', reason: 'duration' });
  });

  it('task: атаки, бой без урона, элита, HP ≥ pct', () => {
    let s = enterKind('combat', withRelics(['t_attacks', 't_nodmg', 't_elite', 't_hp']));
    const c = s.combat!;
    c.hand = [inst('strike')];
    c.energy = 3;
    const r = applyAction(s, { type: 'play_card', cardUid: c.hand[0]!.uid, targetUid: c.enemies[0]!.uid });
    expect(r.events).toContainEqual({ type: 'implant_progress', relicId: 't_attacks', progress: 1, goal: 2 });
    s = r.state;
    // победа ddos (атака №2), HP ниже старта и ниже 50%
    s = winCombat(s, 10);
    expect(s.relics).not.toContain('t_attacks');
    expect(s.relics).toContain('t_nodmg');
    expect(s.relics).toContain('t_hp');
    expect(s.relics).toContain('t_elite');

    // без урона и HP ≥ 50% → снимаются оба; элита — t_elite
    s = { ...s, screen: { kind: 'map' }, currentNodeId: null, hp: s.maxHp };
    s = winCombat(enterKind('elite', s));
    expect(s.relics).toEqual([]);
  });

  it('run — навсегда', () => {
    let s = withRelics(['gray1']);
    for (let i = 0; i < 3; i++) s = winCombat(enterKind('combat', { ...s, screen: { kind: 'map' }, currentNodeId: null }));
    expect(s.relics).toEqual(['gray1']);
  });
});

describe('узлы', () => {
  it('Синтезатор: 2 одного цвета → цвет выше', () => {
    const s = enterKind('synth', withRelics(['gray1', 'gray2', 'green1', 'gold1', 'gold2']));
    if (s.screen.kind !== 'implant_node') throw new Error('no node');
    expect(s.screen.options).toHaveLength(1); // серый; золото не синтезируется, зелёный один
    expect(getLegalActions(s)).toContainEqual({ type: 'leave_node' });
    const r = applyAction(s, { type: 'node_choice', index: 0 });
    expect(r.state.relics.filter((id) => colorOf(id) === 'gray')).toHaveLength(0);
    expect(r.state.relics.filter((id) => colorOf(id) === 'green')).toHaveLength(2);
    expect(r.events.filter((e) => e.type === 'implant_expired' && e.reason === 'synth')).toHaveLength(2);
  });

  it('Рипердок: отдать → цвет выше или ниже, кламп по лестнице', () => {
    const seen = new Set<ImplantColor>();
    for (let i = 0; i < 30; i++) {
      const s = enterKind('ripperdoc', { ...withRelics(['weak', 'red1']), seed: `rd${i}` });
      if (s.screen.kind !== 'implant_node') throw new Error('no node');
      expect(s.screen.options).toHaveLength(1); // классовый не отдаётся
      const r = act({ ...s, rng: createRngStore(`rd${i}`) }, { type: 'node_choice', index: 0 });
      const got = r.relics.find((id) => id !== 'weak')!;
      expect(got).not.toBe('red1');
      seen.add(colorOf(got));
    }
    expect([...seen].sort()).toEqual(['gray', 'red']);
  });

  it('Карантин: бой, затем снять красный или кредиты', () => {
    let s = enterKind('quarantine', withRelics(['red1', 'gray1']));
    expect(s.screen.kind).toBe('combat');
    s = winCombat(s);
    if (s.screen.kind !== 'implant_node') throw new Error('no reward');
    expect(s.screen.node).toBe('quarantine');
    expect(s.screen.options).toHaveLength(2);
    expect(getLegalActions(s)).not.toContainEqual({ type: 'leave_node' });
    const removed = act(s, { type: 'node_choice', index: 0 });
    expect(removed.relics).toEqual(['gray1']);
    const gold = s.screen.options[1]!.gold!;
    expect(gold).toBeGreaterThanOrEqual(40);
    expect(gold).toBeLessThanOrEqual(60);
    expect(act(s, { type: 'node_choice', index: 1 }).gold).toBe(s.gold + gold);
  });
});

describe('снятие красных', () => {
  it('магазин: remove_red, цена растёт; красные не продаются', () => {
    let s = withRelics(['red1', 'red2']);
    s.gold = 1000;
    s = enterKind('shop', s);
    const items = () => (s.screen.kind === 'shop' ? s.screen.items : []);
    for (const it of items()) if (it.kind === 'relic') expect(colorOf(it.id!)).not.toBe('red');
    const idx = items().findIndex((i) => i.kind === 'remove_red');
    expect(items()[idx]!.price).toBe(RED_REMOVE_BASE_PRICE);
    s = act(s, { type: 'shop_buy', index: idx });
    expect(s.relics).not.toContain('red1');
    expect(s.redRemovals).toBe(1);
    expect(s.gold).toBe(1000 - RED_REMOVE_BASE_PRICE);
    const next = enterKind('shop', { ...s, screen: { kind: 'map' }, currentNodeId: null });
    const rr = next.screen.kind === 'shop' ? next.screen.items.find((i) => i.kind === 'remove_red') : undefined;
    expect(rr!.price).toBe(RED_REMOVE_BASE_PRICE + RED_REMOVE_PRICE_STEP);
    const clean = enterKind('shop', withRelics(['gray1']));
    expect(clean.screen.kind === 'shop' && clean.screen.items.some((i) => i.kind === 'remove_red')).toBe(false);
  });

  it('привал: rest_burn_red вместо отдыха', () => {
    const s = enterKind('rest', withRelics(['red1', 'gray1']));
    expect(getLegalActions(s)).toContainEqual({ type: 'rest_burn_red', relicId: 'red1' });
    expect(getLegalActions(s)).not.toContainEqual({ type: 'rest_burn_red', relicId: 'gray1' });
    const r = applyAction(s, { type: 'rest_burn_red', relicId: 'red1' });
    expect(r.state.relics).toEqual(['gray1']);
    expect(r.state.hp).toBe(s.hp);
    expect(r.state.screen.kind).toBe('map');
    expect(() => act(s, { type: 'rest_burn_red', relicId: 'gray1' })).toThrow();
  });
});
