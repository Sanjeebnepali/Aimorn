import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ThemeName } from '@/theme/tokens';

export type ColorMode = 'night';

interface ThemeState {
  theme: ThemeName;
  mode: ColorMode;
  setTheme: (theme: ThemeName) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'sunsetRose',
      mode: 'night',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'amora-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
