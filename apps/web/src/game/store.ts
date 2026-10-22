import { create } from 'zustand';
import type { Action, ClassId, Difficulty, CombatState, GameEvent, NewRunOptions, RunEndResult, RunState } from './engine';
import { applyAction, evaluateRunEnd, newRun } from './engine';
import { markWeeklyLocal, regularRunOptions, weeklyAttemptsLeft, weeklyRunOptions, withWeeklyAttempt, withWeeklyTitle } from './meta';
import { applyRunToMetaExtra, loadMetaExtra, saveMetaExtra, setActiveMetaExtra, syncMetaAchievements, type MetaExtra } from './meta';
import { addFirmwareCopy, claimMetaAchievement, upgradeFirmware as upgradeFirmwareMeta } from '@cyberhack/engine';
import type { Backend, DeviceProfile, Profile, SavedRun, SubmitWeeklyResult, User } from '../net/types';
import { defaultProfile, getBackend, peekBackend } from './backend';
import { sfx } from '../audio/sfx';
import { animScale } from '../ui/settings';

export type View = 'menu' | 'class_select' | 'run' | 'profile' | 'howto' | 'download';

export interface QueuedEvent {
  id: number;
  ev: GameEvent;
}

export const MAX_ASCENSION = 15;

/** Итоги забега для экрана конца: новые ачивки и разблокировки */
/** Момент старта попытки недели (для времени в таблице); 0 — не еженедельный или забег продолжен после перезапуска */
let weeklyStartedAt = 0;

export type RunEndInfo = Omit<RunEndResult, 'profile'>;

interface GameStore {
  view: View;
  /** Экран еженедельного вызова вместо выбора класса */
  weeklyMode: boolean;
  /** Режим «Перегрев» выбран на экране класса */
  heatMode: boolean;
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
  /** Офлайн-профили этого устройства; null — недоступны (бэкенд-заглушка или ещё грузится) */
  accounts: { profiles: DeviceProfile[]; guestHasProgress: boolean } | null;
  profile: Profile;
  savedRun: SavedRun | null;
  backendMode: 'supabase' | 'local' | 'loading';
  weeklyResult: SubmitWeeklyResult | null;
  runEnd: RunEndInfo | null;

  setView(v: View): void;
  openClassSelect(weekly: boolean, heat?: boolean): void;
  startRun(opts: NewRunOptions): void;
  /** Обычный забег с учётом разблокировок профиля */
  startRegular(classId: ClassId, ascension: number, difficulty?: Difficulty, mutators?: readonly string[], heat?: boolean): void;
  /** Еженедельный вызов (3 попытки в неделю). false — попытка уже использована */
  startWeekly(): boolean;
  /** Загрузить готовое состояние (продолжение или dev-сценарий) */
  loadRun(state: RunState, options: NewRunOptions, actions?: Action[]): void;
  dispatch(action: Action): boolean;
  consumeEvents(uptoId: number): void;
  toMenu(): void;
  abandonRun(): Promise<void>;
  clearError(): void;

  // ---- Мета-прогресс v2 (контракт данных: прошивки-коллекция, ачивки с наградами) ----
  /** Коллекция прошивок, ачивки v2, валюта, косметика, ожидающая награда «1 из 3» */
  metaExtra: MetaExtra;
  /** Забрать награду ачивки. false — не выполнена, уже забрана или нет такой */
  claimAchievement(id: string): boolean;
  /** Выбрать прошивку из награды «1 из 3» (дубликат → копия). false — нет такой в предложении */
  pickFirmwareChoice(id: string): boolean;
  /** Отказаться от награды «1 из 3» */
  skipFirmwareChoice(): void;
  /** Улучшить прошивку за копии. false — копий не хватает или максимум */
  upgradeFirmware(id: string): boolean;
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
  weeklyMode: false,
  heatMode: false,
  run: null,
  options: null,
  actions: [],
  events: [],
  heldCombat: null,
  error: null,
  user: null,
  accounts: null,
  profile: defaultProfile(),
  savedRun: null,
  backendMode: 'loading',
  weeklyResult: null,
  runEnd: null,
  metaExtra: initialMetaExtra(),

