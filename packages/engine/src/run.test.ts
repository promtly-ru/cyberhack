import { describe, expect, it } from 'vitest';
import { fixtureContent } from './__fixtures__/content';
import { enterCombat, inst, OPTS, runBot, useContent } from './__fixtures__/helpers';
import { getAscensionDescriptions, getAscensionMods } from './ascension';
import { setContentForTests } from './content';
import { applyAction, getLegalActions, newRun, replay } from './run';
import { computeScore } from './score';
import { InvalidActionError, type Action, type MapNodeKind, type RewardItem, type RunState } from './types';

useContent();

const act = (s: RunState, a: Action) => applyAction(s, a).state;

/** Сделать первый узел ряда 0 нужного типа и войти в него. */
function enterKind(kind: MapNodeKind, s: RunState = newRun(OPTS)): RunState {
  const node = s.map.find((n) => n.row === 0)!;
  node.kind = kind;
  return act(s, { type: 'choose_node', nodeId: node.id });
}

/** Перейти к боссу текущего акта. */
function enterBoss(s: RunState): RunState {
  const last = s.map.find((n) => n.row === 14)!;
  s.currentNodeId = last.id;
  s.screen = { kind: 'map' };
  s.combat = null;
  return act(s, { type: 'choose_node', nodeId: last.next[0]! });
}

/** Выиграть текущий бой одной картой по всем. */
function winCombat(s: RunState): RunState {
  const c = s.combat!;
  for (const e of c.enemies) {
    e.hp = 1;
    e.block = 0;
  }
  c.hand = [inst('ddos')];
  c.energy = 3;
  return act(s, { type: 'play_card', cardUid: c.hand[0]!.uid });
}

const items = (s: RunState): RewardItem[] => (s.screen.kind === 'reward' ? s.screen.items : []);

describe('newRun', () => {
  it('детерминирован и корректно инициализирован', () => {
    const a = newRun(OPTS);
    expect(newRun(OPTS)).toEqual(a);
    expect(newRun({ ...OPTS, seed: 'other' }).map).not.toEqual(a.map);
    expect(a.deck).toHaveLength(10);
    expect(a.relics).toEqual(['r_starter']);
    expect(a.hp).toBe(70);
    expect(a.maxHp).toBe(70);
    expect(a.gold).toBe(99);
    expect(a.act).toBe(1);
    expect(a.screen).toEqual({ kind: 'map' });
    expect(a.bossEncounterId).toBe('e1_boss');
    expect(a.status).toBe('active');
    expect(JSON.parse(JSON.stringify(a))).toEqual(a); // сериализуемо
  });

  it('ошибки и ограничения', () => {
    expect(() => newRun({ seed: 'x', classId: 'ghost' })).toThrow(/Unknown class/);
    expect(newRun({ ...OPTS, ascension: 99 }).ascension).toBe(15);
    expect(newRun({ ...OPTS, ascension: -3 }).ascension).toBe(0);
    expect(newRun({ ...OPTS, ascension: Number.NaN }).ascension).toBe(0);
    expect(newRun({ ...OPTS, weekly: '2026-W43' }).weekly).toBe('2026-W43');
    const bad = fixtureContent();
    bad.classes[0]!.startingDeck = ['nope'];
    setContentForTests(bad);
    expect(() => newRun(OPTS)).toThrow(/starting deck/);
  });
});

