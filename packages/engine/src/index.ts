/**
 * Публичный API движка. Сигнатуры ниже — контракт, реализация в отдельных модулях.
 * Все функции чистые: не мутируют входной state, детерминированы по seed.
 */
import type {
  Action,
  ActionResult,
  CardDef,
  ClassDef,
  ClassId,
  EnemyDef,
  EventDef,
  NewRunOptions,
  RelicDef,
  RunState,
  StatusDef,
} from './types';

export * from './types';

/** Создать новый забег. Один seed + класс + ascension = всегда одинаковая карта и колода. */
export function newRun(_opts: NewRunOptions): RunState {
  throw new Error('newRun: not implemented');
}

/** Применить действие игрока. Бросает InvalidActionError на нелегальное действие. */
export function applyAction(_state: RunState, _action: Action): ActionResult {
  throw new Error('applyAction: not implemented');
}

/** Все легальные действия в текущем состоянии (нужно боту-симулятору и UI-подсказкам). */
export function getLegalActions(_state: RunState): Action[] {
  throw new Error('getLegalActions: not implemented');
}

/** Пересчитать забег с нуля по журналу действий (античит, проверка лидерборда). */
export function replay(_opts: NewRunOptions, _actions: Action[]): RunState {
  throw new Error('replay: not implemented');
}

/** Текст карты с подставленными числами (с учётом улучшения и, если передан бой, статусов). */
export function describeCard(_defId: string, _upgraded: boolean): string {
  throw new Error('describeCard: not implemented');
}

// ---------- Доступ к контенту (бросают Error на неизвестный id) ----------

export function getCardDef(_id: string): CardDef {
  throw new Error('getCardDef: not implemented');
}
export function getEnemyDef(_id: string): EnemyDef {
  throw new Error('getEnemyDef: not implemented');
}
export function getRelicDef(_id: string): RelicDef {
  throw new Error('getRelicDef: not implemented');
}
export function getStatusDef(_id: string): StatusDef {
  throw new Error('getStatusDef: not implemented');
}
export function getEventDef(_id: string): EventDef {
  throw new Error('getEventDef: not implemented');
}
export function getClassDef(_id: ClassId): ClassDef {
  throw new Error('getClassDef: not implemented');
}
export function listClasses(): ClassDef[] {
  throw new Error('listClasses: not implemented');
}

/** Ежедневный сид по дате UTC: 'daily-2026-10-18'. */
export function dailySeed(date: Date): string {
  return `daily-${date.toISOString().slice(0, 10)}`;
}