  setView: (view) => set({ view }),
  openClassSelect: (weekly, heat = false) => set({ view: 'class_select', weeklyMode: weekly, heatMode: heat }),

  startRun(opts) {
    weeklyStartedAt = opts.weekly ? Date.now() : 0;
    try {
      const state = newRun(opts);
      get().loadRun(state, opts, []);
      saveNow();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  startRegular(classId, ascension, difficulty, mutators, heat) {
    const { profile } = get();
    if (!profile.unlockedClasses.includes(classId)) {
      set({ error: 'Класс ещё не открыт' });
      return;
    }
    const max = Math.min(MAX_ASCENSION, profile.maxAscension[classId] ?? 0);
    get().startRun(regularRunOptions(profile, classId, Math.max(0, Math.min(ascension, max)), difficulty, mutators, heat));
  },

  startWeekly() {
    const opts = weeklyRunOptions(new Date());
    const { profile } = get();
    if (weeklyAttemptsLeft(profile, opts.seed) <= 0) {
      set({ error: 'Все 3 попытки этой недели использованы' });
      return false;
    }
    get().startRun(opts);
    if (get().run?.seed !== opts.seed) return false;
    const next: Profile = withWeeklyAttempt(get().profile, opts.seed);
    markWeeklyLocal(opts.seed, next.weekly?.attempts ?? 0);
    set({ profile: next });
    void getBackend()
      .then((b) => b.saves.saveProfile(next))
      .catch(() => undefined);
    return true;
  },

  loadRun(state, options, actions = []) {
    clearTimeout(holdTimer);
    set({ run: state, options, actions, events: [], heldCombat: null, view: 'run', weeklyResult: null, runEnd: null, error: null });
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

  claimAchievement(id) {
    const { profile, metaExtra } = get();
    const r = claimMetaAchievement(profile, metaExtra, id);
    if (!r.ok) return false;
    setMetaExtra(r.extra);
    if (r.profile !== profile) {
      set({ profile: r.profile });
      void getBackend()
        .then((b) => b.saves.saveProfile(r.profile))
        .catch(() => undefined);
    }
    return true;
  },

  pickFirmwareChoice(id) {
    const { metaExtra } = get();
    if (!metaExtra.pendingFirmwareChoice?.includes(id)) return false;
    setMetaExtra({ ...addFirmwareCopy(metaExtra, id), pendingFirmwareChoice: null });
    return true;
  },

  skipFirmwareChoice() {
    const { metaExtra } = get();
    if (metaExtra.pendingFirmwareChoice) setMetaExtra({ ...metaExtra, pendingFirmwareChoice: null });
  },

  upgradeFirmware(id) {
    const { metaExtra } = get();
    const next = upgradeFirmwareMeta(metaExtra, id);
    if (next === metaExtra) return false;
    setMetaExtra(next);
    return true;
  },
}));

// ---------------- Мета-прогресс v2: хранение и автоматические события ----------------

function initialMetaExtra(): MetaExtra {
  const extra = loadMetaExtra(null);
  setActiveMetaExtra(extra);
  return extra;
}

/** Записать мета-данные: стор, опции забега, localStorage текущего пользователя. */
function setMetaExtra(extra: MetaExtra): void {
  setActiveMetaExtra(extra);
  useGame.setState({ metaExtra: extra });
  saveMetaExtra(useGame.getState().user?.id, extra);
}

/**
 * Смена пользователя → его мета-данные; новый профиль → липкая отметка выполненных ачивок;
 * конец забега (победа, поражение, брошен) → копии полученных прошивок и награда «1 из 3».
 */
useGame.subscribe((s, prev) => {
  const userChanged = (s.user?.id ?? null) !== (prev.user?.id ?? null);
  if (userChanged) {
    const extra = loadMetaExtra(s.user?.id, s.profile);
    setActiveMetaExtra(extra);
    useGame.setState({ metaExtra: extra });
    return;
  }
  let extra = s.metaExtra;
  const ended = prev.run?.status === 'active' && (!s.run || s.run.status !== 'active') ? (s.run ?? prev.run) : null;
  if (ended) extra = applyRunToMetaExtra(extra, ended);
  if (s.profile !== prev.profile || extra !== s.metaExtra) extra = syncMetaAchievements(s.profile, extra).extra;
  if (extra !== s.metaExtra) setMetaExtra(extra);
});

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
  lastWrite = ready ? write(ready) : getBackend().then(write).catch(() => undefined);
}

