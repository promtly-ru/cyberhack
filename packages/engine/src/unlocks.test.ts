import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runBot } from './__fixtures__/helpers';
import { getAscensionMods } from './ascension';
import { getContent, resetContent } from './content';
import { weeklyClass, weeklyMutatorIds, weeklyRule, weeklyScoreMult, weeklySeed } from './index';
import { buildCombatRewards, buildShop, rewardCardPool, rollBossRelic, rollRelic } from './rewards';
import { rngOf } from './rng';
import { applyAction, newRun, replay } from './run';
import type { ClassId, NewRunOptions, RunState } from './types';
import {
  ACHIEVEMENTS,
  achievementProgress,
  evaluateRunEnd,
  lockableCards,
  lockableClasses,
  lockableRelics,
  lockedContent,
  type MetaProfile,
} from './unlocks';

beforeEach(() => resetContent());
afterAll(() => resetContent());

function freshProfile(): MetaProfile {
  return {
    unlockedClasses: ['netrunner'],
    unlockedCards: [],
    unlockedRelics: [],
    maxAscension: { netrunner: 0, phreaker: 0, ghost: 0, samurai: 0, engineer: 0, biohacker: 0, droneop: 0, chrono: 0, vabanker: 0 },
    achievements: [],
    totalRuns: 0,
    totalWins: 0,
  };
}

/** Состояние «конца забега» с заданной статистикой. */
function finished(opts: Partial<NewRunOptions> & { status: 'won' | 'lost' }, patch: (s: RunState) => void = () => {}): RunState {
  const s = newRun({ seed: 'end', classId: 'netrunner', ...opts });
  s.status = opts.status;
  s.screen = { kind: 'game_over', victory: opts.status === 'won' };
  patch(s);
  return s;
}

const LOCKED_NONE = { cards: [] as string[], relics: [] as string[] };

