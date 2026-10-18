/**
 * Метапрогрессия: достижения и разблокировки (только за игру, не за покупки).
 * На старте закрыты классы phreaker и ghost и ~30% карт/реликвий из наград.
 * Чистые функции: профиль на входе не мутируется.
 */
import { MAX_ASCENSION } from './ascension';
import { getContent } from './content';
import type { ClassId, NewRunOptions, RunState } from './types';

/** Накопительная статистика между забегами: суммы (total*) и рекорды (best*). Слияние — максимум по ключу. */
export interface LifetimeStats {
  cardsPlayed?: number;
  enemiesKilled?: number;
  elitesKilled?: number;
  bossesKilled?: number;
  damageDealt?: number;
  wins?: number;
  winsNetrunner?: number;
  winsPhreaker?: number;
  winsGhost?: number;
  /** Высший уровень Ascension, на котором была победа */
  bestWinAscension?: number;
  bestAct?: number;
  bestVirusInCombat?: number;
  bestHit?: number;
  bestGold?: number;
  bestCardsInTurn?: number;
  bestElitesInRun?: number;
  bestRelics?: number;
  bestUpgraded?: number;
}

/** Структурное подмножество web-профиля (net/types.ts → Profile), которое нужно движку. */
export interface MetaProfile {
  unlockedClasses: ClassId[];
  unlockedCards: string[];
  unlockedRelics: string[];
  maxAscension: Record<ClassId, number>;
  achievements: string[];
  totalRuns: number;
  totalWins: number;
  lifetime?: LifetimeStats;
}

export type Unlock = { kind: 'class'; id: ClassId } | { kind: 'card'; id: string } | { kind: 'relic'; id: string };

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Порог: достижение получено, когда value(profile) >= target */
  target: number;
  value: (p: MetaProfile) => number;
  unlocks: Unlock[];
}

/** Классы, открытые с первого запуска. */
export const STARTING_CLASSES: readonly ClassId[] = ['netrunner'];

const lt = (key: keyof LifetimeStats) => (p: MetaProfile) => p.lifetime?.[key] ?? 0;
const card = (id: string): Unlock => ({ kind: 'card', id });
const relic = (id: string): Unlock => ({ kind: 'relic', id });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first_blood',
    name: 'Первая кровь',
    description: 'Уничтожить первого врага',
    target: 1,
    value: lt('enemiesKilled'),
    unlocks: [card('nr_hardening')],
  },
  {
    id: 'first_boss',
    name: 'Главный файрвол',
    description: 'Победить первого босса',
    target: 1,
    value: lt('bossesKilled'),
    unlocks: [{ kind: 'class', id: 'phreaker' }, card('ph_keylogger')],
  },
  {
    id: 'deep_dive',
    name: 'Глубокое погружение',
    description: 'Дойти до 3-го акта',
    target: 3,
    value: lt('bestAct'),
    unlocks: [{ kind: 'class', id: 'ghost' }, card('gh_flood')],
  },
  {
    id: 'first_win',
    name: 'Система взломана',
    description: 'Победить в забеге',
    target: 1,
    value: lt('wins'),
    unlocks: [relic('r_thread_pool')],
  },
  {
    id: 'win_netrunner',
    name: 'Нетраннер-легенда',
    description: 'Победить за Нетраннера',
    target: 1,
    value: lt('winsNetrunner'),
    unlocks: [card('nr_zero_day')],
  },
  {
    id: 'win_phreaker',
    name: 'Король фрикинга',
    description: 'Победить за Фрикера',
    target: 1,
    value: lt('winsPhreaker'),
    unlocks: [card('ph_patient_zero')],
  },
  {
    id: 'win_ghost',
    name: 'Нет следов',
    description: 'Победить за Призрака',
    target: 1,
    value: lt('winsGhost'),
    unlocks: [card('gh_ambush')],
  },
  {
    id: 'ascend_5',
    name: 'Восхождение',
    description: 'Победить на Ascension 5 или выше',
    target: 5,
    value: (p) => ((p.lifetime?.wins ?? 0) > 0 ? (p.lifetime?.bestWinAscension ?? 0) : 0),
    unlocks: [relic('r_zero_day_archive')],
  },
  {
    id: 'ascend_10',
    name: 'Чёрный лёд',
    description: 'Победить на Ascension 10 или выше',
    target: 10,
    value: (p) => ((p.lifetime?.wins ?? 0) > 0 ? (p.lifetime?.bestWinAscension ?? 0) : 0),
    unlocks: [card('n_admin_key')],
  },
  {
    id: 'ascend_15',
    name: 'Абсолютный root',
    description: `Победить на Ascension ${MAX_ASCENSION}`,
    target: MAX_ASCENSION,
    value: (p) => ((p.lifetime?.wins ?? 0) > 0 ? (p.lifetime?.bestWinAscension ?? 0) : 0),
    unlocks: [],
  },
  {
    id: 'cards_1000',
    name: 'Тысяча программ',
    description: 'Сыграть 1000 карт (за все забеги)',
    target: 1000,
    value: lt('cardsPlayed'),
    unlocks: [card('n_mass_scan')],
  },
  {
    id: 'kills_100',
    name: 'Сборщик мусора',
    description: 'Уничтожить 100 врагов (за все забеги)',
    target: 100,
    value: lt('enemiesKilled'),
    unlocks: [relic('r_damper')],
  },
  {
    id: 'damage_10000',
    name: 'DDoS-атака',
    description: 'Нанести 10 000 урона (за все забеги)',
    target: 10_000,
    value: lt('damageDealt'),
    unlocks: [relic('r_static_mesh')],
  },
  {
    id: 'virus_100',
    name: 'Пандемия',
    description: 'Наложить 100 вируса на врагов за один бой',
    target: 100,
    value: lt('bestVirusInCombat'),
    unlocks: [card('ph_honeypot'), card('ph_backup')],
  },
  {
    id: 'big_hit',
    name: 'Перегрузка канала',
    description: 'Нанести 50 урона одной атакой',
    target: 50,
    value: lt('bestHit'),
    unlocks: [card('nr_firewall_bash'), card('nr_afterburn')],
  },
  {
    id: 'combo_20',
    name: 'Скрипт-кидди',
    description: 'Сыграть 20 карт за один ход',
    target: 20,
    value: lt('bestCardsInTurn'),
    unlocks: [card('gh_flurry')],
  },
  {
    id: 'elite_hunter',
    name: 'Охотник на стражей',
    description: 'Победить 4 элитных врагов за один забег',
    target: 4,
    value: lt('bestElitesInRun'),
    unlocks: [card('gh_phantom_swarm')],
  },
  {
    id: 'rich',
    name: 'Криптокошелёк',
    description: 'Накопить 500 золота одновременно',
    target: 500,
    value: lt('bestGold'),
    unlocks: [relic('r_trace_jammer')],
  },
  {
    id: 'collector',
    name: 'Коллекционер',
    description: 'Собрать 15 реликвий за один забег',
    target: 15,
    value: lt('bestRelics'),
    unlocks: [relic('r_signal_booster')],
  },
  {
    id: 'upgrader',
    name: 'Патч за патчем',
    description: 'Закончить забег с 8 улучшенными картами в колоде',
    target: 8,
    value: lt('bestUpgraded'),
    unlocks: [],
  },
  {
    id: 'veteran',
    name: 'Ветеран сети',
    description: 'Завершить 10 забегов',
    target: 10,
    value: (p) => p.totalRuns,
    unlocks: [relic('r_med_patch')],
  },
];

