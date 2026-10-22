import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMetaReward,
  claimMetaAchievement,
  computeAchievementStates,
  META_ACHIEVEMENTS,
  metaRewardCards,
  metaUnlockedContent,
  syncAchievements,
  type MetaExtraState,
} from './achievements';
import { getContent, resetContent } from './content';
import { getFirmware } from './firmware';
import { lockableCards, type MetaProfile } from './unlocks';

beforeEach(() => resetContent());
afterAll(() => resetContent());

const profile = (over: Partial<MetaProfile> = {}): MetaProfile => ({
  unlockedClasses: ['netrunner'],
  unlockedCards: [],
  unlockedRelics: [],
  maxAscension: {} as MetaProfile['maxAscension'],
  achievements: [],
  totalRuns: 0,
  totalWins: 0,
  ...over,
});
const extra = (over: Partial<MetaExtraState> = {}): MetaExtraState => ({
  unlockedFirmwares: [],
  firmwareCollection: {},
  achievements: {},
  currency: 0,
  cosmetics: [],
  ...over,
});

describe('ачивки v2: данные', () => {
  it('40+ ачивок, уникальные id, все тиры и виды наград', () => {
    expect(META_ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(META_ACHIEVEMENTS.map((a) => a.id)).size).toBe(META_ACHIEVEMENTS.length);
    for (const t of ['bronze', 'silver', 'gold']) expect(META_ACHIEVEMENTS.some((a) => a.tier === t), t).toBe(true);
    for (const k of ['card', 'firmware', 'copies', 'currency', 'cosmetic']) expect(META_ACHIEVEMENTS.some((a) => a.reward.kind === k), k).toBe(true);
  });
  it('награды ссылаются на существующее; копии — только на открытые с начала прошивки', () => {
    const cards = getContent().cards;
    for (const a of META_ACHIEVEMENTS) {
      expect(a.goal, a.id).toBeGreaterThan(0);
      expect(a.title && a.desc && a.category, a.id).toBeTruthy();
      const r = a.reward;
      if (r.kind === 'card') expect(cards.has(r.id!), a.id).toBe(true);
      if (r.kind === 'firmware') expect(getFirmware(r.id!)?.unlock, a.id).toBe(a.id);
      if (r.kind === 'copies') {
        expect(getFirmware(r.id!), a.id).toBeDefined();
        expect(getFirmware(r.id!)!.unlock, a.id).toBeUndefined();
        expect(r.amount!, a.id).toBeGreaterThan(0);
      }
      if (r.kind === 'currency') expect(r.amount!, a.id).toBeGreaterThan(0);
      if (r.kind === 'cosmetic') expect(r.id, a.id).toBeTruthy();
    }
  });
  it('карты-награды закрыты до ачивки', () => {
    const locked = lockableCards();
    for (const id of metaRewardCards()) expect(locked, id).toContain(id);
  });
});

