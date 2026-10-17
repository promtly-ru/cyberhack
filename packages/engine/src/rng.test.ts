import { describe, expect, it } from 'vitest';
import { createRngStore, hashString, mulberry32, Rng, RNG_STREAMS, rngOf } from './rng';

describe('rng', () => {
  it('hashString детерминирован и различает строки', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(Number.isInteger(hashString(''))).toBe(true);
    expect(hashString('x')).toBeGreaterThanOrEqual(0);
  });

  it('mulberry32 даёт числа в [0,1) и сериализуемое состояние', () => {
    let st = 12345;
    for (let i = 0; i < 1000; i++) {
      const [v, n] = mulberry32(st);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Number.isInteger(n)).toBe(true);
      st = n;
    }
    // Состояние восстанавливается из числа
    const store = createRngStore('seed');
    const copy = JSON.parse(JSON.stringify(store));
    expect(new Rng(store, 'combat').next()).toBe(new Rng(copy, 'combat').next());
  });

  it('один seed — одинаковая последовательность, разные потоки независимы', () => {
    const a = createRngStore('s1');
    const b = createRngStore('s1');
    expect(a).toEqual(b);
    expect(new Set(RNG_STREAMS.map((k) => a[k])).size).toBe(RNG_STREAMS.length);
    const r1 = rngOf({ rng: a }, 'map');
    // крутим другой поток — map не меняется
    const other = rngOf({ rng: b }, 'combat');
    for (let i = 0; i < 10; i++) other.next();
    const r2 = rngOf({ rng: b }, 'map');
    for (let i = 0; i < 5; i++) expect(r1.next()).toBe(r2.next());
  });

  it('int/pick/shuffle/weighted', () => {
    const r = rngOf({ rng: createRngStore('z') }, 'cards');
    for (let i = 0; i < 200; i++) {
      const x = r.int(3, 5);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(5);
    }
    expect(r.int(5, 3)).toBeGreaterThanOrEqual(3);
    expect([1, 2, 3]).toContain(r.pick([1, 2, 3]));
    expect(() => r.pick([])).toThrow();
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect([...r.shuffle([...arr])].sort()).toEqual(arr);
    expect(r.weighted([['a', 0], ['b', 1]])).toBe('b');
    expect(() => r.weighted([['a', 0]])).toThrow();
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) counts[r.weighted<'a' | 'b'>([['a', 3], ['b', 1]])]++;
    expect(counts.a).toBeGreaterThan(counts.b * 2);
  });
});
