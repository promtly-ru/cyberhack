import { describe, expect, it } from 'vitest';
import { defaultProfile, hasProgress, mergeProfiles, normalizeProfile } from './profile';
import type { Profile } from './types';

const a: Profile = {
  unlockedClasses: ['netrunner', 'ghost'],
  unlockedCards: ['zap', 'overclock'],
  unlockedRelics: ['chip'],
  maxAscension: { netrunner: 3, phreaker: 0, ghost: 1 },
  achievements: ['first_win'],
  totalRuns: 10,
  totalWins: 2,
};
const b: Profile = {
  unlockedClasses: ['netrunner', 'phreaker'],
  unlockedCards: ['zap', 'firewall'],
  unlockedRelics: [],
  maxAscension: { netrunner: 1, phreaker: 4, ghost: 0 },
  achievements: ['boss_kill'],
  totalRuns: 7,
  totalWins: 5,
};

describe('mergeProfiles', () => {
  it('объединяет разблокировки и берёт максимум по числам', () => {
    expect(mergeProfiles(a, b)).toEqual({
      unlockedClasses: ['netrunner', 'phreaker', 'ghost'],
      unlockedCards: ['firewall', 'overclock', 'zap'],
      unlockedRelics: ['chip'],
      maxAscension: { netrunner: 3, phreaker: 4, ghost: 1 },
      achievements: ['boss_kill', 'first_win'],
      totalRuns: 10,
      totalWins: 5,
    });
  });

  it('коммутативно и идемпотентно', () => {
    expect(mergeProfiles(a, b)).toEqual(mergeProfiles(b, a));
    const m = mergeProfiles(a, b);
    expect(mergeProfiles(m, m)).toEqual(m);
    expect(mergeProfiles(m, a)).toEqual(m);
  });

  it('hasProgress: стартовый профиль — без прогресса', () => {
    expect(hasProgress(defaultProfile())).toBe(false);
    expect(hasProgress(normalizeProfile({}))).toBe(false);
    expect(hasProgress(a)).toBe(true);
    expect(hasProgress({ ...defaultProfile(), totalRuns: 1 })).toBe(true);
  });
});
