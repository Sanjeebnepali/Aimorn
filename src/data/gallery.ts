/**
 * User creations and AI wallpapers state for Gallery.
 * Real per-user generated wallpapers are managed dynamically via `useGalleryStore`
 * in `src/data/gallery-store.ts`.
 */
export type GalleryItem = {
  id: string;
  date: string;
  height: number;
  favorited: boolean;
  tag: 'Creations' | 'Recent' | 'Saved' | 'Favorites';
};

/** Empty initial array by default — AI generated images are added here dynamically when created */
export const INITIAL_GALLERY_ITEMS: GalleryItem[] = [];
