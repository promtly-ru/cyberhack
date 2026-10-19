/**
 * Расходники — «Модули-инъекции». До POTION_SLOTS штук в RunState.potions.
 * В бою пьются действием use_potion (любые), вне боя — только с outOfCombat (лечебные).
 * Выдача: награды после боя, магазин, эффект gain_potion (события, карты, реликвии).
 * Случайность — отдельный поток extRng(s, 'potions'), чтобы не сдвигать основные потоки ГСЧ.
 */
import { extRng } from './rng';
import type { Effect, GameEvent, RunState } from './types';

export const POTION_SLOTS = 3;

export type PotionRarity = 'common' | 'uncommon' | 'rare';

export interface PotionDef {
  id: string;
  name: string;
  description: string;
  rarity: PotionRarity;
  /** 'enemy' — при использовании нужно выбрать врага (эффекты с target 'enemy' бьют по нему) */
  target: 'none' | 'enemy';
  effects: Effect[];
  /** Можно выпить вне боя (только лечебные) */
  outOfCombat?: boolean;
  /** Категория — для ботов и подсветки в UI */
  kind: 'heal' | 'defense' | 'offense' | 'utility';
}

export const POTIONS: readonly PotionDef[] = [
  {
    id: 'pot_heal',
    name: 'Аптечка-патч',
    description: 'Восстанавливает 20% максимума HP. Можно выпить и вне боя.',
    rarity: 'common',
    target: 'none',
    kind: 'heal',
    outOfCombat: true,
    effects: [{ type: 'heal_pct', amount: 20 }],
  },
  {
    id: 'pot_block',
    name: 'Щит-скрипт',
    description: 'Получить 10 блока.',
    rarity: 'common',
    target: 'none',
    kind: 'defense',
    effects: [{ type: 'block', amount: 10 }],
  },
  {
    id: 'pot_energy',
    name: 'Энергоячейка',
    description: 'Получить 2 энергии.',
    rarity: 'common',
    target: 'none',
    kind: 'utility',
    effects: [{ type: 'gain_energy', amount: 2 }],
  },
  {
    id: 'pot_draw',
    name: 'Кэш-дамп',
    description: 'Взять 3 карты.',
    rarity: 'common',
    target: 'none',
    kind: 'utility',
    effects: [{ type: 'draw', amount: 3 }],
  },
  {
    id: 'pot_bomb',
    name: 'Логическая бомба',
    description: 'Нанести 8 урона ВСЕМ врагам.',
    rarity: 'common',
    target: 'none',
    kind: 'offense',
    effects: [{ type: 'damage', amount: 8, target: 'all_enemies' }],
  },
  {
    id: 'pot_virus',
    name: 'Колба с Вирусом',
    description: 'Наложить 6 Вируса на врага.',
    rarity: 'common',
    target: 'enemy',
    kind: 'offense',
    effects: [{ type: 'apply_status', status: 'virus', amount: 6, target: 'enemy' }],
  },
  {
    id: 'pot_weak',
    name: 'Генератор лагов',
    description: 'Наложить 2 Лага на ВСЕХ врагов.',
    rarity: 'common',
    target: 'none',
    kind: 'defense',
    effects: [{ type: 'apply_status', status: 'weak', amount: 2, target: 'all_enemies' }],
  },
  {
    id: 'pot_breach',
    name: 'Сканер брешей',
    description: 'Наложить 2 Бреши и 2 Метки на врага.',
    rarity: 'common',
    target: 'enemy',
    kind: 'offense',
    effects: [
      { type: 'apply_status', status: 'vulnerable', amount: 2, target: 'enemy' },
      { type: 'apply_status', status: 'mark', amount: 2, target: 'enemy' },
    ],
  },
  {
    id: 'pot_strength',
    name: 'Стимулятор Разгона',
    description: 'Получить 2 Разгона.',
    rarity: 'uncommon',
    target: 'none',
    kind: 'offense',
    effects: [{ type: 'apply_status', status: 'strength', amount: 2 }],
  },
  {
    id: 'pot_dex',
    name: 'Шифратор',
    description: 'Получить 2 Шифрования.',
    rarity: 'uncommon',
    target: 'none',
    kind: 'defense',
    effects: [{ type: 'apply_status', status: 'dexterity', amount: 2 }],
  },
  {
    id: 'pot_echo',
    name: 'Эхо-модуль',
    description: 'Получить 1 Эхо: следующая сыгранная карта сработает дважды.',
    rarity: 'uncommon',
    target: 'none',
    kind: 'utility',
    effects: [{ type: 'double_next', amount: 1 }],
  },
  {
    id: 'pot_barrier',
    name: 'Барьерный кэш',
    description: 'Получить 1 Барьер и 4 блока.',
    rarity: 'uncommon',
    target: 'none',
    kind: 'defense',
    effects: [
      { type: 'apply_status', status: 'barrier', amount: 1 },
      { type: 'block', amount: 4 },
    ],
  },
  {
    id: 'pot_cleanse',
    name: 'Антивирус-шприц',
    description: 'Снять с себя все дебаффы и восстановить 3 HP.',
    rarity: 'uncommon',
    target: 'none',
    kind: 'defense',
    effects: [
      { type: 'cleanse', amount: 99 },
      { type: 'heal', amount: 3 },
    ],
  },
  {
    id: 'pot_regen',
    name: 'Нано-рой',
    description: 'Получить 4 Самовосстановления.',
    rarity: 'uncommon',
    target: 'none',
    kind: 'heal',
    effects: [{ type: 'apply_status', status: 'regen', amount: 4 }],
  },
  {
    id: 'pot_compile',
    name: 'Компилятор на лету',
    description: 'Улучшить все карты в руке до конца боя.',
    rarity: 'rare',
    target: 'none',
    kind: 'utility',
    effects: [{ type: 'upgrade_random_hand', amount: 10 }],
  },
  {
    id: 'pot_gene',
    name: 'Ген-апгрейд',
    description: 'Навсегда +5 к максимуму HP. Можно выпить и вне боя.',
    rarity: 'rare',
    target: 'none',
    kind: 'heal',
    outOfCombat: true,
    effects: [{ type: 'gain_max_hp', amount: 5 }],
  },
];

