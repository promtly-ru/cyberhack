import { create } from 'zustand';
import type { Action, ClassId, CombatState, GameEvent, NewRunOptions, RunEndResult, RunState } from './engine';
import { applyAction, evaluateRunEnd, newRun } from './engine';
import { dailyRunOptions, hasPlayedDaily, markDailyLocal, regularRunOptions } from './meta';
import type { Backend, Profile, SavedRun, User } from '../net/types';
import { defaultProfile, getBackend, peekBackend } from './backend';
import { sfx } from '../audio/sfx';
import { animScale } from '../ui/settings';

export type View = 'menu' | 'class_select' | 'run' | 'profile';

export interface QueuedEvent {
  id: number;
  ev: GameEvent;
}

export const MAX_ASCENSION = 15;

/** Итоги забега для экрана конца: новые ачивки и разблокировки */
export type RunEndInfo = Omit<RunEndResult, 'profile'>;

interface GameStore {
  view: View;
  /** Выбор класса для ежедневного забега */
  dailyMode: boolean;
  run: RunState | null;
  options: NewRunOptions | null;
  /** Журнал действий — для сохранений и replay() на сервере */
  actions: Action[];
  /** Очередь событий для анимаций; потребляет слой эффектов */
  events: QueuedEvent[];
  /** Бой, который ещё показываем после победы/поражения, пока играют анимации */
  heldCombat: CombatState | null;
  error: string | null;

  user: User | null;
  profile: Profile;
  savedRun: SavedRun | null;
  backendMode: 'supabase' | 'local' | 'loading';
  dailyResult: { accepted: boolean; rank?: number } | null;
  runEnd: RunEndInfo | null;

  setView(v: View): void;
  openClassSelect(daily: boolean): void;
  startRun(opts: NewRunOptions): void;
  /** Обычный забег с учётом разблокировок профиля */
  startRegular(classId: ClassId, ascension: number): void;
  /** Ежедневный забег (одна попытка в день). false — попытка уже использована */
  startDaily(): boolean;
  /** Загрузить готовое состояние (продолжение или dev-сценарий) */
  loadRun(state: RunState, options: NewRunOptions, actions?: Action[]): void;
  dispatch(action: Action): boolean;
  consumeEvents(uptoId: number): void;
  toMenu(): void;
  abandonRun(): Promise<void>;
  clearError(): void;
}

let eventSeq = 0;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Финальная картинка боя по событиям — если движок обнулил combat после победы. */
function finalCombat(prev: CombatState, events: GameEvent[]): CombatState {
  const cb = structuredClone(prev);
  for (const ev of events) {
    if (ev.type === 'damage') {
      const t = ev.targetUid === 'player' ? cb.player : cb.enemies.find((e) => e.uid === ev.targetUid);
      if (t) {
        t.block = Math.max(0, t.block - ev.blocked);
        t.hp = Math.max(0, t.hp - ev.amount);
      }
    } else if (ev.type === 'enemy_died') {
      const e = cb.enemies.find((x) => x.uid === ev.enemyUid);
      if (e) e.hp = 0;
    } else if (ev.type === 'card_played') {
      cb.hand = cb.hand.filter((c) => c.uid !== ev.cardUid);
    }
  }
  cb.phase = events.some((e) => e.type === 'combat_lost') ? 'lost' : 'won';
  return cb;
}

