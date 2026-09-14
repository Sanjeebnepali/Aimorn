import { Image } from 'react-native';

import { cardGradients } from '@/theme/card-gradients';

/** The single set of category values every category-chip row in the app
 * filters against — Home's own row and the Template browser's row show
 * different SUBSETS of these as chips (see CATEGORIES in each screen), but
 * both read this same field so a template only ever needs one tag. */
export type TemplateCategory = 'sunset' | 'beach' | 'studio' | 'festival' | 'neon' | 'cartoon' | 'rain';

export type Template = {
  id: string;
  label: string;
  colors: readonly [string, string];
  handle?: string;
  badge?: 'crown';
  /** Real photo backing the card. `colors` still backs the gradient scrim
   * under the label and is the fallback for templates with no photo
   * (Cartoon Us — a real photo wouldn't fit an illustrated style). */
  imageUrl?: string;
  /** Engagement counts shown on the template detail screen (src/app/template/[id].tsx).
   * Placeholder numbers — like the Profile tab's "18 Wallpapers"/"6 Credits Left" — until
   * there's a real backend actually tracking views/likes per template. */
  views?: number;
  likes?: number;
  /** What the Home and Template-browser category chips filter on. Picked by
   * mood/theme, not literally by what's in the placeholder photo — several
   * templates' photos are already documented above as stand-ins for a scene
   * that doesn't have a real shot yet (Cyber Date, Rainy Window, etc.), and
   * the category follows the template's intended theme the same way. */
  category: TemplateCategory;
};

/** Resolves a bundled `require(...)` image module to the plain URI string
 * every `imageUrl` consumer already expects (`<Image source={{ uri }} />`,
 * `Image.prefetch`, etc. — see src/app/(tabs)/index.tsx's HERO_IMAGES). Lets
 * a local asset drop into the exact same `imageUrl: string` field a remote
 * Unsplash URL used to, so no consumer needs to change. */
function local(assetModule: number): string {
  return Image.resolveAssetSource(assetModule).uri;
}

/** Single source of truth for every template shown on Home's rails, the Template
 * browser, and looked up by GenerateTemplate — id here is what round-trips
 * through the `/generate/from-template/[id]` route param. */
export const TEMPLATES: Template[] = [
  {
    id: 'goldenHour',
    label: 'Golden Hour',
    colors: cardGradients.goldenHour,
    handle: '@ava.codes',
    imageUrl: local(require('../../assets/templates/golden-hour.jpg')),
    views: 24800,
    likes: 3120,
    category: 'sunset',
  },
  {
    id: 'cityLights',
    label: 'City Lights',
    colors: cardGradients.cityLights,
    badge: 'crown',
    imageUrl: local(require('../../assets/templates/city-lights.jpg')),
    views: 41200,
    likes: 5860,
    category: 'studio',
  },
  {
    id: 'firstDance',
    label: 'First Dance',
    colors: cardGradients.firstDance,
    imageUrl: local(require('../../assets/templates/first-dance.jpg')),
    views: 18300,
    likes: 2440,
    category: 'festival',
  },
  {
    id: 'beachSunset',
    label: 'Beach Sunset',
    colors: cardGradients.beachSunset,
    imageUrl: local(require('../../assets/templates/beach-sunset.jpg')),
    views: 33500,
    likes: 4710,
    category: 'beach',
  },
  {
    id: 'rooftopNight',
    label: 'Rooftop Night',
    colors: cardGradients.rooftopNight,
    imageUrl: local(require('../../assets/templates/rooftop-night.jpg')),
    views: 27100,
    likes: 3980,
    category: 'studio',
  },
  {
    id: 'cherryBlossom',
    label: 'Cherry Blossom',
    colors: cardGradients.cherryBlossom,
    // Regenerated 2026-09-11 (gemini-3.1-flash-image, server/scripts/
    // generate-template-images.ts) — the previous photo was an unrelated
    // hanok-village street shot with no blossoms in it at all.
    imageUrl: local(require('../../assets/templates/cherry-blossom.jpg')),
    views: 15600,
    likes: 2100,
    category: 'sunset',
  },
  {
    id: 'winterWalk',
    label: 'Winter Walk',
    colors: cardGradients.winterWalk,
    // Regenerated 2026-09-11 (see cherryBlossom's note above) — the
    // previous photo was a cozy indoor cabin hug with no snow or walking.
    imageUrl: local(require('../../assets/templates/winter-walk.jpg')),
    views: 12400,
    likes: 1650,
    category: 'studio',
  },
  {
    id: 'neonNights',
    label: 'Neon Nights',
    colors: cardGradients.neonNights,
    handle: '@kenji.p',
    // Regenerated 2026-09-11 (see cherryBlossom's note above) — the
    // previous photo was a warm indoor string-lights hangout with no neon.
    imageUrl: local(require('../../assets/templates/neon-nights.jpg')),
    views: 29700,
    likes: 4330,
    category: 'neon',
  },
  {
    id: 'cartoonUs',
    label: 'Cartoon Us',
    colors: cardGradients.cartoonUs,
    handle: '@lulu.draws',
    // No photo — this template is explicitly an illustrated style, so the
    // gradient + style-swatch look (see StyleSwatch's 'styleCartoon') fits
    // better than a real photo would.
    views: 9800,
    likes: 1340,
    category: 'cartoon',
  },
  {
    id: 'vintageParis',
    label: 'Vintage Paris',
    colors: cardGradients.vintageParis,
    handle: '@noah.rt',
    imageUrl: local(require('../../assets/templates/vintage-paris.jpg')),
    views: 21500,
    likes: 2890,
    category: 'studio',
  },
  {
    id: 'cyberDate',
    label: 'Cyber Date',
    colors: cardGradients.cyberDate,
    handle: '@zx.creates',
    // Regenerated 2026-09-11 (see cherryBlossom's note above) — the
    // previous photo was a plain beach sunset, not cyberpunk at all.
    imageUrl: local(require('../../assets/templates/cyber-date.jpg')),
    views: 19200,
    likes: 2560,
    category: 'neon',
  },
  {
    id: 'rainyWindow',
    label: 'Rainy Window',
    colors: cardGradients.rainyWindow,
    handle: '@maya.k',
    // Regenerated 2026-09-11 (see cherryBlossom's note above) — the
    // previous photo was a sunset forest close-up with no rain or window.
    imageUrl: local(require('../../assets/templates/rainy-window.jpg')),
    views: 8700,
    likes: 1120,
    category: 'rain',
  },
];

export const TRENDING_IDS = ['goldenHour', 'cityLights', 'firstDance', 'beachSunset'];
export const POPULAR_IDS = ['rooftopNight', 'cherryBlossom', 'winterWalk'];
export const BROWSE_IDS = ['goldenHour', 'neonNights', 'cartoonUs', 'vintageParis', 'cyberDate', 'rainyWindow'];

export function getTemplate(id: string | undefined): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getTemplates(ids: string[]): Template[] {
  return ids.map((id) => getTemplate(id)).filter((t): t is Template => !!t);
}
