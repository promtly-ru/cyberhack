/**
 * Этап 1 «решения, а не числа»: conditional, per-масштабирование, детонация статусов, хуки power-карт,
 * ключевое слово echo, счётчик атак за ход, tags.
 */
import { describe, expect, it } from 'vitest';
import { resolveCard } from './cards';
import { MAX_HOOK_DEPTH } from './combat';
import { validateContent, type ContentData } from './content';
import { enterCombat, play, setupCombat, useContent } from './__fixtures__/helpers';
import { mechanicsContent } from './__fixtures__/mechanics';
import { applyAction } from './run';
import type { CardDef, Effect, RunState } from './types';

function card(id: string, effects: Effect[], extra: Partial<CardDef> = {}): CardDef {
  return { id, name: id, classId: 'netrunner', type: 'skill', rarity: 'special', cost: 0, target: 'enemy', effects, description: id, ...extra };
}

function content(): ContentData {
  const c = mechanicsContent();
  c.cards.push(
    card('exploit', [{ type: 'conditional', if: { targetHasStatus: 'virus' }, then: [{ type: 'damage', amount: 10 }], else: [{ type: 'damage', amount: 1 }] }], { type: 'attack', tags: ['virus'] }),
    card('desperate', [{ type: 'conditional', if: { hpBelowPct: 50 }, then: [{ type: 'block', amount: 9 }] }], { target: 'none' }),
    card('finisher', [{ type: 'conditional', if: { playedAttacksThisTurnAtLeast: 2 }, then: [{ type: 'damage', amount: 20 }] }], { type: 'attack' }),
    card('viral_strike', [{ type: 'damage', amount: 5, per: { kind: 'target_status', status: 'virus' }, perAmount: 2 }], { type: 'attack' }),
    card('pile_wall', [{ type: 'block', amount: 1, per: { kind: 'discard_size' }, perAmount: 3 }], { target: 'none' }),
    card('combo', [{ type: 'damage', amount: 0, per: { kind: 'attacks_played_this_turn' }, perAmount: 4 }], { type: 'attack' }),
    card('double_virus', [{ type: 'multiply_status', status: 'virus', factor: 2 }]),
    card('detonate', [{ type: 'consume_status', status: 'virus', damageMult: 3 }], { type: 'attack' }),
    card('infect', [{ type: 'apply_status', status: 'virus', amount: 3 }]),
    card('armor_core', [{ type: 'add_hook', hook: { on: 'play_attack', effects: [{ type: 'block', amount: 2 }] } }], { type: 'power', target: 'none' }),
    card('pain_loop', [{ type: 'add_hook', hook: { on: 'take_damage', effects: [{ type: 'lose_hp', amount: 1 }] } }], { type: 'power', target: 'none' }),
    card('spreader', [{ type: 'add_hook', hook: { on: 'apply_status', effects: [{ type: 'apply_status', status: 'virus', amount: 1, target: 'enemy' }] } }], { type: 'power', target: 'none' }),
    card('dawn', [{ type: 'add_hook', hook: { on: 'turn_start', effects: [{ type: 'draw', amount: 1 }] } }], { type: 'power', target: 'none' }),
    card('burn_note', [{ type: 'add_hook', hook: { on: 'exhaust', effects: [{ type: 'block', amount: 3 }] } }], { type: 'power', target: 'none' }),
    card('burner', [{ type: 'damage', amount: 1 }], { type: 'attack', exhaust: true }),
    card('last_shot', [{ type: 'damage', amount: 4 }], { type: 'attack', cost: 1, echo: true, upgrade: { echo: false } }),
    card('late_echo', [{ type: 'damage', amount: 4 }], { type: 'attack', cost: 1, upgrade: { echo: true } }),
  );
  return c;
}

useContent(content);

const c0 = (s: RunState) => s.combat!;
const enemy = (s: RunState, i = 0) => s.combat!.enemies[i]!;
const uidOf = (s: RunState, defId: string, nth = 0) => c0(s).hand.filter((h) => h.defId === defId)[nth]!.uid;
const playId = (s: RunState, defId: string, target: string | undefined = 'en0') => play(s, uidOf(s, defId), target);

