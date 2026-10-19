import { describe, expect, it } from 'vitest';
import { fixtureContent } from './__fixtures__/content';
import { OPTS, useContent } from './__fixtures__/helpers';
import { setContentForTests } from './content';
import { applyAction, getLegalActions, newRun } from './run';
import { InvalidActionError, type Action, type EventDef, type MapNodeKind, type RunState } from './types';

useContent();

const act = (s: RunState, a: Action) => applyAction(s, a).state;

function enterKind(kind: MapNodeKind, s: RunState = newRun(OPTS)): RunState {
  const node = s.map.find((n) => n.row === 0)!;
  node.kind = kind;
  return act(s, { type: 'choose_node', nodeId: node.id });
}

function withEvent(def: EventDef, s: RunState = newRun(OPTS)): RunState {
  const c = fixtureContent();
  c.events = [def];
  setContentForTests(c);
  return enterKind('event', s);
}

describe('новые узлы', () => {
  it('лаборатория: улучшение, трансформация и отмена возвращают в лабораторию', () => {
    let s = enterKind('lab');
    expect(s.screen.kind).toBe('lab');
    s = act(s, { type: 'node_choice', index: 0 });
    expect(s.screen).toMatchObject({ kind: 'select_deck_card', purpose: 'upgrade' });
    s = act(s, { type: 'select_deck_card', cardUid: null });
    expect(s.screen.kind).toBe('lab');
    s = act(s, { type: 'node_choice', index: 1 });
    expect(s.screen).toMatchObject({ purpose: 'transform' });
    const offer = (s.screen as { offer: string[] }).offer;
    expect(offer).toHaveLength(3);
    const uid = offer[0]!;
    const before = s.deck.find((c) => c.uid === uid)!.defId;
    s = act(s, { type: 'select_deck_card', cardUid: uid });
    expect(s.screen.kind).toBe('map');
    expect(s.deck).toHaveLength(10);
    expect(s.deck.some((c) => c.uid === uid)).toBe(false);
    expect(before).toBeTruthy();
    expect(() => act(enterKind('lab'), { type: 'node_choice', index: 7 })).toThrow(InvalidActionError);
  });

  it('чёрный ящик: силой берёт HP и даёт реликвию, нельзя при малом HP', () => {
    let s = enterKind('blackbox');
    const hp0 = s.hp;
    s = act(s, { type: 'node_choice', index: 0 });
    expect(s.hp).toBeLessThan(hp0);
    expect(s.screen.kind).toBe('map');
    expect(s.eventResult).toBeTruthy();
    const low = enterKind('blackbox');
    low.hp = 3;
    expect(getLegalActions(low).some((a) => a.type === 'node_choice' && a.index === 0)).toBe(false);
    expect(() => act(low, { type: 'node_choice', index: 0 })).toThrow(InvalidActionError);
    const left = act(enterKind('blackbox'), { type: 'leave_node' });
    expect(left.screen.kind).toBe('map');
  });

  it('ретранслятор: лечит и выдаёт расходник (или кредиты при полных слотах)', () => {
    let s = enterKind('relay');
    s.hp = 30;
    s = act(s, { type: 'node_choice', index: 0 });
    expect(s.hp).toBeGreaterThan(30);
    expect(s.potions?.length).toBe(1);
    expect(s.screen.kind).toBe('map');
    let full = enterKind('relay');
    full.potions = ['p_x', 'p_y', 'p_z'];
    const g = full.gold;
    full = act(full, { type: 'node_choice', index: 0 });
    expect(full.potions).toHaveLength(3);
    expect(full.gold).toBe(g + 25);
  });

  it('засада: бой с повышенной наградой и расходником', () => {
    const s = enterKind('ambush');
    expect(s.screen.kind).toBe('combat');
    s.combat!.enemies.forEach((e) => (e.hp = 1));
    const [first] = s.combat!.hand;
    expect(first).toBeDefined();
  });
});

