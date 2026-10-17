import { describe, expect, it } from 'vitest';
import { enterCombat, OPTS, play, setupCombat, useContent } from './__fixtures__/helpers';
import { chooseMove } from './ai';
import { getContent } from './content';
import { createRngStore, Rng } from './rng';
import { applyAction, getLegalActions, newRun } from './run';
import { InvalidActionError, type EnemyDef, type RunState } from './types';

useContent();

const endTurn = (s: RunState) => applyAction(s, { type: 'end_turn' });
const hand = (s: RunState) => s.combat!.hand;
const enemy = (s: RunState, i = 0) => s.combat!.enemies[i]!;

describe('старт боя', () => {
  it('энергия 3, добор 5, намерения видны', () => {
    const s = enterCombat();
    const c = s.combat!;
    expect(s.screen.kind).toBe('combat');
    expect(c.turn).toBe(1);
    expect(c.energy).toBe(3);
    expect(c.maxEnergy).toBe(3);
    expect(c.hand).toHaveLength(5);
    expect(c.drawPile).toHaveLength(5);
    expect(c.enemies.length).toBeGreaterThan(0);
    for (const e of c.enemies) {
      expect(e.intent.moveId).not.toBe('');
      expect(e.hp).toBeGreaterThan(0);
    }
    const attacker = c.enemies.find((e) => e.intent.kind === 'attack');
    if (attacker) expect(attacker.intent.damage).toBeGreaterThan(0);
  });
});

