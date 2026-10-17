/**
 * Детерминированный ГСЧ: mulberry32, состояние — одно uint32-число на поток.
 * Seed-строка → хэш (cyrb-подобный mix) → начальное состояние каждого потока.
 * Никаких Math.random/Date.
 */
import type { RunState } from './types';

export type RngStream = keyof RunState['rng'];
export type RngStore = RunState['rng'];

export const RNG_STREAMS: readonly RngStream[] = ['map', 'combat', 'cards', 'rewards', 'events', 'shop', 'ai'];

/** 32-битный хэш строки (детерминированный, без зависимостей). */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Один шаг mulberry32: возвращает [число в [0,1), новое состояние]. */
export function mulberry32(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function createRngStore(seed: string): RngStore {
  const store = {} as RngStore;
  for (const s of RNG_STREAMS) store[s] = hashString(`${seed}::${s}`);
  return store;
}

/** Обёртка над одним потоком; мутирует store (вызывающий код работает с клоном состояния). */
export class Rng {
  constructor(
    private readonly store: RngStore,
    private readonly stream: RngStream,
  ) {}

  next(): number {
    const [v, s] = mulberry32(this.store[this.stream]);
    this.store[this.stream] = s;
    return v;
  }

  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  /** Перемешивание на месте (Фишер–Йетс). Возвращает тот же массив. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = tmp;
    }
    return arr;
  }

  /** Взвешенный выбор; элементы с весом <= 0 не выбираются. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const valid = items.filter(([, w]) => w > 0);
    if (valid.length === 0) throw new Error('Rng.weighted: no positive weights');
    const total = valid.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [item, w] of valid) {
      roll -= w;
      if (roll < 0) return item;
    }
    return (valid[valid.length - 1] as readonly [T, number])[0];
  }
}

export function rngOf(state: { rng: RngStore }, stream: RngStream): Rng {
  return new Rng(state.rng, stream);
}
