import { stylePromptFor } from '../data/styles.js';
import {
  BODY_TYPE_HARD_CONSTRAINT,
  buildAdditionalNoteLine,
  buildFormatLine,
  describeReferenceImages,
  FACIAL_ACCESSORY_LINE,
  FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
  type PromptInput,
} from './promptBuilder.js';
import { EQUAL_CAMERA_DISTANCE_HARD_CONSTRAINT, SINGLE_PERSON_ONLY_HARD_CONSTRAINT } from './promptQualityConstraints.js';

/**
 * The "inspired-by" (v2) template mode: the user's own photo is the ONLY image
 * the model sees, and the template contributes only a TEXT scene brief
 * (data/sceneBriefs.ts — place, lighting, palette, mood, outfits; never faces).
 *
 * Why (all measured 2026-09-26 with the identity judge, single attempts, no
 * retries): with the template PHOTO attached — which contains people — the
 * model kept pulling results toward those stand-ins however the request was
 * worded: same-frame edit got the right person 5/8 on a hard reference photo,
 * an "inspired-by" wording with the template still attached only 3/8. With the
 * template withheld and only the text brief supplied: 8/8 on that hard photo,
 * then 12/12 across a man's photo, a clean woman's photo, and a second
 * template — with the template's look preserved (theme score 4.00/5, equal to
 * faithful same-frame copies). Pose and framing are deliberately NOT copied:
 * that exact-frame constraint is what made the stand-in's face sticky.
 *
 * Used for SOLO, and for COUPLE's single "together" shot (which replaces the
 * fragile two-step template head-swap with ONE call).
 */
export type SceneBriefPromptInput = PromptInput & { sceneBrief: string };

export function buildSceneBriefPrompt(input: SceneBriefPromptInput): string {
  const isCouple = input.subjectMode === 'COUPLE';
  const styleLine = `Style: ${stylePromptFor(input.styleKey)}.`;
  const additionalNoteLine = buildAdditionalNoteLine(input.description);
  const formatLine = buildFormatLine(input.subjectMode);

  // Kept as a whole-sentence instruction, not a template: the experiment's
  // exact wording is what was measured.
  const outfitLine = isCouple
    ? `Dress each person in the outfit from the brief that matches THEIR apparent gender (if the brief has no outfit for someone's gender, dress them in a similar style that suits the brief).`
    : `Use the outfit from the brief that matches PERSON's apparent gender (if the brief has no outfit for PERSON's gender, dress PERSON in a similar style that suits the brief).`;
  const modestyLine =
    'Whatever outfit the brief calls for, render it fully modest and non-revealing — never generate nudity or exposed intimate areas, no matter what the scene description says.';

  if (isCouple) {
    const p1 = describeReferenceImages(1, input.photoACount);
    const p2 = describeReferenceImages(input.photoACount + 1, input.photoBCount ?? 1);
    return [
      `You are creating a NEW photorealistic photograph of TWO people together, as a couple: PERSON 1 is shown in ${p1}; PERSON 2 is shown in ${p2}. These are two distinct individuals — never blend, average, or merge one's features into the other's, and no third person may appear.`,
      `SCENE BRIEF (the look to photograph them in): ${input.sceneBrief}`,
      outfitLine,
      `Photograph them naturally together in that place, under that lighting, in those outfits, in an intimate, easy couple pose and framing that suit the scene, both fully visible.`,
      `Each person must be recognizably themselves: use each person's own face, hair (exact color, length, texture and style), skin tone and body build exactly as in their own reference photos.`,
      BODY_TYPE_HARD_CONSTRAINT,
      FACIAL_ACCESSORY_LINE,
      FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
      EQUAL_CAMERA_DISTANCE_HARD_CONSTRAINT,
      styleLine,
      additionalNoteLine,
      formatLine,
      modestyLine,
    ]
      .filter(Boolean)
      .join(' ');
  }

  const personRefs = describeReferenceImages(1, input.photoACount);
  return [
    `You are creating a NEW photorealistic photograph of PERSON — who is shown in ${personRefs} — the ONLY person who may appear in the result.`,
    `SCENE BRIEF (the look to photograph PERSON in): ${input.sceneBrief}`,
    outfitLine,
    `Photograph PERSON naturally in that place, under that lighting, in that outfit, with an easy natural pose and framing that suit the scene (for example standing or walking).`,
    `PERSON must be recognizably themselves: use PERSON's own face, hair (exact color, length, texture and style), skin tone and body build exactly as in the reference photo(s).`,
    BODY_TYPE_HARD_CONSTRAINT,
    FACIAL_ACCESSORY_LINE,
    FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
    SINGLE_PERSON_ONLY_HARD_CONSTRAINT,
    styleLine,
    additionalNoteLine,
    formatLine,
    modestyLine,
  ]
    .filter(Boolean)
    .join(' ');
}
