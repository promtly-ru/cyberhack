/**
 * Ачивки v2 (с тирами и наградами за «Забрать»). Данные — content/achievements.json.
 * Чистые функции: прогресс считается из профиля (LifetimeStats, счётчики) и коллекции прошивок.
 * Классические достижения (unlocks.ts) остаются как есть и продолжают открывать классы/карты.
 */
import achievementsJson from './content/achievements.json';
import { getFirmware, type FirmwareMeta } from './firmware';
import type { LifetimeStats, MetaProfile } from './unlocks';

export type AchievementTier = 'bronze' | 'silver' | 'gold';
export type RewardKind = 'card' | 'firmware' | 'currency' | 'cosmetic';

export interface MetaReward {
  kind: RewardKind;
  /** card/firmware/cosmetic — id */
  id?: string;
  /** currency — количество */
  amount?: number;
}

/** Чем меряется прогресс */
export type AchievementMetric =
  | keyof LifetimeStats
  | 'totalRuns'
  | 'totalWins'
  | 'classesUnlocked'
  | 'classesWon'
  | 'legacyAchievements'
  | 'achievementsClaimed';

export interface MetaAchievementDef {
  id: string;
  title: string;
  desc: string;
  category: string;
  tier: AchievementTier;
  goal: number;
  reward: MetaReward;
  metric: AchievementMetric;
}

export interface MetaAchievementState {
  id: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

/** Прогресс ачивок, который хранится между сессиями (остальное выводится из профиля). */
export interface AchievementRecord {
  /** Получена (липко: не пропадает, даже если метрика когда-то уменьшится) */
  completed?: boolean;
  claimed?: boolean;
}

/** Мета-данные игрока, которых нет в старом профиле: открытые прошивки, ачивки v2, валюта, косметика. */
export interface MetaExtraState extends FirmwareMeta {
  unlockedFirmwares: string[];
  achievements: Record<string, AchievementRecord>;
  currency: number;
  cosmetics: string[];
}

export const META_ACHIEVEMENTS: readonly MetaAchievementDef[] = achievementsJson as MetaAchievementDef[];

const BY_ID = new Map(META_ACHIEVEMENTS.map((a) => [a.id, a]));

export function getMetaAchievement(id: string): MetaAchievementDef | undefined {
  return BY_ID.get(id);
}

const WIN_KEYS = ['winsNetrunner', 'winsPhreaker', 'winsGhost', 'winsSamurai', 'winsEngineer', 'winsBiohacker', 'winsDroneop', 'winsChrono', 'winsVabanker'] as const;

/** Значение метрики. */
export function metricValue(metric: AchievementMetric, p: MetaProfile, extra: Partial<MetaExtraState> = {}): number {
  switch (metric) {
    case 'totalRuns':
      return p.totalRuns;
    case 'totalWins':
      return p.totalWins;
    case 'classesUnlocked':
      return p.unlockedClasses.length;
    case 'classesWon':
      return WIN_KEYS.filter((k) => (p.lifetime?.[k] ?? 0) > 0).length;
    case 'legacyAchievements':
      return p.achievements.length;
    case 'achievementsClaimed':
      return Object.values(extra.achievements ?? {}).filter((r) => r.claimed).length;
    default:
      return p.lifetime?.[metric] ?? 0;
  }
}

/** Состояния всех ачивок для профиля. */
export function computeAchievementStates(p: MetaProfile, extra: Partial<MetaExtraState> = {}): MetaAchievementState[] {
  return META_ACHIEVEMENTS.map((a) => {
    const rec = extra.achievements?.[a.id];
    const raw = Math.max(0, Math.floor(metricValue(a.metric, p, extra)));
    const completed = !!rec?.completed || !!rec?.claimed || raw >= a.goal;
    return { id: a.id, progress: completed ? a.goal : Math.min(a.goal, raw), completed, claimed: !!rec?.claimed };
  });
}

/** Отметить полученные ачивки как completed (липко). Возвращает новые id и обновлённое состояние. */
export function syncAchievements<T extends Partial<MetaExtraState>>(p: MetaProfile, extra: T): { extra: T; newlyCompleted: string[] } {
  const newly: string[] = [];
  const recs = { ...(extra.achievements ?? {}) };
  for (const st of computeAchievementStates(p, extra)) {
    if (st.completed && !recs[st.id]?.completed) {
      recs[st.id] = { ...recs[st.id], completed: true };
      newly.push(st.id);
    }
  }
  return newly.length ? { extra: { ...extra, achievements: recs }, newlyCompleted: newly } : { extra, newlyCompleted: [] };
}

/** Карты, которые закрыты до получения ачивки v2 (награды kind: 'card'). */
export function metaRewardCards(): string[] {
  return META_ACHIEVEMENTS.filter((a) => a.reward.kind === 'card' && a.reward.id).map((a) => a.reward.id!);
}

/** Применить награду. Профиль и extra не мутируются. */
export function applyMetaReward<P extends MetaProfile, E extends MetaExtraState>(
  profile: P,
  extra: E,
  reward: MetaReward,
): { profile: P; extra: E } {
  switch (reward.kind) {
    case 'card':
      if (!reward.id || profile.unlockedCards.includes(reward.id)) return { profile, extra };
      return { profile: { ...profile, unlockedCards: [...profile.unlockedCards, reward.id] }, extra };
    case 'firmware':
      if (!reward.id || !getFirmware(reward.id) || extra.unlockedFirmwares.includes(reward.id)) return { profile, extra };
      return { profile, extra: { ...extra, unlockedFirmwares: [...extra.unlockedFirmwares, reward.id] } };
    case 'currency':
      return { profile, extra: { ...extra, currency: extra.currency + Math.max(0, reward.amount ?? 0) } };
    case 'cosmetic':
      if (!reward.id || extra.cosmetics.includes(reward.id)) return { profile, extra };
      return { profile, extra: { ...extra, cosmetics: [...extra.cosmetics, reward.id] } };
    default:
      return { profile, extra };
  }
}

/** Забрать награду: только полученная и ещё не забранная. ok=false — ничего не изменилось. */
export function claimMetaAchievement<P extends MetaProfile, E extends MetaExtraState>(
  profile: P,
  extra: E,
  id: string,
): { ok: boolean; profile: P; extra: E } {
  const def = BY_ID.get(id);
  if (!def) return { ok: false, profile, extra };
  const st = computeAchievementStates(profile, extra).find((s) => s.id === id);
  if (!st?.completed || st.claimed) return { ok: false, profile, extra };
  const r = applyMetaReward(profile, extra, def.reward);
  return {
    ok: true,
    profile: r.profile,
    extra: { ...r.extra, achievements: { ...r.extra.achievements, [id]: { completed: true, claimed: true } } },
  };
}

/** Что открыто для забега с учётом ачивок v2: награды полученных (даже не забранных) ачивок уже доступны. */
export function metaUnlockedContent(p: MetaProfile, extra: Partial<MetaExtraState>): { cards: string[]; firmwares: string[] } {
  const done = new Set(computeAchievementStates(p, extra).filter((s) => s.completed).map((s) => s.id));
  const cards = new Set(p.unlockedCards);
  const firmwares = new Set(extra.unlockedFirmwares ?? []);
  for (const a of META_ACHIEVEMENTS) {
    if (!done.has(a.id) || !a.reward.id) continue;
    if (a.reward.kind === 'card') cards.add(a.reward.id);
    if (a.reward.kind === 'firmware') firmwares.add(a.reward.id);
  }
  return { cards: [...cards], firmwares: [...firmwares] };
}