describe('детерминизм и чистота', () => {
  it('applyAction не мутирует вход', () => {
    const s = newRun(OPTS);
    const snapshot = structuredClone(s);
    const r = applyAction(s, getLegalActions(s)[0]!);
    expect(s).toEqual(snapshot);
    expect(r.state).not.toBe(s);
    const c = r.state;
    const snap2 = structuredClone(c);
    applyAction(c, { type: 'end_turn' });
    expect(c).toEqual(snap2);
  });

  it('один seed + одинаковые действия = одинаковое состояние; replay совпадает', () => {
    for (const seed of ['d1', 'd2', 'd3']) {
      const opts = { seed, classId: 'netrunner' as const };
      const a = runBot(opts, 7);
      const b = runBot(opts, 7);
      expect(b.state).toEqual(a.state);
      expect(b.actions).toEqual(a.actions);
      expect(replay(opts, a.actions)).toEqual(a.state);
      // пошаговая игра и replay совпадают и на промежуточном шаге
      const half = a.actions.slice(0, Math.floor(a.actions.length / 2));
      let step = newRun(opts);
      for (const x of half) step = applyAction(step, x).state;
      expect(replay(opts, half)).toEqual(step);
    }
  });

  it('потоки ГСЧ независимы: перетасовка боя не меняет награды', () => {
    const a = enterCombat();
    const b = structuredClone(a);
    b.rng.combat = (b.rng.combat + 12345) >>> 0;
    b.rng.ai = (b.rng.ai + 999) >>> 0;
    const ra = winCombat(a);
    const rb = winCombat(b);
    expect(items(rb)).toEqual(items(ra));
  });
});

describe('карта и выбор узлов', () => {
  it('в начале — любой узел ряда 0, дальше только next', () => {
    const s = newRun(OPTS);
    const legal = getLegalActions(s);
    const row0 = s.map.filter((n) => n.row === 0).map((n) => n.id);
    expect(legal.map((a) => (a.type === 'choose_node' ? a.nodeId : ''))).toEqual(row0);
    const row1 = s.map.find((n) => n.row === 1)!;
    expect(() => applyAction(s, { type: 'choose_node', nodeId: row1.id })).toThrow(InvalidActionError);
    const r = winCombat(act(s, legal[0] as Action));
    const back = act(r, { type: 'leave_reward' });
    expect(back.screen.kind).toBe('map');
    expect(back.floor).toBe(1);
    const node = back.map.find((n) => n.id === back.currentNodeId)!;
    expect(getLegalActions(back)).toEqual(node.next.map((id) => ({ type: 'choose_node', nodeId: id })));
    back.currentNodeId = 'missing';
    expect(getLegalActions(back)).toEqual([]);
    expect(() => applyAction(s, { type: 'end_turn' })).toThrow(InvalidActionError);
  });

  it('первые бои акта — лёгкие встречи', () => {
    const s = enterCombat();
    expect(s.combat!.enemies).toHaveLength(1);
  });
});

describe('награды', () => {
  it('золото, выбор карты, пропуск, уход', () => {
    let s = winCombat(enterCombat());
    expect(getLegalActions(s)).toEqual([
      { type: 'take_reward', index: 0 },
      { type: 'take_reward', index: 1 },
      { type: 'leave_reward' },
    ]);
    const gold = s.gold;
    const amount = (items(s)[0] as { amount: number }).amount;
    const r = applyAction(s, { type: 'take_reward', index: 0 });
    expect(r.state.gold).toBe(gold + amount);
    expect(r.events).toContainEqual({ type: 'gold_changed', amount });
    s = r.state;
    expect(() => act(s, { type: 'take_reward', index: 5 })).toThrow(InvalidActionError);
    s = act(s, { type: 'take_reward', index: 0 });
    expect(s.screen.kind).toBe('card_pick');
    const offered = s.screen.kind === 'card_pick' ? s.screen.cardIds : [];
    expect(getLegalActions(s)).toHaveLength(4);
    expect(() => act(s, { type: 'pick_card', cardId: 'bash' })).toThrow(InvalidActionError);
    expect(() => act(s, { type: 'leave_reward' })).toThrow(InvalidActionError);
    const picked = act(s, { type: 'pick_card', cardId: offered[0]! });
    expect(picked.deck).toHaveLength(11);
    expect(picked.deck.at(-1)!.defId).toBe(offered[0]);
    expect(items(picked)).toEqual([]);
    expect(picked.pendingRewards).toBeUndefined();
    const skipped = act(s, { type: 'pick_card', cardId: null });
    expect(skipped.deck).toHaveLength(10);
    expect(items(skipped)).toEqual([]);
    expect(act(skipped, { type: 'leave_reward' }).screen.kind).toBe('map');
    expect(() => act(skipped, { type: 'pick_card', cardId: null })).toThrow(InvalidActionError);
  });

  it('элита: золото 25-35 и реликвия', () => {
    const s = winCombat(enterKind('elite'));
    expect(s.stats.elitesKilled).toBe(1);
    const it = items(s);
    const gold = it.find((i) => i.kind === 'gold') as { amount: number };
    expect(gold.amount).toBeGreaterThanOrEqual(25);
    expect(gold.amount).toBeLessThanOrEqual(35);
    const relic = it.find((i) => i.kind === 'relic');
    expect(relic).toBeDefined();
    const idx = it.findIndex((i) => i.kind === 'relic');
    const r = act(s, { type: 'take_reward', index: idx });
    expect(r.relics).toHaveLength(2);
  });

  it('сокровищница: реликвия сразу экраном награды', () => {
    const s = enterKind('treasure');
    expect(s.screen.kind).toBe('reward');
    expect(items(s)).toHaveLength(1);
    expect(items(s)[0]!.kind).toBe('relic');
    // без доступных реликвий — золото
    const c = fixtureContent();
    c.relics = c.relics.filter((r) => r.rarity === 'starter' || r.rarity === 'boss');
    setContentForTests(c);
    const g = enterKind('treasure');
    expect(items(g)[0]!.kind).toBe('gold');
  });

  it('pickup-реликвия срабатывает при получении', () => {
    const s = enterKind('treasure');
    s.screen = { kind: 'reward', items: [{ kind: 'relic', relicId: 'r_gold' }] };
    s.hp = 60;
    const r = applyAction(s, { type: 'take_reward', index: 0 });
    expect(r.state.gold).toBe(149);
    expect(r.state.hp).toBe(65);
    expect(r.events).toContainEqual({ type: 'relic_triggered', relicId: 'r_gold' });
  });
});