describe('розыгрыш карт', () => {
  it('удар тратит энергию и уходит в сброс', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike'], energy: 3 });
    const uid = hand(s)[0]!.uid;
    const r = applyAction(s, { type: 'play_card', cardUid: uid, targetUid: 'en0' });
    expect(r.state.combat!.energy).toBe(2);
    expect(enemy(r.state).hp).toBe(94);
    expect(r.state.combat!.discardPile.map((c) => c.uid)).toEqual([uid]);
    expect(r.events).toContainEqual({ type: 'card_played', cardUid: uid, defId: 'strike' });
    expect(r.events).toContainEqual({ type: 'damage', targetUid: 'en0', amount: 6, blocked: 0 });
    expect(r.state.stats.cardsPlayed).toBe(1);
    expect(r.state.stats.damageDealt).toBe(6);
  });

  it('блок врага поглощает урон', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike'], energy: 3 });
    enemy(s).block = 4;
    const r = applyAction(s, { type: 'play_card', cardUid: hand(s)[0]!.uid, targetUid: 'en0' });
    expect(enemy(r.state).hp).toBe(98);
    expect(enemy(r.state).block).toBe(0);
    expect(r.events).toContainEqual({ type: 'damage', targetUid: 'en0', amount: 2, blocked: 4 });
  });

  it('нелегальные розыгрыши бросают InvalidActionError', () => {
    const s = setupCombat(enterCombat(), { hand: ['bash', 'glitch', 'strike', 'malware'], energy: 1 });
    const [bash, glitch, strike] = hand(s);
    expect(() => play(s, bash!.uid, 'en0')).toThrow(InvalidActionError); // энергия
    expect(() => play(s, glitch!.uid)).toThrow(/unplayable/);
    expect(() => play(s, strike!.uid)).toThrow(/target/);
    expect(() => play(s, strike!.uid, 'nobody')).toThrow(InvalidActionError);
    expect(() => play(s, 'missing')).toThrow(/not in hand/);
    const legal = getLegalActions(s);
    expect(legal).toEqual([{ type: 'play_card', cardUid: strike!.uid, targetUid: 'en0' }, { type: 'end_turn' }]);
    expect(() => applyAction(s, { type: 'leave_shop' })).toThrow(InvalidActionError);
    expect(() => applyAction(s, { type: 'nonsense' } as never)).toThrow(InvalidActionError);
  });

  it('getLegalActions: карта на врага — для каждого живого врага', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike', 'defend'], energy: 3, enemyHp: [10, 0, 10] });
    const legal = getLegalActions(s);
    const strikeUid = hand(s)[0]!.uid;
    expect(legal.filter((a) => a.type === 'play_card' && a.cardUid === strikeUid)).toHaveLength(2);
    expect(legal).toContainEqual({ type: 'play_card', cardUid: hand(s)[1]!.uid });
  });

  it('X-стоимость: тратит всю энергию, эффект X раз', () => {
    const s = setupCombat(enterCombat(), { hand: ['x_burst', 'x_burst'], energy: 3 });
    const r = play(s, hand(s)[0]!.uid, 'en0');
    expect(r.combat!.energy).toBe(0);
    expect(enemy(r).hp).toBe(100 - 15);
    // при 0 энергии X-карта легальна и ничего не делает
    expect(getLegalActions(r).some((a) => a.type === 'play_card')).toBe(true);
    const r2 = play(r, hand(r)[0]!.uid, 'en0');
    expect(enemy(r2).hp).toBe(85);
  });

  it('exhaust и ethereal', () => {
    const s = setupCombat(enterCombat(), { hand: ['purge', 'ghost_shield', 'defend'], draw: ['strike'], energy: 3 });
    const purgeUid = hand(s)[0]!.uid;
    const r = applyAction(s, { type: 'play_card', cardUid: purgeUid });
    expect(r.state.combat!.exhaustPile.map((c) => c.uid)).toEqual([purgeUid]);
    expect(r.events).toContainEqual({ type: 'card_exhausted', cardUid: purgeUid });
    expect(r.state.combat!.player.block).toBe(4);
    expect(hand(r.state).map((c) => c.defId)).toEqual(['ghost_shield', 'defend', 'strike']);
    const ghostUid = hand(r.state)[0]!.uid;
    const e = endTurn(r.state).state;
    expect(e.combat!.exhaustPile.map((c) => c.uid)).toContain(ghostUid);
    expect([...e.combat!.discardPile, ...e.combat!.hand, ...e.combat!.drawPile].map((c) => c.uid)).not.toContain(ghostUid);
  });

  it('улучшенный purge не сжигается; power уходит из боя', () => {
    const s = setupCombat(enterCombat(), { hand: ['purge', 'overclock'], energy: 3 });
    hand(s)[0]!.upgraded = true;
    const r = play(play(s, hand(s)[0]!.uid), hand(s)[1]!.uid);
    expect(r.combat!.exhaustPile).toHaveLength(0);
    expect(r.combat!.discardPile.map((c) => c.defId)).toEqual(['purge']);
    expect(r.combat!.player.statuses.strength).toBe(2);
  });

  it('урон: strength + vulnerable + weak', () => {
    const s = setupCombat(enterCombat(), { hand: ['overclock', 'bash', 'strike'], energy: 10 });
    let r = play(s, hand(s)[0]!.uid); // +2 силы
    r = play(r, hand(r)[0]!.uid, 'en0'); // bash: 8+2 = 10, затем уязвимость 2
    expect(enemy(r).hp).toBe(90);
    expect(enemy(r).statuses.vulnerable).toBe(2);
    r.combat!.player.statuses.weak = 1;
    r = play(r, hand(r)[0]!.uid, 'en0'); // (6+2)*0.75*1.5 = 9
    expect(enemy(r).hp).toBe(81);
  });

  it('намерение показывает итоговый урон с учётом статусов', () => {
    const s = setupCombat(enterCombat(), { hand: ['defend'], energy: 3 });
    enemy(s).statuses.strength = 2;
    s.combat!.player.statuses.vulnerable = 1;
    const r = play(s, hand(s)[0]!.uid);
    expect(enemy(r).intent).toEqual({ kind: 'attack', moveId: 'hit', damage: 10, times: 1 }); // (5+2)*1.5
  });

  it('урон по всем и по случайным', () => {
    const s = setupCombat(enterCombat(), { hand: ['ddos', 'ping_storm'], energy: 3, enemyHp: [20, 20, 20] });
    let r = play(s, hand(s)[0]!.uid);
    expect(r.combat!.enemies.map((e) => e.hp)).toEqual([16, 16, 16]);
    r = play(r, hand(r)[0]!.uid);
    expect(r.combat!.enemies.reduce((sum, e) => sum + e.hp, 0)).toBe(48 - 9);
  });

  it('добавление карт, сжигание случайной, золото, потеря HP', () => {
    const s = setupCombat(enterCombat(), { hand: ['spam', 'cleanup', 'defend'], energy: 3, draw: ['strike'] });
    let r = play(s, hand(s)[0]!.uid, 'en0');
    expect(r.combat!.discardPile.filter((c) => c.defId === 'glitch')).toHaveLength(1);
    expect(r.combat!.drawPile.filter((c) => c.defId === 'glitch')).toHaveLength(1);
    const gold = r.gold;
    const hp = r.combat!.player.hp;
    r = play(r, hand(r)[0]!.uid);
    expect(r.gold).toBe(gold + 5);
    expect(r.combat!.player.hp).toBe(hp - 1);
    expect(r.hp).toBe(hp - 1);
    expect(r.combat!.exhaustPile).toHaveLength(1);
    expect(hand(r).map((c) => c.defId)).toContain('strike');
  });

  it('лимит руки 10', () => {
    const s = setupCombat(enterCombat(), {
      hand: Array(10).fill('defend'),
      draw: ['strike'],
      energy: 3,
    });
    s.combat!.hand[0] = { uid: 'scan1', defId: 'n_scan', upgraded: false };
    const r = play(s, 'scan1');
    expect(hand(r)).toHaveLength(10);
  });
});

