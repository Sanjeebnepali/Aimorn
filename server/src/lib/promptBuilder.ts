import { buildTemplateEditPrompt } from './promptTemplateEdit.js';
import { buildGroupScenePrompt } from './promptGroup.js';
import { buildFreeformScenePrompt } from './promptFreeform.js';

// Re-exported for generationJob.ts's existing `from './promptBuilder.js'`
// import — moving the functions themselves to promptTemplateEdit.ts
// (2026-09-12, to stay under this file's 350-line cap) shouldn't force
// every caller to know or care which file actually defines them.
export { buildTemplateFaceSwapPrompt, buildTemplateCompositePrompt } from './promptTemplateEdit.js';

export type PromptInput = {
  subjectMode: 'SOLO' | 'COUPLE' | 'GROUP';
  templateId?: string;
  styleKey: string;
  description?: string;
  /**
   * True when generations.ts is actually attaching the template's real
   * photo (src/data/templateImages.ts) as a reference image alongside this
   * prompt. Added 2026-09-11 — switches buildFusionPrompt into the
   * template-EDIT branch below (match the attached photo exactly, only
   * swap faces) instead of the older text-only "invent a scene from this
   * description" branch. False/absent for a template with no real photo
   * (the illustrated-only "Cartoon Us") or no template at all, where the
   * text-only branch is still exactly correct — there's no photo to edit.
   */
  hasTemplateImage?: boolean;
  /**
   * True for the "General" create mode (src/components/create/freeform-form.tsx)
   * — one photo, one free-text description, deliberately no couple/solo
   * template gallery involved. Added 2026-09-12 for the viral "reimagine me
   * as ___" decade-photo trend (80s/90s yearbook, Y2K flash, etc. — see that
   * trend's own writeup): those all require changing clothing, hair, AND
   * era/setting together, which the default freeform fidelity rule below
   * deliberately forbids unless overridden (that rule exists for the
   * OPPOSITE reason — see buildFreeformScenePrompt's fidelityLine comment —
   * a plain "add a description" request that should only ever change the
   * background). Only ever true with no templateId and subjectMode SOLO
   * (enforced by generations.ts's zod schema) — General mode never has a
   * second person to reason about.
   */
  freeform?: boolean;
  /**
   * How many of the attached reference images are Person 1's ("You") own
   * photos — always ≥1. Added 2026-09-12 alongside multi-angle identity
   * lock (provider.ts's FusionInput.photoA doc comment): a real, reported
   * complaint ("output unrecognizable, completely different from the
   * original") plus outside research (Google's own Nano Banana Pro
   * prompting guidance: up to 14 reference images, 6 at high fidelity, for
   * measurably better identity lock than one photo) both point at the same
   * fix — attach several angles/expressions of the same person instead of
   * just one, and TELL the model explicitly that they're the same person
   * (describeReferenceImages below), since an unlabeled group of similar
   * faces reads to the model as "several people to compose in," which is
   * the opposite of the intent.
   */
  photoACount: number;
  /** Same idea as photoACount, for Person 2 ("Partner"). Absent for SOLO
   * and GROUP — GROUP uses groupPhotoCount instead (see its doc comment). */
  photoBCount?: number;
  /**
   * GROUP mode only (2026-09-12, real request: "three faces in one photo").
   * How many DISTINCT people are packed into the photoA array — the
   * opposite meaning from photoACount's usual "N angles of the SAME
   * person": here every one of these images is a different individual's
   * own single photo. See promptGroup.ts's buildGroupScenePrompt for the
   * dedicated N-person prompt this drives (kept in its own file rather
   * than forcing SOLO/COUPLE's already-tested buildFreeformScenePrompt to
   * grow a third, structurally different case).
   */
  groupPhotoCount?: number;
};

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
function ordinal(n: number): string {
  return (ORDINALS[n - 1] ?? `${n}th`).toUpperCase();
}

