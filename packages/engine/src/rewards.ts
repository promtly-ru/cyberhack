/**
 * Генерация наград и магазина.
 */
import type { AscensionMods } from './ascension';
import { getContent } from './content';
import { rngOf, type Rng } from './rng';
import type { CardDef, ClassId, RelicDef, RewardItem, RunState, ShopItem } from './types';

export type CombatTier = 'normal' | 'elite' | 'boss';
type RewardRarity = 'common' | 'uncommon' | 'rare';

export const GOLD_RANGES: Record<CombatTier, [number, number]> = {
  normal: [10, 20],
  elite: [25, 35],
  boss: [95, 105],
};

/** Веса редкостей карт: common / uncommon / rare */
export const CARD_RARITY_WEIGHTS: Record<CombatTier | 'shop', [number, number, number]> = {
  normal: [60, 37, 3],
  elite: [50, 40, 10],
  boss: [0, 0, 100],
  shop: [60, 37, 3],
};

export const CARD_PRICES: Record<RewardRarity, [number, number]> = {
  common: [45, 55],
  uncommon: [68, 82],
  rare: [135, 165],
};

export const RELIC_PRICES: Record<RelicDef['rarity'], [number, number]> = {
  starter: [150, 150],
  common: [150, 180],
  uncommon: [200, 240],
  rare: [260, 300],
  shop: [170, 220],
  boss: [300, 300],
};

export const REMOVE_BASE_PRICE = 75;
export const REMOVE_PRICE_STEP = 25;

function isRewardRarity(r: string): r is RewardRarity {
  return r === 'common' || r === 'uncommon' || r === 'rare';
}

export function rewardCardPool(classId: ClassId | 'neutral'): CardDef[] {
  return getContent().data.cards.filter(
    (c) => c.classId === classId && isRewardRarity(c.rarity) && c.type !== 'curse' && c.type !== 'status',
  );
}

export function rollGold(rng: Rng, tier: CombatTier, mods: AscensionMods): number {
  const [min, max] = GOLD_RANGES[tier];
  return Math.floor(rng.int(min, max) * mods.goldMult);
}

/** До count разных карт из пула с учётом весов редкости. */
export function rollCards(
  rng: Rng,
  pool: readonly CardDef[],
  count: number,
  weights: [number, number, number],
  rareMult = 1,
): CardDef[] {
  const result: CardDef[] = [];
  const w: [RewardRarity, number][] = [
    ['common', weights[0]],
    ['uncommon', weights[1]],
    ['rare', weights[2] * rareMult],
  ];
  for (let i = 0; i < count; i++) {
    const remaining = pool.filter((c) => !result.includes(c));
    if (remaining.length === 0) break;
    const rarity = rng.weighted(w);
    const ofRarity = remaining.filter((c) => c.rarity === rarity);
    result.push(rng.pick(ofRarity.length > 0 ? ofRarity : remaining));
  }
  return result;
}

export function rollCardChoice(s: RunState, rng: Rng, tier: CombatTier, mods: AscensionMods): string[] {
  return rollCards(rng, rewardCardPool(s.classId), 3, CARD_RARITY_WEIGHTS[tier], mods.rareCardMult).map((c) => c.id);
}

function relicAvailable(s: RunState, r: RelicDef): boolean {
  return !s.relics.includes(r.id) && (r.classId === 'neutral' || r.classId === s.classId);
}

/** Случайная реликвия (не босс/стартовая/магазинная): common 50 / uncommon 33 / rare 17. */
export function rollRelic(s: RunState, rng: Rng): string | undefined {
  const pool = getContent().data.relics.filter((r) => relicAvailable(s, r) && isRewardRarity(r.rarity));
  if (pool.length === 0) return undefined;
  const rarity = rng.weighted<RewardRarity>([
    ['common', 50],
    ['uncommon', 33],
    ['rare', 17],
  ]);
  const ofRarity = pool.filter((r) => r.rarity === rarity);
  return rng.pick(ofRarity.length > 0 ? ofRarity : pool).id;
}

export function rollBossRelic(s: RunState, rng: Rng): string | undefined {
  const pool = getContent().data.relics.filter((r) => relicAvailable(s, r) && r.rarity === 'boss');
  return pool.length > 0 ? rng.pick(pool).id : undefined;
}

/** Золото и реликвии — поток rewards, карты — поток cards. */
export function buildCombatRewards(s: RunState, tier: CombatTier, mods: AscensionMods): RewardItem[] {
  const rng = rngOf(s, 'rewards');
  const items: RewardItem[] = [{ kind: 'gold', amount: rollGold(rng, tier, mods) }];
  const cards = rollCardChoice(s, rngOf(s, 'cards'), tier, mods);
  if (cards.length > 0) items.push({ kind: 'card_choice', cardIds: cards });
  const relicId = tier === 'boss' ? rollBossRelic(s, rng) : tier === 'elite' ? rollRelic(s, rng) : undefined;
  if (relicId) items.push({ kind: 'relic', relicId });
  return items;
}

function price(rng: Rng, range: [number, number], mods: AscensionMods): number {
  return Math.round(rng.int(range[0], range[1]) * mods.shopPriceMult);
}

export function removePrice(s: RunState, mods: AscensionMods): number {
  return Math.round((REMOVE_BASE_PRICE + REMOVE_PRICE_STEP * (s.cardRemovals ?? 0)) * mods.shopPriceMult);
}

/** Магазин: 5 карт класса + 2 нейтральные, 3 реликвии, удаление карты. */
export function buildShop(s: RunState, rng: Rng, mods: AscensionMods): ShopItem[] {
  const items: ShopItem[] = [];
  const classCards = rollCards(rng, rewardCardPool(s.classId), 5, CARD_RARITY_WEIGHTS.shop);
  const neutralCards = rollCards(rng, rewardCardPool('neutral'), 2, CARD_RARITY_WEIGHTS.shop);
  for (const c of [...classCards, ...neutralCards]) {
    const range = CARD_PRICES[isRewardRarity(c.rarity) ? c.rarity : 'common'];
    items.push({ kind: 'card', id: c.id, price: price(rng, range, mods), sold: false });
  }
  const relicPool = getContent().data.relics.filter(
    (r) => relicAvailable(s, r) && (isRewardRarity(r.rarity) || r.rarity === 'shop'),
  );
  rng.shuffle(relicPool);
  for (const r of relicPool.slice(0, 3)) {
    items.push({ kind: 'relic', id: r.id, price: price(rng, RELIC_PRICES[r.rarity], mods), sold: false });
  }
  items.push({ kind: 'remove', price: removePrice(s, mods), sold: false });
  return items;
}
