import { describe, expect, it } from 'vitest';
import { enterCombat, play, setupCombat, useContent } from './__fixtures__/helpers';
import { fixtureContent } from './__fixtures__/content';
import { chooseMove, type AiContext, type AiMemory } from './ai';
import { getContent, validateContent, type ContentData } from './content';
import { checkSaveCompat } from './index';
import { createRngStore, Rng } from './rng';
import { applyAction, newRun } from './run';
import { SAVE_VERSION, type EnemyDef, type EnemyMove, type RunState } from './types';
import { zoneRuleFor } from './zones';

const move = (id: string, effects: EnemyMove['effects'] = [{ type: 'damage', amount: 1 }]): EnemyMove => ({ id, name: id, intent: 'attack', effects });

const EXTRA: EnemyDef[] = [
  {
    id: 'x_boss',
    name: 'Фазовый босс',
    tier: 'boss',
    act: 1,
    hp: [100, 100],
    moves: [move('a'), move('b'), move('c'), move('roar', [{ type: 'apply_status', status: 'strength', amount: 2, target: 'self' }])],
    ai: { kind: 'phased', phases: [{ hpAtMost: 100, order: ['a', 'b'] }, { hpAtMost: 50, order: ['c'], onEnter: 'roar' }] },
  },
  {
    id: 'x_script',
    name: 'Скриптовый',
    tier: 'normal',
    act: 1,
    hp: [30, 30],
    moves: [move('open'), move('heal', [{ type: 'heal', amount: 5 }]), move('call'), move('punish'), move('hit')],
    ai: {
      kind: 'scripted',
      script: [
        { move: 'open', when: { turn: 1 } },
        { move: 'heal', when: { hpBelow: 30 }, once: true },
        { move: 'call', when: { enemiesAtMost: 1 } },
        { move: 'punish', when: { playerPlayed: 'attack', playerPlayedCount: 2 } },
      ],
      fallback: ['hit'],
    },
  },
  {
    id: 'x_summoner',
    name: 'Призыватель',
    tier: 'normal',
    act: 1,
    hp: [40, 40],
    moves: [{ id: 'call', name: 'Вызов', intent: 'buff', effects: [{ type: 'summon', enemyId: 'a1_firewall', amount: 2, max: 2 }] }],
    ai: { kind: 'cycle', order: ['call'] },
  },
  {
    id: 'x_guardian',
    name: 'Страж',
    tier: 'normal',
    act: 1,
    hp: [40, 40],
    moves: [{ id: 'shield', name: 'Щит', intent: 'defend', effects: [{ type: 'shield_allies', amount: 6 }] }],
    ai: { kind: 'cycle', order: ['shield'] },
  },
];

function content(): ContentData {
  const c = fixtureContent();
  c.enemies.push(...structuredClone(EXTRA));
  return c;
}

useContent(content);

const def = (id: string) => getContent().enemies.get(id)!;
const ctx = (over: Partial<AiContext> = {}): AiContext => ({ hpPct: 100, enemies: 2, played: [], ...over });
const endTurn = (s: RunState) => applyAction(s, { type: 'end_turn' }).state;

describe('ИИ phased', () => {
  it('фазы по порогу HP, ход входа, без отката при лечении', () => {
    const rng = new Rng(createRngStore('ph'), 'ai');
    const mem: AiMemory = {};
    const h: string[] = [];
    const next = (hpPct: number) => {
      const m = chooseMove(def('x_boss'), h, rng, ctx({ hpPct }), mem);
      h.push(m);
      return m;
    };
    expect([next(100), next(90), next(60)]).toEqual(['a', 'b', 'a']);
    expect(next(50)).toBe('roar');
    expect(mem.aiPhase).toBe(1);
    expect([next(40), next(80)]).toEqual(['c', 'c']);
  });

  it('в бою фаза хранится в EnemyState', () => {
    let s = setupCombat(enterCombat(), { enemyDefId: 'x_boss', enemyHp: [100] });
    const e = s.combat!.enemies[0]!;
    e.intent = { kind: 'attack', moveId: 'a' };
    e.aiPhase = 0;
    e.aiPhaseStart = 0;
    e.hp = 40;
    s = endTurn(s);
    expect(s.combat!.enemies[0]!.intent.moveId).toBe('roar');
    expect(s.combat!.enemies[0]!.aiPhase).toBe(1);
  });
});

describe('ИИ scripted', () => {
  const pick = (h: string[], over: Partial<AiContext> = {}) => chooseMove(def('x_script'), h, new Rng(createRngStore('sc'), 'ai'), ctx(over));
  it('условия: ход, HP (один раз), число врагов, карты игрока, fallback', () => {
    expect(pick([])).toBe('open');
    expect(pick(['open'], { hpPct: 20 })).toBe('heal');
    expect(pick(['open', 'heal'], { hpPct: 20 })).toBe('hit');
    expect(pick(['open'], { enemies: 1 })).toBe('call');
    expect(pick(['open'], { played: ['strike', 'strike'] })).toBe('punish');
    expect(pick(['open'], { played: ['strike', 'defend'] })).toBe('hit');
  });

  it('старые cycle/random не изменились', () => {
    const r = new Rng(createRngStore('old'), 'ai');
    expect(chooseMove(def('a1_firewall'), ['hit'], r)).toBe('guard');
    expect(chooseMove(def('a1_scanner'), ['ping', 'ping'], r)).toBe('mark');
  });
});

