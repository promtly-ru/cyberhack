/**
 * UI-адаптер: единственная точка, через которую интерфейс прошивок и достижений берёт данные.
 * Реальные данные: прошивки — @cyberhack/engine (firmware.ts), состояние — useGame().metaExtra,
 * ачивки — game/achievements.ts. Экспорты и их сигнатуры совпадают с прежними заглушками.
 */
import {
  canUpgrade as engineCanUpgrade,
  copiesForNextLevel,
  describeFirmwareEffects,
  getFirmware,
  isFirmwareUnlocked as engineIsUnlocked,
  listFirmwares as engineListFirmwares,
  MAX_FIRMWARE_LEVEL,
} from '@cyberhack/engine';
import { useGame } from '../game/store';
import * as ach from '../game/achievements';

// ---- Типы контракта ----
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type FirmwareType = 'attack' | 'defense' | 'economy' | 'utility' | 'combo';

export interface FirmwareLevelDef {
  copiesNeeded: number;
  /** В движке — Effect[]; текст для UI даёт firmwareEffectText */
  effect: unknown;
}

export interface FirmwareDef {
  id: string;
  name: string;
  desc: string;
  type: FirmwareType;
  rarity: Rarity;
  icon: string;
  /** id ачивки, которая открывает; нет — открыта с начала */
  unlock?: string;
  /** Уровни 1..N, индекс 0 — уровень 1 */
  levels: readonly FirmwareLevelDef[];
}

export interface FirmwareState {
  id: string;
  /** 1..N; 0 — ещё нет в коллекции */
  level: number;
  copies: number;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold';
export type Reward = ach.Reward;
export type AchievementDef = ach.AchievementDef;
export type AchievementState = ach.AchievementState;

const metaExtra = () => useGame.getState().metaExtra;

/** Хук: компонент перерисуется при смене мета-данных (коллекция, ачивки, награда). */
export function useContractVersion(): unknown {
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
export function firmwareStateOf(id: string): FirmwareState {
  return metaExtra().firmwareCollection[id] ?? { id, level: 0, copies: 0 };
}
export function copiesForNext(id: string): number | null {
  return copiesForNextLevel(metaExtra(), id);
}
export function canUpgrade(id: string): boolean {
  return engineCanUpgrade(metaExtra(), id);
}
export function upgradeFirmware(id: string): void {
  useGame.getState().upgradeFirmware(id);
}
export function firmwareEffectText(def: FirmwareDef, level: number): string {
  const fw = getFirmware(def.id);
  return fw ? describeFirmwareEffects(fw, 2, Math.max(1, Math.min(level, MAX_FIRMWARE_LEVEL))) : def.desc;
}

// ---- Награда «1 из 3»: показываем вне забега (после экрана конца забега) ----
export function usePendingFirmwareChoice(): string[] | null {
  return useGame((s) => (s.run ? null : s.metaExtra.pendingFirmwareChoice));
}
export function pickFirmwareChoice(id: string): void {
  useGame.getState().pickFirmwareChoice(id);
}
export function skipFirmwareChoice(): void {
  useGame.getState().skipFirmwareChoice();
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
