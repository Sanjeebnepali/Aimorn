import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as RNImage } from 'react-native';

export type UserCreationItem = {
  id: string;
  togetherImage?: string | number;
  roleAImage?: string | number;
  roleBImage?: string | number;
  prompt?: string;
  mode?: 'couple' | 'solo' | 'group';
  /** Matches a StyleOption.key from style-swatch.tsx — lets any screen
   * showing this creation resolve the real style label/icon instead of
   * guessing from `prompt`'s free text. Optional since older creations
   * (from before this field existed) won't have it. */
  styleKey?: string;
  date: string;
  height: number;
  favorited: boolean;
  tag: 'Creations' | 'Recent' | 'Saved' | 'Favorites';
};

/** Shared fallback label wherever a creation needs a human-readable name and
 * has no explicit title of its own (the Gallery grid, the create-post
 * picker, My Posts) — one rule so all three never drift out of sync with
 * each other. */
export function creationLabel(item: Pick<UserCreationItem, 'prompt' | 'mode'>): string {
  if (item.prompt) return item.prompt;
  if (item.mode === 'solo') return 'Solo AI Wallpaper';
  if (item.mode === 'group') return 'Group AI Wallpaper';
  return 'Couple AI Wallpaper';
}

/** `togetherImage`/`roleAImage`/`roleBImage` are `string | number` — a real
 * URI once actual AI generation exists, or (today) a `require()`'d demo
 * asset id while it doesn't (see `addCreation` below). `expo-image`'s
 * `source` prop is typed to accept that raw number directly, but confirmed
 * live (2026-09-08) it silently renders nothing for one on Android — the
 * same asset shows up fine everywhere else in this app (see
 * src/data/templates.ts's `local()`) only because those call sites resolve
 * the require() id to a real URI *first* via `Image.resolveAssetSource`
 * instead of trusting expo-image to do it. Same fix here, so every
 * `<Image source={{ uri: resolveCreationImage(x) }} />` call site behaves
 * the same regardless of which of the two shapes the field currently holds.
 *
 * `resolveAssetSource` can itself return `null` — confirmed live for a
 * creation persisted by an earlier Metro session: numeric `require()` ids
 * aren't stable across a dev-server restart (Metro reassigns them), so an
 * old number surviving in AsyncStorage can point at nothing in the current
 * bundle's asset registry, and this crashed the screen on `.uri` before this
 * guard existed. `addCreation` below now resolves to a string *before*
 * persisting so this shouldn't recur going forward, but old already-stored
 * data (like the one that surfaced this) needs this to degrade to "no
 * image" instead of a crash, not just newly-added creations. */
export function resolveCreationImage(source: string | number | undefined): string | undefined {
  if (source == null) return undefined;
  if (typeof source === 'string') return source;
  return RNImage.resolveAssetSource(source)?.uri;
}

type GalleryStoreState = {
  creations: UserCreationItem[];
  favorites: Record<string, boolean>;
  addCreation: (
    item: Omit<UserCreationItem, 'date' | 'height' | 'favorited' | 'tag'> & {
      date?: string;
      height?: number;
    },
  ) => void;
  toggleFavorite: (id: string) => void;
  /** Removes a creation from the LOCAL Gallery cache + AsyncStorage only —
   * this store has no network access of its own. The real, permanent delete
   * is `DELETE /generations/:id` (server/src/routes/generations.ts); the
   * caller (result/[id].tsx's handleDelete) MUST await that call succeeding
   * before calling this, never the other way around. Originally this was
   * the only half that existed at all (no server route backed it) — that
   * was a real bug: a "deleted" item came right back the next time
   * `syncFromServer` below re-fetched the still-intact server row. Kept as
   * its own action (rather than folding the API call in here) so this file
   * stays a plain state store with no fetch/Clerk-token dependency, same
   * reasoning as ServerGeneration's own doc comment below. */
  deleteCreation: (id: string) => void;
  /** Patches just ONE of a creation's 3 possible images in place — the
   * local-cache half of the "regenerate a single image" feature
   * (api.ts's regenerateGenerationPart / result/[id].tsx's handleRegenerate).
   * Same "local cache only, caller awaits the real server call first" shape
   * as deleteCreation above — this never talks to the network itself. The
   * new URL is expected to already carry a cache-busting query string (the
   * server route appends one) so `expo-image`'s own URL-keyed cache doesn't
   * keep showing the stale bytes at what would otherwise be an unchanged URL. */
  updateCreationImage: (id: string, field: 'togetherImage' | 'roleAImage' | 'roleBImage', url: string) => void;
  loadFromStorage: () => Promise<void>;
  /** Replaces `creations` with the caller's real generations from the
   * server (GET /generations) — see this store's own top-of-file doc
   * comment for why this exists. Only COMPLETE ones are shown (a PROCESSING
   * or FAILED row isn't a real wallpaper yet); existing favorite flags are
   * preserved by id rather than reset, since favoriting is still a
   * local-only preference the server doesn't track. */
  syncFromServer: (generations: ServerGeneration[]) => void;
  /** Wipes both the in-memory state AND the on-disk AsyncStorage copy —
   * must be called on sign-out. Without this, `STORAGE_KEY`/`FAVORITES_KEY`
   * are plain un-namespaced keys shared by whichever account is currently
   * signed in, so a previous account's generated wallpapers stayed in this
   * store (and got shown/pickable in Gallery and Create Post) after
   * signing out and even after a *different* account signed in, until that
   * new account happened to visit the Gallery tab and its `syncFromServer`
   * call overwrote them — a real cross-account privacy leak, confirmed live
   * 2026-09-16. Same fix shape as `couple/store.ts`'s own `reset()`, which
   * solved this exact class of bug for couple-pairing state earlier. */
  reset: () => void;
};