const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievement(id: string): AchievementDef | undefined {
  return ACH_BY_ID.get(id);
}

function lockableIds(kind: 'card' | 'relic'): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) for (const u of a.unlocks) if (u.kind === kind && !out.includes(u.id)) out.push(u.id);
  return out;
}

/** Все карты, которые закрыты до получения достижения (только существующие в текущем контенте). */
export function lockableCards(): string[] {
  const cards = getContent().cards;
  return lockableIds('card').filter((id) => cards.has(id));
}

export function lockableRelics(): string[] {
  const relics = getContent().relics;
  return lockableIds('relic').filter((id) => relics.has(id));
}

export function lockableClasses(): ClassId[] {
  const out: ClassId[] = [];
  for (const a of ACHIEVEMENTS) for (const u of a.unlocks) if (u.kind === 'class' && !out.includes(u.id)) out.push(u.id);
  return out;
}

/** Закрытое содержимое для забега по списку открытого игроком. */
export function lockedContent(unlocked: NonNullable<NewRunOptions['unlocked']>): { cards: string[]; relics: string[] } {
  const cards = new Set(unlocked.cards ?? []);
  const relics = new Set(unlocked.relics ?? []);
  return {
    cards: lockableCards().filter((id) => !cards.has(id)),
    relics: lockableRelics().filter((id) => !relics.has(id)),
  };
}

/** Какое достижение открывает этот элемент (для подписи «как открыть»). */
export function unlockSource(kind: Unlock['kind'], id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.unlocks.some((u) => u.kind === kind && u.id === id));
}

/** Прогресс по достижению: текущее значение (не больше цели), цель, получено ли. */
export function achievementProgress(p: MetaProfile, id: string): { value: number; target: number; done: boolean } {
  const a = ACH_BY_ID.get(id);
  if (!a) return { value: 0, target: 1, done: false };
  const done = p.achievements.includes(id) || a.value(p) >= a.target;
  return { value: done ? a.target : Math.min(a.target, Math.max(0, Math.floor(a.value(p)))), target: a.target, done };
}

/** Опции newRun с учётом профиля: открытые карты/реликвии. */
export function unlockedOptions(p: Pick<MetaProfile, 'unlockedCards' | 'unlockedRelics'>): NonNullable<NewRunOptions['unlocked']> {
  return { cards: [...p.unlockedCards], relics: [...p.unlockedRelics] };
}

