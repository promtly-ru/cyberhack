/**
 * Мутаторы забега — добровольные испытания, выбираются при старте (NewRunOptions.mutators).
 * Часть правил ложится на AscensionMods (как режимы сложности), остальное — MutatorMods,
 * которые читают бой и награды. В еженедельном вызове мутаторы и правило недели задаются неделей (weekly.ts).
 */
import type { AscensionMods } from './ascension';

export interface MutatorDef {
  id: string;
  name: string;
  description: string;
  /** Бонус к счёту забега (доля: 0.1 = +10%) */
  scoreBonus: number;
  /** Характер: risk — чистое усложнение, mixed — обмен плюсов на минусы */
  tag?: 'risk' | 'mixed';
}

export interface MutatorMods {
  /** Добавка к энергии каждый ход */
  bonusEnergy: number;
  /** Намерения обычных (не элитных и не боссов) врагов скрыты */
  hideNormalIntents: boolean;
  /** Множитель урона атак игрока */
  playerDamageMult: number;
  /** Статусы игрока в начале каждого боя */
  playerCombatStatuses: Record<string, number>;
  /** Статусы каждого врага в начале боя */
  enemyCombatStatuses: Record<string, number>;
  /** Дополнительные карты в выборе награды */
  extraCardChoices: number;
  /** Добавка к шансу расходника в награде */
  potionChanceBonus: number;
  /** В начале каждого хода — минимум 1 Эхо */
  turnEcho: boolean;
  /** Добавка к добору карт каждый ход */
  bonusDraw: number;
  /** В начале забега выдаётся дополнительный случайный реликт */
  bonusStartRelic: boolean;
  /** «Охота за головой»: каждый бой один враг помечен */
  bounty: boolean;
  /** «Нестабильный код»: каждый ход одна карта в руке срабатывает дважды и сгорает */
  volatileCard: boolean;
}

interface MutatorSpec extends MutatorDef {
  mods?: (m: AscensionMods) => void;
  extra?: (x: MutatorMods) => void;
}

const SPECS: readonly MutatorSpec[] = [
  {
    id: 'fog',
    name: 'Туман войны',
    description: 'Намерения обычных врагов скрыты — видно только, что они что-то готовят. Элиты и боссы читаются как обычно.',
    scoreBonus: 0.1,
    tag: 'risk',
    extra: (x) => (x.hideNormalIntents = true),
  },
  {
    id: 'poverty',
    name: 'Бедность',
    description: 'Цены на чёрном рынке ×1.5, золота за бои на 25% меньше. Зато +1 энергия каждый ход.',
    scoreBonus: 0,
    mods: (m) => {
      m.shopPriceMult *= 1.5;
      m.goldMult *= 0.75;
    },
    extra: (x) => (x.bonusEnergy += 1),
  },
  {
    id: 'glass_cannon',
    name: 'Стеклянная пушка',
    description: 'Все атаки — и твои, и вражеские — наносят в 1.5 раза больше урона.',
    scoreBonus: 0.1,
    mods: (m) => {
      m.normalDamageMult *= 1.5;
      m.eliteDamageMult *= 1.5;
      m.bossDamageMult *= 1.5;
    },
    extra: (x) => (x.playerDamageMult *= 1.5),
  },
  {
    id: 'plague',
    name: 'Чумной сервер',
    description: 'Каждый бой ты начинаешь с 3 Вируса.',
    scoreBonus: 0.1,
    tag: 'risk',
    extra: (x) => (x.playerCombatStatuses.virus = (x.playerCombatStatuses.virus ?? 0) + 3),
  },
  {
    id: 'armored',
    name: 'Бронированная сеть',
    description: 'Каждый враг начинает бой с 2 Барьера. Взамен в награде на 1 карту больше в выборе и расходники падают чаще.',
    scoreBonus: 0.1,
    tag: 'mixed',
    extra: (x) => {
      x.enemyCombatStatuses.barrier = (x.enemyCombatStatuses.barrier ?? 0) + 2;
      x.extraCardChoices += 1;
      x.potionChanceBonus += 0.3;
    },
  },
  {
    id: 'storm',
    name: 'Информационный шторм',
    description: '+2 карты в руке каждый ход, но обычные враги и элиты бьют на 25% сильнее.',
    scoreBonus: 0.1,
    tag: 'mixed',
    mods: (m) => {
      m.normalDamageMult *= 1.25;
      m.eliteDamageMult *= 1.25;
    },
    extra: (x) => (x.bonusDraw += 2),
  },
  {
    id: 'rare_hunt',
    name: 'Охота за редкостью',
    description: 'Редкие карты в наградах выпадают вдвое чаще, но максимум HP на 15% меньше.',
    scoreBonus: 0.05,
    tag: 'mixed',
    mods: (m) => {
      m.rareCardMult *= 2;
      m.maxHpPenaltyPct = Math.min(0.9, m.maxHpPenaltyPct + 0.15);
    },
  },
  {
    id: 'elite_hunt',
    name: 'Охота на элиту',
    description: 'Элитных стражей на карте вдвое больше, и они на 10% крепче.',
    scoreBonus: 0.15,
    tag: 'risk',
    mods: (m) => {
      m.eliteWeightMult *= 2;
      m.eliteHpMult *= 1.1;
    },
  },
  {
    id: 'echo_chamber',
    name: 'Эхо-камера',
    description: 'Первая карта каждого хода срабатывает дважды (Эхо), но враги начинают бой с 2 Разгона.',
    scoreBonus: 0.05,
    extra: (x) => {
      x.turnEcho = true;
      x.enemyCombatStatuses.strength = (x.enemyCombatStatuses.strength ?? 0) + 2;
    },
  },
  {
    id: 'fragile',
    name: 'Хрупкий носитель',
    description: 'Максимум HP на 30% меньше, зато каждый бой начинается с 1 Барьером.',
    scoreBonus: 0.15,
    mods: (m) => (m.maxHpPenaltyPct = Math.min(0.9, m.maxHpPenaltyPct + 0.3)),
    extra: (x) => (x.playerCombatStatuses.barrier = (x.playerCombatStatuses.barrier ?? 0) + 1),
  },
];