describe('conditional', () => {
  it('targetHasStatus: then/else', () => {
    let s = setupCombat(enterCombat(), { hand: ['exploit', 'exploit'] });
    s = playId(s, 'exploit');
    expect(enemy(s).hp).toBe(99);
    enemy(s).statuses.virus = 1;
    s = playId(s, 'exploit');
    expect(enemy(s).hp).toBe(89);
  });

  it('hpBelowPct', () => {
    let s = setupCombat(enterCombat(), { hand: ['desperate'] });
    s = playId(s, 'desperate', undefined);
    expect(c0(s).player.block).toBe(0);
    s = setupCombat(s, { hand: ['desperate'], playerHp: 10 });
    s = playId(s, 'desperate', undefined);
    expect(c0(s).player.block).toBe(9);
  });

  it('playedAttacksThisTurnAtLeast считает атаки до этой карты; счётчик сбрасывается в начале хода', () => {
    let s = setupCombat(enterCombat(), { hand: ['finisher', 'exploit', 'exploit', 'finisher'], energy: 3 });
    s = playId(s, 'finisher'); // 0 атак до неё
    expect(enemy(s).hp).toBe(100);
    s = playId(s, 'exploit');
    s = playId(s, 'exploit');
    expect(c0(s).attacksThisTurn).toBe(3);
    s = playId(s, 'finisher');
    expect(enemy(s).hp).toBe(78);
    s = applyAction(s, { type: 'end_turn' }).state;
    expect(c0(s).attacksThisTurn).toBe(0);
  });
});

describe('per-масштабирование', () => {
  it('damage per target_status', () => {
    let s = setupCombat(enterCombat(), { hand: ['viral_strike'] });
    enemy(s).statuses.virus = 4;
    s = playId(s, 'viral_strike');
    expect(enemy(s).hp).toBe(100 - 13);
  });

  it('block per discard_size', () => {
    let s = setupCombat(enterCombat(), { hand: ['pile_wall'], discard: ['strike', 'defend'] });
    s = playId(s, 'pile_wall', undefined);
    expect(c0(s).player.block).toBe(7);
  });

  it('damage per attacks_played_this_turn', () => {
    let s = setupCombat(enterCombat(), { hand: ['exploit', 'exploit', 'combo'] });
    s = playId(s, 'exploit');
    s = playId(s, 'exploit');
    s = playId(s, 'combo');
    expect(enemy(s).hp).toBe(100 - 2 - 8);
  });
});

describe('детонация статусов', () => {
  it('multiply_status удваивает стаки', () => {
    let s = setupCombat(enterCombat(), { hand: ['double_virus'] });
    enemy(s).statuses.virus = 3;
    s = playId(s, 'double_virus');
    expect(enemy(s).statuses.virus).toBe(6);
  });

  it('consume_status снимает стаки и бьёт через блок', () => {
    let s = setupCombat(enterCombat(), { hand: ['detonate'] });
    enemy(s).statuses.virus = 5;
    enemy(s).block = 4;
    s = playId(s, 'detonate');
    expect(enemy(s).statuses.virus ?? 0).toBe(0);
    expect(enemy(s).block).toBe(0);
    expect(enemy(s).hp).toBe(100 - (15 - 4));
  });
});