describe('конец хода и ходы врагов', () => {
  it('сброс руки, перетасовка сброса в добор, добор 5', () => {
    const s = setupCombat(enterCombat(), {
      hand: ['defend'],
      draw: ['strike', 'strike'],
      discard: ['defend', 'defend', 'defend'],
    });
    const r = endTurn(s);
    const c = r.state.combat!;
    expect(c.turn).toBe(2);
    expect(c.energy).toBe(3);
    expect(c.hand).toHaveLength(5);
    expect(c.drawPile).toHaveLength(1);
    expect(c.discardPile).toHaveLength(0);
    expect(r.events).toContainEqual({ type: 'deck_shuffled', count: 4 });
    expect(r.events).toContainEqual({ type: 'turn_started', turn: 2 });
    expect(r.events).toContainEqual({ type: 'enemy_move', enemyUid: 'en0', moveId: 'hit' });
  });

  it('перетасовка детерминирована по seed и не трогает поток наград', () => {
    const a = setupCombat(enterCombat(), { discard: ['strike', 'defend', 'bash', 'purge', 'patch', 'ddos'] });
    const b = structuredClone(a);
    const ra = endTurn(a).state;
    const rb = endTurn(b).state;
    expect(ra.combat!.hand.map((c) => c.defId)).toEqual(rb.combat!.hand.map((c) => c.defId));
    expect(ra.rng.rewards).toBe(a.rng.rewards);
    expect(ra.rng.combat).not.toBe(a.rng.combat);
  });

  it('блок игрока держится в ход врага и сбрасывается в начале своего хода', () => {
    const s = setupCombat(enterCombat(), { hand: ['defend'], energy: 3 });
    const r = endTurn(play(s, hand(s)[0]!.uid)).state;
    // враг ударил на 5, блок 5 поглотил
    expect(r.combat!.player.hp).toBe(s.combat!.player.hp);
    expect(r.combat!.player.block).toBe(0);
  });

  it('блок врага сбрасывается в начале его хода, cycle-ИИ идёт по кругу', () => {
    const s = setupCombat(enterCombat(), {});
    enemy(s).block = 7;
    let r = endTurn(s).state;
    expect(enemy(r).block).toBe(0); // ударил, блок сброшен
    expect(enemy(r).moveHistory).toEqual(['hit']);
    expect(enemy(r).intent.moveId).toBe('guard');
    expect(enemy(r).intent.damage).toBeUndefined();
    r = endTurn(r).state;
    expect(enemy(r).block).toBe(5);
    expect(enemy(r).intent.moveId).toBe('hit');
    r = endTurn(r).state;
    expect(enemy(r).moveHistory).toEqual(['hit', 'guard', 'hit']);
  });

  it('virus: теряет N игнорируя блок, потом N-1', () => {
    const s = setupCombat(enterCombat(), { hand: ['virus_inject'], energy: 3 });
    let r = play(s, hand(s)[0]!.uid, 'en0');
    expect(enemy(r).statuses.virus).toBe(5);
    enemy(r).block = 50;
    r = endTurn(r).state;
    expect(enemy(r).hp).toBe(95);
    expect(enemy(r).statuses.virus).toBe(4);
    // вирус на игроке — в начале его хода
    r.combat!.player.statuses.virus = 2;
    r.combat!.player.block = 0;
    const hpBefore = r.combat!.player.hp;
    enemy(r).intent = { kind: 'defend', moveId: 'guard' };
    r = endTurn(r).state;
    expect(r.combat!.player.hp).toBe(hpBefore - 2);
    expect(r.combat!.player.statuses.virus).toBe(1);
  });

  it('plating, thorns, regen, ritual, dexterity', () => {
    const s = setupCombat(enterCombat(), { hand: ['firewall', 'patch', 'ritual_code', 'defend'], energy: 10, playerHp: 50 });
    let r = s;
    for (let i = 0; i < 4; i++) r = play(r, hand(r)[0]!.uid);
    const p = r.combat!.player;
    expect(p.statuses).toMatchObject({ plating: 3, thorns: 2, regen: 3, dexterity: 1, ritual: 1 });
    expect(p.hp).toBe(54);
    expect(p.block).toBe(6); // 5 + dexterity 1
    const res = endTurn(r);
    r = res.state;
    // конец хода: plating +3 блока (итого 9), regen +3 HP, ritual +1 силы. Враг бьёт 5 — блок держит, шипы 2.
    expect(enemy(r).hp).toBe(98);
    expect(r.combat!.player.hp).toBe(57);
    expect(r.combat!.player.statuses.regen).toBe(2);
    expect(r.combat!.player.statuses.strength).toBe(1);
    expect(r.combat!.player.statuses.plating).toBe(3);
    expect(res.events).toContainEqual({ type: 'block_gained', targetUid: 'player', amount: 3 });
  });

  it('duration-статусы тают в конце хода носителя', () => {
    const s = setupCombat(enterCombat(), { hand: ['weaken'], energy: 3, enemyHp: [30, 30] });
    let r = play(s, hand(s)[0]!.uid);
    expect(enemy(r, 0).statuses.weak).toBe(2);
    expect(enemy(r, 1).statuses.weak).toBe(2);
    expect(r.combat!.player.statuses.frail).toBe(1);
    // weak врага действует на его удар: 5 * 0.75 = 3
    expect(enemy(r).intent.damage).toBe(3);
    r = endTurn(r).state;
    expect(r.combat!.player.statuses.frail).toBeUndefined();
    expect(enemy(r, 0).statuses.weak).toBe(1);
  });

  it('шипы врага ранят атакующего игрока', () => {
    const s = setupCombat(enterCombat(), { hand: ['ping_storm'], energy: 3 });
    enemy(s).statuses.thorns = 2;
    const hp = s.combat!.player.hp;
    const r = play(s, hand(s)[0]!.uid);
    expect(r.combat!.player.hp).toBe(hp - 6);
  });

  it('победа: награды, золото, карта; combat = null', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike'], energy: 3, enemyHp: [5] });
    const r = applyAction(s, { type: 'play_card', cardUid: hand(s)[0]!.uid, targetUid: 'en0' });
    expect(r.events).toContainEqual({ type: 'enemy_died', enemyUid: 'en0' });
    expect(r.events).toContainEqual({ type: 'combat_won' });
    expect(r.events).toContainEqual({ type: 'screen_changed', screen: 'reward' });
    expect(r.state.combat).toBeNull();
    expect(r.state.screen.kind).toBe('reward');
    const items = r.state.screen.kind === 'reward' ? r.state.screen.items : [];
    const gold = items.find((i) => i.kind === 'gold');
    expect(gold && gold.kind === 'gold' && gold.amount).toBeGreaterThanOrEqual(10);
    expect(gold && gold.kind === 'gold' && gold.amount).toBeLessThanOrEqual(20);
    const choice = items.find((i) => i.kind === 'card_choice');
    expect(choice && choice.kind === 'card_choice' && choice.cardIds).toHaveLength(3);
    expect(items.some((i) => i.kind === 'relic')).toBe(false);
    expect(r.state.stats.enemiesKilled).toBe(1);
  });

  it('поражение: game_over, status lost', () => {
    const s = setupCombat(enterCombat(), { playerHp: 3 });
    const r = endTurn(s);
    expect(r.state.status).toBe('lost');
    expect(r.state.hp).toBe(0);
    expect(r.state.screen).toEqual({ kind: 'game_over', victory: false });
    expect(r.events).toContainEqual({ type: 'combat_lost' });
    expect(getLegalActions(r.state)).toEqual([]);
    expect(() => endTurn(r.state)).toThrow(InvalidActionError);
  });

  it('враг-босс: debuff, attack_defend с шипами, lose_hp', () => {
    let s = setupCombat(enterCombat(), { enemyDefId: 'a1_core', enemyHp: [200] });
    enemy(s).intent = { kind: 'attack', moveId: 'smash' };
    s = endTurn(s).state; // smash 10
    expect(s.combat!.player.hp).toBe(60);
    s = endTurn(s).state; // corrupt
    // weak/frail тают в конце хода игрока; вирус уже тикнул в начале хода (2 → 1)
    expect(s.combat!.player.statuses).toMatchObject({ weak: 2, frail: 2, virus: 1 });
    expect(s.combat!.player.hp).toBe(58);
    s = endTurn(s).state; // shield: блок 10, удар 6, шипы 1
    expect(enemy(s).statuses.thorns).toBe(1);
    expect(enemy(s).block).toBe(10);
    s = endTurn(s).state; // drain: lose_hp 2, draw игнорируется
    expect(enemy(s).moveHistory).toEqual(['smash', 'corrupt', 'shield', 'drain']);
  });

  it('враг-элита: ritual даёт силу в конце его хода, heal и plating', () => {
    let s = setupCombat(enterCombat(), { enemyDefId: 'a1_antivirus', enemyHp: [40] });
    enemy(s).intent = { kind: 'buff', moveId: 'scan' };
    enemy(s).hp = 30;
    s = endTurn(s).state;
    expect(enemy(s).statuses.strength).toBe(1);
    expect(enemy(s).intent.damage).toBe(9); // 6+2 + 1
    s = endTurn(s).state;
    s = endTurn(s).state; // heal +5, plating 2 → блок 2 в конце хода
    expect(enemy(s).hp).toBe(35);
    expect(enemy(s).block).toBe(2);
  });
});

