/**
 * Состояние обучения (отдельный zustand-стор) и переходы между шагами.
 * Шаги двигаются подпиской на useGame: сыграл карту, нажал «Конец хода», сменился экран.
 */
import { create } from 'zustand';
import { unlockedOptions, type ClassId, type Difficulty, type NewRunOptions } from '../game/engine';
import { useGame } from '../game/store';
import { readTutorialFlag, writeTutorialFlag, type TutorialFlag } from './storage';
import { STEPS, TUTORIAL_SEED, makeSnap, type Ctx, type ScreenKey, type Snap } from './steps';

interface TutorialState {
  active: boolean;
  index: number;
  snap: Snap;
  pre: { block: number; hp: number };
  /** Спросить, можно ли затереть незаконченный забег */
  confirm: boolean;
  /** Окно выбора класса и режима перед обучением */
  setup: boolean;
  /** Приглашение закрыто в этой сессии (Esc) */
  inviteClosed: boolean;
  /** Копия флага из localStorage */
  flag: TutorialFlag | null;
}

const EMPTY_SNAP: Snap = { enemyHp: 0, block: 0, hp: 0, turn: 0 };

export const useTutorial = create<TutorialState>(() => ({
  active: false,
  index: 0,
  snap: EMPTY_SNAP,
  pre: { block: 0, hp: 0 },
  confirm: false,
  setup: false,
  inviteClosed: false,
  flag: readTutorialFlag(),
}));

type GameState = ReturnType<typeof useGame.getState>;
type GameView = Pick<GameState, 'run' | 'heldCombat' | 'view'>;

export function screenOf(g: GameView): ScreenKey {
  const run = g.run;
  if (g.view !== 'run' || !run) return 'none';
  if (g.heldCombat) return 'combat';
  switch (run.screen.kind) {
    case 'combat':
      return run.combat ? 'combat' : 'map';
    case 'map':
      return 'map';
    case 'reward':
      return 'reward';
    case 'card_pick':
      return 'card_pick';
    default:
      return 'other';
  }
}

export function ctxOf(g: GameView, t: Pick<TutorialState, 'snap' | 'pre'>): Ctx | null {
  if (!g.run) return null;
  return { run: g.run, combat: g.heldCombat ?? g.run.combat ?? null, screen: screenOf(g), snap: t.snap, pre: t.pre };
}

/** Перейти к шагу i (с пропуском неактуальных) и снять снимок боя. */
function goTo(i: number): void {
  const g = useGame.getState();
  let idx = i;
  for (; idx < STEPS.length; idx++) {
    const step = STEPS[idx]!;
    const c = ctxOf(g, useTutorial.getState());
    if (!c || !step.skip?.(c)) break;
  }
  if (idx >= STEPS.length) {
    finishTutorial();
    return;
  }
  const combat = g.heldCombat ?? g.run?.combat ?? null;
  const snap = makeSnap(combat);
  // «pre» — блок и HP перед концом хода: заводим на входе в шаг «Конец хода» и не трогаем после
  const pre = STEPS[idx]!.id === 'end-turn' ? { block: snap.block, hp: snap.hp } : useTutorial.getState().pre;
  useTutorial.setState({ index: idx, snap, pre });
  if (STEPS[idx]!.id === 'done') markFlag('done');
}

function markFlag(v: TutorialFlag): void {
  writeTutorialFlag(v);
  useTutorial.setState({ flag: readTutorialFlag() ?? v });
}

let unsubscribe: (() => void) | null = null;

function onGameChange(g: GameState): void {
  const t = useTutorial.getState();
  if (!t.active) return;
  const run = g.run;
  // Забег сменился или закончился — обучение молча завершается
  if (!run || run.seed !== TUTORIAL_SEED || run.status !== 'active') {
    stop();
    return;
  }
  const step = STEPS[t.index];
  if (!step) return;
  const c = ctxOf(g, t);
  if (!c) return;
  // Перед концом хода запоминаем блок и HP: по ним потом объясняем, что сделал враг
  if (step.id === 'end-turn' && c.combat && c.combat.phase === 'player' && c.combat.turn === t.snap.turn) {
    const pre = { block: c.combat.player.block, hp: c.combat.player.hp };
    if (pre.block !== t.pre.block || pre.hp !== t.pre.hp) useTutorial.setState({ pre });
  }
  if (step.done?.(c)) goTo(t.index + 1);
}

function stop(): void {
  unsubscribe?.();
  unsubscribe = null;
  useTutorial.setState({ active: false, index: 0, confirm: false, setup: false });
}

/** Начать обучение: обычный забег с фиксированным сидом, выбранные класс и режим, A0. */
export function beginTutorial(classId: ClassId = 'netrunner', difficulty: Difficulty = 'normal'): void {
  const g = useGame.getState();
  let unlocked: NewRunOptions['unlocked'];
  try {
    unlocked = unlockedOptions(g.profile);
  } catch {
    unlocked = undefined;
  }
  const opts: NewRunOptions = { seed: TUTORIAL_SEED, classId, ascension: 0, difficulty, ...(unlocked ? { unlocked } : {}) };
  useTutorial.setState({ confirm: false, setup: false, inviteClosed: true });
  g.startRun(opts);
  if (useGame.getState().run?.seed !== TUTORIAL_SEED) return; // движок вернул ошибку — её покажет тост
  unsubscribe?.();
  unsubscribe = useGame.subscribe(onGameChange);
  useTutorial.setState({ active: true });
  goTo(0);
}

/** Есть незаконченный забег, который обучение затрёт. */
export function hasActiveRun(): boolean {
  const g = useGame.getState();
  return !!((g.run && g.run.status === 'active') || g.savedRun);
}

export function nextStep(): void {
  const t = useTutorial.getState();
  if (t.active) goTo(t.index + 1);
}

export function skipTutorial(): void {
  markFlag('skipped');
  stop();
}

export function finishTutorial(toMenu = false): void {
  markFlag('done');
  stop();
  if (toMenu) useGame.getState().toMenu();
}

export function declineInvite(): void {
  markFlag('skipped');
  useTutorial.setState({ inviteClosed: true });
}
