/**
 * Единственная точка импорта из '@cyberhack/engine' для UI.
 * Пока функция движка бросает 'not implemented', вызывается мок из dev/mock.ts.
 * Когда движок реализует функцию, мок для неё отключается сам.
 */
import * as real from '@cyberhack/engine';
import * as mock from '../dev/mock';

export type * from '@cyberhack/engine';
export { InvalidActionError, SAVE_VERSION } from '@cyberhack/engine';
// Метапрогрессия и ascension — только настоящий движок (мока нет)
export {
  ACHIEVEMENTS,
  DIFFICULTY_CARDS,
  DIFFICULTY_INFO,
  SYNERGIES,
  FIRMWARES,
  getFirmware,
  blackboxForceCost,
  blackboxHackCost,
  meetsRequires,
  RELAY_HEAL_PCT,
  MAX_SHOP_REFRESHES,
  firmwareProgress,
  isFirmwareActive,
  getActiveSynergies,
  STARTING_CLASSES,
  achievementProgress,
  evaluateRunEnd,
  getAchievement,
  getAscensionDescriptions,
  lockableCards,
  lockableRelics,
  unlockSource,
  unlockSources,
  unlockedOptions,
  // Расходники и мутаторы забега
  POTIONS,
  POTION_SLOTS,
  getPotion,
  canUsePotionNow,
  MUTATORS,
  getMutator,
  // Еженедельный вызов
  WEEKLY_ATTEMPTS,
  WEEKLY_RULES,
  getWeeklyRule,
  weeklySeed,
  weeklyClass,
  weeklyRule,
  weeklyMutatorIds,
  weeklyScoreMult,
  weeklyResetAt,
  prevWeeklySeed,
  weeklyTitle,
  // Режим «Перегрев»
  HEAT_MAX,
  HEAT_COOL_AMOUNT,
  HEAT_COOL_HP,
  HEAT_THRESHOLDS,
  heatLevel,
  canCool,
} from '@cyberhack/engine';

const mocked = new Set<string>();

function isNotImplemented(e: unknown): boolean {
  return e instanceof Error && /not implemented/i.test(e.message);
}

/** Функции забега: настоящий движок, а при 'not implemented' — мок (навсегда для этой функции). */
function withFallback<A extends unknown[], R>(name: string, realFn: (...a: A) => R, mockFn: (...a: A) => R): (...a: A) => R {
  return (...args: A): R => {
    if (!mocked.has(name)) {
      try {
        return realFn(...args);
      } catch (e) {
        if (!isNotImplemented(e)) throw e;
        mocked.add(name);
        if (import.meta.env.DEV) console.info(`[engine] ${name}: движок не готов, использую мок`);
      }
    }
    return mockFn(...args);
  };
}

/**
 * Доступ к контенту: настоящий движок; если он не готов или не знает id — мок
 * (нужно, пока у движка пустые content/*.json, а состояние пришло из мока).
 */
function contentFallback<R>(name: string, realFn: (id: never) => R, mockFind: (id: string) => R | undefined) {
  return (id: string): R => {
    if (!mocked.has(name)) {
      try {
        return (realFn as (id: string) => R)(id);
      } catch (e) {
        if (isNotImplemented(e)) mocked.add(name);
        const m = mockFind(id);
        if (m) return m;
        throw e;
      }
    }
    const m = mockFind(id);
    if (m) return m;
    throw new Error(`Неизвестный id '${id}' (${name})`);
  };
}

export const newRun = withFallback('newRun', real.newRun, mock.newRun);
export const applyAction = withFallback('applyAction', real.applyAction, mock.applyAction);
export const getLegalActions = withFallback('getLegalActions', real.getLegalActions, mock.getLegalActions);
export const replay = withFallback('replay', real.replay, mock.replay);
export const listClasses = withFallback('listClasses', real.listClasses, mock.listClasses);

export const getCardDef = contentFallback('getCardDef', real.getCardDef, mock.mockFind.card);
export const getEnemyDef = contentFallback('getEnemyDef', real.getEnemyDef, mock.mockFind.enemy);
export const getRelicDef = contentFallback('getRelicDef', real.getRelicDef, mock.mockFind.relic);
export const getStatusDef = contentFallback('getStatusDef', real.getStatusDef, mock.mockFind.status);
export const getEventDef = contentFallback('getEventDef', real.getEventDef, mock.mockFind.event);
export const getClassDef = contentFallback('getClassDef', real.getClassDef, mock.mockFind.cls) as (id: real.ClassId) => real.ClassDef;

export function describeCard(defId: string, upgraded: boolean): string {
  if (!mocked.has('describeCard')) {
    try {
      return real.describeCard(defId, upgraded);
    } catch (e) {
      if (isNotImplemented(e)) mocked.add('describeCard');
      else if (!mock.mockFind.card(defId)) throw e;
    }
  }
  return mock.describeCard(defId, upgraded);
}

/** Безопасные варианты для рендера: не роняют UI на неизвестном id. */
export function tryStatusDef(id: string): real.StatusDef | null {
  try {
    return getStatusDef(id);
  } catch {
    return null;
  }
}
export function tryRelicDef(id: string): real.RelicDef | null {
  try {
    return getRelicDef(id);
  } catch {
    return null;
  }
}

/** Итоговая стоимость/флаги карты с учётом улучшения. */
export function cardStats(defId: string, upgraded: boolean) {
  const d = getCardDef(defId);
  const u = upgraded ? d.upgrade : undefined;
  return {
    def: d,
    name: (upgraded ? u?.name : undefined) ?? d.name,
    cost: u?.cost ?? d.cost,
    exhaust: u?.exhaust ?? d.exhaust ?? false,
    ethereal: d.ethereal ?? false,
    retain: u?.retain ?? d.retain ?? false,
    innate: u?.innate ?? d.innate ?? false,
    echo: u?.echo ?? d.echo ?? false,
  };
}

/** Используется ли где-то мок (для плашки «DEV: мок движка»). */
export function isMockActive(): boolean {
  return mocked.size > 0;
}

/** Мок-сценарии (только когда движок не готов или в dev-сборке). */
export function devScenario(kind: mock.DevScenario): real.RunState | null {
  let s: real.RunState;
  try {
    s = real.newRun({ seed: 'dev-shot', classId: 'netrunner' });
  } catch {
    return mock.mockScenario(kind); // движок не готов — полный мок-сценарий
  }
  // Настоящий движок: карта или первый бой
  if (kind === 'map') return s;
  if (kind === 'combat') {
    // Бой с несколькими врагами — на нём видно выбор цели (с одним врагом карта играется сразу)
    let first: real.RunState | undefined;
    for (let i = 0; i < 20; i++) {
      const base = i === 0 ? s : real.newRun({ seed: `dev-shot-${i}`, classId: 'netrunner' });
      for (const a of real.getLegalActions(base)) {
        if (a.type !== 'choose_node') continue;
        const st = real.applyAction(base, a).state;
        first ??= st;
        if ((st.combat?.enemies.length ?? 0) > 1) return st;
      }
    }
    return first ?? s;
  }
  return mock.mockScenario(kind);
}
export type DevScenario = mock.DevScenario;
