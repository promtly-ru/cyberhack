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
  winsSamurai?: number;
  winsEngineer?: number;
  winsBiohacker?: number;
  winsDroneop?: number;
  winsChrono?: number;
  winsVabanker?: number;
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
    id: 'vet_two',
    name: 'Двойная победа',
    description: 'Победить в двух забегах',
    target: 2,
    value: lt('wins'),
    unlocks: [{ kind: 'class', id: 'samurai' }, card('sm_heavy_strike')],
  },
  {
    id: 'elite_slayer',
    name: 'Охотник на элиту',
    description: 'Уничтожить 8 элитных врагов',
    target: 8,
    value: lt('elitesKilled'),
    unlocks: [{ kind: 'class', id: 'engineer' }, card('en_overcharge')],
  },
  {
    id: 'win_engineer',
    name: 'Несокрушимый',
    description: 'Победить за Инженера',
    target: 1,
    value: lt('winsEngineer'),
    unlocks: [card('en_railgun'), card('en_reactor')],
  },
  {
    id: 'act_four',
    name: 'За гранью сети',
    description: 'Дойти до 4-го акта',
    target: 4,
    value: lt('bestAct'),
    unlocks: [{ kind: 'class', id: 'biohacker' }, card('bh_mutation')],
  },
  {
    id: 'win_biohacker',
    name: 'Эволюция',
    description: 'Победить за Биохакера',
    target: 1,
    value: lt('winsBiohacker'),
    unlocks: [card('bh_plague_doctor'), card('bh_overgrowth')],
  },
  {
    id: 'win_samurai',
    name: 'Путь клинка',
    description: 'Победить за Кибер-самурая',
    target: 1,
    value: lt('winsSamurai'),
    unlocks: [card('sm_hundred_cuts'), card('sm_bushido')],
  },
  {
    id: 'win_netrunner',
    name: 'Нетраннер-легенда',
    description: 'Победить за Нетраннера',
    target: 1,
    value: lt('winsNetrunner'),
    unlocks: [card('nr_zero_day'), card('nr_flood_loop')],
  },
  {
    id: 'win_phreaker',
    name: 'Король фрикинга',
    description: 'Победить за Фрикера',
    target: 1,
    value: lt('winsPhreaker'),
    unlocks: [card('ph_patient_zero'), card('ph_dos')],
  },
  {
    id: 'win_ghost',
    name: 'Нет следов',
    description: 'Победить за Призрака',
    target: 1,
    value: lt('winsGhost'),
    unlocks: [card('gh_ambush'), card('gh_quantum')],
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
    unlocks: [relic('r_singularity_core')],
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
    unlocks: [relic('r_damper'), relic('r_logic_bomb')],
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
    unlocks: [card('ph_honeypot'), card('ph_backup'), card('ph_polymorph')],
  },
  {
    id: 'big_hit',
    name: 'Перегрузка канала',
    description: 'Нанести 50 урона одной атакой',
    target: 50,
    value: lt('bestHit'),
    unlocks: [card('nr_firewall_bash'), card('nr_afterburn'), card('nr_meltdown')],
  },
  {
    id: 'combo_20',
    name: 'Скрипт-кидди',
    description: 'Сыграть 20 карт за один ход',
    target: 20,
    value: lt('bestCardsInTurn'),
    unlocks: [card('gh_flurry'), card('gh_null_storm')],
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
    unlocks: [relic('r_trace_jammer'), relic('r_smart_watch')],
  },
  {
    id: 'collector',
    name: 'Коллекционер',
    description: 'Собрать 15 реликвий за один забег',
    target: 15,
    value: lt('bestRelics'),
    unlocks: [relic('r_signal_booster'), relic('r_debug_port')],
  },
  {
    id: 'upgrader',
    name: 'Патч за патчем',
    description: 'Закончить забег с 8 улучшенными картами в колоде',
    target: 8,
    value: lt('bestUpgraded'),
    unlocks: [card('gh_phase_shift'), relic('r_auto_patcher')],
  },
  {
    id: 'veteran',
    name: 'Ветеран сети',
    description: 'Завершить 10 забегов',
    target: 10,
    value: (p) => p.totalRuns,
    unlocks: [relic('r_med_patch')],
  },
  // ---- Контент v2 ----
  {
    id: 'elites_20',
    name: 'Ледокол',
    description: 'Победить 20 элитных врагов (за все забеги)',
    target: 20,
    value: lt('elitesKilled'),
    unlocks: [card('nr_redline'), relic('r_black_ice_shard')],
  },
  {
    id: 'bosses_10',
    name: 'Гроза файрволов',
    description: 'Победить 10 боссов (за все забеги)',
    target: 10,
    value: lt('bossesKilled'),
    unlocks: [card('ph_mass_mailer'), relic('r_ph_pandemic')],
  },
  {
    id: 'wins_5',
    name: 'Серийный взломщик',
    description: 'Победить в 5 забегах',
    target: 5,
    value: lt('wins'),
    unlocks: [card('n_ram_upgrade'), relic('r_turbo_fan')],
  },
  {
    id: 'damage_50000',
    name: 'Цифровой шторм',
    description: 'Нанести 50 000 урона (за все забеги)',
    target: 50_000,
    value: lt('damageDealt'),
    unlocks: [card('nr_unlimit'), relic('r_nr_multiplexer')],
  },
  {
    id: 'runs_25',
    name: 'Завсегдатай даркнета',
    description: 'Завершить 25 забегов',
    target: 25,
    value: (p) => p.totalRuns,
    unlocks: [card('ph_rootkit'), card('gh_layers'), relic('r_ph_zero_patient'), relic('r_gh_ghost_cache')],
  },
  // ---- Контент v3 ----
  {
    id: 'bosses_6',
    name: 'Укротитель боссов',
    description: 'Победить 6 боссов (за все забеги)',
    target: 6,
    value: lt('bossesKilled'),
    unlocks: [{ kind: 'class', id: 'droneop' }, card('dr_barrage')],
  },
  {
    id: 'win_droneop',
    name: 'Рой без пощады',
    description: 'Победить за Оператора дронов',
    target: 1,
    value: lt('winsDroneop'),
    unlocks: [card('dr_mothership'), card('dr_swarm_protocol')],
  },
  {
    id: 'wins_3',
    name: 'Тройная победа',
    description: 'Победить в трёх забегах',
    target: 3,
    value: lt('wins'),
    unlocks: [{ kind: 'class', id: 'chrono' }, card('ch_quantum_leap')],
  },
  {
    id: 'win_chrono',
    name: 'Время на моей стороне',
    description: 'Победить за Хроно-хакера',
    target: 1,
    value: lt('winsChrono'),
    unlocks: [card('ch_chronostasis'), card('ch_dilation')],
  },
  {
    id: 'wins_7',
    name: 'Везунчик',
    description: 'Победить в семи забегах',
    target: 7,
    value: lt('wins'),
    unlocks: [{ kind: 'class', id: 'vabanker' }, card('vb_double_down')],
  },
  {
    id: 'win_vabanker',
    name: 'Казино всегда в плюсе. Кроме сегодня',
    description: 'Победить за Ва-банкера',
    target: 1,
    value: lt('winsVabanker'),
    unlocks: [card('vb_all_in'), card('vb_jackpot')],
  },
  {
    id: 'kills_500',
    name: 'Чистильщик сети',
    description: 'Уничтожить 500 врагов (за все забеги)',
    target: 500,
    value: lt('enemiesKilled'),
    unlocks: [card('n_system_crash'), relic('r_chain_lightning')],
  },
  {
    id: 'elites_in_run_3',
    name: 'Охотник за головами',
    description: 'Победить 3 элитных врагов за один забег',
    target: 3,
    value: lt('bestElitesInRun'),
    unlocks: [card('n_black_box'), relic('r_dead_mans_switch')],
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
  samurai: 'winsSamurai',
  engineer: 'winsEngineer',
  biohacker: 'winsBiohacker',
  droneop: 'winsDroneop',
  chrono: 'winsChrono',
  vabanker: 'winsVabanker',
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
