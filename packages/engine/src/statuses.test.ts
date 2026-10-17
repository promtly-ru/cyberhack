import { describe, expect, it } from 'vitest';
import { addStatus, calcAttackDamage, calcBlock, getStatus } from './statuses';
import type { CombatantState } from './types';

const unit = (statuses: Record<string, number> = {}): CombatantState => ({ hp: 50, maxHp: 50, block: 0, statuses });

describe('формулы статусов', () => {
  it('базовый урон без статусов', () => {
    expect(calcAttackDamage(6, unit(), unit())).toBe(6);
  });

  it('strength + vulnerable + weak, округление вниз', () => {
    // (6 + 2) * 0.75 * 1.5 = 9
    expect(calcAttackDamage(6, unit({ strength: 2, weak: 1 }), unit({ vulnerable: 1 }))).toBe(9);
    // (7) * 0.75 * 1.5 = 7.875 → 7
    expect(calcAttackDamage(7, unit({ weak: 2 }), unit({ vulnerable: 3 }))).toBe(7);
    // vulnerable: 5 * 1.5 = 7.5 → 7
    expect(calcAttackDamage(5, unit(), unit({ vulnerable: 1 }))).toBe(7);
    // weak: 5 * 0.75 = 3.75 → 3
    expect(calcAttackDamage(5, unit({ weak: 1 }), unit())).toBe(3);
    // strength: 6 + 3
    expect(calcAttackDamage(6, unit({ strength: 3 }), unit())).toBe(9);
  });

  it('отрицательная сила, минимум 0, сырой урон', () => {
    expect(calcAttackDamage(6, unit({ strength: -2 }), unit())).toBe(4);
    expect(calcAttackDamage(3, unit({ strength: -10 }), unit({ vulnerable: 1 }))).toBe(0);
    expect(calcAttackDamage(4, null, null)).toBe(4);
    expect(calcAttackDamage(4, null, unit({ vulnerable: 1 }))).toBe(6);
  });

  it('блок: dexterity и frail', () => {
    expect(calcBlock(5, unit())).toBe(5);
    expect(calcBlock(5, unit({ dexterity: 2 }))).toBe(7);
    expect(calcBlock(5, unit({ frail: 1 }))).toBe(3); // 3.75 → 3
    expect(calcBlock(5, unit({ dexterity: 3, frail: 1 }))).toBe(6);
    expect(calcBlock(2, unit({ dexterity: -5 }))).toBe(0);
  });

  it('addStatus удаляет ключ при нуле', () => {
    const u = unit();
    expect(addStatus(u, 'strength', 2)).toBe(2);
    expect(addStatus(u, 'strength', -2)).toBe(0);
    expect('strength' in u.statuses).toBe(false);
    addStatus(u, 'strength', -1);
    expect(getStatus(u, 'strength')).toBe(-1);
  });
});
