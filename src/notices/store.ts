import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface NoticesState {
  /** Whether the couple-generation expectations notice (loading.tsx) has
   * already been shown on this device — shown once, not on every
   * generation, so it reads as a genuine heads-up rather than a nag. The
   * full text stays available anytime in Profile → About This App, which
   * is the actual "so it doesn't make user in the shade" answer (the
   * user's own phrase) for anyone who dismissed this too fast to read it. */
  hasSeenCoupleDisclaimer: boolean;
  markCoupleDisclaimerSeen: () => void;
}

export const useNoticesStore = create<NoticesState>()(
  persist(
    (set) => ({
      hasSeenCoupleDisclaimer: false,
      markCoupleDisclaimerSeen: () => set({ hasSeenCoupleDisclaimer: true }),
    }),
    {
      name: 'amora-notices',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
