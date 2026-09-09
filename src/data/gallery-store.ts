import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as RNImage } from 'react-native';

export type UserCreationItem = {
  id: string;
  togetherImage?: string | number;
  roleAImage?: string | number;
  roleBImage?: string | number;
  prompt?: string;
  mode?: 'couple' | 'solo';
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
  return item.prompt || (item.mode === 'solo' ? 'Solo AI Wallpaper' : 'Couple AI Wallpaper');
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
  loadFromStorage: () => Promise<void>;
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
}));
