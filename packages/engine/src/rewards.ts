import { rollableFirmwares } from './firmware';
/**
 * Генерация наград и магазина.
 */
import type { AscensionMods } from './ascension';
import { getContent } from './content';
import { getMutatorMods } from './mutators';
import { getPotion, POTION_DROP_CHANCE, POTION_PRICES, rollPotion } from './potions';
import { extRng, rngOf, type Rng } from './rng';
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

/** Засада: золото ×1.6, карты как с элиты, гарантированный расходник */
export const AMBUSH_GOLD_MULT = 1.6;
export const REMOVE_BASE_PRICE = 75;
export const REMOVE_PRICE_STEP = 25;
export const UPGRADE_BASE_PRICE = 70;
export const UPGRADE_PRICE_STEP = 20;
export const REFRESH_BASE_PRICE = 35;
export const REFRESH_PRICE_STEP = 30;
export const MAX_SHOP_REFRESHES = 2;
export const SALE_DISCOUNT = 0.3;

function isRewardRarity(r: string): r is RewardRarity {
  return r === 'common' || r === 'uncommon' || r === 'rare';
}

/** Пул карт-наград класса. s — забег: карты из s.locked (метапрогрессия) исключаются. */
export function rewardCardPool(classId: ClassId | 'neutral', s?: Pick<RunState, 'locked'>): CardDef[] {
  const locked = s?.locked?.cards;
  return getContent().data.cards.filter(
    (c) =>
      c.classId === classId &&
      isRewardRarity(c.rarity) &&
      c.type !== 'curse' &&
      c.type !== 'status' &&
      !(locked && locked.includes(c.id)),
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
  avoid: readonly string[] = [],
): CardDef[] {
  const result: CardDef[] = [];
  const w: [RewardRarity, number][] = [
    ['common', weights[0]],
    ['uncommon', weights[1]],
    ['rare', weights[2] * rareMult],
  ];
  for (let i = 0; i < count; i++) {
    const left = pool.filter((c) => !result.includes(c));
    if (left.length === 0) break;
    // Недавно предложенные карты пропускаем, пока есть из чего выбрать.
    const fresh = left.filter((c) => !avoid.includes(c.id));
    const remaining = fresh.length > 0 ? fresh : left;
    const rarity = rng.weighted(w);
    const ofRarity = remaining.filter((c) => c.rarity === rarity);
    result.push(rng.pick(ofRarity.length > 0 ? ofRarity : remaining));
  }
  return result;
}

export function rollCardChoice(s: RunState, rng: Rng, tier: CombatTier, mods: AscensionMods): string[] {
  const count = 3 + getMutatorMods(s.mutators).extraCardChoices;
  const classPool = rewardCardPool(s.classId, s);
  // Маленький пул класса разбавляем нейтральными картами, иначе предложения повторяются.
  const pool = tier !== 'boss' && classPool.length < 20 ? [...classPool, ...rewardCardPool('neutral', s)] : classPool;
  const recent = s.recentOffers ?? [];
  const ids = rollCards(rng, pool, count, CARD_RARITY_WEIGHTS[tier], mods.rareCardMult, recent).map((c) => c.id);
  s.recentOffers = [...recent, ...ids].slice(-Math.min(12, Math.floor(pool.length / 2)));
  return ids;
}

function relicAvailable(s: RunState, r: RelicDef): boolean {
  return (
    !s.relics.includes(r.id) &&
    (r.classId === 'neutral' || r.classId === s.classId) &&
    !(s.locked && s.locked.relics.includes(r.id))
  );
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
export function buildCombatRewards(s: RunState, tier: CombatTier, mods: AscensionMods, ambush = false): RewardItem[] {
  const rng = rngOf(s, 'rewards');
  const items: RewardItem[] = [{ kind: 'gold', amount: Math.floor(rollGold(rng, tier, mods) * (ambush ? AMBUSH_GOLD_MULT : 1)) }];
  const cards = rollCardChoice(s, rngOf(s, 'cards'), ambush ? 'elite' : tier, mods);
  if (cards.length > 0) items.push({ kind: 'card_choice', cardIds: cards });
  const relicId = tier === 'boss' ? rollBossRelic(s, rng) : tier === 'elite' ? rollRelic(s, rng) : undefined;
  if (relicId) items.push({ kind: 'relic', relicId });
  // Прошивки: всегда с элит и боссов, иногда с обычных боёв
  const fwPool = rollableFirmwares(s);
  const fwChance = tier === 'normal' ? 0.12 : 1;
  if (fwPool.length > 0 && rngOf(s, 'rewards').next() < fwChance) {
    items.push({ kind: 'firmware', firmwareId: rngOf(s, 'rewards').pick(fwPool).id });
  }
  // Расходник: свой поток ГСЧ (не сдвигает остальные награды); в конце списка — индексы прежних наград не меняются
  const potionChance = POTION_DROP_CHANCE[tier] + getMutatorMods(s.mutators).potionChanceBonus;
  if (ambush || extRng(s, 'potions').next() < potionChance) items.push({ kind: 'potion', potionId: rollPotion(s) });
  return items;
}

function price(rng: Rng, range: [number, number], mods: AscensionMods): number {
  return Math.round(rng.int(range[0], range[1]) * mods.shopPriceMult);
}

export function upgradePrice(s: RunState, mods: AscensionMods): number {
  return Math.round((UPGRADE_BASE_PRICE + UPGRADE_PRICE_STEP * (s.shopUpgrades ?? 0)) * mods.shopPriceMult);
}

export function refreshPrice(n: number, mods: AscensionMods): number {
  return Math.round((REFRESH_BASE_PRICE + REFRESH_PRICE_STEP * n) * mods.shopPriceMult);
}

export function removePrice(s: RunState, mods: AscensionMods): number {
  return Math.round((REMOVE_BASE_PRICE + REMOVE_PRICE_STEP * (s.cardRemovals ?? 0)) * mods.shopPriceMult);
}

/** Магазин: 5 карт класса + 2 нейтральные, 3 реликвии, удаление карты. */
export function buildShop(s: RunState, rng: Rng, mods: AscensionMods, refreshes = 0): ShopItem[] {
  const items: ShopItem[] = [];
  const classCards = rollCards(rng, rewardCardPool(s.classId, s), 5, CARD_RARITY_WEIGHTS.shop);
  const neutralCards = rollCards(rng, rewardCardPool('neutral', s), 2, CARD_RARITY_WEIGHTS.shop);
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
  // SHOP_POTIONS расходников (поток 'potions'), в конце списка
  const prng = extRng(s, 'potions');
  for (let i = 0; i < SHOP_POTIONS; i++) {
    const id = rollPotion(s);
    const p = getPotion(id);
    if (!p) continue;
    const [lo, hi] = POTION_PRICES[p.rarity];
    items.push({ kind: 'potion', id, price: Math.round(prng.int(lo, hi) * mods.shopPriceMult), sold: false });
  }
  // Услуги: улучшение карты и обновление ассортимента
  items.push({ kind: 'upgrade', price: upgradePrice(s, mods), sold: false });
  items.push({ kind: 'refresh', price: refreshPrice(refreshes, mods), sold: refreshes >= MAX_SHOP_REFRESHES, n: refreshes });
  // Распродажа: одна случайная позиция −30%
  const goods = items.map((it, i) => (it.kind === 'card' || it.kind === 'relic' || it.kind === 'potion' ? i : -1)).filter((i) => i >= 0);
  if (goods.length > 0) {
    const it = items[rng.pick(goods)]!;
    it.basePrice = it.price;
    it.price = Math.max(1, Math.round(it.price * (1 - SALE_DISCOUNT)));
    it.sale = true;
  }
  return items;
}

/** Обновление ассортимента: новые товары, услуги сохраняют состояние «продано». */
export function refreshShop(s: RunState, old: readonly ShopItem[], rng: Rng, mods: AscensionMods): ShopItem[] {
  const n = (old.find((i) => i.kind === 'refresh')?.n ?? 0) + 1;
  const items = buildShop(s, rng, mods, n);
  for (const it of items) {
    if (it.kind === 'remove' || it.kind === 'upgrade') it.sold = old.find((o) => o.kind === it.kind)?.sold ?? false;
  }
  return items;
}

export const SHOP_POTIONS = 2;
