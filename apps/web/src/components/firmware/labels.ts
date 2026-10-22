import type { AchievementTier, FirmwareDef, FirmwareType, Rarity, Reward } from '../../ui-adapter/contract';
import { getFirmwareDef, listAchievements } from '../../ui-adapter/contract';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_NAME: Record<Rarity, string> = { common: 'Обычная', uncommon: 'Необычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная' };

export const TYPE_ORDER: FirmwareType[] = ['attack', 'defense', 'economy', 'utility', 'combo'];
export const TYPE_NAME: Record<FirmwareType, string> = { attack: 'Атака', defense: 'Защита', economy: 'Экономика', utility: 'Утилита', combo: 'Комбо' };
export const TYPE_ICON: Record<FirmwareType, string> = { attack: 'attack', defense: 'block', economy: 'gold', utility: 'gear', combo: 'replay' };

export const TIER_NAME: Record<AchievementTier, string> = { bronze: 'Бронза', silver: 'Серебро', gold: 'Золото' };

/** Подсказка, как открыть закрытую прошивку. */
export function unlockHint(def: FirmwareDef): string {
  if (!def.unlock) return 'Выпадает в забегах';
  const ach = listAchievements().find((a) => a.id === def.unlock);
  return ach ? `Достижение «${ach.title}»: ${ach.desc.toLowerCase()}` : def.unlock;
}

export function rewardLabel(r: Reward): string {
  switch (r.kind) {
    case 'currency':
      return `${r.amount ?? 0} кредитов`;
    case 'firmware':
      return `Прошивка «${(r.id && getFirmwareDef(r.id)?.name) || r.id}»`;
    case 'copies':
      return `${r.amount ?? 1} коп. «${(r.id && getFirmwareDef(r.id)?.name) || r.id}»`;
    case 'card':
      return 'Новая карта';
    case 'cosmetic':
      return 'Оформление';
  }
}

export const REWARD_ICON: Record<Reward['kind'], string> = { currency: 'gold', firmware: 'firmware', copies: 'chip', card: 'deck', cosmetic: 'crown' };
