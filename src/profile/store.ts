import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Same seed photo the screen showed before this store existed — keeps the
// default look unchanged for anyone who hasn't picked their own avatar yet.
const DEFAULT_AVATAR_URI = 'https://images.unsplash.com/photo-1625241152315-4a698f74ceb7?q=75&w=200&auto=format&fit=crop';

interface ProfileState {
  avatarUri: string;
  setAvatarUri: (uri: string) => void;
  /** Wipes the chosen avatar back to the default and clears the on-disk
   * copy — must be called on sign-out. `amora-profile` is an
   * un-namespaced AsyncStorage key shared by whichever account is
   * currently signed in, so without this a previous account's chosen
   * profile photo kept showing up as a *different* account's avatar after
   * sign-out/sign-in on the same device — same cross-account leak class as
   * `data/gallery-store.ts`'s own `reset()`, found and fixed alongside it
   * 2026-09-16. */
  reset: () => void;
}

/**
 * Persists the user's chosen avatar across app restarts, the same way
 * `theme/store.ts` persists the color theme — otherwise picking a new
 * profile picture would silently revert every time the app relaunches,
 * which reads as the picker "not really working" even though it did.
 */
export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      avatarUri: DEFAULT_AVATAR_URI,
      setAvatarUri: (avatarUri) => set({ avatarUri }),
      reset: () => {
        set({ avatarUri: DEFAULT_AVATAR_URI });
        void useProfileStore.persist.clearStorage();
      },
    }),
    {
      name: 'amora-profile',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
