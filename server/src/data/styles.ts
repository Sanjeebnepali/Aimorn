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
};

export const DEFAULT_STYLE_PROMPT = STYLE_PROMPTS.realistic;

export function stylePromptFor(styleKey: string): string {
  return STYLE_PROMPTS[styleKey] ?? DEFAULT_STYLE_PROMPT;
}