/**
 * Правила недели (только для еженедельного вызова): id 'wk_*', не входят в MUTATORS и normalizeMutators.
 * Ложатся на те же AscensionMods/MutatorMods, что и обычные мутаторы.
 */
export const WEEKLY_RULES: readonly MutatorSpec[] = [
  {
    id: 'wk_bounty',
    name: 'Охота за головой',
    description: 'В каждом бою один враг помечен. Убей его до 3-го хода — получишь 8 HP и 20 золота. Не успеешь — он уйдёт в тень и получит 2 Разгона.',
    scoreBonus: 0.1,
    extra: (x) => (x.bounty = true),
  },
  {
    id: 'wk_volatile',
    name: 'Нестабильный код',
    description: 'Каждый ход одна случайная карта в руке нестабильна: срабатывает дважды, но сгорает после розыгрыша. Выбирай, когда её тратить.',
    scoreBonus: 0.1,
    extra: (x) => (x.volatileCard = true),
  },
  {
    id: 'wk_cursed_gift',
    name: 'Проклятый дар',
    description: 'Забег начинается с проклятием в колоде, но с бонусным реликтом.',
    scoreBonus: 0.1,
    mods: (m) => (m.curseInDeck = true),
    extra: (x) => (x.bonusStartRelic = true),
  },
  {
    id: 'wk_sprint',
    name: 'Перегруз канала',
    description: 'На 1 энергию меньше каждый ход, зато на 1 карту больше в руке.',
    scoreBonus: 0.1,
    extra: (x) => {
      x.bonusEnergy -= 1;
      x.bonusDraw += 1;
    },
  },
  {
    id: 'wk_elites_only',
    name: 'Зона элит',
    description: 'Путь кишит элитными стражами: их на карте в разы больше.',
    scoreBonus: 0.2,
    mods: (m) => (m.eliteWeightMult *= 6),
  },
  {
    id: 'wk_gold_rush',
    name: 'Золотая лихорадка',
    description: 'Золота за бои вдвое больше, но чёрный рынок просит вдвое дороже.',
    scoreBonus: 0,
    mods: (m) => {
      m.goldMult *= 2;
      m.shopPriceMult *= 2;
    },
  },
  {
    id: 'wk_iron_nerves',
    name: 'Стальные нервы',
    description: 'Каждый бой начинается с 2 Барьера, но у врагов на 15% больше HP.',
    scoreBonus: 0.05,
    mods: (m) => {
      m.normalHpMult *= 1.15;
      m.eliteHpMult *= 1.15;
      m.bossHpMult *= 1.15;
    },
    extra: (x) => (x.playerCombatStatuses.barrier = (x.playerCombatStatuses.barrier ?? 0) + 2),
  },
  {
    id: 'wk_field_hospital',
    name: 'Полевой госпиталь',
    description: 'Старт с 70% HP, но отдых восстанавливает 50% HP.',
    scoreBonus: 0.05,
    mods: (m) => {
      m.startHpPct = 0.7;
      m.restHealPct = 0.5;
    },
  },
];

/** Скрытое правило режима «Нулевой день» (id 'dz_*'): добавляется в RunState.mutators самим движком. */
export const ZERO_DAY_RULE_ID = 'dz_zero_day';
const DIFFICULTY_RULES: readonly MutatorSpec[] = [
  {
    id: ZERO_DAY_RULE_ID,
    name: 'Нулевой день',
    description: '+1 энергия, но на 1 карту меньше в руке; намерения обычных врагов скрыты; враги начинают с 1 Разгоном; проклятие в колоде и бонусный имплант; старт с 80% HP; золота +25%.',
    scoreBonus: 0.4,
    mods: (m) => {
      m.curseInDeck = true;
      m.startHpPct = Math.min(m.startHpPct, 0.8);
      m.goldMult *= 1.25;
    },
    extra: (x) => {
      x.bonusEnergy += 1;
      x.bonusDraw -= 1;
      x.hideNormalIntents = true;
      x.enemyCombatStatuses.strength = (x.enemyCombatStatuses.strength ?? 0) + 1;
      x.bonusStartRelic = true;
    },
  },
];

