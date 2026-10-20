/**
 * Ascension 0..15. Каждый уровень добавляет ровно один модификатор, накопительно.
 */

export const MAX_ASCENSION = 15;

export interface AscensionMods {
  /** Множитель веса элит при генерации карты */
  eliteWeightMult: number;
  normalDamageMult: number;
  eliteDamageMult: number;
  bossDamageMult: number;
  /** Доля недостающего HP, восстанавливаемая после босса */
  actHealPct: number;
  /** Доля maxHp на старте */
  startHpPct: number;
  normalHpMult: number;
  eliteHpMult: number;
  bossHpMult: number;
  curseInDeck: boolean;
  shopPriceMult: number;
  rareCardMult: number;
  restHealPct: number;
  maxHpPenaltyPct: number;
  goldMult: number;
}

const BASE: AscensionMods = {
  eliteWeightMult: 1,
  normalDamageMult: 1,
  eliteDamageMult: 1,
  bossDamageMult: 1,
  actHealPct: 0.75,
  startHpPct: 1,
  normalHpMult: 1,
  eliteHpMult: 1,
  bossHpMult: 1,
  curseInDeck: false,
  shopPriceMult: 1,
  rareCardMult: 1,
  restHealPct: 0.3,
  maxHpPenaltyPct: 0,
  goldMult: 1,
};

interface AscensionLevel {
  level: number;
  description: string;
  apply: (m: AscensionMods) => void;
}

export const ASCENSION_TABLE: readonly AscensionLevel[] = [
  { level: 1, description: 'Элитные файрволы встречаются на карте чаще', apply: (m) => (m.eliteWeightMult = 1.5) },
  { level: 2, description: 'Обычные враги наносят на 10% больше урона', apply: (m) => (m.normalDamageMult = 1.1) },
  { level: 3, description: 'Элитные враги наносят на 10% больше урона', apply: (m) => (m.eliteDamageMult = 1.1) },
  { level: 4, description: 'Боссы наносят на 15% больше урона', apply: (m) => (m.bossDamageMult = 1.15) },
  {
    level: 5,
    description: 'После босса восстанавливается 50% недостающего HP вместо 75%',
    apply: (m) => (m.actHealPct = 0.5),
  },
  { level: 6, description: 'Забег начинается с 90% HP', apply: (m) => (m.startHpPct = 0.9) },
  { level: 7, description: 'У обычных врагов на 10% больше HP', apply: (m) => (m.normalHpMult = 1.1) },
  { level: 8, description: 'У элитных врагов на 10% больше HP', apply: (m) => (m.eliteHpMult = 1.1) },
  { level: 9, description: 'У боссов на 10% больше HP', apply: (m) => (m.bossHpMult = 1.1) },
  {
    level: 10,
    description: 'В стартовой колоде есть карта-проклятие',
    apply: (m) => (m.curseInDeck = true),
  },
  { level: 11, description: 'Цены в магазине выше на 10%', apply: (m) => (m.shopPriceMult = 1.1) },
  { level: 12, description: 'Редкие карты в наградах встречаются вдвое реже', apply: (m) => (m.rareCardMult = 0.5) },
  { level: 13, description: 'Отдых восстанавливает 25% HP вместо 30%', apply: (m) => (m.restHealPct = 0.25) },
  { level: 14, description: 'Максимальное HP меньше на 5%', apply: (m) => (m.maxHpPenaltyPct = 0.05) },
  {
    level: 15,
    description: 'Золота за бои на 20% меньше (и действуют все предыдущие модификаторы)',
    apply: (m) => (m.goldMult = 0.8),
  },
];

import type { Difficulty } from './types';

export const DIFFICULTY_INFO: Record<Difficulty, { name: string; description: string }> = {
  easy: { name: 'Лёгкая', description: 'Враги слабее (HP −20%, урон −15%), отдых и награда за акт щедрее. Для знакомства с игрой.' },
  normal: { name: 'Обычная', description: 'Задуманный баланс.' },
  hard: { name: 'Сложная', description: 'Враги крепче (HP +15%, урон +12%), элит больше, золота меньше на 10%.' },
  zero_day: {
    name: 'Нулевой день',
    description: 'Уязвимость без патча: другие правила, а не просто цифры. Подробности — в карточке режима.',
  },
};

/** Карточка режима для меню: девиз, особенности (+/−) и бонус к счёту. */
export const DIFFICULTY_CARDS: Record<Difficulty, { tagline: string; perks: readonly string[]; traps: readonly string[]; scoreBonus: number }> = {
  easy: { tagline: 'Знакомство с сетью', perks: ['Враги слабее: HP −20%, урон −15%', 'Отдых лечит 40%, после босса — полное HP'], traps: [], scoreBonus: 0 },
  normal: { tagline: 'Задуманный баланс', perks: ['Без поблажек и усилений'], traps: [], scoreBonus: 0 },
  hard: { tagline: 'Файрволы злее', perks: [], traps: ['Враги крепче: HP +15%, урон +12%', 'Больше элит на карте', 'Золота на 10% меньше'], scoreBonus: 0 },
  zero_day: {
    tagline: 'Правила взлома переписаны',
    perks: ['+1 энергия каждый ход', 'Бонусный имплант на старте', 'Золота на 25% больше'],
    traps: ['На 1 карту меньше в руке', 'Намерения обычных врагов скрыты', 'Враги начинают бой с 1 Разгоном', 'В колоде проклятие, старт с 80% HP'],
    scoreBonus: 0.4,
  },
};

/** Режим сложности накладывается на модификаторы Ascension. */
export function applyDifficulty(m: AscensionMods, d: Difficulty | undefined): AscensionMods {
  if (d === 'easy') {
    return {
      ...m,
      normalHpMult: m.normalHpMult * 0.8,
      eliteHpMult: m.eliteHpMult * 0.8,
      bossHpMult: m.bossHpMult * 0.8,
      normalDamageMult: m.normalDamageMult * 0.85,
      eliteDamageMult: m.eliteDamageMult * 0.85,
      bossDamageMult: m.bossDamageMult * 0.85,
      restHealPct: Math.max(m.restHealPct, 0.4),
      actHealPct: 1,
    };
  }
  if (d === 'hard') {
    return {
      ...m,
      normalHpMult: m.normalHpMult * 1.15,
      eliteHpMult: m.eliteHpMult * 1.15,
      bossHpMult: m.bossHpMult * 1.15,
      normalDamageMult: m.normalDamageMult * 1.12,
      eliteDamageMult: m.eliteDamageMult * 1.12,
      bossDamageMult: m.bossDamageMult * 1.12,
      eliteWeightMult: m.eliteWeightMult * 1.25,
      goldMult: m.goldMult * 0.9,
    };
  }
  return m;
}

export function clampAscension(level: number | undefined): number {
  const n = Math.floor(Number(level ?? 0));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_ASCENSION, Math.max(0, n));
}

export function getAscensionMods(level: number): AscensionMods {
  const lvl = clampAscension(level);
  const m: AscensionMods = { ...BASE };
  for (const row of ASCENSION_TABLE) if (row.level <= lvl) row.apply(m);
  return m;
}

/** Таблица для UI: уровень → что добавляет. */
export function getAscensionDescriptions(): { level: number; description: string }[] {
  return ASCENSION_TABLE.map(({ level, description }) => ({ level, description }));
}
