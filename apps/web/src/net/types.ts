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
  /** Сид последнего начатого ежедневного забега ('daily-YYYY-MM-DD'): одна попытка в день */
  dailyPlayed?: string;
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
  submitDaily(seed: string, options: NewRunOptions, actions: Action[]): Promise<{ accepted: boolean; rank?: number }>;
  getDaily(seed: string, limit?: number): Promise<LeaderboardEntry[]>;
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