describe('ачивки v2: прогресс и выдача', () => {
  it('прогресс из статистики профиля: старые сохранения сразу видят выполненное', () => {
    const p = profile({ totalRuns: 12, lifetime: { enemiesKilled: 30, wins: 1 } });
    const st = new Map(computeAchievementStates(p).map((s) => [s.id, s]));
    expect(st.get('ach_runs_1')).toEqual({ id: 'ach_runs_1', progress: 1, completed: true, claimed: false });
    expect(st.get('ach_runs_2')!.completed).toBe(true);
    expect(st.get('ach_runs_3')).toEqual({ id: 'ach_runs_3', progress: 12, completed: false, claimed: false });
    expect(st.get('ach_kills_1')!.completed).toBe(true);
    expect(st.get('ach_wins_1')!.completed).toBe(true);
  });
  it('completed липкий: сохраняется, даже если метрика стала меньше', () => {
    const { extra: e, newlyCompleted } = syncAchievements(profile({ totalRuns: 1 }), extra());
    expect(newlyCompleted).toContain('ach_runs_1');
    expect(computeAchievementStates(profile(), e).find((s) => s.id === 'ach_runs_1')!.completed).toBe(true);
    expect(syncAchievements(profile({ totalRuns: 1 }), e).newlyCompleted).toEqual([]);
  });
  it('забрать: только выполненную и один раз', () => {
    const p = profile({ totalRuns: 1 });
    expect(claimMetaAchievement(p, extra(), 'ach_runs_3').ok).toBe(false);
    expect(claimMetaAchievement(p, extra(), 'nope').ok).toBe(false);
    const r = claimMetaAchievement(p, extra(), 'ach_runs_1');
    expect(r.ok).toBe(true);
    expect(r.extra.currency).toBe(50);
    expect(r.extra.achievements.ach_runs_1).toEqual({ completed: true, claimed: true });
    const again = claimMetaAchievement(r.profile, r.extra, 'ach_runs_1');
    expect(again.ok).toBe(false);
    expect(again.extra.currency).toBe(50);
  });
  it('награды: карта, прошивка, копии, валюта, косметика', () => {
    const p = profile();
    const e = extra();
    expect(applyMetaReward(p, e, { kind: 'card', id: 'nr_f_singularity' }).profile.unlockedCards).toEqual(['nr_f_singularity']);
    const fw = applyMetaReward(p, e, { kind: 'firmware', id: 'fw_zero_hour' }).extra;
    expect(fw.unlockedFirmwares).toContain('fw_zero_hour');
    expect(fw.firmwareCollection.fw_zero_hour).toEqual({ id: 'fw_zero_hour', level: 1, copies: 0 });
    // Повторная выдача прошивки, которая уже есть, не сбрасывает уровень
    const lv = extra({ firmwareCollection: { fw_zero_hour: { id: 'fw_zero_hour', level: 3, copies: 2 } }, unlockedFirmwares: ['fw_zero_hour'] });
    expect(applyMetaReward(p, lv, { kind: 'firmware', id: 'fw_zero_hour' }).extra.firmwareCollection.fw_zero_hour!.level).toBe(3);
    const cp = applyMetaReward(p, extra({ firmwareCollection: { fw_miner: { id: 'fw_miner', level: 1, copies: 1 } } }), { kind: 'copies', id: 'fw_miner', amount: 2 });
    expect(cp.extra.firmwareCollection.fw_miner!.copies).toBe(3);
    expect(applyMetaReward(p, e, { kind: 'currency', amount: 150 }).extra.currency).toBe(150);
    expect(applyMetaReward(p, e, { kind: 'cosmetic', id: 'frame_boss' }).extra.cosmetics).toEqual(['frame_boss']);
    expect(e).toEqual(extra());
  });
  it('метрики коллекции и забранных наград', () => {
    const e = extra({
      firmwareCollection: {
        fw_bloom: { id: 'fw_bloom', level: 4, copies: 0 },
        fw_stolen_time: { id: 'fw_stolen_time', level: 1, copies: 0 },
        fw_miner: { id: 'fw_miner', level: 2, copies: 0 },
      },
    });
    const st = new Map(computeAchievementStates(profile(), e).map((s) => [s.id, s]));
    expect(st.get('ach_fw_owned_1')!.completed).toBe(true);
    expect(st.get('ach_fw_upgrade_1')!.completed).toBe(true);
    expect(st.get('ach_fw_upgrade_2')!.progress).toBe(4);
    expect(st.get('ach_fw_max')!.completed).toBe(true);
    expect(st.get('ach_fw_legendary')!.completed).toBe(true);
  });
  it('награды выполненных (ещё не забранных) ачивок уже открыты для забега', () => {
    const u = metaUnlockedContent(profile({ lifetime: { wins: 1, winsGhost: 1 } }), extra());
    expect(u.cards).toContain('nr_f_singularity');
    expect(u.firmwares).toContain('fw_vanishing_act');
    expect(u.firmwares).not.toContain('fw_zero_hour');
  });
});