describe('боссы и акты', () => {
  it('босс акта 1 → награда с босс-реликвией → акт 2 с лечением 75% недостающего', () => {
    let s = enterBoss(newRun(OPTS));
    expect(s.combat!.enemies.map((e) => e.defId)).toEqual(['a1_core']);
    s = winCombat(s);
    expect(s.stats.bossesKilled).toBe(1);
    const it = items(s);
    const gold = it.find((i) => i.kind === 'gold') as { amount: number };
    expect(gold.amount).toBeGreaterThanOrEqual(95);
    expect(gold.amount).toBeLessThanOrEqual(105);
    const relic = it.find((i) => i.kind === 'relic') as { relicId: string };
    expect(relic.relicId.startsWith('r_boss')).toBe(true);
    const cards = it.find((i) => i.kind === 'card_choice') as { cardIds: string[] };
    expect(cards.cardIds.sort()).toEqual(['battery', 'cleanup', 'ritual_code']);
    s.hp = 30;
    const r = applyAction(s, { type: 'leave_reward' });
    expect(r.state.act).toBe(2);
    expect(r.state.hp).toBe(30 + Math.floor(40 * 0.75));
    expect(r.state.currentNodeId).toBeNull();
    expect(r.state.map.every((n) => n.act === 2)).toBe(true);
    expect(r.events).toContainEqual({ type: 'act_started', act: 2 });
    expect(r.state.bossEncounterId).toBe('e2_boss');
  });

  it('победа над боссом акта 3 = победа в забеге', () => {
    let s = newRun(OPTS);
    s.act = 3;
    s.map = s.map.map((n) => ({ ...n, act: 3 as const }));
    s.bossEncounterId = 'e3_boss';
    s = enterBoss(s);
    expect(s.combat!.enemies.map((e) => e.defId)).toEqual(['a3_core']);
    const r = applyAction(s, { type: 'end_turn' });
    expect(r.state.status).toBe('active');
    const won = winCombat(s);
    expect(won.status).toBe('won');
    expect(won.screen).toEqual({ kind: 'game_over', victory: true });
    expect(won.score).toBe(computeScore(won));
    expect(won.score).toBeGreaterThanOrEqual(300 + 100);
    expect(getLegalActions(won)).toEqual([]);
    expect(() => applyAction(won, { type: 'leave_reward' })).toThrow(/Run is over/);
  });
});