export const useGame = create<GameStore>((set, get) => ({
  view: 'menu',
  dailyMode: false,
  run: null,
  options: null,
  actions: [],
  events: [],
  heldCombat: null,
  error: null,
  user: null,
  profile: defaultProfile(),
  savedRun: null,
  backendMode: 'loading',
  dailyResult: null,
  runEnd: null,

  setView: (view) => set({ view }),
  openClassSelect: (daily) => set({ view: 'class_select', dailyMode: daily }),

  startRun(opts) {
    try {
      const state = newRun(opts);
      get().loadRun(state, opts, []);
      saveNow();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  startRegular(classId, ascension) {
    const { profile } = get();
    if (!profile.unlockedClasses.includes(classId)) {
      set({ error: 'Класс ещё не открыт' });
      return;
    }
    const max = Math.min(MAX_ASCENSION, profile.maxAscension[classId] ?? 0);
    get().startRun(regularRunOptions(profile, classId, Math.max(0, Math.min(ascension, max))));
  },

  startDaily() {
    const opts = dailyRunOptions(new Date());
    const { profile } = get();
    if (hasPlayedDaily(profile, opts.seed)) {
      set({ error: 'Ежедневный взлом уже сыгран сегодня' });
      return false;
    }
    get().startRun(opts);
    if (get().run?.seed !== opts.seed) return false;
    const next: Profile = { ...get().profile, dailyPlayed: opts.seed };
    markDailyLocal(opts.seed);
    set({ profile: next });
    void getBackend()
      .then((b) => b.saves.saveProfile(next))
      .catch(() => undefined);
    return true;
  },

  loadRun(state, options, actions = []) {
    clearTimeout(holdTimer);
    set({ run: state, options, actions, events: [], heldCombat: null, view: 'run', dailyResult: null, runEnd: null, error: null });
  },

  dispatch(action) {
    const { run, actions, events } = get();
    if (!run || run.status !== 'active') return false;
    let res;
    try {
      res = applyAction(run, action);
    } catch (e) {
      sfx('error');
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
    const queued = res.events.map((ev) => ({ id: ++eventSeq, ev }));
    const ended = res.events.some((e) => e.type === 'combat_won' || e.type === 'combat_lost');
    let heldCombat = get().heldCombat;
    if (ended && run.combat) {
      heldCombat = res.state.combat ?? finalCombat(run.combat, res.events);
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => set({ heldCombat: null }), 1500 * animScale());
    }
    set({ run: res.state, actions: [...actions, action], events: [...events, ...queued].slice(-200), heldCombat, error: null });
    // Смена экрана (узел карты, награда, выход из боя) — сохраняем сразу, иначе перезагрузка в первые 400 мс теряет шаг
    if (res.state.screen.kind !== run.screen.kind || !res.state.combat !== !run.combat) saveNow();
    else scheduleSave();
    if (res.state.status !== 'active' && run.status === 'active') void onRunEnded(res.state);
    return true;
  },

  consumeEvents(uptoId) {
    set((s) => ({ events: s.events.filter((e) => e.id > uptoId) }));
  },

  toMenu() {
    clearTimeout(holdTimer);
    set({ view: 'menu', heldCombat: null, events: [] });
    void refreshSaved();
  },

  async abandonRun() {
    const { run } = get();
    clearTimeout(saveTimer);
    set({ run: null, options: null, actions: [], events: [], heldCombat: null, view: 'menu', savedRun: null });
    if (run && run.status === 'active') {
      const b = await getBackend();
      // Брошенный забег = поражение: счётчики и рекорды всё равно идут в зачёт
      const p = applyRunEnd(get().profile, run).profile;
      set({ profile: p });
      await Promise.allSettled([b.saves.clearRun(), b.saves.saveProfile(p)]);
    }
  },

  clearError: () => set({ error: null }),
}));

/** Отложенное сохранение: частые действия в бою (розыгрыш карт) склеиваются в одну запись. */
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

/** Сохранить забег сейчас же (отменяя отложенное сохранение). */
function saveNow(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const { run, options, actions } = useGame.getState();
  if (!run || !options || run.status !== 'active') return;
  const saved: SavedRun = { options, actions, state: run, updatedAt: new Date().toISOString() };
  useGame.setState({ savedRun: saved });
  // Если бэкенд уже подключён — пишем синхронно: на pagehide промис может не успеть
  const ready = peekBackend();
  const write = (b: Backend) => b.saves.saveRun(saved).catch(() => undefined);
  if (ready) void write(ready);
  else void getBackend().then(write).catch(() => undefined);
}

/** Досохранить отложенное (уход со вкладки, сворачивание, закрытие страницы). */
export function flushSave(): void {
  if (saveTimer !== undefined) saveNow();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}

/** Итоги забега → новый профиль (с сохранением полей, о которых движок не знает). */
function applyRunEnd(profile: Profile, state: RunState): { profile: Profile; info: RunEndInfo } {
  const { profile: meta, ...info } = evaluateRunEnd(profile, state);
  return { profile: { ...profile, ...meta }, info };
}

async function onRunEnded(state: RunState): Promise<void> {
  const b = await getBackend();
  const { profile, options, actions } = useGame.getState();
  const { profile: next, info } = applyRunEnd(profile, state);
  useGame.setState({ profile: next, savedRun: null, runEnd: info });
  await Promise.allSettled([b.saves.clearRun(), b.saves.saveProfile(next)]);
  if (state.daily && options) {
    try {
      const r = await b.leaderboard.submitDaily(state.seed, options, actions);
      useGame.setState({ dailyResult: r });
    } catch {
      useGame.setState({ dailyResult: { accepted: false } });
    }
  }
}

async function refreshSaved(): Promise<void> {
  try {
    const b = await getBackend();
    const saved = await b.saves.loadRun();
    useGame.setState({ savedRun: saved && saved.state.status === 'active' ? saved : null });
  } catch {
    /* офлайн — оставляем как есть */
  }
}

/** Подключить бэкенд: пользователь, профиль, сохранённый забег. */
export async function initBackend(): Promise<void> {
  const b = await getBackend();
  useGame.setState({ backendMode: b.mode });
  const [user, profile, saved] = await Promise.allSettled([b.auth.getUser(), b.saves.loadProfile(), b.saves.loadRun()]);
  useGame.setState({
    user: user.status === 'fulfilled' ? user.value : null,
    profile: profile.status === 'fulfilled' ? profile.value : defaultProfile(),
    savedRun: saved.status === 'fulfilled' && saved.value && saved.value.state.status === 'active' ? saved.value : null,
  });
  b.auth.onChange((u) => {
    useGame.setState({ user: u });
    void b.saves.loadProfile().then((p) => useGame.setState({ profile: p })).catch(() => undefined);
    void refreshSaved();
  });
}
