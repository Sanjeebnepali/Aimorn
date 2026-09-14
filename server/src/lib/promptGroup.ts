import { DEFAULT_THEME_PROMPT } from '../data/themes.js';
import { stylePromptFor } from '../data/styles.js';
import {
  BODY_TYPE_HARD_CONSTRAINT,
  buildFormatLine,
  describeReferenceImages,
  FACIAL_ACCESSORY_LINE,
  FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
  MAX_PRIMARY_DESCRIPTION_LENGTH,
  sanitizeUserPrompt,
  type PromptInput,
} from './promptBuilder.js';
import { NATURAL_HEAD_PROPORTION_CONSTRAINT, UNIFORM_PHOTO_QUALITY_CONSTRAINT } from './promptQualityConstraints.js';

/**
 * GROUP mode's own prompt strategy — added 2026-09-12 for a real request:
 * "three faces in one photo... exactly." Kept in its own file rather than
 * a third case bolted onto promptBuilder.ts's buildFreeformScenePrompt for
 * two real reasons:
 *
 *   1. It's a structurally different task. SOLO/COUPLE's freeform branch
 *      is built around a FIXED cast (one or two people, each already named
 *      "Person 1"/"Person 2" in hardcoded wording) — GROUP is 2 to 4
 *      DISTINCT people, a number only known at request time, which needs a
 *      generated list, not a fixed sentence.
 *   2. It inverts the multi-image meaning a SECOND time. photoACount
 *      already means "N angles of the SAME person" for SOLO, and
 *      photoBCount the same for COUPLE's Person 2 — GROUP's
 *      groupPhotoCount means "N DIFFERENT people, one photo each," which
 *      would make the shared subjectLine impossible to read correctly
 *      without a subjectMode branch anyway. Splitting the file makes that
 *      branch structural instead of a landmine some future edit to the
 *      SOLO/COUPLE wording could accidentally cross-contaminate.
 *
 * Always the freeform/no-template case in practice — group photos have no
 * bundled Template to recreate (every existing Template is a 1- or
 * 2-person scene), so this mirrors buildFreeformScenePrompt's own
 * "no-template" branch shape (identity header → body-type constraint →
 * scene from the user's own description → style → format → modesty)
 * rather than duplicating the template-edit machinery that doesn't apply
 * here at all.
 */
export function buildGroupScenePrompt(input: PromptInput): string {
  const count = input.groupPhotoCount ?? 0;

  // Each group member contributes exactly ONE photo (no multi-angle within
  // GROUP mode — see provider.ts's FusionInput.photoA doc comment for why
  // that scope was deliberately cut: N people × several angles each risks
  // sending the model more images than it can keep straight, for a feature
  // whose whole point is already "several distinct faces at once"). So
  // each person's own reference is just describeReferenceImages(i, 1) at
  // position i, one line per person, 1-indexed to match nanoBanana.ts's
  // attached-image order exactly.
  const personLines = Array.from({ length: count }, (_, i) => `Person ${i + 1}'s true identity is locked from ${describeReferenceImages(i + 1, 1)}`).join('; ');

  const identityHardNegative =
    `Treat all ${count} people as completely distinct individuals — do not blend, average, or merge any of their facial features into each other or into a new invented face, and do not invent extra people or drop any of the ${count} shown. For each person, match their exact facial structure, eye shape, nose shape, jawline, and skin tone across face and body from their own reference photo — do not idealize, slim, beautify, or alter their proportions. Preserve each person's actual facial features precisely, not a generic or "improved" version, and keep their real skin tone and skin texture across face and exposed body skin as shown in their own reference photo. Do not morph, average, idealize, beautify, slim, or generate a different/generic face for anyone — any deviation from someone's actual reference likeness is a failure of this task, not a stylistic choice.`;

  const subjectLine = `This is a face-identity task: fuse ${count} real, distinct people into one new photo together, as a group. ${personLines}. ${identityHardNegative}`;

  // Group mode has no template — a bundled Template is always a 1- or
  // 2-person scene, so there's nothing to recreate here — meaning the
  // user's own description IS the scene, same reasoning as
  // buildFreeformScenePrompt's own no-template branch (see that function's
  // doc comment for the real bug this exact pattern already fixed once).
  const sceneLine = `Scene: ${sanitizeUserPrompt(input.description, MAX_PRIMARY_DESCRIPTION_LENGTH) ?? DEFAULT_THEME_PROMPT}.`;
  const styleLine = `Style: ${stylePromptFor(input.styleKey)}.`;
  const formatLine = buildFormatLine('GROUP');
  // Pose/outfit/setting are the description's to redirect (same "freeform"
  // philosophy as General mode — a group photo request describes a whole
  // scene, not a small style tweak on an existing pose) — only identity
  // and body type are hard-locked, via subjectLine and
  // BODY_TYPE_HARD_CONSTRAINT above/below.
  const modestyLine =
    'Whatever outfits the scene above calls for, render them fully modest and non-revealing for everyone — never generate nudity or exposed intimate areas, no matter what the description says.';

  return [
    subjectLine,
    BODY_TYPE_HARD_CONSTRAINT,
    FACIAL_ACCESSORY_LINE,
    FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
    NATURAL_HEAD_PROPORTION_CONSTRAINT,
    UNIFORM_PHOTO_QUALITY_CONSTRAINT,
    sceneLine,
    styleLine,
    formatLine,
    modestyLine,
  ]
    .filter(Boolean)
    .join(' ');
}