describe('магазин', () => {
  it('ассортимент и цены', () => {
    const s = enterKind('shop');
    expect(s.screen.kind).toBe('shop');
    const shop = s.screen.kind === 'shop' ? s.screen.items : [];
    const cards = shop.filter((i) => i.kind === 'card');
    expect(cards).toHaveLength(7);
    expect(shop.filter((i) => i.kind === 'relic')).toHaveLength(3);
    expect(shop.filter((i) => i.kind === 'remove')).toEqual([{ kind: 'remove', price: 75, sold: false }]);
    expect(shop.filter((i) => i.sale)).toHaveLength(1);
    expect(shop.filter((i) => i.kind === 'upgrade' || i.kind === 'refresh')).toHaveLength(2);
    const neutral = cards.slice(5).map((c) => c.id);
    for (const id of neutral) expect(id!.startsWith('n_')).toBe(true);
    for (const c of cards) {
      const def = fixtureContent().cards.find((d) => d.id === c.id)!;
      const [lo, hi] = def.rarity === 'common' ? [45, 55] : def.rarity === 'uncommon' ? [68, 82] : [135, 165];
      expect(c.basePrice ?? c.price).toBeGreaterThanOrEqual(lo);
      expect(c.basePrice ?? c.price).toBeLessThanOrEqual(hi);
    }
    for (const r of shop.filter((i) => i.kind === 'relic')) {
      expect(r.basePrice ?? r.price).toBeGreaterThanOrEqual(150);
      expect(r.basePrice ?? r.price).toBeLessThanOrEqual(300);
    }
  });

  it('покупка карты, реликвии, удаление карты с ростом цены', () => {
    let s = enterKind('shop');
    s.gold = 1000;
    const shop = () => (s.screen.kind === 'shop' ? s.screen.items : []);
    const cardIdx = shop().findIndex((i) => i.kind === 'card');
    const price = shop()[cardIdx]!.price;
    s = act(s, { type: 'shop_buy', index: cardIdx });
    expect(s.gold).toBe(1000 - price);
    expect(s.deck).toHaveLength(11);
    expect(shop()[cardIdx]!.sold).toBe(true);
    expect(() => act(s, { type: 'shop_buy', index: cardIdx })).toThrow(InvalidActionError);
    expect(getLegalActions(s)).not.toContainEqual({ type: 'shop_buy', index: cardIdx });

    const relicIdx = shop().findIndex((i) => i.kind === 'relic');
    s = act(s, { type: 'shop_buy', index: relicIdx });
    expect(s.relics).toHaveLength(2);

    const removeIdx = shop().findIndex((i) => i.kind === 'remove');
    let sel = act(s, { type: 'shop_buy', index: removeIdx });
    expect(sel.screen).toEqual({ kind: 'select_deck_card', purpose: 'remove', returnTo: 'shop' });
    expect(getLegalActions(sel)).toHaveLength(12);
    // отмена: золото не тратится, магазин на месте
    const cancel = act(sel, { type: 'select_deck_card', cardUid: null });
    expect(cancel.screen.kind).toBe('shop');
    expect(cancel.gold).toBe(sel.gold);
    expect(() => act(sel, { type: 'select_deck_card', cardUid: 'nope' })).toThrow(InvalidActionError);
    const victim = sel.deck[0]!;
    const gold = sel.gold;
    sel = act(sel, { type: 'select_deck_card', cardUid: victim.uid });
    expect(sel.deck).toHaveLength(10);
    expect(sel.deck.some((c) => c.uid === victim.uid)).toBe(false);
    expect(sel.gold).toBe(gold - 75);
    expect(sel.cardRemovals).toBe(1);
    expect(sel.savedShop).toBeUndefined();
    s = sel;
    expect(shop()[removeIdx]!.sold).toBe(true);
    s = act(s, { type: 'leave_shop' });
    expect(s.screen.kind).toBe('map');
    // следующий магазин: удаление дороже на 25
    const next = s.map.find((n) => n.id === s.currentNodeId)!.next[0]!;
    s.map.find((n) => n.id === next)!.kind = 'shop';
    s = act(s, { type: 'choose_node', nodeId: next });
    expect(shop().find((i) => i.kind === 'remove')!.price).toBe(100);
  });

  it('нехватка золота', () => {
    const s = enterKind('shop');
    s.gold = 0;
    expect(getLegalActions(s)).toEqual([{ type: 'leave_shop' }]);
    expect(() => act(s, { type: 'shop_buy', index: 0 })).toThrow(/gold/);
    expect(() => act(s, { type: 'rest_heal' })).toThrow(InvalidActionError);
  });
});

