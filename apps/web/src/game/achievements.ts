/**
 * Ачивки v2 для UI (контракт данных). Определения и логика — в движке (achievements.ts, content/achievements.json),
 * состояние игрока — в сторе (profile + metaExtra). Прогресс считается из статистики профиля,
 * поэтому старые сохранения сразу видят уже выполненное; классические достижения (profile.achievements) не трогаются.
 */
import { useMemo } from 'react';
import {
  computeAchievementStates,
  META_ACHIEVEMENTS,
  type MetaAchievementDef,
  type MetaAchievementState,
  type MetaReward,
} from '@cyberhack/engine';
import { useGame } from './store';

export type AchievementDef = MetaAchievementDef;
export type AchievementState = MetaAchievementState;
export type Reward = MetaReward;
export type { AchievementTier, RewardKind } from '@cyberhack/engine';

export function listAchievements(): readonly AchievementDef[] {
  return META_ACHIEVEMENTS;
}

export function getAchievementStates(): AchievementState[] {
  const { profile, metaExtra } = useGame.getState();
  return computeAchievementStates(profile, metaExtra);
}

/** Забрать награду (карта, прошивка, копии, валюта, косметика). false — нельзя. */
export function claimAchievement(id: string): boolean {
  return useGame.getState().claimAchievement(id);
}

/** Есть выполненные, но не забранные награды (для бейджа на кнопке). */
export function hasUnclaimed(): boolean {
  return getAchievementStates().some((s) => s.completed && !s.claimed);
}

/** React-хук: состояния ачивок, пересчитываются при смене профиля или мета-данных. */
export function useAchievementStates(): AchievementState[] {
  const profile = useGame((s) => s.profile);
  const metaExtra = useGame((s) => s.metaExtra);
  return useMemo(() => computeAchievementStates(profile, metaExtra), [profile, metaExtra]);
}

/** React-хук: есть ли незабранные награды. */
export function useHasUnclaimed(): boolean {
  return useAchievementStates().some((s) => s.completed && !s.claimed);
}