/**
 * Natural-language description of a contiguous run of attached reference
 * images, 1-based over the WHOLE attached-image list (matching whatever
 * "the FIRST/SECOND attached image" convention the calling prompt already
 * uses — template photo, if any, always occupies position 1 there). A
 * single image reads as "the SECOND reference photo"; several read as "the
 * SECOND through FOURTH reference photos (different angles of the very
 * same person...)" — the explicit same-person callout is not decorative:
 * without it, extra angles of one person read to the model as extra
 * PEOPLE to place in the scene, which is exactly backwards from what
 * multi-angle identity lock is for. Exported for promptTemplateEdit.ts's
 * two template-editing branches, which need the identical wording for
 * exactly the same reason.
 */
export function describeReferenceImages(startIndex: number, count: number): string {
  if (count <= 1) return `the ${ordinal(startIndex)} reference photo`;
  const endIndex = startIndex + count - 1;
  return `the ${ordinal(startIndex)} through ${ordinal(endIndex)} reference photos (these are ALL the very same person, just different angles/expressions/lighting — never treat them as different individuals, and never blend them into an averaged or composite face; use them together to lock in that one person's true likeness)`;
}

/**
 * The hard, non-negotiable body-preservation line — split out as its own
 * constant 2026-09-12 after a real reported complaint ("my photo still
 * looks unrecognizable because of fatty and so on"): a real user's actual
 * build was coming back visibly heavier than their real photo. Generic
 * image models have a documented tendency to normalize an unclear or
 * partially-visible body toward a generic default when they can't see it
 * clearly in the reference (a face-only or tightly-cropped photo gives the
 * model nothing to match proportions against) — worded here as its own
 * isolated, repeated, ALL-CAPS "HARD CONSTRAINT" rather than folded into
 * the general fidelity line, per the researched "identity header" pattern
 * (explicit hard constraints stated in isolation hold up better than the
 * same instruction buried in a longer sentence).
 */
export const BODY_TYPE_HARD_CONSTRAINT =
  'HARD CONSTRAINT — body type: match each person\'s real body weight, size, build, and proportions EXACTLY as shown in their own reference photos. Do not slim them down, do not add weight, do not idealize or "improve" their physique, do not default to a generic or average build when the reference photo only shows their face or upper body — infer the rest of their body conservatively from what IS visible (shoulder width, neck, visible frame) rather than inventing an unrelated body type. This is a hard constraint, not a style preference.';

/**
 * Distinctive facial accessories/markings are part of a person's real
 * identity, not incidental detail — often MORE visually distinctive than
 * bone structure alone, since a face-swap that drops them reads as "not
 * the same person" even when the underlying face shape is close. Added
 * 2026-09-12 after a real, visually-VERIFIED gap: the hair-transfer fix
 * (see promptTemplateEdit.ts's own doc comment) was re-run against the
 * actual production code and real Gemini API on the exact broken case —
 * the hair fix worked, confirmed by direct pixel comparison, but the
 * result still dropped the reference photo's bindi, because the existing
 * wording named facial STRUCTURE (eyes, nose, jawline, skin tone) and, as
 * of that fix, hair — but never accessories or markings, so nothing told
 * the model they mattered too. Exported as its own shared constant (same
 * pattern as BODY_TYPE_HARD_CONSTRAINT above) so every identity-preserving
 * branch — template edit, template face-swap, and freeform — states this
 * identically instead of drifting.
 *
 * Extended 2026-09-13 to explicitly name eyewear and to forbid
 * cross-person transplants, after a real, live, visually-confirmed couple
 * generation: the "Together" composite came back with the man's own real
 * glasses missing from his face AND the same style of glasses instead
 * appearing on the woman, who doesn't wear glasses in her own reference
 * photos — while BOTH of their separate solo portraits (same session, same
 * reference photos) correctly put glasses on him and not on her. So this
 * wasn't a "dropped" accessory the old wording already covered — it was a
 * whole distinctive feature swapped onto the WRONG person, a failure mode
 * this line never named, on an item type (eyewear) it never even listed.
 * Nothing in `assessGenerationOutput`'s checker caught it either, for the
 * exact same reason — see that file's own updated marking list.
 */
