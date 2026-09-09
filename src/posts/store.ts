import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface MyPost {
  id: string;
  /** Which of the user's own Gallery creations (src/data/gallery-store.ts'
   * `useGalleryStore` — the same store the Gallery tab reads) this post
   * shares — looked up for its photo/label rather than copying them, so a
   * post always reflects the real generated wallpaper, not a snapshot.
   * Used to reference a static public-template catalog instead
   * (src/data/creations.ts, now deleted); per explicit correction
   * (2026-09-08), sharing needs to be from something actually yours. */
  creationId: string;
  /** Short one-line title, separate from the caption — the one place this
   * app's flow deliberately diverges from a strict Instagram/TikTok copy,
   * per an explicit ask for a title *and* description. */
  title: string;
  /** Free-text caption/description — hashtags and @mentions aren't separate
   * fields, same as Instagram/TikTok: they're just typed inline and pulled
   * back out with extractHashtags()/extractMentions() wherever they need to
   * render as chips. */
  caption: string;
  createdAt: number;
}

interface PostsState {
  posts: MyPost[];
  addPost: (post: Omit<MyPost, 'id' | 'createdAt'>) => void;
  removePost: (id: string) => void;
}

/** #word tokens pulled out of a caption for display as chips — matches how
 * Instagram/TikTok treat hashtags as part of the caption text, not a
 * separately-typed field. */
export function extractHashtags(caption: string): string[] {
  return [...caption.matchAll(/#(\w+)/g)].map((m) => m[0]);
}

/** @name tokens pulled out of a caption — same inline-typed convention as
 * hashtags above. There's no real user directory to tag someone *from*
 * yet (this app's only "connection" concept is the onboarding pairing
 * code), so this is a caption-text mention, not a picker over real
 * accounts — same honest limitation as everything else pre-backend. */
export function extractMentions(caption: string): string[] {
  return [...caption.matchAll(/@(\w+)/g)].map((m) => m[0]);
}

/**
 * "My Posts" — what the user has shared to the community from their own
 * Gallery via src/app/create-post. Local-only for now, same honest
 * limitation as useOnboardingStore: there's no community backend yet (see
 * docs/ai-generation-plan.md) for these to actually reach other users or
 * earn credits, so this is a real local record of *your* posts, not a live
 * public feed — src/app/create-post says so explicitly at share time.
 */
export const usePostsStore = create<PostsState>()(
  persist(
    (set) => ({
      posts: [],
      addPost: (post) =>
        set((state) => ({
          posts: [{ ...post, id: `post_${Date.now()}_${Math.round(Math.random() * 1e6)}`, createdAt: Date.now() }, ...state.posts],
        })),
      removePost: (id) => set((state) => ({ posts: state.posts.filter((p) => p.id !== id) })),
    }),
    {
      name: 'amora-posts',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
