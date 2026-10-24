/**
 * Публичный API движка. Сигнатуры ниже — контракт, реализация в отдельных модулях.
 * Все функции чистые: не мутируют входной state, детерминированы по seed.
 */
import { describeCard as describeCardImpl } from './cards';
import { getContent } from './content';
import { weeklyClassId } from './weekly';
import { SAVE_VERSION } from './types';
import {
  applyAction as applyActionImpl,
  getLegalActions as getLegalActionsImpl,
  newRun as newRunImpl,
  replay as replayImpl,
} from './run';
import type {
  Action,
  ActionResult,
  CardDef,
  ClassDef,
  ClassId,
  EncounterDef,
  EnemyDef,
  EventDef,
  NewRunOptions,
  RelicDef,
  RunState,
  StatusDef,
} from './types';

export * from './types';
export { validateContent, setContentForTests, resetContent, getContent } from './content';
export type { ContentData } from './content';
export { DIFFICULTY_CARDS, DIFFICULTY_INFO, getAscensionDescriptions, getAscensionMods, MAX_ASCENSION } from './ascension';
export type { AscensionMods } from './ascension';
export { computeScore } from './score';
export {
  FIRMWARES,
  getFirmware,
  firmwareProgress,
  isFirmwareActive,
  firmwareLevel,
  firmwareEffects,
  partialEffects,
  describeFirmwareEffects,
  FIRMWARE_RARITY_WEIGHT,
  FIRMWARE_UPGRADE_MULT,
  RARITIES,
  scaleEffects,
  lockableFirmwares,
  listFirmwares,
  listAvailableFirmwares,
  isFirmwareUnlocked,
  firmwareEffect,
  isFirmwareUpgraded,
  upgradableFirmwares,
} from './firmware';
export {
  META_ACHIEVEMENTS,
  getMetaAchievement,
  metricValue,
  computeAchievementStates,
  syncAchievements,
  metaRewardCards,
  applyMetaReward,
  claimMetaAchievement,
  metaUnlockedContent,
} from './achievements';
export type {
  AchievementTier,
  RewardKind,
  MetaReward,
  AchievementMetric,
  MetaAchievementDef,
  MetaAchievementState,
  AchievementRecord,
  MetaExtraState,
} from './achievements';
export type { FirmwareDef, FirmwareLevel, FirmwareTrigger, FirmwareMeta, FirmwareType, Rarity as FirmwareRarity } from './firmware';
export { SYNERGIES, getActiveSynergies } from './synergies';
export type { SynergyDef } from './synergies';
export { availableNodes, blackboxForceCost, blackboxHackCost, canUsePotionNow, currentNode, meetsRequires, RELAY_HEAL_PCT } from './run';
export { MAX_SHOP_REFRESHES } from './rewards';
export { POTIONS, POTION_SLOTS, getPotion } from './potions';
export type { PotionDef } from './potions';
export { MUTATORS, MUTATOR_SCORE_CAP, WEEKLY_RULES, getMutator, getWeeklyRule, mutatorWarnings } from './mutators';
export type { MutatorDef } from './mutators';
export { calcAttackDamage, calcBlock, STATUS } from './statuses';
export { hashString } from './rng';
export {
  ACHIEVEMENTS,
  STARTING_CLASSES,
  achievementProgress,
  evaluateRunEnd,
  getAchievement,
  lockableCards,
  lockableClasses,
  lockableRelics,
  lockedContent,
  unlockSource,
  unlockSources,
  unlockedOptions,
} from './unlocks';
export type { AchievementDef, LifetimeStats, MetaProfile, RunEndResult, Unlock } from './unlocks';

/** Создать новый забег. Один seed + класс + ascension = всегда одинаковая карта и колода. */
export function newRun(opts: NewRunOptions): RunState {
  return newRunImpl(opts);
}

/** Применить действие игрока. Бросает InvalidActionError на нелегальное действие. */
export function applyAction(state: RunState, action: Action): ActionResult {
  return applyActionImpl(state, action);
}

/** Все легальные действия в текущем состоянии (нужно боту-симулятору и UI-подсказкам). */
export function getLegalActions(state: RunState): Action[] {
  return getLegalActionsImpl(state);
}

/** Пересчитать забег с нуля по журналу действий (античит, проверка лидерборда). */
export function replay(opts: NewRunOptions, actions: Action[]): RunState {
  return replayImpl(opts, actions);
}

/** Текст карты с подставленными числами (с учётом улучшения и, если передан бой, статусов). */
export function describeCard(defId: string, upgraded: boolean): string {
  return describeCardImpl(defId, upgraded);
}

// ---------- Доступ к контенту (бросают Error на неизвестный id) ----------

function lookup<T>(map: Map<string, T>, kind: string, id: string): T {
  const v = map.get(id);
  if (v === undefined) throw new Error(`Unknown ${kind} id: ${id}`);
  return v;
}

export function getCardDef(id: string): CardDef {
  return lookup(getContent().cards, 'card', id);
}
export function getEnemyDef(id: string): EnemyDef {
  return lookup(getContent().enemies, 'enemy', id);
}
export function getRelicDef(id: string): RelicDef {
  return lookup(getContent().relics, 'relic', id);
}
export function getStatusDef(id: string): StatusDef {
  return lookup(getContent().statuses, 'status', id);
}
export function getEventDef(id: string): EventDef {
  return lookup(getContent().events, 'event', id);
}
export function getEncounterDef(id: string): EncounterDef {
  return lookup(getContent().encounters, 'encounter', id);
}
export function getClassDef(id: ClassId): ClassDef {
  return lookup(getContent().classes, 'class', id);
}
export function listClasses(): ClassDef[] {
  return [...getContent().data.classes];
}

/** Класс еженедельного вызова: детерминированно по id недели, одинаковый у всех игроков. */
export function weeklyClass(seed: string): ClassId {
  return weeklyClassId(seed, getContent().data.classes.map((c) => c.id)) as ClassId;
}

export * from './weekly';
export * from './heat';
export { canCool, canVent } from './combat';
export * from './zones';
export { MAP_ROWS, BOSS_ROW, SECTORS, SECTOR_LENGTH, sectorOf } from './map';
export { TUTORIAL_PATH, generateTutorialMap } from './map';
export { TUTORIAL_HP_MULT } from './run';

/** Совместим ли сохранённый забег с текущим движком; иначе — причина для игрока (профиль не трогаем). */
export function checkSaveCompat(state: unknown): { ok: true } | { ok: false; reason: string } {
  const v = (state as { version?: unknown } | null)?.version;
  if (v === SAVE_VERSION) return { ok: true };
  return { ok: false, reason: 'Забег создан в старой версии игры (карта и враги обновились). Начните новый забег — профиль и достижения сохранены.' };
}
export * from './implants';