describe('отдых', () => {
  it('rest_heal лечит 30% maxHp и триггерит rest-реликвии', () => {
    const s = enterKind('rest');
    s.hp = 30;
    s.relics.push('r_rest');
    const r = applyAction(s, { type: 'rest_heal' });
    expect(r.state.hp).toBe(30 + 21 + 5);
    expect(r.state.screen.kind).toBe('map');
    expect(r.events).toContainEqual({ type: 'relic_triggered', relicId: 'r_rest' });
  });

  it('rest_upgrade → выбор карты → улучшение; отмена возвращает к отдыху', () => {
    const s = enterKind('rest');
    let sel = act(s, { type: 'rest_upgrade' });
    expect(sel.screen).toMatchObject({ kind: 'select_deck_card', purpose: 'upgrade', returnTo: 'map' });
    expect(act(sel, { type: 'select_deck_card', cardUid: null }).screen.kind).toBe('rest');
    const uid = (sel.screen as { offer: string[] }).offer[0]!;
    const picked = sel.deck.find((c) => c.uid === uid)!;
    const r = applyAction(sel, { type: 'select_deck_card', cardUid: uid });
    expect(r.state.deck.find((c) => c.uid === uid)!.upgraded).toBe(true);
    expect(r.state.screen.kind).toBe('map');
    expect(r.events).toContainEqual({ type: 'card_upgraded', cardUid: uid, defId: picked.defId });
    // уже улучшенную нельзя
    sel = structuredClone(sel);
    sel.deck.find((c) => c.uid === uid)!.upgraded = true;
    expect(() => act(sel, { type: 'select_deck_card', cardUid: uid })).toThrow(/cannot be upgraded/);
    // всё улучшено — rest_upgrade нелегален
    const all = enterKind('rest');
    for (const c of all.deck) c.upgraded = true;
    expect(getLegalActions(all)).toEqual([{ type: 'rest_heal' }]);
    expect(() => act(all, { type: 'rest_upgrade' })).toThrow(InvalidActionError);
  });
});

