import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// import.meta.dirname resolves correctly in BOTH run modes this server
// actually uses: `tsx watch src/index.ts` (dev) resolves to
// server/src/data/templateImages/, and the compiled
// `node dist/index.js` (prod) resolves to server/dist/data/templateImages/
// — which is why package.json's `build` script now also runs
// scripts/copy-template-images.mjs after `tsc`, since tsc itself only
// compiles .ts and would otherwise silently leave these .jpg files out of
// dist/ entirely.
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templateImages');

/**
 * Server-side copies of the exact photos the app bundles at
 * assets/templates/*.jpg — added 2026-09-11 so a "recreate this template"
 * generation can send the model the REAL template photo as an editing
 * target (background/pose/clothing to preserve exactly, per
 * promptBuilder.ts's template-image branch) instead of only a text
 * description of it. Keyed to match `Template.id` in
 * amora/src/data/templates.ts exactly, same hand-kept-in-lockstep
 * convention as THEME_PROMPTS in themes.ts and STYLE_PROMPTS in styles.ts
 * — there's no shared package between the two projects (yet) to enforce
 * this automatically, so updating a template's photo in the app means
 * copying the same file here too.
 *
 * `cartoonUs` has no entry — it's explicitly an illustrated-only template
 * with no real photo at all (see templates.ts's own comment on it), so it
 * falls back to promptBuilder.ts's text-only scene description exactly
 * like it always has.
 */
const TEMPLATE_IMAGE_FILES: Record<string, string> = {
  goldenHour: 'golden-hour.jpg',
  cityLights: 'city-lights.jpg',
  firstDance: 'first-dance.jpg',
  beachSunset: 'beach-sunset.jpg',
  rooftopNight: 'rooftop-night.jpg',
  cherryBlossom: 'cherry-blossom.jpg',
  winterWalk: 'winter-walk.jpg',
  neonNights: 'neon-nights.jpg',
  vintageParis: 'vintage-paris.jpg',
  cyberDate: 'cyber-date.jpg',
  rainyWindow: 'rainy-window.jpg',
};

export type TemplateImage = { bytes: Buffer; mimeType: string };

// These are static files bundled with the server — they never change
// between requests, so there's no reason to hit disk again once a given
// template's bytes have been read once.
const cache = new Map<string, TemplateImage>();

/** Returns the exact template photo for a template id, or undefined when
 * there isn't one (no template selected, or an illustrated-only template
 * like cartoonUs) — callers (generations.ts) treat undefined as "fall back
 * to the text-only theme description," not as an error. */
export function templateImageFor(templateId: string | undefined): TemplateImage | undefined {
  if (!templateId) return undefined;

  const cached = cache.get(templateId);
  if (cached) return cached;

  const filename = TEMPLATE_IMAGE_FILES[templateId];
  if (!filename) return undefined;

  const bytes = readFileSync(path.join(DIR, filename));
  const image: TemplateImage = { bytes, mimeType: 'image/jpeg' };
  cache.set(templateId, image);
  return image;
}