/** The subset of GenerationResponse (src/utils/api.ts) this store actually
 * needs — kept as a local structural type rather than importing api.ts
 * directly so this data-layer file doesn't take on a dependency toward the
 * network layer (api.ts already depends on Clerk/fetch; gallery-store.ts
 * stays a plain Zustand store any screen can import cheaply). */
export type ServerGeneration = {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  subjectMode: 'SOLO' | 'COUPLE' | 'GROUP';
  styleKey: string;
  description: string | null;
  createdAt: string;
  outputUrl: string | null;
  outputUrlA: string | null;
  outputUrlB: string | null;
};

const STORAGE_KEY = 'amora_user_creations';
const FAVORITES_KEY = 'amora_gallery_favorites';

export const useGalleryStore = create<GalleryStoreState>((set, get) => ({
  creations: [],
  favorites: {},

  addCreation: (item) => {
    // Default fallback triptych images for demo AI creation if specific URIs
    // aren't passed. Resolved to real URI strings *here*, before anything
    // gets persisted — storing the raw require() numbers instead (as this
    // used to) meant AsyncStorage held numeric asset ids that only mean
    // anything to the Metro bundle session that created them; the next dev
    // server restart reassigns those ids, silently turning old persisted
    // creations' images into a crash (confirmed live, 2026-09-08 — see
    // resolveCreationImage's comment above). A resolved string URI has no
    // such expiry.
    const defaultTogether = RNImage.resolveAssetSource(require('../assets/couple/pack1-together.webp')).uri;
    const defaultBoy = RNImage.resolveAssetSource(require('../assets/couple/pack1-boy.webp')).uri;
    const defaultGirl = RNImage.resolveAssetSource(require('../assets/couple/pack1-girl.webp')).uri;

    const newItem: UserCreationItem = {
      id: item.id,
      togetherImage: resolveCreationImage(item.togetherImage) ?? defaultTogether,
      roleAImage: resolveCreationImage(item.roleAImage) ?? defaultBoy,
      roleBImage: resolveCreationImage(item.roleBImage) ?? defaultGirl,
      prompt: item.prompt,
      mode: item.mode ?? 'couple',
      styleKey: item.styleKey,
      date: item.date ?? 'Just now',
      height: item.height ?? 220,
      favorited: false,
      tag: 'Creations',
    };

    const updated = [newItem, ...get().creations.filter((c) => c.id !== newItem.id)];
    set({ creations: updated });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  toggleFavorite: (id: string) => {
    const currentFavs = { ...get().favorites };
    currentFavs[id] = !currentFavs[id];

    const updatedCreations = get().creations.map((c) =>
      c.id === id ? { ...c, favorited: !!currentFavs[id] } : c,
    );

    set({ favorites: currentFavs, creations: updatedCreations });
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(currentFavs)).catch(() => {});
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCreations)).catch(() => {});
  },

  deleteCreation: (id: string) => {
    const updatedCreations = get().creations.filter((c) => c.id !== id);
    // Drop its favorite flag too — nothing else keys off a favorites entry
    // whose creation no longer exists, but leaving it behind is just a slow
    // AsyncStorage leak for no reason.
    const updatedFavs = { ...get().favorites };
    delete updatedFavs[id];

    set({ creations: updatedCreations, favorites: updatedFavs });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCreations)).catch(() => {});
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updatedFavs)).catch(() => {});
  },

  updateCreationImage: (id, field, url) => {
    const updatedCreations = get().creations.map((c) => (c.id === id ? { ...c, [field]: url } : c));
    set({ creations: updatedCreations });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCreations)).catch(() => {});
  },

  syncFromServer: (generations) => {
    const currentFavs = get().favorites;
    const synced: UserCreationItem[] = generations
      .filter((g) => g.status === 'COMPLETE' && g.outputUrl)
      .map((g) => ({
        id: g.id,
        togetherImage: g.outputUrl ?? undefined,
        roleAImage: g.outputUrlA ?? undefined,
        roleBImage: g.outputUrlB ?? undefined,
        prompt: g.description ?? undefined,
        mode: g.subjectMode === 'SOLO' ? 'solo' : g.subjectMode === 'GROUP' ? 'group' : 'couple',
        styleKey: g.styleKey,
        date: new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        height: 220,
        favorited: !!currentFavs[g.id],
        tag: 'Creations',
      }));

    set({ creations: synced });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(synced)).catch(() => {});
  },

  loadFromStorage: async () => {
    try {
      const storedCreations = await AsyncStorage.getItem(STORAGE_KEY);
      const storedFavs = await AsyncStorage.getItem(FAVORITES_KEY);
      const favs = storedFavs ? JSON.parse(storedFavs) : {};
      const parsedCreations: UserCreationItem[] = storedCreations ? JSON.parse(storedCreations) : [];

      const creationsWithFavs = parsedCreations.map((c) => ({
        ...c,
        favorited: !!favs[c.id],
      }));

      set({
        creations: creationsWithFavs,
        favorites: favs,
      });
    } catch {
      // fallback
    }
  },

  reset: () => {
    set({ creations: [], favorites: {} });
    AsyncStorage.multiRemove([STORAGE_KEY, FAVORITES_KEY]).catch(() => {});
  },
}));
