/**
 * Words that describe a PERSON's physical features. Text that is meant to describe only a scene (a template's
 * scene brief, or an enhanced user prompt) must never contain them: the image model gets the person's real photo,
 * and any facial/hair/body description in the text competes with it (measured 2026-09-26: showing the model a
 * template's people pulled results toward those people, so scene text must stay person-free).
 *
 * Shared by scripts/generate-scene-briefs.ts and lib/promptEnhancer.ts so the two can't drift apart.
 *
 * Body/identity words are flagged; garment details are not. "slim black tie" / "slim trousers" describe clothing (a
 * real false positive we hit), so body-shape adjectives are only flagged when they describe a person: followed by a
 * body/person noun ("slim build", "athletic woman").
 */
export const IDENTITY_WORDS =
  /\b(hair|hairstyle|face|faces|skin|eyes|brunette|blonde|redhead|bangs|curly|wavy|complexion|beard|mustache|moustache|ethnicity|young|elderly|teen|teenage)\b|\b(slim|slender|petite|curvy|muscular|athletic|stocky|heavyset|tall|short)\s+(build|figure|frame|body|physique|woman|man|person|model|waist|torso)\b/gi;

/** The distinct identity words found in `text` (lowercased), or [] if it is clean. */
export function findIdentityWords(text: string): string[] {
  const found = text.match(IDENTITY_WORDS);
  return found ? [...new Set(found.map((w) => w.toLowerCase()))] : [];
}
