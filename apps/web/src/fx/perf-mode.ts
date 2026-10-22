/**
 * Режим «экономия графики». auto — включается сам на слабом устройстве, при prefers-reduced-motion
 * или если в первые секунды кадры заметно проседают; lite/full — выбор игрока.
 * Применяется атрибутом <html data-gfx="lite|full">, правила — в styles/perf.css.
 */
import { create } from 'zustand';

export type GfxPref = 'auto' | 'lite' | 'full';

const KEY = 'cyberhack.perf.v1';
const FPS_KEY = 'cyberhack.perf.slow.v1';

function load(): GfxPref {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '"auto"') as unknown;
    return v === 'lite' || v === 'full' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function slowMeasured(): boolean {
  try {
    return localStorage.getItem(FPS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Признаки слабого устройства, известные сразу при старте. */
export function weakDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return true;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return true;
  return (nav.hardwareConcurrency ?? 8) <= 2;
}

const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

interface GfxStore {
  pref: GfxPref;
  /** Итоговый режим с учётом auto */
  lite: boolean;
  setPref(p: GfxPref): void;
}

function resolve(pref: GfxPref): boolean {
  if (pref !== 'auto') return pref === 'lite';
  return !!reducedQuery?.matches || weakDevice() || slowMeasured();
}

export const useGfx = create<GfxStore>((set) => ({
  pref: load(),
  lite: resolve(load()),
  setPref(pref) {
    try {
      localStorage.setItem(KEY, JSON.stringify(pref));
    } catch {
      /* приватный режим — выбор не запомнится */
    }
    set({ pref, lite: resolve(pref) });
    applyGfx();
  },
}));

export function isLite(): boolean {
  return useGfx.getState().lite;
}

export function applyGfx(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.gfx = useGfx.getState().lite ? 'lite' : 'full';
}

function refresh(): void {
  const { pref } = useGfx.getState();
  useGfx.setState({ lite: resolve(pref) });
  applyGfx();
}

reducedQuery?.addEventListener?.('change', refresh);

/**
 * Замер FPS после старта (режим auto, один раз на устройство): если медиана кадра хуже ~30 FPS,
 * запоминаем устройство как медленное и включаем экономию.
 */
export function probeFrameRate(ms = 4000): () => void {
  if (useGfx.getState().pref !== 'auto' || useGfx.getState().lite || typeof requestAnimationFrame !== 'function') return () => {};
  const frames: number[] = [];
  let raf = 0;
  let prev = 0;
  let start = 0;
  const tick = (t: number) => {
    if (!start) start = t;
    else if (document.visibilityState === 'visible') frames.push(t - prev);
    prev = t;
    if (t - start < ms) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (frames.length < 20) return;
    frames.sort((a, b) => a - b);
    if (frames[Math.floor(frames.length / 2)]! > 34) {
      try {
        localStorage.setItem(FPS_KEY, '1');
      } catch {
        /* не запомним — замерим в следующий раз */
      }
      refresh();
    }
  };
  // Первые секунды заняты загрузкой — меряем после неё
  const delay = setTimeout(() => (raf = requestAnimationFrame(tick)), 2500);
  return () => {
    clearTimeout(delay);
    cancelAnimationFrame(raf);
  };
}