// Upgraded to a HARD CONSTRAINT (same ALL-CAPS pattern as
// BODY_TYPE_HARD_CONSTRAINT above, which real testing already proved
// holds up) after the first, softer phrasing was ALSO real-tested against
// the actual Gemini API on the same known case and still dropped the
// reference photo's bindi entirely — a plain trailing sentence wasn't
// enough. This version does two more things real research on this exact
// problem recommends: names the specific failure mode as a hard negative
// ("a missing marking... is a failure"), and is deliberately ALSO woven
// directly into each subjectLine's own core sentence below (not just left
// as one more line in a list) — redundant, on-purpose, since a constraint
// stated once among many competing instructions is easier for the model
// to silently drop than the same constraint stated twice in different
// words.
export const FACIAL_ACCESSORY_LINE =
  'HARD CONSTRAINT — facial accessories, eyewear, and markings: if a person\'s OWN reference photo shows a bindi, facial piercing, earring, nose ring, mole, freckle, scar, eyeglasses, sunglasses, or other distinctive marking or eyewear, that exact item MUST appear on THAT SAME person in the output, in the same position — and must NEVER be given to a different person in the scene whose own reference photo doesn\'t show it. Do not omit it, do not "clean up" or beautify it away, and do not transplant one person\'s glasses, jewelry, or marking onto someone else\'s face — a missing, fabricated, OR misattributed (given to the wrong person) marking or eyewear is a failure of this task, the same as a wrong face shape would be. This is a hard constraint, not a style preference.';

/**
 * Head-to-body SCALE, for the template face-swap path specifically — added
 * 2026-09-12 after a real, measured complaint: "face of the boy... doesn't
 * correctly match with the body as like single one." Direct pixel
 * measurement against the actual template photo (rooftop-night.jpg) and a
 * real generated output confirmed it: comparing head width against a fixed,
 * unoccluded body landmark (the short-sleeve/bicep edge), the swapped-in
 * head came back measurably larger relative to the body than the
 * template's own original head was — a real anatomical mismatch, not a
 * subjective impression.
 *
 * Root cause, by elimination against the actual prompt text: both
 * buildTemplateEditPrompt and buildTemplateFaceSwapPrompt already say to
 * preserve the template's "pose, body position, and clothing" exactly, but
 * neither ever named head SIZE/SCALE as one of the things being preserved
 * — only identity (whose face it is), never the geometric fit of that face
 * into the body already there. Nothing stopped the model from rendering
 * the swapped head at whatever scale a normal portrait crop of the
 * reference photo would suggest, instead of the exact scale the vacated
 * template head occupied. The solo template-edit path recomposes/recrops
 * the frame anyway (buildTemplateEditPrompt's own "recompose as needed"),
 * which likely masks the same gap by letting the model naturally rescale
 * the whole frame around the new head — the couple path has no such
 * escape hatch, since both people's exact composition is locked, so any
 * head/body scale drift has nowhere to hide.
 */
export const HEAD_SCALE_HARD_CONSTRAINT =
  'HARD CONSTRAINT — ANATOMICAL HEAD & BODY PROPORTIONS: Analyze each person\'s real head-to-body proportion and shoulder width. The replacement head (face and hair) must occupy an anatomically natural size relative to their shoulders and torso frame (head height should be approximately 1/7th to 1/8th of total body height, and head width must fit naturally within the shoulder span). Measure against their neck width and shoulder line — NEVER generate an oversized, swollen, floating, or bobblehead face on top of the body frame. This is a hard constraint, not a style preference.';

/**
 * Full-body skin tone unification — added 2026-09-13 after user feedback
 * showing body skin (arms, neck, chest, legs) mismatching face skin tone.
 * The AI model must recolor visible body skin to match the reference person's real skin tone.
 */