describe('ИИ врагов', () => {
  const def = (): EnemyDef => getContent().enemies.get('a1_scanner')!;

  it('random: не выбирает один move 3 раза подряд', () => {
    const rng = new Rng(createRngStore('ai'), 'ai');
    for (let i = 0; i < 200; i++) expect(chooseMove(def(), ['ping', 'ping'], rng)).toBe('mark');
    const picks = new Set<string>();
    for (let i = 0; i < 200; i++) picks.add(chooseMove(def(), ['mark'], rng));
    expect(picks).toEqual(new Set(['ping', 'mark']));
  });

  it('random с единственным move допускает повтор; пустые веса → первый move', () => {
    const rng = new Rng(createRngStore('ai'), 'ai');
    const single: EnemyDef = { ...def(), ai: { kind: 'random', weights: { ping: 1 } } };
    expect(chooseMove(single, ['ping', 'ping'], rng)).toBe('ping');
    const none: EnemyDef = { ...def(), ai: { kind: 'random', weights: {} } };
    expect(chooseMove(none, [], rng)).toBe('ping');
    const badCycle: EnemyDef = { ...def(), ai: { kind: 'cycle', order: ['zzz'] } };
    expect(chooseMove(badCycle, [], rng)).toBe('ping');
    expect(() => chooseMove({ ...def(), moves: [] }, [], rng)).toThrow();
  });
});

