/**
 * Хранилище ключ-значение (подмножество Web Storage API).
 * Внедряется в local/supabase-бэкенды, чтобы тестировать их без браузера.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_PREFIX = 'cyberhack:';

/** Ошибка записи: закончилась квота или хранилище недоступно (приватный режим). */
export class StorageWriteError extends Error {
  constructor(
    message: string,
    readonly quotaExceeded: boolean,
  ) {
    super(message);
    this.name = 'StorageWriteError';
  }
}

/** Хранилище в памяти: для тестов и как запасной вариант, если localStorage недоступен. */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

/** localStorage браузера; если его нет или он запрещён — память (данные живут до перезагрузки). */
export function browserStorage(): KeyValueStorage {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = `${STORAGE_PREFIX}__probe__`;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    // SecurityError в приватном режиме / отключённых cookies
  }
  return new MemoryStorage();
}

function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { name?: string; code?: number };
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

/** Прочитать JSON. Нет ключа, повреждённый JSON или ошибка доступа → null. */
export function readJson(storage: KeyValueStorage, key: string): unknown {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Записать JSON. Бросает StorageWriteError с понятным текстом. */
export function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  try {
    storage.setItem(key, raw);
  } catch (e) {
    if (isQuotaError(e)) {
      throw new StorageWriteError('Не хватает места в хранилище браузера, сохранение не записано', true);
    }
    throw new StorageWriteError('Хранилище браузера недоступно, сохранение не записано', false);
  }
}

export function removeKey(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // нечего делать: ключ останется, при чтении будет перезаписан
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