describe('хуки power-карт', () => {
  it('play_attack: хук хранится в combat.hooks и срабатывает', () => {
    let s = setupCombat(enterCombat(), { hand: ['armor_core', 'exploit', 'desperate'] });
    s = playId(s, 'armor_core', undefined);
    expect(c0(s).hooks).toHaveLength(1);
    expect(c0(s).discardPile.some((h) => h.defId === 'armor_core')).toBe(false);
    s = playId(s, 'exploit');
    expect(c0(s).player.block).toBe(2);
    s = playId(s, 'desperate', undefined); // skill — не атака
    expect(c0(s).player.block).toBe(2);
  });

  it('take_damage -> lose_hp: рекурсия ограничена глубиной', () => {
    let s = setupCombat(enterCombat(), { hand: ['pain_loop', 'pain_loop'] });
    s = playId(s, 'pain_loop', undefined);
    s = playId(s, 'pain_loop', undefined);
    const hp = c0(s).player.hp;
    c0(s).hand = [];
    s = applyAction(s, { type: 'end_turn' }).state; // враг бьёт
    const lost = hp - c0(s).player.hp;
    let ctrl = setupCombat(enterCombat(), { hand: [] });
    const hp0 = c0(ctrl).player.hp;
    ctrl = applyAction(ctrl, { type: 'end_turn' }).state;
    const hit = hp0 - c0(ctrl).player.hp; // урон врага без хуков
    // 2 хука, каждый уровень удваивает: 2 + 4 + 8 при глубине 3
    let extra = 0;
    for (let d = 1, n = 2; d <= MAX_HOOK_DEPTH; d++, n *= 2) extra += n;
    expect(lost).toBe(hit + extra);
  });

  it('apply_status: хук на наложение статуса (не зацикливается сам на себе)', () => {
    let s = setupCombat(enterCombat(), { hand: ['spreader', 'infect'] });
    s = playId(s, 'spreader', undefined);
    s = playId(s, 'infect');
    expect(enemy(s).statuses.virus).toBe(3 + MAX_HOOK_DEPTH);
  });

  it('turn_start и exhaust', () => {
    let s = setupCombat(enterCombat(), { hand: ['dawn', 'burn_note', 'burner'], draw: ['strike', 'strike', 'strike', 'strike', 'strike', 'strike', 'strike'] });
    s = playId(s, 'dawn', undefined);
    s = playId(s, 'burn_note', undefined);
    s = playId(s, 'burner');
    expect(c0(s).player.block).toBe(3);
    s = applyAction(s, { type: 'end_turn' }).state;
    expect(c0(s).hand).toHaveLength(6);
  });

  it('состояние с хуками сериализуется', () => {
    let s = setupCombat(enterCombat(), { hand: ['armor_core'] });
    s = playId(s, 'armor_core', undefined);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('старое сохранение без hooks/attacksThisTurn работает', () => {
    let s = setupCombat(enterCombat(), { hand: ['combo', 'finisher'] });
    delete c0(s).hooks;
    delete c0(s).attacksThisTurn;
    s = playId(s, 'combo');
    s = playId(s, 'finisher');
    expect(c0(s).attacksThisTurn).toBe(2);
  });
});

describe('ключевое слово echo', () => {
  it('энергия стала 0 — эффекты ещё раз; иначе один раз', () => {
    let s = setupCombat(enterCombat(), { hand: ['last_shot'], energy: 1 });
    s = playId(s, 'last_shot');
    expect(enemy(s).hp).toBe(92);
    s = setupCombat(s, { hand: ['last_shot'], energy: 2 });
    s = playId(s, 'last_shot');
    expect(enemy(s).hp).toBe(96);
  });

  it('upgrade меняет echo; tags читаются', () => {
    expect(resolveCard('last_shot', true).echo).toBe(false);
    expect(resolveCard('late_echo', false).echo).toBe(false);
    expect(resolveCard('late_echo', true).echo).toBe(true);
    expect(resolveCard('exploit', false).def.tags).toEqual(['virus']);
  });
});

describe('валидация новых эффектов', () => {
  it('фикстуры валидны, ошибки ловятся', () => {
    const c = content();
    expect(validateContent(c)).toEqual([]);
    c.cards.push(
      card('bad1', [{ type: 'conditional', if: { targetHasStatus: 'nope' }, then: [{ type: 'boom' } as never] }]),
      card('bad2', [{ type: 'add_hook', hook: { on: 'never' as never, effects: [] } }]),
      card('bad3', [{ type: 'damage', amount: 1, per: { kind: 'self_status', status: 'nope' } }]),
      card('bad4', [{ type: 'consume_status', status: 'virus', damageMult: 'x' as never }]),
    );
    const errs = validateContent(c).join('\n');
    expect(errs).toContain('if.targetHasStatus');
    expect(errs).toContain('then.effects[0]');
    expect(errs).toContain('hook.on');
    expect(errs).toContain('статус per');
    expect(errs).toContain('damageMult');
  });
});