describe('реликвии в бою', () => {
  function combatWithRelics(relics: string[]): RunState {
    const s = newRun(OPTS);
    s.relics.push(...relics);
    return applyAction(s, getLegalActions(s)[0]!).state;
  }

  it('combat_start: уязвимость всем, урон всем, добор', () => {
    const s = combatWithRelics(['r_vuln', 'r_boss_draw', 'r_shop']);
    expect(s.combat!.enemies.every((e) => e.statuses.vulnerable === 1)).toBe(true);
    expect(s.combat!.hand).toHaveLength(7);
    expect(s.combat!.player.statuses.strength).toBe(1);
    const s2 = combatWithRelics(['r_boss_aoe']);
    const maxHp = s2.combat!.enemies.map((e) => e.maxHp - e.hp);
    expect(maxHp.every((d) => d === 3)).toBe(true);
  });

  it('every: каждая 3-я атака, каждая 5-я карта, каждый 2-й ход', () => {
    let s = combatWithRelics(['r_every3', 'r_cards5', 'r_turn_start', 'r_turn_end']);
    expect(s.combat!.energy).toBe(3); // ход 1: счётчик 1 из 2
    s = setupCombat(s, { hand: ['strike', 'strike', 'strike', 'defend', 'defend'], draw: ['n_scan'], energy: 10 });
    for (let i = 0; i < 2; i++) s = play(s, hand(s)[0]!.uid, 'en0');
    expect(enemy(s).hp).toBe(88);
    const r = applyAction(s, { type: 'play_card', cardUid: hand(s)[0]!.uid, targetUid: 'en0' });
    expect(r.events).toContainEqual({ type: 'relic_triggered', relicId: 'r_every3' });
    expect(enemy(r.state).hp).toBe(100 - 18 - 5);
    s = play(r.state, hand(r.state)[0]!.uid);
    expect(hand(s).map((c) => c.defId)).toEqual(['defend']);
    s = play(s, hand(s)[0]!.uid); // 5-я карта → добор
    expect(hand(s).map((c) => c.defId)).toEqual(['n_scan']);
    expect(s.combat!.counters).toMatchObject({ r_every3: 3, r_cards5: 5 });
    const blockBefore = s.combat!.player.block;
    const e = endTurn(s);
    expect(e.events).toContainEqual({ type: 'relic_triggered', relicId: 'r_turn_end' });
    expect(blockBefore).toBe(10);
    expect(e.state.combat!.energy).toBe(4); // ход 2: +1
  });

  it('combat_end: стартовая реликвия лечит после боя', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike'], energy: 3, enemyHp: [1], playerHp: 40 });
    const r = applyAction(s, { type: 'play_card', cardUid: hand(s)[0]!.uid, targetUid: 'en0' });
    expect(r.state.hp).toBe(46);
    expect(r.events).toContainEqual({ type: 'relic_triggered', relicId: 'r_starter' });
  });
});
