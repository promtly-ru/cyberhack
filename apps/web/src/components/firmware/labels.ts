import type { AchievementTier, FirmwareDef, FirmwareType, Rarity, Reward } from '../../ui-adapter/contract';
import { getFirmwareDef, listAchievements } from '../../ui-adapter/contract';
import { cardStats } from '../../game/engine';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_NAME: Record<Rarity, string> = { common: 'Обычная', uncommon: 'Необычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная' };

export const TYPE_ORDER: FirmwareType[] = ['attack', 'defense', 'economy', 'utility', 'combo'];
export const TYPE_NAME: Record<FirmwareType, string> = { attack: 'Атака', defense: 'Защита', economy: 'Экономика', utility: 'Утилита', combo: 'Комбо' };
export const TYPE_ICON: Record<FirmwareType, string> = { attack: 'attack', defense: 'block', economy: 'gold', utility: 'gear', combo: 'replay' };

export const TIER_NAME: Record<AchievementTier, string> = { bronze: 'Бронза', silver: 'Серебро', gold: 'Золото' };

/** Категории ачивок приходят id (content/achievements.json). */
const CATEGORY_NAME: Record<string, string> = { progress: 'Прогресс', combat: 'Бой', classes: 'Классы', firmware: 'Прошивки', records: 'Рекорды', meta: 'Коллекция' };
export function categoryName(id: string): string {
  return CATEGORY_NAME[id] ?? id;
}

/** Подсказка, как открыть закрытую прошивку. */
export function unlockHint(def: FirmwareDef): string {
  if (!def.unlock) return 'Выпадает в забегах';
  const ach = listAchievements().find((a) => a.id === def.unlock);
  return ach ? `Достижение «${ach.title}»: ${ach.desc.toLowerCase()}` : def.unlock;
}

const COSMETIC_NAME: Record<string, string> = { frame: 'Рамка профиля', cardback: 'Рубашка карт', title: 'Титул', avatar: 'Аватар', theme: 'Тема оформления' };

export function cardName(id: string): string {
  try {
    return cardStats(id, false).name;
  } catch {
    return 'новая';
  }
}

export function rewardLabel(r: Reward): string {
  switch (r.kind) {
    case 'currency':
      return `${r.amount ?? 0} кредитов`;
    case 'firmware':
      return `Прошивка «${(r.id && getFirmwareDef(r.id)?.name) || r.id}»`;
    case 'card':
      return r.id ? `Карта «${cardName(r.id)}»` : 'Новая карта';
    case 'cosmetic':
      return COSMETIC_NAME[r.id?.split('_')[0] ?? ''] ?? 'Оформление';
  }
}

export const REWARD_ICON: Record<Reward['kind'], string> = { currency: 'gold', firmware: 'firmware', card: 'deck', cosmetic: 'crown' };
