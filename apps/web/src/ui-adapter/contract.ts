/**
 * UI-адаптер: единственная точка, через которую интерфейс прошивок и достижений берёт данные.
 * Реальные данные: прошивки — @cyberhack/engine (firmware.ts), состояние — useGame().metaExtra,
 * ачивки — game/achievements.ts. Экспорты и их сигнатуры совпадают с прежними заглушками.
 */
import { describeFirmwareEffects, getFirmware, isFirmwareUnlocked as engineIsUnlocked, listFirmwares as engineListFirmwares } from '@cyberhack/engine';
import { useGame } from '../game/store';
import * as ach from '../game/achievements';

// ---- Типы контракта ----
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type FirmwareType = 'attack' | 'defense' | 'economy' | 'utility' | 'combo';

export interface FirmwareDef {
  id: string;
  name: string;
  desc: string;
  type: FirmwareType;
  rarity: Rarity;
  icon: string;
  /** id ачивки, которая открывает; нет — открыта с начала */
  unlock?: string;
}

/** Прошивка в текущем забеге: получена ли и улучшена ли (вне забега — обе false). */
export interface FirmwareRunState {
  owned: boolean;
  upgraded: boolean;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold';
export type Reward = ach.Reward;
export type AchievementDef = ach.AchievementDef;
export type AchievementState = ach.AchievementState;

const metaExtra = () => useGame.getState().metaExtra;

/** Хук: компонент перерисуется при смене мета-данных (открытые прошивки, ачивки) или забега. */
export function useContractVersion(): unknown {
  useGame((s) => s.run);
  return useGame((s) => s.metaExtra);
}

// ---- Прошивки ----
export function listFirmwares(): readonly FirmwareDef[] {
  return engineListFirmwares();
}
export function getFirmwareDef(id: string): FirmwareDef | undefined {
  return getFirmware(id);
}
export function isFirmwareUnlocked(id: string): boolean {
  const def = getFirmware(id);
  return !!def && engineIsUnlocked(def, metaExtra());
}
export function firmwareRunState(id: string): FirmwareRunState {
  const run = useGame.getState().run;
  return { owned: !!run?.firmwares?.includes(id), upgraded: !!run?.upgradedFirmwares?.includes(id) };
}
/** Хук: id прошивок текущего забега (пусто вне забега). */
export function useRunFirmwares(): readonly string[] {
  return useGame((s) => s.run?.firmwares ?? EMPTY);
}
const EMPTY: readonly string[] = [];
export function firmwareEffectText(def: FirmwareDef, upgraded = false): string {
  const fw = getFirmware(def.id);
  return fw ? describeFirmwareEffects(fw, 2, upgraded) : def.desc;
}

// ---- Достижения ----
export function listAchievements(): readonly AchievementDef[] {
  return ach.listAchievements();
}
export function getAchievementStates(): AchievementState[] {
  return ach.getAchievementStates();
}
export const useAchievementStates = ach.useAchievementStates;
export function claimAchievement(id: string): boolean {
  return ach.claimAchievement(id);
}
export function hasUnclaimed(): boolean {
  return ach.hasUnclaimed();
}
export function useUnclaimedCount(): number {
  return ach.useAchievementStates().filter((s) => s.completed && !s.claimed).length;
}