describe('каталог разблокировок', () => {
  it('~20 достижений с уникальными id', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('все закрываемые карты/реликвии существуют, не стартовые, около 30% пула', () => {
    const c = getContent();
    const cards = lockableCards();
    const relics = lockableRelics();
    for (const id of cards) expect(['common', 'uncommon', 'rare']).toContain(c.cards.get(id)?.rarity);
    for (const id of relics) expect(c.relics.get(id)?.rarity).not.toBe('starter');
    const cardPool = (['netrunner', 'phreaker', 'ghost', 'neutral'] as const).flatMap((k) => rewardCardPool(k));
    const relicPool = c.data.relics.filter((r) => r.rarity !== 'starter');
    expect(cards.length / cardPool.length).toBeGreaterThan(0.2);
    expect(cards.length / cardPool.length).toBeLessThan(0.4);
    expect(relics.length / relicPool.length).toBeGreaterThan(0.2);
    expect(relics.length / relicPool.length).toBeLessThan(0.4);
    expect(lockableClasses().sort()).toEqual(['biohacker', 'chrono', 'droneop', 'engineer', 'ghost', 'phreaker', 'samurai', 'vabanker']);
  });

  it('lockedContent: открытое исключается из закрытого', () => {
    const all = lockedContent({});
    expect(all.cards).toEqual(lockableCards());
    const some = lockedContent({ cards: [all.cards[0]!], relics: [all.relics[0]!] });
    expect(some.cards).not.toContain(all.cards[0]);
    expect(some.relics).not.toContain(all.relics[0]);
    expect(some.cards.length).toBe(all.cards.length - 1);
    expect(lockedContent({ cards: lockableCards(), relics: lockableRelics() })).toEqual(LOCKED_NONE);
  });
});

describe('фильтрация пулов', () => {
  it('без опции unlocked всё открыто (поле locked отсутствует)', () => {
    const s = newRun({ seed: 'x', classId: 'phreaker' });
    expect(s.locked).toBeUndefined();
    expect(rewardCardPool('phreaker', s).length).toBe(rewardCardPool('phreaker').length);
  });

  it('закрытые карты и реликвии не выпадают в наградах, магазине и сокровищах', () => {
    const lockedCards = new Set(lockableCards());
    const lockedRelics = new Set(lockableRelics());
    const mods = getAscensionMods(0);
    for (const classId of ['netrunner', 'phreaker', 'ghost'] as ClassId[]) {
      const s = newRun({ seed: `pool-${classId}`, classId, unlocked: {} });
      expect(s.locked?.cards.length).toBe(lockedCards.size);
      expect(rewardCardPool(classId, s).some((c) => lockedCards.has(c.id))).toBe(false);
      for (let i = 0; i < 150; i++) {
        for (const item of buildShop(s, rngOf(s, 'shop'), mods)) {
          if (item.kind === 'card') expect(lockedCards.has(item.id!)).toBe(false);
          if (item.kind === 'relic') expect(lockedRelics.has(item.id!)).toBe(false);
        }
        for (const tier of ['normal', 'elite', 'boss'] as const) {
          for (const r of buildCombatRewards(s, tier, mods)) {
            if (r.kind === 'card_choice') for (const id of r.cardIds) expect(lockedCards.has(id)).toBe(false);
            if (r.kind === 'relic') expect(lockedRelics.has(r.relicId)).toBe(false);
          }
        }
        const relic = rollRelic(s, rngOf(s, 'rewards'));
        if (relic) expect(lockedRelics.has(relic)).toBe(false);
        const boss = rollBossRelic(s, rngOf(s, 'rewards'));
        if (boss) expect(lockedRelics.has(boss)).toBe(false);
      }
    }
  });

  it('открытая карта снова попадает в пул', () => {
    const id = 'nr_zero_day';
    const closed = newRun({ seed: 'u', classId: 'netrunner', unlocked: {} });
    const open = newRun({ seed: 'u', classId: 'netrunner', unlocked: { cards: [id] } });
    expect(rewardCardPool('netrunner', closed).some((c) => c.id === id)).toBe(false);
    expect(rewardCardPool('netrunner', open).some((c) => c.id === id)).toBe(true);
  });

  it('в реальном забеге ботом ни один экран не предлагает закрытое', () => {
    const lockedCards = new Set(lockableCards());
    const lockedRelics = new Set(lockableRelics());
    for (let i = 0; i < 15; i++) {
      const opts: NewRunOptions = { seed: `bot-unl-${i}`, classId: 'netrunner', unlocked: {} };
      const { actions } = runBot(opts, 77 + i);
      let s = newRun(opts);
      for (const a of actions) {
        s = applyAction(s, a).state;
        const sc = s.screen;
        if (sc.kind === 'reward') {
          for (const r of sc.items) {
            if (r.kind === 'card_choice') for (const id of r.cardIds) expect(lockedCards.has(id)).toBe(false);
            if (r.kind === 'relic') expect(lockedRelics.has(r.relicId)).toBe(false);
          }
        } else if (sc.kind === 'card_pick') {
          for (const id of sc.cardIds) expect(lockedCards.has(id)).toBe(false);
        } else if (sc.kind === 'shop') {
          for (const it of sc.items) {
            if (it.kind === 'card') expect(lockedCards.has(it.id!)).toBe(false);
            if (it.kind === 'relic') expect(lockedRelics.has(it.id!)).toBe(false);
          }
        }
      }
    }
  });
});

describe('детерминизм с unlocked', () => {
  it('одинаковые опции → одинаковый забег; replay совпадает', () => {
    const opts: NewRunOptions = { seed: 'det-1', classId: 'netrunner', ascension: 3, unlocked: { cards: ['nr_zero_day'] } };
    expect(newRun(opts)).toEqual(newRun(opts));
    const { state, actions } = runBot(opts, 5);
    expect(replay(opts, actions)).toEqual(state);
  });

  it('всё открыто через unlocked ≡ без опции (кроме поля locked)', () => {
    const base: NewRunOptions = { seed: 'det-2', classId: 'netrunner' };
    const { state, actions } = runBot(base, 9);
    const full = replay({ ...base, unlocked: { cards: lockableCards(), relics: lockableRelics() } }, actions);
    expect(full.locked).toEqual(LOCKED_NONE);
    delete full.locked;
    expect(full).toEqual(state);
  });

  it('неделя детерминированно задаёт класс, мутаторы, правило и множитель', () => {
    const seed = weeklySeed(new Date('2026-10-20T12:00:00Z'));
    expect(weeklyClass(seed)).toBe(weeklyClass(seed));
    expect(weeklyMutatorIds(seed)).toEqual(weeklyMutatorIds(seed));
    expect(weeklyRule(seed).id).toBe(weeklyRule(seed).id);
    const ids = getContent().data.classes.map((c) => c.id);
    const classes = new Set<string>();
    const rules = new Set<string>();
    for (let w = 1; w <= 52; w++) {
      const s = `2026-W${String(w).padStart(2, '0')}`;
      const id = weeklyClass(s);
      expect(ids).toContain(id);
      classes.add(id);
      rules.add(weeklyRule(s).id);
      const m = weeklyMutatorIds(s);
      expect(m).toHaveLength(3);
      expect(new Set(m).size).toBe(3);
      const k = weeklyScoreMult(s);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(1.2001);
    }
    expect(classes.size).toBeGreaterThan(1);
    expect(rules.size).toBeGreaterThan(1);
  });
});

describe('evaluateRunEnd', () => {
  it('поражение в 1-м акте: счётчики, первая кровь, без побед', () => {
    const p = freshProfile();
    const snapshot = structuredClone(p);
    const s = finished({ status: 'lost' }, (st) => {
      st.stats.enemiesKilled = 2;
      st.stats.cardsPlayed = 30;
    });
    const r = evaluateRunEnd(p, s);
    expect(p).toEqual(snapshot); // вход не мутируется
    expect(r.profile.totalRuns).toBe(1);
    expect(r.profile.totalWins).toBe(0);
    expect(r.profile.lifetime?.cardsPlayed).toBe(30);
    expect(r.newAchievements).toEqual(['first_blood']);
    expect(r.unlocked.cards).toEqual(['nr_hardening']);
    expect(r.ascensionUnlocked).toBeUndefined();
    expect(r.profile.maxAscension.netrunner).toBe(0);
  });

  it('3 босса открывают Фрикера, 3-й акт Призрака не открывает', () => {
    const s = finished({ status: 'lost' }, (st) => {
      st.act = 3;
      st.stats.enemiesKilled = 10;
      st.stats.bossesKilled = 3;
    });
    const r = evaluateRunEnd(freshProfile(), s);
    expect(r.newAchievements).toEqual(expect.arrayContaining(['first_boss', 'deep_dive']));
    expect(r.unlocked.classes.sort()).toEqual(['phreaker']);
    expect(r.profile.unlockedClasses.sort()).toEqual(['netrunner', 'phreaker']);
  });

  it('победа на максимальном A открывает следующий уровень, на меньшем — нет', () => {
    const p = freshProfile();
    p.maxAscension.netrunner = 4;
    const win4 = evaluateRunEnd(p, finished({ status: 'won', ascension: 4 }));
    expect(win4.ascensionUnlocked).toEqual({ classId: 'netrunner', level: 5 });
    expect(win4.profile.maxAscension.netrunner).toBe(5);
    expect(win4.profile.maxAscension.phreaker).toBe(0);
    expect(win4.newAchievements).toEqual(expect.arrayContaining(['first_win', 'win_netrunner']));
    expect(win4.newAchievements).not.toContain('ascend_5');

    const win2 = evaluateRunEnd(p, finished({ status: 'won', ascension: 2 }));
    expect(win2.ascensionUnlocked).toBeUndefined();
    expect(win2.profile.maxAscension.netrunner).toBe(4);

    const win5 = evaluateRunEnd(win4.profile, finished({ status: 'won', ascension: 5 }));
    expect(win5.newAchievements).toContain('ascend_5');
    expect(win5.unlocked.relics).toContain('r_zero_day_archive');
    expect(win5.profile.maxAscension.netrunner).toBe(6);
  });

  it('рекорды за бой: вирус, удар, карты за ход, золото', () => {
    const s = finished({ status: 'lost', classId: 'phreaker' }, (st) => {
      st.stats.maxVirusInCombat = 260;
      st.stats.maxHit = 85;
      st.stats.maxCardsInTurn = 36;
      st.stats.maxGold = 510;
    });
    const r = evaluateRunEnd(freshProfile(), s);
    expect(r.newAchievements).toEqual(expect.arrayContaining(['virus_100', 'big_hit', 'combo_20', 'rich']));
    expect(r.unlocked.cards).toEqual(expect.arrayContaining(['ph_honeypot', 'ph_backup', 'nr_firewall_bash', 'gh_flurry']));
    expect(r.unlocked.relics).toContain('r_trace_jammer');
  });

  it('накопительные достижения копятся между забегами; повторно не выдаются', () => {
    let p = freshProfile();
    const s = finished({ status: 'lost' }, (st) => {
      st.stats.cardsPlayed = 400;
    });
    const got: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = evaluateRunEnd(p, s);
      got.push(...r.newAchievements);
      p = r.profile;
    }
    expect(p.lifetime?.cardsPlayed).toBe(1200);
    expect(got.filter((a) => a === 'cards_1000')).toHaveLength(1);
    expect(achievementProgress(p, 'cards_1000')).toEqual({ value: 1000, target: 1000, done: true });
    expect(achievementProgress(p, 'veteran')).toEqual({ value: 3, target: 10, done: false });
    const again = evaluateRunEnd(p, finished({ status: 'lost' }));
    expect(again.newAchievements).toEqual([]);
    expect(again.unlocked).toEqual({ classes: [], cards: [], relics: [] });
  });

  it('разблокировки восстанавливаются из уже полученных достижений', () => {
    const p = freshProfile();
    p.achievements = ['first_boss'];
    const r = evaluateRunEnd(p, finished({ status: 'lost' }));
    expect(r.profile.unlockedClasses).toContain('phreaker');
    expect(r.unlocked.cards).toContain('ph_keylogger');
  });

  it('профиль после evaluateRunEnd даёт опции newRun с открытыми картами', () => {
    const r = evaluateRunEnd(freshProfile(), finished({ status: 'won' }));
    const s = newRun({ seed: 'after', classId: 'netrunner', unlocked: { cards: r.profile.unlockedCards, relics: r.profile.unlockedRelics } });
    expect(s.locked?.cards).not.toContain('nr_zero_day');
    expect(s.locked?.relics).not.toContain('r_thread_pool');
    expect(s.locked?.cards).toContain('n_admin_key');
  });
});
