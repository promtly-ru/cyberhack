/**
 * Публичный API движка. Сигнатуры ниже — контракт, реализация в отдельных модулях.
 * Все функции чистые: не мутируют входной state, детерминированы по seed.
 */
import { describeCard as describeCardImpl } from './cards';
import { getContent } from './content';
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
export { getAscensionDescriptions, getAscensionMods, MAX_ASCENSION } from './ascension';
export type { AscensionMods } from './ascension';
export { computeScore } from './score';
export { availableNodes, currentNode } from './run';
export { calcAttackDamage, calcBlock, STATUS } from './statuses';
export { hashString } from './rng';

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

/** Ежедневный сид по дате UTC: 'daily-2026-10-18'. */
export function dailySeed(date: Date): string {
  return `daily-${date.toISOString().slice(0, 10)}`;
}
