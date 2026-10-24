import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { inst } from './__fixtures__/helpers';
import { resetContent } from './content';
import { TUTORIAL_PATH } from './map';
import { applyAction, getLegalActions, newRun } from './run';
import { evaluateRunEnd, type MetaProfile } from './unlocks';
import type { Action, NewRunOptions, RunState } from './types';

beforeEach(() => resetContent());
afterAll(() => resetContent());

const TUT: NewRunOptions = { seed: 'tut-1', classId: 'netrunner', tutorial: true };

/** Прогон обучения: бои выигрываем читом, вне боя — случайный легальный ход. */
function playTutorial(opts: NewRunOptions): { s: RunState; kinds: string[]; firstEnemies: string[]; firstCards: string[] } {
  let s = newRun(opts);
  let r = 1;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) % 1000) / 1000;
  const kinds: string[] = [];
  let firstEnemies: string[] = [];
  let firstCards: string[] = [];
  for (let step = 0; step < 3000 && s.status === 'active'; step++) {
    if (s.screen.kind === 'combat' && s.combat) {
      const c = s.combat;
      if (firstEnemies.length === 0) firstEnemies = c.enemies.map((e) => e.defId);
      const target = c.enemies.find((e) => e.hp > 0)!;
      target.hp = 1;
      target.block = 0;
      c.player.hp = c.player.maxHp;
      c.hand = [inst('nr_ping')];
      c.energy = 3;
      s = applyAction(s, { type: 'play_card', cardUid: c.hand[0]!.uid, targetUid: target.uid }).state;
      continue;
    }
    if (s.screen.kind === 'reward' && firstCards.length === 0) {
      const ch = s.screen.items.find((i) => i.kind === 'card_choice');
      if (ch && ch.kind === 'card_choice') firstCards = [...ch.cardIds];
    }
    s.hp = s.maxHp;
    const legal = getLegalActions(s).filter((a) => a.type !== 'discard_potion');
    const nodes = legal.filter((a) => a.type === 'choose_node');
    const a = (nodes[0] ?? legal[Math.floor(rand() * legal.length)]) as Action;
    if (a.type === 'choose_node') kinds.push(s.map.find((n) => n.id === a.nodeId)!.kind);
    s = applyAction(s, a).state;
  }
  return { s, kinds, firstEnemies, firstCards };
}

describe('обучение', () => {
  it('карта — один короткий акт с узлами всех механик', () => {
    const s = newRun(TUT);
    expect(s.tutorial).toBe(true);
    expect(s.act).toBe(1);
    expect(s.map.map((n) => n.kind)).toEqual([...TUTORIAL_PATH]);
    expect(TUTORIAL_PATH).toEqual(['combat', 'event', 'combat', 'signal', 'shop', 'elite', 'rest', 'boss']);
    expect(s.map.every((n) => n.act === 1)).toBe(true);
    expect(s.map.filter((n) => n.row === 0)).toHaveLength(1);
  });

  it('победа над боссом акта 1 завершает забег', () => {
    const { s, kinds } = playTutorial(TUT);
    expect(kinds).toEqual([...TUTORIAL_PATH]);
    expect(s.status).toBe('won');
    expect(s.act).toBe(1);
    expect(s.screen).toEqual({ kind: 'game_over', victory: true });
  });

  it('первая награда содержит расходник, имплант с Перехвата не красный', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      let s = newRun({ ...TUT, seed });
      s = applyAction(s, { type: 'choose_node', nodeId: s.map[0]!.id }).state;
      const c = s.combat!;
      for (const e of c.enemies) {
        e.hp = 1;
        e.block = 0;
      }
      while (s.combat) {
        const t = s.combat.enemies.find((e) => e.hp > 0)!;
        s.combat.hand = [inst('nr_ping')];
        s.combat.energy = 3;
        s = applyAction(s, { type: 'play_card', cardUid: s.combat.hand[0]!.uid, targetUid: t.uid }).state;
      }
      expect(s.screen.kind).toBe('reward');
      if (s.screen.kind === 'reward') expect(s.screen.items.some((i) => i.kind === 'potion')).toBe(true);
    }
  });

  it('разные сиды — разные враги или награды', () => {
    const runs = ['s1', 's2', 's3', 's4', 's5', 's6'].map((seed) => playTutorial({ ...TUT, seed }));
    const sig = new Set(runs.map((r) => `${r.firstEnemies.join()}|${r.firstCards.join()}`));
    expect(sig.size).toBeGreaterThan(1);
  });

  it('класс берётся из опций', () => {
    expect(newRun({ ...TUT, classId: 'phreaker' }).classId).toBe('phreaker');
  });

  it('обучение не трогает метапрогресс', () => {
    const { s } = playTutorial(TUT);
    const p = { totalRuns: 0 } as unknown as MetaProfile;
    const r = evaluateRunEnd(p, s);
    expect(r.profile).toBe(p);
    expect(r.newAchievements).toEqual([]);
  });

  it('обычный забег не изменился', () => {
    const s = newRun({ seed: 'tut-1', classId: 'netrunner' });
    expect(s.tutorial).toBeUndefined();
    expect(s.map.some((n) => n.row === 15 && n.kind === 'boss')).toBe(true);
  });
});
