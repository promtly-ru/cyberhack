/**
 * КОНТРАКТ СЕТЕВОГО СЛОЯ. UI использует только этот интерфейс, реализация — в net/supabase.ts
 * и net/local.ts (гостевой режим без бэкенда / без env-переменных).
 */
import type { Action, ClassId, LifetimeStats, NewRunOptions, RunState } from '@cyberhack/engine';

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  /** 'local' — офлайн-профиль на этом устройстве (ник + необязательный PIN), 'guest' — гость по умолчанию */
  provider: 'email' | 'google' | 'github' | 'local' | 'guest';
}

export interface Profile {
  /** Метапрогрессия: разблокированные классы/карты/реликвии и высшая пройденная сложность */
  unlockedClasses: ClassId[];
  unlockedCards: string[];
  unlockedRelics: string[];
  maxAscension: Record<ClassId, number>;
  achievements: string[];
  totalRuns: number;
  totalWins: number;
  // ---- Расширения (опциональные) ----
  /** Накопительная статистика и рекорды для достижений (слияние — максимум по ключу) */
  lifetime?: LifetimeStats;
  /** Еженедельный вызов: id недели ('2026-W43') и сколько из 3 попыток начато */
  weekly?: WeeklyProgress;
  /** Эксклюзивные титулы (например «Чемпион W43») */
  titles?: string[];
}

export interface WeeklyProgress {
  seed: string;
  attempts: number;
}

export interface SavedRun {
  options: NewRunOptions;
  actions: Action[];
  state: RunState;
  updatedAt: string; // ISO
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  classId: ClassId;
  score: number;
  floor: number;
  victory: boolean;
  /** Длительность забега, сек (если известна) */
  durationS?: number | null;
}

export interface SubmitWeeklyResult {
  accepted: boolean;
  rank?: number;
  /** Номер использованной попытки (1..3) */
  attempt?: number;
  attemptsLeft?: number;
  /** Причина отказа сервера: attempts_exhausted, seed_not_active, ... */
  reason?: string;
}

export interface AuthApi {
  /** null = не вошёл (гость) */
  getUser(): Promise<User | null>;
  onChange(cb: (user: User | null) => void): () => void;
  signInWithEmail(email: string): Promise<void>; // magic link
  /** Регистрация по почте и паролю. true — нужно подтвердить почту по письму */
  signUpWithPassword(email: string, password: string): Promise<{ confirmEmail: boolean }>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signInWithOAuth(provider: 'google' | 'github'): Promise<void>;
  signOut(): Promise<void>;
}

export interface SavesApi {
  loadRun(): Promise<SavedRun | null>;
  /** Офлайн: кладёт в очередь и досылает при появлении сети */
  saveRun(run: SavedRun): Promise<void>;
  clearRun(): Promise<void>;
  loadProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;
}

export interface LeaderboardApi {
  /** Сервер пересчитывает забег через replay() и только потом записывает результат */
  submitWeekly(seed: string, options: NewRunOptions, actions: Action[], durationS?: number): Promise<SubmitWeeklyResult>;
  /** Топ недели: одна строка на игрока (лучшая попытка) */
  getWeekly(seed: string, limit?: number): Promise<LeaderboardEntry[]>;
  /** Своя строка в таблице недели (null — не играл или гость без входа) */
  getWeeklyMine(seed: string): Promise<LeaderboardEntry | null>;
}

/** Офлайн-профиль на этом устройстве (без PIN-хеша — он не покидает net/). */
export interface DeviceProfile {
  id: string;
  name: string;
  hasPin: boolean;
  createdAt: string; // ISO
}

/**
 * Офлайн-профили: несколько игроков на одном устройстве, у каждого свой прогресс.
 * Работают без сервера. Ошибки — LocalProfileError с понятным текстом.
 */
export interface DeviceProfilesApi {
  /** Все профили этого устройства (по алфавиту) */
  list(): DeviceProfile[];
  /** Активный офлайн-профиль; null — играет гость */
  current(): DeviceProfile | null;
  /** Есть ли у гостя прогресс или сохранённый забег (для галочки «Перенести прогресс гостя») */
  guestHasProgress(): boolean;
  /** Создать профиль и сразу войти в него */
  create(input: { name: string; pin?: string; importGuest?: boolean }): Promise<User>;
  signIn(id: string, pin?: string): Promise<User>;
  /** Выйти из офлайн-профиля — снова гость */
  signOut(): Promise<void>;
  /** Удалить профиль и весь его прогресс. Если у профиля есть PIN — нужен PIN */
  remove(id: string, pin?: string): Promise<void>;
}

export interface Backend {
  mode: 'supabase' | 'local';
  auth: AuthApi;
  saves: SavesApi;
  leaderboard: LeaderboardApi;
  /** Офлайн-профили устройства (нет у заглушки) */
  profiles?: DeviceProfilesApi;
}