const pub = ({ id, name, description, scoreBonus, tag }: MutatorSpec): MutatorDef => (tag ? { id, name, description, scoreBonus, tag } : { id, name, description, scoreBonus });

/** Публичный список мутаторов (для UI). */
export const MUTATORS: readonly MutatorDef[] = SPECS.map(pub);

const BY_ID = new Map([...SPECS, ...WEEKLY_RULES, ...DIFFICULTY_RULES].map((m) => [m.id, m] as const));

export function getWeeklyRule(id: string): MutatorDef | undefined {
  const m = WEEKLY_RULES.find((r) => r.id === id);
  return m ? pub(m) : undefined;
}

export function getMutator(id: string): MutatorDef | undefined {
  const m = BY_ID.get(id);
  return m ? pub(m) : undefined;
}

/** Только известные id, без повторов, в каноническом порядке. */
export function normalizeMutators(ids: readonly string[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  const set = new Set(ids);
  return SPECS.filter((m) => set.has(m.id)).map((m) => m.id);
}

/** Мутаторы поверх модификаторов Ascension/сложности. */
export function applyMutators(m: AscensionMods, ids: readonly string[] | undefined): AscensionMods {
  if (!ids || ids.length === 0) return m;
  const out = { ...m };
  for (const id of ids) BY_ID.get(id)?.mods?.(out);
  return out;
}

const NO_MUTATORS: MutatorMods = Object.freeze({
  bonusEnergy: 0,
  hideNormalIntents: false,
  playerDamageMult: 1,
  playerCombatStatuses: Object.freeze({}) as Record<string, number>,
  enemyCombatStatuses: Object.freeze({}) as Record<string, number>,
  extraCardChoices: 0,
  potionChanceBonus: 0,
  turnEcho: false,
  bonusDraw: 0,
  bonusStartRelic: false,
  bounty: false,
  volatileCard: false,
});

export function getMutatorMods(ids: readonly string[] | undefined): MutatorMods {
  if (!ids || ids.length === 0) return NO_MUTATORS;
  const x: MutatorMods = { ...NO_MUTATORS, playerCombatStatuses: {}, enemyCombatStatuses: {} };
  for (const id of ids) BY_ID.get(id)?.extra?.(x);
  return x;
}

/** Потолок суммарного бонуса мутаторов к счёту: стопка из всех не должна ломать таблицу рекордов. */
export const MUTATOR_SCORE_CAP = 0.8;

/** Множитель счёта: 1 + сумма бонусов, но не больше 1 + MUTATOR_SCORE_CAP. */
export function mutatorScoreMult(ids: readonly string[] | undefined): number {
  let b = 0;
  for (const id of ids ?? []) b += BY_ID.get(id)?.scoreBonus ?? 0;
  return 1 + Math.min(MUTATOR_SCORE_CAP, b);
}

/** Предупреждения о неудачных комбинациях (не запрещают выбор). */
export function mutatorWarnings(ids: readonly string[] | undefined, zeroDay = false): string[] {
  const set = new Set(normalizeMutators(ids));
  const out: string[] = [];
  if (set.has('glass_cannon') && set.has('fragile')) out.push('Стеклянная пушка + Хрупкий носитель: один пропущенный удар может убить.');
  if (set.has('glass_cannon') && set.has('storm')) out.push('Стеклянная пушка + Шторм: враги бьют почти вдвое сильнее — очень жёстко.');
  if (set.has('plague') && set.has('fragile')) out.push('Чумной сервер + Хрупкий носитель: Вирус быстро съедает урезанное HP.');
  if (set.has('fragile') && set.has('rare_hunt')) out.push('Хрупкий носитель + Охота за редкостью: HP урезано дважды (−45%).');
  if (set.has('elite_hunt') && set.has('armored')) out.push('Охота на элиту + Бронированная сеть: толстые элиты затянут бои.');
  if (set.has('poverty') && set.has('armored')) out.push('Бедность + Бронированная сеть: награды щедрее, но золота мало — выбор карт важнее покупок.');
  if (zeroDay && set.has('fog')) out.push('Туман войны уже входит в «Нулевой день» — мутатор ничего не добавит, но бонус к счёту засчитается.');
  const total = [...set].reduce((a, id) => a + (BY_ID.get(id)?.scoreBonus ?? 0), 0) + (zeroDay ? (BY_ID.get(ZERO_DAY_RULE_ID)?.scoreBonus ?? 0) : 0);
  if (total > MUTATOR_SCORE_CAP) out.push(`Бонус к счёту ограничен потолком +${Math.round(MUTATOR_SCORE_CAP * 100)}%.`);
  return out;
}
