/**
 * Prompt fragments describing each style's rendering treatment, keyed to
 * match `StyleOption.key` in amora/src/components/primitives/style-swatch.tsx
 * exactly. Kept in lockstep with that file by hand — see the same note in
 * themes.ts.
 */
export const STYLE_PROMPTS: Record<string, string> = {
  realistic: 'photorealistic, natural skin texture and lighting, shot on a real camera',
  neon: 'neon-noir style, high-contrast rim lighting in magenta and cyan',
  anime: 'anime illustration style, clean linework, cel-shaded color',
  cyberpunk: 'cyberpunk style, moody purple and blue tones, futuristic detail',
  vintage: 'vintage 35mm film photo, warm grain, slightly faded color',
  oil: 'oil painting style, visible brushstrokes, rich painterly color blending',
  '3d': 'stylized 3D render, soft studio lighting, smooth shaded surfaces',
  watercolor: 'watercolor painting style, soft bleeding edges, light washes of color',
  fantasy: 'fantasy glow style, soft magical light particles, dreamlike atmosphere',
  cartoon: '3D toon style, rounded friendly proportions, bright saturated color',
  // A PHOTOGRAPHIC look (see PHOTOGRAPHIC_STYLES). Normally the app turns this style into the full K-pop scene look (lib/styleLook.ts);
  // this line is used when it is combined with a template or GROUP, where it acts as a rendering treatment on top.
  kpop: 'K-pop idol photoshoot style: glossy high-fashion editorial photography, dramatic hot-pink and black neon lighting with haze, crisp detail, a real photograph',
};

/**
 * Styles whose result is still a PHOTOGRAPH of the person, so the identity check ("is this the person in the reference?") applies.
 * A stylized result (anime, oil painting, 3D toon...) legitimately doesn't resemble a photo, so checking it would fail good work —
 * that is why only 'realistic' used to be checked. K-pop is photographic, so it must be checked too.
 */
export const PHOTOGRAPHIC_STYLES: ReadonlySet<string> = new Set(['realistic', 'kpop']);

export function isPhotographicStyle(styleKey: string): boolean {
  return PHOTOGRAPHIC_STYLES.has(styleKey);
}

export const DEFAULT_STYLE_PROMPT = STYLE_PROMPTS.realistic;

export function stylePromptFor(styleKey: string): string {
  return STYLE_PROMPTS[styleKey] ?? DEFAULT_STYLE_PROMPT;
}
