import { DEFAULT_THEME_PROMPT, themePromptFor } from '../data/themes.js';
import { stylePromptFor } from '../data/styles.js';
import {
  BODY_TYPE_HARD_CONSTRAINT,
  buildAdditionalNoteLine,
  buildFormatLine,
  describeReferenceImages,
  FACIAL_ACCESSORY_LINE,
  FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
  MAX_PRIMARY_DESCRIPTION_LENGTH,
  sanitizeUserPrompt,
  type PromptInput,
} from './promptBuilder.js';
import { EQUAL_CAMERA_DISTANCE_HARD_CONSTRAINT, NATURAL_HEAD_PROPORTION_CONSTRAINT, UNIFORM_PHOTO_QUALITY_CONSTRAINT } from './promptQualityConstraints.js';

/**
 * Split out of promptBuilder.ts 2026-09-12 — adding GROUP mode's dispatch
 * logic pushed that file to 361 lines, over this workspace's 350-line
 * module cap, and this SOLO/COUPLE branch was the natural piece to extract
 * (promptGroup.ts and promptTemplateEdit.ts already got the same
 * treatment for their own branches). Nothing about this function's own
 * logic changed in the move — see promptBuilder.ts's buildFusionPrompt for
 * the dispatcher that calls this.
 *
 * The original text-only branch — used whenever there's no template photo
 * to attach (no template selected, or an illustrated-only one like
 * "Cartoon Us"). Scene comes from THEME_PROMPTS' written description (or
 * the user's own free text when there's no template at all), not an
 * attached image.
 */
