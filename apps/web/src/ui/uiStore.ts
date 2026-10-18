import { create } from 'zustand';

interface UiStore {
  settingsOpen: boolean;
  openSettings(open: boolean): void;
}

export const useUi = create<UiStore>((set) => ({
  settingsOpen: false,
  openSettings: (settingsOpen) => set({ settingsOpen }),
}));

export const ACT_NAMES: Record<number, string> = {
  1: 'Корпоративный периметр',
  2: 'Ядро датацентра',
  3: 'Сердце ИИ',
};