describe('события', () => {
  function inEvent(eventId: string, setup?: (s: RunState) => void): RunState {
    const s = enterKind('event');
    expect(s.screen.kind).toBe('event');
    s.screen = { kind: 'event', eventId };
    setup?.(s);
    return s;
  }

  it('эффекты: золото и потеря HP', () => {
    const r = act(inEvent('ev_cache'), { type: 'event_choice', index: 0 });
    expect(r.gold).toBe(139);
    expect(r.hp).toBe(65);
    expect(r.screen.kind).toBe('map');
    expect(() => act(inEvent('ev_cache'), { type: 'event_choice', index: 9 })).toThrow(InvalidActionError);
    expect(act(inEvent('ev_cache'), { type: 'event_choice', index: 1 }).screen.kind).toBe('map');
  });

  it('смерть в событии', () => {
    const r = act(inEvent('ev_cache', (s) => (s.hp = 3)), { type: 'event_choice', index: 0 });
    expect(r.status).toBe('lost');
    expect(r.screen).toEqual({ kind: 'game_over', victory: false });
  });

  it('special: upgrade_card / remove_card', () => {
    const up = act(inEvent('ev_forge'), { type: 'event_choice', index: 0 });
    expect(up.screen).toMatchObject({ kind: 'select_deck_card', purpose: 'upgrade', returnTo: 'map' });
    expect(act(up, { type: 'select_deck_card', cardUid: null }).screen.kind).toBe('map');
    const rm = act(inEvent('ev_forge'), { type: 'event_choice', index: 1 });
    expect(rm.screen).toEqual({ kind: 'select_deck_card', purpose: 'remove', returnTo: 'map' });
    const done = act(rm, { type: 'select_deck_card', cardUid: rm.deck[0]!.uid });
    expect(done.deck).toHaveLength(9);
    expect(done.gold).toBe(99);
    expect(done.screen.kind).toBe('map');
    // нечего улучшать/удалять — сразу на карту
    const noUp = act(inEvent('ev_forge', (s) => s.deck.forEach((c) => (c.upgraded = true))), { type: 'event_choice', index: 0 });
    expect(noUp.screen.kind).toBe('map');
    const noRm = act(inEvent('ev_forge', (s) => (s.deck = [])), { type: 'event_choice', index: 1 });
    expect(noRm.screen.kind).toBe('map');
  });

  it('special: fight / random_relic, стоимость в золоте', () => {
    const fight = act(inEvent('ev_ambush'), { type: 'event_choice', index: 0 });
    expect(fight.screen.kind).toBe('combat');
    expect(fight.combat).not.toBeNull();
    const won = winCombat(fight);
    expect(won.screen.kind).toBe('reward');
    const paid = act(inEvent('ev_ambush', (s) => (s.hp = 50)), { type: 'event_choice', index: 1 });
    expect(paid.gold).toBe(69);
    expect(paid.hp).toBe(60);
    expect(paid.relics).toHaveLength(2);
    const poor = inEvent('ev_ambush', (s) => (s.gold = 10));
    expect(getLegalActions(poor)).toEqual([{ type: 'event_choice', index: 0 }]);
    expect(() => act(poor, { type: 'event_choice', index: 1 })).toThrow(/gold/);
  });

  it('special: random_card, damage вне боя, add_card в колоду; все варианты недоступны → доступны все', () => {
    const r = act(inEvent('ev_market'), { type: 'event_choice', index: 1 });
    expect(r.hp).toBe(64);
    expect(r.deck).toHaveLength(12);
    expect(r.deck.some((c) => c.defId === 'malware')).toBe(true);
    const c = fixtureContent();
    c.events.push({ id: 'ev_pricey', name: 'x', text: 'x', options: [{ label: 'a', effects: [{ type: 'gain_gold', amount: -1000 }] }] });
    setContentForTests(c);
    const p = inEvent('ev_pricey');
    expect(getLegalActions(p)).toEqual([{ type: 'event_choice', index: 0 }]);
    expect(act(p, { type: 'event_choice', index: 0 }).gold).toBe(0);
  });

  it('события не повторяются, пока есть новые; без событий — бой', () => {
    const s = enterKind('event');
    expect(s.seenEvents).toHaveLength(1);
    const c = fixtureContent();
    c.events = [];
    setContentForTests(c);
    expect(enterKind('event').screen.kind).toBe('combat');
  });
});

describe('фолбэки контента', () => {
  it('нет встреч — враг подбирается по tier', () => {
    const c = fixtureContent();
    c.encounters = [];
    setContentForTests(c);
    const s = enterCombat();
    expect(s.combat!.enemies).toHaveLength(1);
    expect(s.bossEncounterId).toBeUndefined();
    const elite = enterKind('elite');
    expect(elite.combat!.enemies[0]!.defId).toBe('a1_antivirus');
    c.enemies = c.enemies.filter((e) => e.tier !== 'elite');
    setContentForTests(c);
    expect(enterKind('elite').combat!.enemies).toHaveLength(1);
    c.enemies = [];
    setContentForTests(c);
    expect(() => enterCombat()).toThrow(/no enemies/);
  });

  it('встречи без акта — берутся из других актов', () => {
    const c = fixtureContent();
    c.encounters = c.encounters.filter((e) => e.act === 1);
    setContentForTests(c);
    let s = newRun(OPTS);
    s.act = 2;
    s = enterKind('combat', s);
    expect(s.combat!.enemies[0]!.defId.startsWith('a1_')).toBe(true);
  });
});