export function buildFreeformScenePrompt(input: PromptInput): string {
  // Previously: "Combine the two people from the reference photos into a
  // single new photo of them together" — doesn't say which reference maps
  // to which face, which is exactly the kind of ambiguity that let the
  // model blend/average the two identities into one (or lock onto only one
  // of them) instead of keeping both distinct. Naming "Person 1"/"Person 2"
  // against "first reference photo"/"second reference photo" — the actual
  // order nanoBanana.ts and qwenImageEdit.ts send photoA/photoB in — gives
  // it an unambiguous 1:1 mapping instead.
  // Identity-header pattern (researched against Google's own Nano Banana
  // Pro guidance + third-party multi-reference-locking write-ups, 2026-09-
  // 12, in direct response to a real complaint: "output unrecognizable,
  // completely different from the original"): lead with an unambiguous
  // per-person reference-image range (describeReferenceImages handles the
  // "these N photos are the SAME person" callout multi-angle uploads need),
  // then hard negatives ("no morphing," "not a different/generic person")
  // rather than only positive instructions — a positive instruction can be
  // satisfied loosely; a named negative closes off the specific failure
  // mode actually being hit.
  const personOneRefs = describeReferenceImages(1, input.photoACount);
  const personTwoRefs = input.photoBCount ? describeReferenceImages(input.photoACount + 1, input.photoBCount) : '';
  const identityHardNegative =
    'Do not morph, average, idealize, beautify, slim, or generate a different/generic face — any deviation from their actual reference likeness is a failure of this task, not a stylistic choice.';
  const subjectLine =
    input.subjectMode === 'COUPLE'
      ? `This is a face-identity task: fuse two real people into one new photo together, as a couple. Person 1's true identity is locked from ${personOneRefs}; Person 2's true identity is locked from ${personTwoRefs} — treat them as two distinct individuals and do not blend, average, or merge either person's facial features into the other's, or into a new invented face. For each person, match their exact facial structure, eye shape, nose shape, jawline, skin tone across face and body, AND any bindi, facial piercing, earring, nose ring, mole, freckle, or scar visible in their own reference photos — do not idealize, slim, beautify, or alter their proportions. Preserve each person's actual facial features precisely, not a generic or "improved" version, and keep their real skin tone and skin texture across face and exposed body skin as shown in their own reference photos. ${identityHardNegative}`
      : `This is a face-identity task: reimagine one real person in a new scene. Their true identity is locked from ${personOneRefs}. Match their exact facial structure, eye shape, nose shape, jawline, skin tone across face and body, AND any bindi, facial piercing, earring, nose ring, mole, freckle, or scar visible in those reference photos — do not idealize, slim, beautify, or alter their proportions. Preserve their actual facial features precisely, not a generic or "improved" version, and keep their real skin tone and skin texture across face and exposed body skin as shown in their reference photos. ${identityHardNegative}`;

  // Confirmed live 2026-09-10 with the user's own real photos: the model
  // was freely reinventing pose, body position, and outfit — the prompt
  // never said not to, it only ever protected FACE identity (subjectLine
  // above). Default should be "only the scene/background and art style
  // change" — pose and clothing carry over from the reference photo as-is
  // — with an explicit escape hatch for extraLine below (the user's own
  // optional description) to override that when they actually want a
  // different pose or outfit. Now also names body type/build explicitly
  // (prompt-templates.pdf's own preservation list) — "dress and pose"
  // drift reported live 2026-09-11 included the model subtly changing
  // build/proportions along with outfit, which the old wording never
  // named as something to hold fixed.
  // General mode (freeform: true) inverts this default on purpose — see
  // PromptInput.freeform's doc comment for the trend this exists for. It's
  // still exactly one rule, just aimed the other way: everything EXCEPT
  // identity is now the user's to redirect, instead of only the background.
  // Body type/weight is deliberately carved OUT of what freeform hands
  // over to the description, in both branches — BODY_TYPE_HARD_CONSTRAINT
  // below covers it unconditionally instead. Pose/outfit/setting/era are
  // fair game to reinvent for a "make me look like X" request; the
  // person's actual build is not a style choice to reinterpret, it's part
  // of their identity, same as their face.
  const fidelityLine = input.freeform
    ? "The scene description below has full creative authority over this person's pose, outfit, hairstyle, setting, era, and photo style — reinvent all of that freely to match what they describe. The ONLY fixed constraints: it must still be recognizably the same real person (see the face-identity rules above and the body-type rule below) — do not invent a different person or blend in a generic/idealized face."
    : "Keep each person's pose, body position, and exact clothing/outfit the same as shown in their own reference photo — do not invent a new pose or outfit. Only the background, scene, and artistic rendering style should change from the reference photo, unless the additional direction below explicitly asks for a pose or clothing change.";

  // The plain Generate tab (create-form.tsx, as opposed to the "recreate a
  // template" flow) never sends a templateId at all — it only has a free-
  // text description field (backed by suggestion chips like "Sunset
  // Beach"). That meant EVERY generation from the main Generate screen fell
  // through to the generic DEFAULT_THEME_PROMPT below as its actual "Scene:"
  // instruction, with the user's real intent demoted to a trailing
  // "Additional direction" note that a hardcoded, unrelated scene line was
  // actively competing with. Confirmed live 2026-09-10 — a real generation
  // ignored the picked theme and came back with a generic, unrelated scene.
  // Fix: no template means the user's own description IS the scene, not an
  // afterthought to one.
  const templateScene = input.templateId ? themePromptFor(input.templateId) : null;
  // "Scene: <mood phrase>." reads as a soft suggestion the model is free to
  // drift from — confirmed live 2026-09-11 as the cause of "recreate this
  // template" results not actually matching the template's theme/scene.
  // Rephrased as an imperative recreation instruction (the PDF's own
  // "exact template to preserve" framing, applied to the scene description
  // this branch actually has — a template WITHOUT a real photo, e.g.
  // Cartoon Us, still only has this text to go on) only for the templated
  // case; the free-text case below still reads naturally as a description,
  // not a command, since it's the user's own words.
  const sceneLine = templateScene
    ? `Recreate this exact scene faithfully — keep its setting, mood, and composition consistent throughout the whole image, do not substitute a different scene: ${templateScene}.`
    : `Scene: ${sanitizeUserPrompt(input.description, MAX_PRIMARY_DESCRIPTION_LENGTH) ?? DEFAULT_THEME_PROMPT}.`;
  const styleLine = `Style: ${stylePromptFor(input.styleKey)}.`;
  // Only a genuinely separate, secondary note when a template's own scene
  // is already driving the shot — otherwise the description above already
  // IS the scene, and repeating it here would just be redundant noise.
  const extraLine = templateScene ? buildAdditionalNoteLine(input.description) : '';
  const formatLine = buildFormatLine(input.subjectMode);
  // Found via a real test run (see docs/ai-generation-plan.md §3a): without
  // this, an ambiguous reference photo (e.g. cropped at the shoulders) can
  // get extended into an unintentionally shirtless/undressed result instead
  // of preserving what the person was actually wearing. fidelityLine above
  // now also says "keep the exact outfit," but this is the specific,
  // hard-won safety case worth stating twice rather than trusting the
  // general rule to cover it. General mode (freeform) deliberately WANTS
  // outfit changes (fidelityLine above hands the description authority over
  // exactly that) — this exact wording would flatly contradict it, so the
  // safety property that actually matters (no nudity/exposure) has to be
  // restated in a form that survives an intentional outfit change instead of
  // forbidding one.
  const modestyLine = input.freeform
    ? 'Whatever new outfit the scene above calls for, render it fully modest and non-revealing — never generate nudity or exposed intimate areas, no matter what the description says.'
    : 'Never remove, alter, or extend past a person’s actual clothing from their reference photo.';

  return [
    subjectLine,
    BODY_TYPE_HARD_CONSTRAINT,
    FACIAL_ACCESSORY_LINE,
    FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
    NATURAL_HEAD_PROPORTION_CONSTRAINT,
    EQUAL_CAMERA_DISTANCE_HARD_CONSTRAINT,
    UNIFORM_PHOTO_QUALITY_CONSTRAINT,
    fidelityLine,
    sceneLine,
    styleLine,
    extraLine,
    formatLine,
    modestyLine,
  ]
    .filter(Boolean)
    .join(' ');
}
