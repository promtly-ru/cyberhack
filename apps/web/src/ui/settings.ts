import { create } from 'zustand';

export type AnimSpeed = 1 | 1.5 | 2.5;
export type MotionPref = 'system' | 'reduced' | 'full';

export interface Settings {
  volume: number; // 0..1
  muted: boolean;
  animSpeed: AnimSpeed;
  motion: MotionPref;
  scanlines: boolean;
}

const KEY = 'cyberhack.settings.v1';
const DEFAULTS: Settings = { volume: 0.6, muted: false, animSpeed: 1, motion: 'system', scanlines: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULTS.muted,
      animSpeed: p.animSpeed === 1.5 || p.animSpeed === 2.5 ? p.animSpeed : 1,
      motion: p.motion === 'reduced' || p.motion === 'full' ? p.motion : 'system',
      scanlines: typeof p.scanlines === 'boolean' ? p.scanlines : true,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* приватный режим / квота — настройки просто не запомнятся */
  }
}

interface SettingsStore extends Settings {
  set(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsStore>((setState, get) => ({
  ...load(),
  set(patch) {
    setState(patch);
    const { set: _omit, ...rest } = { ...get() };
    void _omit;
    save(rest);
    applyToDocument();
  },
}));

const systemQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function isReducedMotion(): boolean {
  const m = useSettings.getState().motion;
  if (m === 'reduced') return true;
  if (m === 'full') return false;
  return systemQuery?.matches ?? false;
}

/** Множитель длительностей анимаций (0.4 = в 2.5 раза быстрее). */
export function animScale(): number {
  return 1 / useSettings.getState().animSpeed;
}

export function applyToDocument(): void {
  const root = document.documentElement;
  const s = useSettings.getState();
  root.dataset.motion = isReducedMotion() ? 'reduced' : 'full';
  root.dataset.scanlines = s.scanlines ? 'on' : 'off';
  root.style.setProperty('--speed', String(s.animSpeed));
}

systemQuery?.addEventListener?.('change', applyToDocument);
