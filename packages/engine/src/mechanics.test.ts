/**
 * Новые механики: ключевые слова карт (retain/innate), эффекты (scry, discard_hand_draw, upgrade_random_hand,
 * gain_max_hp, heal_pct, double_next, cleanse, gain_potion), статусы (echo, barrier, bleed, mark).
 */
import { describe, expect, it } from 'vitest';
import { setContentForTests } from './content';
import { enterCombat, OPTS, play, setupCombat, useContent } from './__fixtures__/helpers';
import { mechanicsContent } from './__fixtures__/mechanics';
import { applyAction, newRun } from './run';
import type { RunState } from './types';

useContent(mechanicsContent);

const c0 = (s: RunState) => s.combat!;
const enemy = (s: RunState, i = 0) => s.combat!.enemies[i]!;
const uidOf = (s: RunState, defId: string, nth = 0) => c0(s).hand.filter((h) => h.defId === defId)[nth]!.uid;
const endTurn = (s: RunState) => applyAction(s, { type: 'end_turn' }).state;

describe('ключевые слова карт', () => {
  it('Удержание: карта остаётся в руке после конца хода, остальные уходят в сброс', () => {
    const s = setupCombat(enterCombat(), { hand: ['keep_shield', 'strike'], draw: [] });
    const r = endTurn(s);
    expect(c0(r).hand.map((h) => h.defId)).toContain('keep_shield');
    expect(c0(r).hand.filter((h) => h.defId === 'strike')).toHaveLength(1); // strike вернулся только через перемешивание
    expect(c0(r).hand.find((h) => h.defId === 'keep_shield')!.uid).toBe(c0(s).hand[0]!.uid);
  });

  it('Эфемерная без удержания по-прежнему сгорает', () => {
    const s = setupCombat(enterCombat(), { hand: ['ghost_shield'], draw: ['strike'] });
    const r = endTurn(s);
    expect(c0(r).exhaustPile.map((h) => h.defId)).toEqual(['ghost_shield']);
  });

  it('Врождённая: всегда в стартовой руке, на любом сиде', () => {
    for (let i = 0; i < 12; i++) {
      const content = mechanicsContent();
      content.classes[0]!.startingDeck.push('opener', 'opener');
      setContentForTests(content);
      const s = enterCombat({ ...OPTS, seed: `innate-${i}` });
      expect(c0(s).hand.filter((h) => h.defId === 'opener')).toHaveLength(2);
      expect(c0(s).hand).toHaveLength(5);
    }
  });

  it('Врождённая из улучшения (upgrade.innate)', () => {
    const content = mechanicsContent();
    setContentForTests(content);
    let s = newRun({ ...OPTS, seed: 'innate-up' });
    s.deck.push({ uid: 'up1', defId: 'late_opener', upgraded: true });
    s = applyAction(s, { type: 'choose_node', nodeId: s.map.find((n) => n.row === 0)!.id }).state;
    expect(c0(s).hand.some((h) => h.uid === 'up1')).toBe(true);
  });
});

describe('новые эффекты', () => {
  it('scry: статусы и проклятия сверху добора уходят в сброс', () => {
    const s = setupCombat(enterCombat(), { hand: ['scry3'], draw: ['glitch', 'strike', 'malware', 'defend'] });
    const r = applyAction(s, { type: 'play_card', cardUid: uidOf(s, 'scry3') });
    expect(c0(r.state).drawPile.map((h) => h.defId)).toEqual(['strike', 'defend']);
    expect(c0(r.state).discardPile.map((h) => h.defId).sort()).toEqual(['glitch', 'malware', 'scry3']);
    expect(r.events).toContainEqual({ type: 'cards_discarded', count: 2 });
  });

  it('discard_hand_draw: сбросить руку и взять столько же + amount', () => {
    const s = setupCombat(enterCombat(), { hand: ['reboot', 'strike', 'strike'], draw: ['defend', 'defend', 'defend', 'defend'] });
    const r = play(s, uidOf(s, 'reboot'));
    expect(c0(r).hand.map((h) => h.defId)).toEqual(['defend', 'defend', 'defend']);
    expect(c0(r).discardPile.map((h) => h.defId).sort()).toEqual(['reboot', 'strike', 'strike']);
  });

  it('upgrade_random_hand: улучшает карты в руке только до конца боя', () => {
    const s = setupCombat(enterCombat(), { hand: ['hotfix', 'strike', 'strike', 'strike', 'glitch'] });
    const r = play(s, uidOf(s, 'hotfix'));
    expect(c0(r).hand.filter((h) => h.upgraded)).toHaveLength(2);
    expect(c0(r).hand.find((h) => h.defId === 'glitch')!.upgraded).toBe(false);
    expect(r.deck.some((d) => d.upgraded)).toBe(false);
  });

  it('gain_max_hp: в бою, сохраняется после победы', () => {
    const s = setupCombat(enterCombat(), { hand: ['gene', 'strike'], enemyHp: [1] });
    const maxHp = c0(s).player.maxHp;
    let r = play(s, uidOf(s, 'gene'));
    expect(c0(r).player.maxHp).toBe(maxHp + 4);
    r = play(r, uidOf(r, 'strike'), 'en0');
    expect(r.screen.kind).toBe('reward');
    expect(r.maxHp).toBe(maxHp + 4);
  });

  it('heal_pct: лечит процент от максимума', () => {
    const s = setupCombat(enterCombat(), { hand: ['medkit'], playerHp: 10 });
    const r = play(s, uidOf(s, 'medkit'));
    expect(c0(r).player.hp).toBe(10 + Math.floor(c0(s).player.maxHp / 2));
  });

  it('cleanse: снимает дебаффы, баффы остаются', () => {
    const s = setupCombat(enterCombat(), { hand: ['purify'] });
    c0(s).player.statuses = { weak: 2, vulnerable: 1, virus: 3, bleed: 2, strength: 2, dexterity: -1 };
    const r = play(s, uidOf(s, 'purify'));
    expect(c0(r).player.statuses).toEqual({ strength: 2 });
  });

  it('gain_potion: кладёт расходник в свободный слот', () => {
    const s = setupCombat(enterCombat(), { hand: ['brew'] });
    const r = applyAction(s, { type: 'play_card', cardUid: uidOf(s, 'brew') });
    expect(r.state.potions).toEqual(['pot_block']);
    expect(r.events).toContainEqual({ type: 'potion_obtained', potionId: 'pot_block' });
  });
});