const BY_ID = new Map(POTIONS.map((p) => [p.id, p] as const));

export function getPotion(id: string): PotionDef | undefined {
  return BY_ID.get(id);
}

export const POTION_RARITY_WEIGHTS: Record<PotionRarity, number> = { common: 65, uncommon: 27, rare: 8 };

export const POTION_PRICES: Record<PotionRarity, [number, number]> = {
  common: [50, 60],
  uncommon: [70, 85],
  rare: [95, 110],
};

/** Шанс расходника в награде за бой (босс даёт редкую карту и имплант — без расходника). */
export const POTION_DROP_CHANCE = { normal: 0.25, elite: 1, boss: 0 } as const;

export function potionsOf(s: Pick<RunState, 'potions'>): readonly string[] {
  return s.potions ?? [];
}

export function hasFreePotionSlot(s: Pick<RunState, 'potions'>): boolean {
  return potionsOf(s).length < POTION_SLOTS;
}

/** Случайный расходник по весам редкости (поток 'potions'). */
export function rollPotion(s: RunState): string {
  const rng = extRng(s, 'potions');
  const rarity = rng.weighted<PotionRarity>([
    ['common', POTION_RARITY_WEIGHTS.common],
    ['uncommon', POTION_RARITY_WEIGHTS.uncommon],
    ['rare', POTION_RARITY_WEIGHTS.rare],
  ]);
  const pool = POTIONS.filter((p) => p.rarity === rarity);
  return rng.pick(pool.length > 0 ? pool : POTIONS).id;
}

/** Положить расходник в свободный слот. false — слоты заняты или id неизвестен. */
export function addPotion(s: RunState, potionId: string, ev: GameEvent[]): boolean {
  if (!BY_ID.has(potionId) || !hasFreePotionSlot(s)) return false;
  (s.potions ??= []).push(potionId);
  ev.push({ type: 'potion_obtained', potionId });
  return true;
}

/** Эффект gain_potion: amount расходников (конкретный или случайные), пока есть слоты. */
export function gainPotions(s: RunState, amount: number, potionId: string | undefined, ev: GameEvent[]): void {
  for (let i = 0; i < amount && hasFreePotionSlot(s); i++) addPotion(s, potionId ?? rollPotion(s), ev);
}
