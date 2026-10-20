/**
 * Ленивое подключение сетевого слоя. Реализацию (net/index.ts → createBackend) пишет другой агент.
 * import.meta.glob не падает, если файла ещё нет — тогда работает заглушка «гость без сохранений».
 */
import type { Backend, Profile } from '../net/types';
import type { ClassId } from './engine';

type NetModule = { createBackend: () => Backend };

const loaders = import.meta.glob<NetModule>('../net/index.ts');

export function defaultProfile(): Profile {
  return {
    unlockedClasses: ['netrunner'] satisfies ClassId[],
    unlockedCards: [],
    unlockedRelics: [],
    maxAscension: { netrunner: 0, phreaker: 0, ghost: 0, samurai: 0, engineer: 0, biohacker: 0, droneop: 0, chrono: 0, vabanker: 0 },
    achievements: [],
    totalRuns: 0,
    totalWins: 0,
  };
}

/** Заглушка: гостевой режим, ничего не сохраняется. */
export function createStubBackend(): Backend {
  let profile = defaultProfile();
  return {
    mode: 'local',
    auth: {
      getUser: async () => null,
      onChange: () => () => undefined,
      signInWithEmail: async () => {
        throw new Error('Сервер авторизации недоступен: гостевой режим');
      },
      signUpWithPassword: async () => {
        throw new Error('Сервер авторизации недоступен: гостевой режим');
      },
      signInWithPassword: async () => {
        throw new Error('Сервер авторизации недоступен: гостевой режим');
      },
      signInWithOAuth: async () => {
        throw new Error('Сервер авторизации недоступен: гостевой режим');
      },
      signOut: async () => undefined,
    },
    saves: {
      loadRun: async () => null,
      saveRun: async () => undefined,
      clearRun: async () => undefined,
      loadProfile: async () => structuredClone(profile),
      saveProfile: async (p) => {
        profile = structuredClone(p);
      },
    },
    leaderboard: {
      submitWeekly: async () => ({ accepted: false }),
      getWeekly: async () => [],
      getWeeklyMine: async () => null,
    },
  };
}

let pending: Promise<Backend> | null = null;
let ready: Backend | null = null;
let isStub = false;

export function getBackend(): Promise<Backend> {
  if (!pending) {
    const load = loaders['../net/index.ts'];
    pending = (load ? load() : Promise.reject(new Error('net/index.ts отсутствует')))
      .then((m) => {
        if (typeof m.createBackend !== 'function') throw new Error('createBackend не найден');
        return m.createBackend();
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) console.info('[backend] заглушка:', e instanceof Error ? e.message : e);
        isStub = true;
        return createStubBackend();
      })
      .then((b) => (ready = b));
  }
  return pending;
}

/** Уже подключённый бэкенд (синхронно) — для сохранения на pagehide, когда ждать промис поздно. */
export function peekBackend(): Backend | null {
  return ready;
}

export function isStubBackend(): boolean {
  return isStub;
}