describe('эффекты врагов', () => {
  it('summon: призыв с лимитом, призванный ходит со следующего раза', () => {
    let s = setupCombat(enterCombat(), { enemyDefId: 'x_summoner', enemyHp: [40] });
    s.combat!.enemies[0]!.intent = { kind: 'buff', moveId: 'call' };
    const hp = s.combat!.player.hp;
    const r = applyAction(s, { type: 'end_turn' });
    s = r.state;
    const es = s.combat!.enemies;
    expect(es).toHaveLength(2);
    expect(es[1]!.defId).toBe('a1_firewall');
    expect(es[1]!.summoned).toBe(true);
    expect(es[1]!.moveHistory).toEqual([]);
    expect(es[1]!.intent.moveId).toBe('hit');
    expect(s.combat!.player.hp).toBe(hp);
    expect(r.events.filter((e) => e.type === 'enemy_summoned')).toHaveLength(1);
    s = endTurn(s);
    expect(s.combat!.enemies.filter((e) => e.hp > 0)).toHaveLength(2);
  });

  it('shield_allies: блок союзникам доживает до хода игрока', () => {
    let s = setupCombat(enterCombat(), { enemyHp: [40, 40] });
    const [g, f] = s.combat!.enemies;
    g!.defId = 'x_guardian';
    g!.intent = { kind: 'defend', moveId: 'shield' };
    f!.intent = { kind: 'defend', moveId: 'guard' };
    s = endTurn(s);
    expect(s.combat!.enemies[1]!.block).toBe(11);
    expect(s.combat!.enemies[0]!.block).toBe(0);
  });

  it('валидация: summon неизвестного врага и эффект врага в карте — ошибки', () => {
    const c = content();
    expect(validateContent(c)).toEqual([]);
    c.enemies.find((e) => e.id === 'x_summoner')!.moves[0]!.effects = [{ type: 'summon', enemyId: 'nope', amount: 1 }];
    c.cards[0]!.effects.push({ type: 'shield_allies', amount: 1 });
    const errs = validateContent(c);
    expect(errs.some((e) => e.includes('nope'))).toBe(true);
    expect(errs.some((e) => e.includes('только для врагов'))).toBe(true);
  });
});

describe('правила зон', () => {
  it('по актам и отключение в опциях', () => {
    expect(([1, 2, 3, 4] as const).map((act) => zoneRuleFor({ act }))).toEqual(['none', 'overheat', 'adaptive', 'distortion']);
    expect(zoneRuleFor({ act: 3, noZoneRules: true })).toBe('none');
    expect(newRun({ seed: 'z', classId: 'netrunner', zoneRules: false }).noZoneRules).toBe(true);
  });

  it('overheat: на 3-м ходу враги +1 Разгон', () => {
    let s = setupCombat(enterCombat(), { enemyHp: [40] });
    s.combat!.zoneRule = 'overheat';
    s.combat!.enemies[0]!.intent = { kind: 'defend', moveId: 'guard' };
    s = endTurn(s);
    expect(s.combat!.enemies[0]!.statuses.strength ?? 0).toBe(0);
    s = endTurn(s);
    expect(s.combat!.turn).toBe(3);
    expect(s.combat!.enemies[0]!.statuses.strength).toBe(1);
  });

  it('adaptive: третья одинаковая атака подряд — половина урона', () => {
    let s = setupCombat(enterCombat(), { hand: ['strike', 'strike', 'strike'], energy: 3, enemyHp: [100] });
    s.combat!.zoneRule = 'adaptive';
    for (let i = 0; i < 3; i++) s = play(s, s.combat!.hand[0]!.uid, 'en0');
    expect(s.combat!.enemies[0]!.hp).toBe(100 - 6 - 6 - 3);
    expect(s.combat!.resist).toEqual({ cardId: 'strike', turn: s.combat!.turn });
  });

  it('adaptive выключен — урон полный', () => {
    let s = setupCombat(enterCombat(), { hand: ['strike', 'strike', 'strike'], energy: 3, enemyHp: [100] });
    for (let i = 0; i < 3; i++) s = play(s, s.combat!.hand[0]!.uid, 'en0');
    expect(s.combat!.enemies[0]!.hp).toBe(82);
  });

  it('distortion: часть намерений обычных врагов скрыта, детерминированно', () => {
    let s = setupCombat(enterCombat(), { enemyHp: [40, 40] });
    s.combat!.zoneRule = 'distortion';
    s = endTurn(s);
    const [a, b] = s.combat!.enemies;
    expect(a!.intent).toMatchObject({ kind: 'unknown', hidden: true });
    expect(b!.intent.hidden).toBeUndefined();
    expect(b!.intent.kind).not.toBe('unknown');
  });
});

describe('сохранения', () => {
  it('старый забег — понятный отказ', () => {
    expect(checkSaveCompat({ version: SAVE_VERSION })).toEqual({ ok: true });
    expect(checkSaveCompat({ version: 1 }).ok).toBe(false);
    expect(checkSaveCompat(null).ok).toBe(false);
  });
});