export interface RunEndResult {
  /** id достижений, полученных этим забегом */
  newAchievements: string[];
  /** Что открылось впервые */
  unlocked: { classes: ClassId[]; cards: string[]; relics: string[] };
  /** Новый открытый уровень Ascension для класса забега (если вырос) */
  ascensionUnlocked?: { classId: ClassId; level: number };
  /** Обновлённый профиль: счётчики, рекорды, достижения, разблокировки, maxAscension */
  profile: MetaProfile;
}

const WIN_KEY: Record<ClassId, keyof LifetimeStats> = {
  netrunner: 'winsNetrunner',
  phreaker: 'winsPhreaker',
  ghost: 'winsGhost',
};

function mergeRunIntoLifetime(prev: LifetimeStats | undefined, s: RunState, victory: boolean): LifetimeStats {
  const l: LifetimeStats = { ...(prev ?? {}) };
  const add = (k: keyof LifetimeStats, v: number) => {
    if (v > 0) l[k] = (l[k] ?? 0) + v;
  };
  const best = (k: keyof LifetimeStats, v: number) => {
    if (v > (l[k] ?? 0)) l[k] = v;
  };
  const st = s.stats;
  add('cardsPlayed', st.cardsPlayed);
  add('enemiesKilled', st.enemiesKilled);
  add('elitesKilled', st.elitesKilled);
  add('bossesKilled', st.bossesKilled);
  add('damageDealt', st.damageDealt);
  if (victory) {
    add('wins', 1);
    add(WIN_KEY[s.classId], 1);
    if ((l.wins ?? 0) === 1 && l.bestWinAscension === undefined) l.bestWinAscension = s.ascension;
    else best('bestWinAscension', s.ascension);
  }
  best('bestAct', s.act);
  best('bestVirusInCombat', st.maxVirusInCombat ?? 0);
  best('bestHit', st.maxHit ?? 0);
  best('bestGold', Math.max(st.maxGold ?? 0, s.gold));
  best('bestCardsInTurn', st.maxCardsInTurn ?? 0);
  best('bestElitesInRun', st.elitesKilled);
  best('bestRelics', s.relics.length);
  best('bestUpgraded', s.deck.filter((c) => c.upgraded).length);
  return l;
}

/**
 * Итоги забега для метапрогрессии. finalState — состояние в конце (won/lost; active = брошенный забег,
 * засчитывается как поражение). Профиль не мутируется.
 */
export function evaluateRunEnd(profile: MetaProfile, finalState: RunState): RunEndResult {
  const s = finalState;
  const victory = s.status === 'won';
  const next: MetaProfile = {
    ...profile,
    unlockedClasses: [...profile.unlockedClasses],
    unlockedCards: [...profile.unlockedCards],
    unlockedRelics: [...profile.unlockedRelics],
    maxAscension: { ...profile.maxAscension },
    achievements: [...profile.achievements],
    totalRuns: profile.totalRuns + 1,
    totalWins: profile.totalWins + (victory ? 1 : 0),
    lifetime: mergeRunIntoLifetime(profile.lifetime, s, victory),
  };
  for (const c of STARTING_CLASSES) if (!next.unlockedClasses.includes(c)) next.unlockedClasses.push(c);

  let ascensionUnlocked: RunEndResult['ascensionUnlocked'];
  const curMax = next.maxAscension[s.classId] ?? 0;
  if (victory && s.ascension >= curMax && curMax < MAX_ASCENSION) {
    const level = Math.min(MAX_ASCENSION, s.ascension + 1);
    next.maxAscension[s.classId] = level;
    ascensionUnlocked = { classId: s.classId, level };
  }

  const newAchievements: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (next.achievements.includes(a.id)) continue;
    if (a.value(next) >= a.target) {
      next.achievements.push(a.id);
      newAchievements.push(a.id);
    }
  }

  // Разблокировки выводятся из всех полученных достижений (самовосстановление старых профилей).
  const unlocked: RunEndResult['unlocked'] = { classes: [], cards: [], relics: [] };
  for (const id of next.achievements) {
    const a = ACH_BY_ID.get(id);
    if (!a) continue;
    for (const u of a.unlocks) {
      if (u.kind === 'class' && !next.unlockedClasses.includes(u.id)) {
        next.unlockedClasses.push(u.id);
        unlocked.classes.push(u.id);
      } else if (u.kind === 'card' && !next.unlockedCards.includes(u.id)) {
        next.unlockedCards.push(u.id);
        unlocked.cards.push(u.id);
      } else if (u.kind === 'relic' && !next.unlockedRelics.includes(u.id)) {
        next.unlockedRelics.push(u.id);
        unlocked.relics.push(u.id);
      }
    }
  }

  return { newAchievements, unlocked, ...(ascensionUnlocked ? { ascensionUnlocked } : {}), profile: next };
}