export const FULL_BODY_SKIN_TONE_HARD_CONSTRAINT =
  'HARD CONSTRAINT — UNIFIED FULL-BODY SKIN TONE: Match each person\'s exact real skin tone from their reference photos across their ENTIRE visible body — face, neck, shoulders, chest, forearms, hands, legs, and feet. The template photo\'s original stock model skin tone MUST BE FULLY DISCARDED AND RECOLORED to match the real reference person\'s skin tone. Never leave mismatched skin tones (e.g. warm brown face with pale white legs, arms, or neck) — all exposed skin across the entire body must have a uniform, continuous, realistic skin tone matching their real reference photos. A face with a different skin tone than the attached body is a failure of this task. This is a hard constraint, not a style preference.';

/**
 * The "pasted-on head" look — added 2026-09-12 after a real, specific
 * complaint pointing at two concrete symptoms in the same generated image:
 * (1) the background immediately around each swapped-in head reads
 * noticeably softer/blurrier than the rest of the photo, and (2) the new
 * head's skin tone doesn't continue smoothly into the neck/body skin
 * already in the template. Both are the same underlying failure — a
 * localized head-swap edit that doesn't fully commit to matching the
 * surrounding photo's own sharpness, grain, and lighting/color grade,
 * leaving a visible boundary where the edit happened, the same tell-tale
 * as a badly-blended photo composite. Named explicitly rather than left
 * for "preserve the photo exactly" to cover implicitly, per this file's
 * own established pattern — a vague instruction leaves room for the model
 * to treat the edit region as its own island; a named boundary condition
 * doesn't.
 */
export const SEAMLESS_INTEGRATION_HARD_CONSTRAINT =
  'HARD CONSTRAINT — SEAMLESS ANATOMICAL INTEGRATION: Render head, hair, neck, collarbones, shoulders, and chest as ONE continuous, undivided anatomical human body with unified skin tone. There must be NO cutout line, NO shadow seam under the chin, NO neck collar band artifact, NO sticker edge boundary, and NO mismatched body skin tone. When isolating a person for a solo portrait, discard all limbs, hands, or sleeves of the second template person completely, rendering a clean, natural neck and posture. Matching the scene\'s lighting means matching its brightness, direction, and shadow — it does NOT mean tinting their hair with the scene\'s own ambient color cast: their hair must keep its exact real color from the reference photo. A head that reads as pasted onto the body, or a head whose skin tone mismatches the arms/legs/chest skin tone, is a failure of this task. This is a hard constraint, not a style preference.';

// Mirrors the zod `description: z.string().max(500)` cap in
// routes/generations.ts — kept as its own named constant here (rather than
// imported) since promptBuilder.ts is deliberately the one file route/
// provider code never needs to touch; duplicating one number is cheaper
// than coupling the two layers.
// Exported so promptGroup.ts (split out 2026-09-12 to keep this file under
// the workspace's 350-line cap) can build its own "Scene:" line the exact
// same way this file's own freeform branch does, instead of duplicating
// the cap.
export const MAX_PRIMARY_DESCRIPTION_LENGTH = 500;
// From prompt-templates.pdf §3: "Cap user input length (e.g. 100-150
// characters) so it can only add small style notes... not restructure the
// whole request." Applies only when a template (image- or text-based) is
// already driving the scene/pose — the no-template case is the user's
// actual scene, not a small note, so it keeps the full 500.
const MAX_ADDITIONAL_NOTE_LENGTH = 150;

/**
 * Phrases that read as an attempt to use the free-text description field to
 * override the face-identity/pose/scene rules below, rather than add a
 * small style note ("golden hour," "add rain"). Taken directly from
 * prompt-templates.pdf §3's own denylist example. Checked as case-
 * insensitive substrings since real users won't type these verbatim, but
 * a jailbreak attempt tends to contain one of these phrases close to
 * verbatim.
 */
const OVERRIDE_ATTEMPT_PHRASES = [
  'ignore previous instructions',
  'ignore the above',
  'ignore all previous',
  'disregard the above',
  'disregard previous',
];

