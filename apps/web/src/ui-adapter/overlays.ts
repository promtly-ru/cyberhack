import { create } from 'zustand';
import type { FirmwareDef } from './contract';

/** Окна прошивок/достижений поверх текущего экрана (не трогаем view в game/store). */
interface OverlayStore {
  /** 'run' — только открытые прошивки; 'collection' — все, закрытые затемнены */
  firmware: 'run' | 'collection' | null;
  achievements: boolean;
  /** Выбор 1 из 3; onPick вызывается после выбора */
  reward: { choices: FirmwareDef[]; onPick?: (id: string) => void } | null;
  openFirmware(mode: 'run' | 'collection' | null): void;
  openAchievements(open: boolean): void;
  openFirmwareReward(choices: FirmwareDef[] | null, onPick?: (id: string) => void): void;
}

export const useOverlays = create<OverlayStore>((set) => ({
  firmware: null,
  achievements: false,
  reward: null,
  openFirmware: (firmware) => set({ firmware }),
  openAchievements: (achievements) => set({ achievements }),
  openFirmwareReward: (choices, onPick) => set({ reward: choices ? { choices, onPick } : null }),
}));

// Dev: открыть награду из консоли/e2e — window.__overlays.getState().openFirmwareReward(...)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __overlays: typeof useOverlays }).__overlays = useOverlays;
