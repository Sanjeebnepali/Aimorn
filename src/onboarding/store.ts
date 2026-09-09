import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface OnboardingState {
  /**
   * Clerk user ids that have finished onboarding on this device — a set
   * rather than one global flag so signing out and into a *different*
   * account on the same phone doesn't skip the new account's onboarding,
   * and signing back into an account that already finished it doesn't
   * re-show it. Local-first because amora/server has no live database yet
   * (see server/.env.example) — /profile/onboarding is still called and is
   * the real source of truth once a DB exists, but the app can't block
   * every signup behind a backend that doesn't exist yet in the meantime.
   */
  completedUserIds: string[];
  markCompleted: (userId: string) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedUserIds: [],
      markCompleted: (userId) => {
        if (get().completedUserIds.includes(userId)) return;
        set({ completedUserIds: [...get().completedUserIds, userId] });
      },
    }),
    {
      name: 'amora-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/**
 * Selector hook for gating navigation (see Stack.Protected in _layout.tsx).
 * Deliberately a hook, not a `.getState()` helper — the root layout must
 * re-render and flip the guard the instant onboarding finishes, and only
 * subscribing (not a one-off read) makes that happen without an explicit
 * navigation call at the call site.
 */
export function useHasCompletedOnboarding(userId: string | null | undefined): boolean {
  return useOnboardingStore((s) => !!userId && s.completedUserIds.includes(userId));
}