/**
 * Cleans a user-supplied free-text note before it gets anywhere near the
 * model. Two jobs, both from prompt-templates.pdf §3: reject outright
 * (return null, not a partially-stripped string) if it contains a phrase
 * that reads as an override attempt — a defused attack is still an attack,
 * so the safe move is to drop it whole rather than guess which part was
 * safe — and cap length so it can only ever add a short note, never
 * restructure the request. Was previously completely unguarded: `description`
 * flowed straight into the prompt as either the whole scene or an
 * "Additional direction" line with nothing checking it for exactly this.
 * Exported for promptGroup.ts's identical need — same guardrail, same
 * reasoning, so it can't drift between the two files.
 */
export function sanitizeUserPrompt(text: string | undefined, maxLength: number): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (OVERRIDE_ATTEMPT_PHRASES.some((phrase) => lower.includes(phrase))) return null;

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/** Shared by both prompt branches below (and by promptTemplateEdit.ts's two
 * template-editing branches — exported for exactly that, see this file's
 * import there) — the low-priority, capped, denylist-checked user note that
 * rides along under a template (image- or text-based). Kept as one function
 * so the guardrail logic can't drift between branches, template or not. */
export function buildAdditionalNoteLine(description: string | undefined): string {
  const clean = sanitizeUserPrompt(description, MAX_ADDITIONAL_NOTE_LENGTH);
  return clean
    ? `Additional style preference from the user (apply only if it does not conflict with the face-identity, pose, and scene-preservation rules above): "${clean}".`
    : '';
}

/** Also shared with promptTemplateEdit.ts's two template-editing branches —
 * framing/lighting instruction is the same regardless of whether the scene
 * comes from an attached template photo or a text description. Exported so
 * that file (split out 2026-09-12 to keep this one under the workspace's
 * 350-line module cap) can reuse it instead of duplicating it. */
export function buildFormatLine(subjectMode: PromptInput['subjectMode']): string {
  const wallpaperFraming =
    'VERTICAL 9:16 PHONE WALLPAPER COMPOSITION — frame the subject aesthetically in the upper 75% of the screen with balanced headroom for smartphone lock-screen clock widgets.';
  const whoLine =
    subjectMode === 'COUPLE'
      ? 'both people fully visible in an intimate, aesthetic couple wallpaper pose'
      : subjectMode === 'GROUP'
        ? 'everyone in the group fully visible, naturally arranged together in one wallpaper shot'
        : 'the person fully visible in a stylish, photorealistic solo wallpaper pose';
  return `Compose as a premium 9:16 mobile wallpaper, ${whoLine}, consistent lighting across the image. ${wallpaperFraming}`;
}

/**
 * Builds the natural-language instruction sent to the AI provider. Kept as
 * one small, swappable function — the prompt wording is the single biggest
 * lever on output quality, so this is exactly what should change during the
 * Phase 0/1 testing in docs/ai-generation-plan.md without touching route or
 * provider code.
 *
 * Dispatches to one of three genuinely different prompt strategies (see
 * each function's own doc comment): buildTemplateEditPrompt when a real
 * template photo is being attached (generations.ts sets hasTemplateImage),
 * buildGroupScenePrompt for GROUP mode (2026-09-12 — a fundamentally
 * different N-DISTINCT-people task, never a template, kept in its own file
 * rather than a third case bolted onto buildFreeformScenePrompt), or
 * buildFreeformScenePrompt for everything else (SOLO/COUPLE with only a
 * text description to go on — no template, or an illustrated-only one like
 * Cartoon Us).
 */
export function buildFusionPrompt(input: PromptInput): string {
  if (input.templateId && input.hasTemplateImage) {
    return buildTemplateEditPrompt(input);
  }
  if (input.subjectMode === 'GROUP') {
    return buildGroupScenePrompt(input);
  }
  return buildFreeformScenePrompt(input);
}
