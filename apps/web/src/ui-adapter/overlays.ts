import { create } from 'zustand';

/** Окна прошивок/достижений поверх текущего экрана (не трогаем view в game/store). */
interface OverlayStore {
  /** 'run' — только открытые прошивки; 'collection' — все, закрытые затемнены */
  firmware: 'run' | 'collection' | null;
  achievements: boolean;
  openFirmware(mode: 'run' | 'collection' | null): void;
  openAchievements(open: boolean): void;
}

export const useOverlays = create<OverlayStore>((set) => ({
  firmware: null,
  achievements: false,
  openFirmware: (firmware) => set({ firmware }),
  openAchievements: (achievements) => set({ achievements }),
}));