describe('ascension', () => {
  it('таблица из 15 описаний, модификаторы накопительны', () => {
    const d = getAscensionDescriptions();
    expect(d).toHaveLength(15);
    expect(d.map((x) => x.level)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(getAscensionMods(0).eliteWeightMult).toBe(1);
    expect(getAscensionMods(1).eliteWeightMult).toBe(1.5);
    expect(getAscensionMods(5)).toMatchObject({ eliteWeightMult: 1.5, normalDamageMult: 1.1, actHealPct: 0.5, startHpPct: 1 });
    expect(getAscensionMods(15)).toMatchObject({ curseInDeck: true, goldMult: 0.8, restHealPct: 0.25, maxHpPenaltyPct: 0.05 });
  });

  it('A6 HP 90%, A10 проклятие, A14 меньше maxHp', () => {
    expect(newRun({ ...OPTS, ascension: 6 }).hp).toBe(63);
    expect(newRun({ ...OPTS, ascension: 9 }).deck.some((c) => c.defId === 'malware')).toBe(false);
    const a10 = newRun({ ...OPTS, ascension: 10 });
    expect(a10.deck.some((c) => c.defId === 'malware')).toBe(true);
    expect(a10.score).toBe(500);
    const a14 = newRun({ ...OPTS, ascension: 14 });
    expect(a14.maxHp).toBe(67);
    expect(a14.hp).toBe(60);
    // нет проклятий в контенте — пропускаем
    const c = fixtureContent();
    c.cards = c.cards.filter((x) => x.type !== 'curse');
    setContentForTests(c);
    expect(newRun({ ...OPTS, ascension: 10 }).deck).toHaveLength(10);
  });

  it('A2/A7: урон и HP обычных врагов выше; A5: меньше лечения после босса', () => {
    const base = enterCombat({ ...OPTS, ascension: 0 });
    const hard = enterCombat({ ...OPTS, ascension: 7 });
    const fw = (s: RunState) => s.combat!.enemies.find((e) => e.intent.moveId === 'hit' || e.intent.moveId === 'ping');
    const b = fw(base);
    const h = fw(hard);
    if (b && h && b.defId === h.defId) expect(h.intent.damage!).toBeGreaterThan(b.intent.damage!);
    expect(hard.combat!.enemies[0]!.maxHp).toBeGreaterThanOrEqual(base.combat!.enemies[0]!.maxHp);
    let s = winCombat(enterBoss(newRun({ ...OPTS, ascension: 5 })));
    s.hp = 30;
    s = act(s, { type: 'leave_reward' });
    expect(s.hp).toBe(30 + 20);
  });

  it('A13: отдых лечит 25%, A11: цены выше, A15: золота меньше', () => {
    const s = enterKind('rest', newRun({ ...OPTS, ascension: 15 }));
    s.hp = 10;
    expect(s.maxHp).toBe(67);
    expect(act(s, { type: 'rest_heal' }).hp).toBe(10 + Math.floor(67 * 0.25));
    const shop = enterKind('shop', newRun({ ...OPTS, ascension: 11 }));
    const remove = shop.screen.kind === 'shop' ? shop.screen.items.find((i) => i.kind === 'remove') : undefined;
    expect(remove!.price).toBe(Math.round(75 * 1.1));
    for (let i = 0; i < 10; i++) {
      const w = winCombat(enterCombat({ ...OPTS, seed: `g${i}`, ascension: 15 }));
      const g = items(w).find((x) => x.kind === 'gold') as { amount: number };
      expect(g.amount).toBeLessThanOrEqual(16);
      expect(g.amount).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('счёт', () => {
  it('формула', () => {
    const s = newRun(OPTS);
    s.floor = 10;
    s.stats.elitesKilled = 2;
    s.stats.bossesKilled = 1;
    expect(computeScore(s)).toBe(50 + 50 + 100);
    s.status = 'won';
    s.hp = 40;
    s.ascension = 3;
    expect(computeScore(s)).toBe(50 + 50 + 100 + 300 + 40 + 150);
  });

  it('пересчитывается после действий', () => {
    const s = winCombat(enterCombat());
    expect(s.score).toBe(5);
  });
});