describe('Эхо (echo / double_next)', () => {
  it('следующая карта срабатывает дважды, Эхо тратится', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike', 'strike'] });
    c0(s).player.statuses.echo = 1;
    const r = applyAction(s, { type: 'play_card', cardUid: uidOf(s, 'strike'), targetUid: 'en0' });
    expect(enemy(r.state).hp).toBe(88);
    expect(c0(r.state).player.statuses.echo).toBeUndefined();
    expect(r.events.some((e) => e.type === 'card_echoed')).toBe(true);
    const r2 = play(r.state, uidOf(r.state, 'strike'), 'en0');
    expect(enemy(r2).hp).toBe(82);
  });

  it('карта с double_next не тратит своё же Эхо; X-карта удваивает повторы', () => {
    const s = setupCombat(enterCombat(), { hand: ['double', 'x_burst'], energy: 3 });
    let r = play(s, uidOf(s, 'double'));
    expect(c0(r).player.statuses.echo).toBe(1);
    r = play(r, uidOf(r, 'x_burst'), 'en0');
    expect(enemy(r).hp).toBe(100 - 5 * 3 * 2);
  });
});

describe('Барьер', () => {
  it('поглощает удар врага целиком один раз', () => {
    const s = setupCombat(enterCombat(), { hand: [], draw: ['strike'], playerHp: 50 });
    c0(s).player.statuses.barrier = 1;
    const r = applyAction(s, { type: 'end_turn' });
    expect(c0(r.state).player.hp).toBe(50);
    expect(c0(r.state).player.statuses.barrier).toBeUndefined();
    expect(r.events).toContainEqual({ type: 'barrier_absorbed', targetUid: 'player', amount: 5 });
  });

  it('не тратится, если удар целиком съел блок; не защищает от Вируса', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike', 'strike'] });
    enemy(s).statuses.barrier = 1;
    enemy(s).block = 10;
    let r = play(s, uidOf(s, 'strike'), 'en0');
    expect(enemy(r).statuses.barrier).toBe(1);
    expect(enemy(r).hp).toBe(100);
    r = play(r, uidOf(r, 'strike'), 'en0'); // 4 блока + 2 урона — поглощено барьером
    expect(enemy(r).hp).toBe(100);
    expect(enemy(r).statuses.barrier).toBeUndefined();
    enemy(r).statuses.barrier = 1;
    enemy(r).statuses.virus = 3;
    const r2 = endTurn(r);
    expect(enemy(r2).hp).toBe(97);
    expect(enemy(r2).statuses.barrier).toBe(1);
  });
});

describe('Утечка (bleed)', () => {
  it('тикает в начале хода игрока и снимается блоком', () => {
    const s = setupCombat(enterCombat(), { hand: [], draw: ['defend'], playerHp: 50 });
    c0(s).player.statuses.bleed = 3;
    let r = endTurn(s);
    expect(c0(r).player.hp).toBe(50 - 5 - 3);
    expect(c0(r).player.statuses.bleed).toBe(3);
    r = play(r, uidOf(r, 'defend'));
    expect(c0(r).player.statuses.bleed).toBeUndefined();
  });

  it('на враге: тикает перед его ходом, не тает, снимается его защитой', () => {
    const s = setupCombat(enterCombat(), { hand: ['leak'], draw: [] });
    let r = play(s, uidOf(s, 'leak'), 'en0');
    r = endTurn(r); // ход врага: hit
    expect(enemy(r).hp).toBe(96);
    expect(enemy(r).statuses.bleed).toBe(4);
    r = endTurn(r); // ход врага: guard — блок снимает Утечку
    expect(enemy(r).hp).toBe(92);
    expect(enemy(r).statuses.bleed).toBeUndefined();
  });
});

describe('Метка (mark)', () => {
  it('+N урона за каждый удар атакой, N тает в конце хода носителя', () => {
    const s = setupCombat(enterCombat(), { hand: ['strike'], draw: [] });
    enemy(s).statuses.mark = 3;
    let r = play(s, uidOf(s, 'strike'), 'en0');
    expect(enemy(r).hp).toBe(91);
    r = endTurn(r);
    expect(enemy(r).statuses.mark).toBe(2);
  });
});
