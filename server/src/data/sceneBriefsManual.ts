/**
 * Hand-written scene briefs for templates that have no server-side reference photo — kept separate from the
 * auto-generated sceneBriefs.ts (which scripts/generate-scene-briefs.ts overwrites from the template photos).
 *
 * Same rules as the generated briefs (see promptSceneBrief.ts / scripts/generate-scene-briefs.ts for why): describe the
 * LOOK only — place, lighting, palette, mood, camera, and clothing for both a woman and a man — and NEVER anyone's face,
 * hair, skin, age or body. That is checked by scripts/check-manual-briefs.ts using the same word list as the generator.
 *
 * kpopIdol: a generic "K-pop idol photoshoot" look in the black-and-hot-pink palette. It deliberately names no group and
 * no real artist and imitates no real person: those are trademarks/likenesses we have no right to use, and a "make me
 * look like <specific star>" feature is the kind of thing app stores reject. The trend's visual language — glossy
 * black stage set, hot-pink neon, haze, silver chains, sharp tailoring — is generic and free to use.
 */
export const MANUAL_SCENE_BRIEFS: Record<string, string> = {
  kpopIdol:
    "Location & environment: A sleek idol-style fashion photoshoot set — a glossy black studio with a wall of hot-pink neon light bars, a light haze in the air, and a mirror-black reflective floor. Lighting, Time & Palette: Dramatic editorial lighting with a hard hot-pink and magenta neon rim light from one side, cool white flash from the front, and deep black shadows. Palette of jet black, hot pink and silver-white with glossy highlights. Mood & Camera: Confident, cool, high-fashion stage energy; a low-angle editorial shot framed from the knees up, close enough that the person and the styling are both large and clear, crisp and glossy like a magazine cover. Woman's outfit: A black cropped tailored jacket with silver buckles over a black top, a hot-pink pleated mini skirt with silver chain detailing and a studded belt, layered silver chain necklaces and a black choker. Man's outfit: A black oversized tailored blazer with silver zips and buckles over a hot-pink shirt, black wide-leg cargo trousers with a chain, and layered silver chain necklaces and rings.",
};
