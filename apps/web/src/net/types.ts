/**
 * КОНТРАКТ СЕТЕВОГО СЛОЯ. UI использует только этот интерфейс, реализация — в net/supabase.ts
 * и net/local.ts (гостевой режим без бэкенда / без env-переменных).
 */
import type { Action, ClassId, NewRunOptions, RunState } from '@cyberhack/engine';

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  provider: 'email' | 'google' | 'github' | 'guest';
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

export interface Backend {
  mode: 'supabase' | 'local';
  auth: AuthApi;
  saves: SavesApi;
  leaderboard: LeaderboardApi;
}
