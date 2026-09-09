import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { type LanguageCode } from './languages';

type LanguageState = {
  /** `null` = follow the device's own language (the default for every new
   *  install — see index.ts's device-detection). Set only once the user
   *  explicitly picks a language from Settings, same "explicit override
   *  beats device default" shape as `theme/store.ts`. */
  language: LanguageCode | null;
  setLanguage: (language: LanguageCode | null) => void;
};

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: null,
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'amora-language',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
