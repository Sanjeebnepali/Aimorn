import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface LikesState {
  /** Template ids *this device* has liked — a set so re-visiting a template
   * detail screen (src/app/template/[id].tsx) shows the heart still filled,
   * the same reasoning useOnboardingStore uses a set of user ids for. */
  likedIds: string[];
  toggleLike: (id: string) => void;
}

/**
 * Local-only like state for template previews. The displayed *count* next
 * to it (Template.likes in src/data/templates.ts) is still a static
 * placeholder — no backend tallies real likes yet — but whether *you*
 * liked something needs to persist and actually respond to taps, which it
 * wasn't doing before this store existed.
 */
export const useLikesStore = create<LikesState>()(
  persist(
    (set, get) => ({
      likedIds: [],
      toggleLike: (id) => {
        const liked = get().likedIds.includes(id);
        set({ likedIds: liked ? get().likedIds.filter((x) => x !== id) : [...get().likedIds, id] });
      },
    }),
    {
      name: 'amora-likes',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