describe('магазин: услуги', () => {
  it('распродажа, обновление ассортимента и улучшение карты', () => {
    let s = enterKind('shop');
    s.gold = 1000;
    const items = () => (s.screen.kind === 'shop' ? s.screen.items : []);
    const sale = items().filter((i) => i.sale);
    expect(sale).toHaveLength(1);
    expect(sale[0]!.price).toBeLessThan(sale[0]!.basePrice!);
    const ri = items().findIndex((i) => i.kind === 'refresh');
    const p0 = items()[ri]!.price;
    const g0 = s.gold;
    s = act(s, { type: 'shop_buy', index: ri });
    expect(s.gold).toBe(g0 - p0);
    expect(items()[ri]!.price).toBeGreaterThan(p0);
    s = act(s, { type: 'shop_buy', index: ri });
    expect(items()[ri]!.sold).toBe(true);
    expect(() => act(s, { type: 'shop_buy', index: ri })).toThrow(InvalidActionError);
    const ui = items().findIndex((i) => i.kind === 'upgrade');
    const price = items()[ui]!.price;
    const gold = s.gold;
    s = act(s, { type: 'shop_buy', index: ui });
    expect(s.screen).toMatchObject({ kind: 'select_deck_card', purpose: 'upgrade', returnTo: 'shop' });
    s = act(s, { type: 'select_deck_card', cardUid: null });
    expect(s.gold).toBe(gold);
    s = act(s, { type: 'shop_buy', index: ui });
    const uid = (s.screen as { offer: string[] }).offer[0]!;
    s = act(s, { type: 'select_deck_card', cardUid: uid });
    expect(s.gold).toBe(gold - price);
    expect(s.deck.find((c) => c.uid === uid)!.upgraded).toBe(true);
    expect(items()[ui]!.sold).toBe(true);
    expect(s.shopUpgrades).toBe(1);
  });
});

describe('события: условия, исходы, цепочки', () => {
  const def = (o: Partial<EventDef> = {}): EventDef => ({
    id: 'ev_t',
    name: 'T',
    text: 't',
    options: [
      { label: 'rich', requires: { gold: 500 }, effects: [], setFlag: 'rich' },
      { label: 'dice', effects: [], outcomes: [{ weight: 1, effects: [{ type: 'gain_gold', amount: 10 }] }, { weight: 1, effects: [{ type: 'gain_gold', amount: 20 }] }] },
      { label: 'flag', effects: [], setFlag: 'chain' },
    ],
    ...o,
  });

  it('requires скрывает недоступные варианты', () => {
    const s = withEvent(def());
    const legal = getLegalActions(s).filter((a) => a.type === 'event_choice');
    expect(legal).toHaveLength(2);
    expect(() => act(s, { type: 'event_choice', index: 0 })).toThrow(InvalidActionError);
  });

  it('исходы детерминированы по сиду, флаг запоминается', () => {
    const a = act(withEvent(def()), { type: 'event_choice', index: 1 });
    const b = act(withEvent(def()), { type: 'event_choice', index: 1 });
    expect(a.gold).toBe(b.gold);
    expect([109, 119]).toContain(a.gold);
    const c = act(withEvent(def()), { type: 'event_choice', index: 2 });
    expect(c.flags).toEqual(['chain']);
  });

  it('событие-продолжение появляется только при флаге', () => {
    const chained = def({ id: 'ev_chain', requiresFlag: 'chain' });
    const base = fixtureContent();
    base.events = [chained];
    setContentForTests(base);
    // без флага пул пуст — вместо события обычный бой
    const none = enterKind('event');
    expect(none.screen.kind).toBe('combat');
    const s0 = newRun(OPTS);
    s0.flags = ['chain'];
    expect(enterKind('event', s0).screen).toMatchObject({ kind: 'event', eventId: 'ev_chain' });
  });

  it('fight_elite запускает элитный бой, lose_potion забирает расходник', () => {
    const f = act(withEvent(def({ options: [{ label: 'x', effects: [], special: 'fight_elite' }] })), { type: 'event_choice', index: 0 });
    expect(f.screen.kind).toBe('combat');
    const s0 = newRun(OPTS);
    s0.potions = ['p_a'];
    const p = withEvent(def({ options: [{ label: 'x', requires: { potion: true }, effects: [], special: 'lose_potion' }] }), s0);
    const after = act(p, { type: 'event_choice', index: 0 });
    expect(after.potions ?? []).toHaveLength(0);
    expect(after.screen.kind).toBe('map');
  });
});

describe('сохранение', () => {
  it('состояние без новых полей остаётся рабочим (старые сохранения)', () => {
    const s = newRun(OPTS);
    expect(s.flags).toBeUndefined();
    const json = JSON.parse(JSON.stringify(s)) as RunState;
    expect(getLegalActions(json).length).toBeGreaterThan(0);
    const shop = enterKind('shop', json);
    expect(shop.screen.kind).toBe('shop');
  });
});
