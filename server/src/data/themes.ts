/**
 * Prompt fragments describing each theme's scene/mood, keyed to match
 * `Template.id` in amora/src/data/templates.ts exactly — the app sends that
 * same id, so this map has to stay in lockstep with that file by hand until
 * these two projects share a code package.
 */
export const THEME_PROMPTS: Record<string, string> = {
  goldenHour: 'a warm golden-hour sunset, soft low sunlight, long shadows',
  cityLights: 'a city skyline at night, bokeh lights, glass and neon reflections',
  firstDance: 'an intimate dance-floor moment, warm string lights, soft focus background',
  beachSunset: 'a beach at sunset, gentle waves, pastel sky, warm sand',
  rooftopNight: 'a rooftop at night overlooking a lit-up city, string lights, cool night air',
  cherryBlossom: 'a park in full cherry blossom bloom, soft pink petals drifting',
  winterWalk: 'a snowy street in winter, soft falling snow, warm coats, cozy light',
  neonNights: 'a neon-lit street at night, vibrant pink and blue signage reflections',
  cartoonUs: 'a warm, hand-illustrated cartoon scene, expressive and playful',
  vintageParis: 'a Parisian street, warm vintage tone, old-world architecture',
  cyberDate: 'a futuristic cyberpunk city street, glowing signage, rain-slicked pavement',
  rainyWindow: 'looking out through a rain-streaked window, soft ambient indoor light',
};

export const DEFAULT_THEME_PROMPT = 'a warm, softly lit scene that suits a phone wallpaper';

export function themePromptFor(templateId: string | undefined): string {
  if (!templateId) return DEFAULT_THEME_PROMPT;
  return THEME_PROMPTS[templateId] ?? DEFAULT_THEME_PROMPT;
}
