import { describe, expect, it } from 'vitest';
import { useContent } from './__fixtures__/helpers';
import * as engine from './index';

useContent();

describe('публичный API', () => {
  it('newRun / getLegalActions / applyAction / replay / describeCard', () => {
    const opts = { seed: 'api', classId: 'netrunner' as const };
    const s = engine.newRun(opts);
    const actions: engine.Action[] = [];
    let cur = s;
    for (let i = 0; i < 30 && cur.status === 'active'; i++) {
      const a = engine.getLegalActions(cur)[0]!;
      actions.push(a);
      cur = engine.applyAction(cur, a).state;
    }
    expect(engine.replay(opts, actions)).toEqual(cur);
    expect(engine.describeCard('strike', true)).toBe('Нанести 9 урона.');
    expect(() => engine.applyAction(s, { type: 'end_turn' })).toThrow(engine.InvalidActionError);
    expect(engine.getAscensionDescriptions()).toHaveLength(engine.MAX_ASCENSION);
    expect(engine.validateContent()).toEqual([]);
    expect(engine.calcAttackDamage(6, null, null)).toBe(6);
    expect(engine.STATUS.virus).toBe('virus');
    expect(engine.SAVE_VERSION).toBe(1);
  });
});