/** Последняя запись забега — её дожидаемся перед сменой аккаунта, чтобы забег не ушёл новому игроку. */
let lastWrite: Promise<unknown> = Promise.resolve();

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
  if (state.weekly && options) {
    try {
      const durationS = weeklyStartedAt ? Math.max(0, Math.round((Date.now() - weeklyStartedAt) / 1000)) : undefined;
      const r = await b.leaderboard.submitWeekly(state.seed, options, actions, durationS);
      const withTitle = r.accepted ? withWeeklyTitle(useGame.getState().profile, state.weekly) : null;
      useGame.setState({ weeklyResult: r, ...(withTitle ? { profile: withTitle } : {}) });
      if (withTitle) void b.saves.saveProfile(withTitle).catch(() => undefined);
    } catch {
      useGame.setState({ weeklyResult: { accepted: false } });
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
  refreshAccounts(b);
  b.auth.onChange((u) => applyUser(b, u));
}

// ---------------- Аккаунт: вход, выход, смена профиля ----------------

/** Номер последней смены пользователя: ответы для прежнего пользователя отбрасываются. */
let userSeq = 0;

/** Список офлайн-профилей устройства → в стор (для экрана профиля). */
function refreshAccounts(b: Backend): void {
  const api = b.profiles;
  try {
    useGame.setState({ accounts: api ? { profiles: api.list(), guestHasProgress: api.guestHasProgress() } : null });
  } catch {
    useGame.setState({ accounts: null });
  }
}

/**
 * Пользователь сменился (вход, выход, переключение профиля) — забег и профиль прежнего
 * не должны достаться новому: всё сбрасываем и грузим данные нового пользователя.
 * Тот же пользователь (обновление токена) — только перечитываем профиль и сохранение.
 */
function applyUser(b: Backend, u: User | null): void {
  const prev = useGame.getState().user;
  const changed = (prev?.id ?? null) !== (u?.id ?? null);
  const seq = ++userSeq;
  if (changed) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    clearTimeout(holdTimer);
    const { view } = useGame.getState();
    useGame.setState({
      user: u,
      profile: defaultProfile(),
      savedRun: null,
      run: null,
      options: null,
      actions: [],
      events: [],
      heldCombat: null,
      runEnd: null,
      weeklyResult: null,
      view: view === 'run' ? 'menu' : view,
    });
  } else {
    useGame.setState({ user: u });
  }
  refreshAccounts(b);
  void Promise.allSettled([b.saves.loadProfile(), b.saves.loadRun()]).then(([p, r]) => {
    if (seq !== userSeq) return; // пока грузили, пользователь сменился ещё раз
    const patch: Partial<GameStore> = {};
    if (p.status === 'fulfilled') patch.profile = p.value;
    if (r.status === 'fulfilled') patch.savedRun = r.value && r.value.state.status === 'active' ? r.value : null;
    useGame.setState(patch);
  });
}

/**
 * Выполнить действие с аккаунтом (войти, выйти, создать/удалить профиль).
 * Сначала дописываем отложенное сохранение забега прежнему пользователю — иначе
 * таймер сохранения сработал бы уже после переключения и записал забег новому.
 */
export async function accountAction<T>(fn: (b: Backend) => Promise<T>): Promise<T> {
  flushSave();
  await lastWrite;
  const b = await getBackend();
  try {
    return await fn(b);
  } finally {
    refreshAccounts(b);
  }
}
