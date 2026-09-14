import { stylePromptFor } from '../data/styles.js';
import {
  BODY_TYPE_HARD_CONSTRAINT,
  buildAdditionalNoteLine,
  buildFormatLine,
  describeReferenceImages,
  FACIAL_ACCESSORY_LINE,
  FULL_BODY_SKIN_TONE_HARD_CONSTRAINT,
  HEAD_SCALE_HARD_CONSTRAINT,
  SEAMLESS_INTEGRATION_HARD_CONSTRAINT,
  type PromptInput,
} from './promptBuilder.js';

/**
 * Split out of promptBuilder.ts 2026-09-12 — adding the "General" freeform
 * mode's own fidelity/modesty branches pushed that file to 363 lines, over
 * this workspace's 350-line module cap. These two functions are also a
 * clean, self-contained concern on their own: everything here is about
 * editing an ATTACHED template photo (generations.ts's hasTemplateImage
 * case), never about the text-only freeform branch that stayed behind in
 * promptBuilder.ts. `buildAdditionalNoteLine`/`buildFormatLine` are
 * imported back from there rather than duplicated, since both branches
 * share them and the denylist/format logic can't be allowed to drift
 * between the two files.
 */

/**
 * The template-EDIT branch for SOLO output — used when generations.ts is
 * attaching the template's real photo (hasTemplateImage). Rewritten
 * 2026-09-11 directly against prompt-templates.pdf's own design: this is
 * genuinely the "image 1 is the exact template to preserve, only swap the
 * face" editing task the PDF describes, which wasn't literally possible
 * before that session because no template photo was ever sent to the
 * model. The scene/pose/clothing instructions here deliberately point at
 * the TEMPLATE photo, not the user's own reference photo — that's the
 * actual point of this mode: the template is what gets recreated by
 * default, and the user's own uploaded pose/outfit no longer matters
 * except for their face.
 *
 * COUPLE output used to also go through here (one prompt swapping both
 * faces at once) — moved to buildTemplateFaceSwapPrompt below, called
 * twice in sequence, after a real generation proved the combined version
 * unreliable (see that function's doc comment for the actual evidence).
 *
 * Used to target a hardcoded 'left'/'right' side per caller — dropped the
 * same day as buildTemplateFaceSwapPrompt's identical fix, for the exact
 * same reason: a couple session's two solo portraits (generations.ts)
 * called this once per photoA/photoB with a fixed left/right assignment
 * that has no real relationship to which position either person actually
 * appears in in the template photo. Now each call independently asks the
 * model to identify which of the template's two people the attached
 * reference photo plausibly matches — the two solo calls run in parallel
 * with two different reference photos (photoA vs photoB), so as long as
 * each one is actually a plausible match for a different one of the
 * template's two people, they naturally resolve to different people
 * without the two calls needing to coordinate.
 */
export function buildTemplateEditPrompt(input: PromptInput): string {
  const styleLine = `Style: ${stylePromptFor(input.styleKey)}.`;
  const additionalNoteLine = buildAdditionalNoteLine(input.description);
  const formatLine = buildFormatLine(input.subjectMode);
  // "from their reference photo" (the freeform branch's modesty line)
  // would be wrong here — the clothing being preserved is the template's,
  // not the uploaded reference photo's.
  const modestyLine = 'Never remove, alter, or extend past a person’s actual clothing as shown in the template photo.';

  // Added 2026-09-11 after a real reported bug + visual confirmation: a
  // "golden hour" template where both people's hands sit close together
  // near the frame's center (hers at her own neck, his at his own collar)
  // came back with the girl's SOLO portrait showing an anatomically
  // confused tangle of fingers near her neck — zoomed-in inspection of the
  // actual output showed extra/doubled finger shapes right where the two
  // template people's hands had been close together, consistent with a
  // fragment of the removed person's hand getting blended into hers during
  // the recrop rather than being cleanly discarded. The general "remove the
  // other person entirely" instruction above doesn't specifically protect
  // hands, which sit right at the boundary between the two people in a lot
  // of couple poses (arms around each other, hands near each other's face)
  // — naming the failure mode explicitly is the same "explicit beats
  // implicit" fix as the rest of this function's own history.
  const handArtifactLine = 'Many of these templates show both people\'s hands close together (one person\'s hand near the other\'s shoulder, collar, or neck) — when isolating the one matching person, do not blend, merge, or leave any leftover fragment of the OTHER (removed) person\'s hand, fingers, or arm into the frame. The remaining person\'s own hands must be anatomically correct and complete: exactly five fingers per visible hand, cleanly connected to their own wrist and arm, with no extra, doubled, or floating finger shapes.';

  // Only ever called for SOLO now (see this function's own doc comment
  // above and buildTemplateFaceSwapPrompt below for COUPLE) — isolates ONE
  // person from the template's two, discarding the other.
  //
  // Fixed 2026-09-11: the previous wording said BOTH "take only that person
  // and ignore the other one" AND "preserve the template's composition
  // exactly" in the same instruction — a real, reported bug ("single image
  // also show pair with couple," i.e. a SOLO generation coming back with
  // both template people still in frame). Those two instructions directly
  // conflict for a two-person template: its actual composition, by
  // definition, includes both people, so "preserve composition exactly"
  // gave the model license to leave the second (unmatched, still-generic)
  // person right where the template had them, only ever fixing the face of
  // whichever one it matched. The fix is to say explicitly that the output
  // must become a solo shot — remove/recompose the frame, don't just leave
  // a second person untouched next to it — which is what the old wording
  // never actually said. Used both for a genuine standalone solo generation
  // and for each of a couple session's two individual solo portraits
  // (generations.ts).
  // describeReferenceImages(2, ...) since position 1 is always the template
  // photo attached ahead of it (this function's own subjectLine below) —
  // multi-angle uploads (2026-09-12, see promptBuilder.ts's PromptInput.
  // photoACount doc comment) mean this is no longer always exactly one
  // image at position 2, so the range has to be computed, not hardcoded.
  const referenceImages = describeReferenceImages(2, input.photoACount);
  // TEMPLATE_MODEL_REPLACEMENT_LINE below is the actual fix for a real,
  // visually-confirmed failure (2026-09-12): a live "rooftopNight"
  // generation came back nearly IDENTICAL to the template's own two stock
  // models — same haircuts, same face shapes — meaning the "face swap"
  // barely happened. Root-caused two concrete gaps, both against real
  // outside research (Google's own Nano Banana guidance plus multiple
  // independent "why doesn't Gemini keep my face" guides), not guessed:
  //   1. HAIR was never named as something to take from the reference
  //      photo — only "face"/"facial structure" was, and hair is one of
  //      the single biggest visual identity cues. With no instruction
  //      either way, the model kept the TEMPLATE's own hairstyle, which
  //      alone is often enough to make the result look like a different
  //      person even if the underlying face shape were correct.
  //   2. The instruction never named the actual failure mode. Independent
  //      research on this exact problem confirms it's a known, documented
  //      MODEL-LEVEL bias, not just a wording gap: general-purpose editing
  //      models are tuned to prefer keeping an already-coherent face
  //      (here, the template's own professionally-shot model) over fully
  //      committing to a real uploaded person's actual likeness, and
  //      default toward generic/idealized faces. Naming that specific
  //      failure mode as a hard negative — "the template photo's own
  //      person is a placeholder to be fully discarded, not blended with"
  //      — is the documented mitigation; there is no claim here that this
  //      makes the model 100% reliable, only that it measurably reduces
  //      the exact drift a real test showed.
  const templateModelReplacementLine =
    'The person currently shown in the template photo is a PLACEHOLDER model — their face, hairstyle, and identity must be COMPLETELY discarded, not partially kept or blended with the real reference person. If you find yourself keeping any part of the placeholder\'s face shape, eyes, or hairstyle "because it looks good," that is the failure this task is checking for.';
  const subjectLine = `This is a precise image-EDITING task. The FIRST attached image is the exact template photo showing two people together. Look at ${referenceImages} and identify which of the template people they correspond to (matching apparent gender, age, and build). The output must be a SOLO portrait of ONLY that one matching person: COMPLETELY DISCARD AND REMOVE the second (unmatched) template person from the frame, filling the background seamlessly with the template photo's environment. PRESERVE THE MATCHING PERSON'S EXACT CLOTHING, BODY POSTURE, POSE, BACKGROUND SETTING, LIGHTING, AND CAMERA ANGLE 100% AS SHOWN IN THE TEMPLATE PHOTO. ${templateModelReplacementLine} Replace ONLY their head — face AND hair — with the reference photos' real person: match their exact facial structure, eye shape, nose shape, jawline, skin tone, hair color/length/style, AND any bindi, facial piercing, earring, nose ring, mole, freckle, or scar visible in their reference photos. Do not idealize, slim, beautify, or alter proportions. Preserve their actual facial features precisely, and use their reference photos' real skin tone and texture across their ENTIRE face and all exposed body skin (arms, neck, chest, legs), recoloring the template's original body skin to match their real reference skin tone.`;

  return [subjectLine, BODY_TYPE_HARD_CONSTRAINT, FACIAL_ACCESSORY_LINE, HEAD_SCALE_HARD_CONSTRAINT, FULL_BODY_SKIN_TONE_HARD_CONSTRAINT, SEAMLESS_INTEGRATION_HARD_CONSTRAINT, handArtifactLine, styleLine, additionalNoteLine, formatLine, modestyLine]
    .filter(Boolean)
    .join(' ');
}

/**
 * A single face-swap on a TWO-person photo, leaving the other person
 * completely alone — added 2026-09-11 to replace the old one-shot "swap
 * both faces at once" COUPLE prompt after a real live test proved it
 * unreliable (one face swapped correctly, the other left close to the
 * template's own original). Doing one swap at a time is a strictly
 * simpler ask each call.
 *
 * Originally targeted a side ('left'/'right') directly — dropped the same
 * day after a SECOND real test: our own `photoA`↔left / `photoB`↔right
 * convention is just an arbitrary code-level assumption with no actual
 * relationship to which position a given template photo happens to show
 * which gender in, and this app has no gender data for either the
 * template photos or the user's own "You"/"Partner" uploads to map
 * correctly in the first place. Confirmed live: telling it to target
 * "left" with a reference photo that didn't visually match the template's
 * left-side person produced a materially worse result than the exact same
 * inputs with the position/photo pairing corrected by hand.
 *
 * This version removes position from the instruction entirely: "exactly
 * one of these two people should get the attached reference face — pick
 * whichever one it plausibly belongs to." The model's own visual matching
 * (confirmed reliable when the reference photo and target are actually a
 * plausible match) does the picking, not us.
 *
 * Used to also take a `pass: 'first' | 'second'` mode — 'second' edited
 * the FIRST pass's own OUTPUT bytes to add the second person's face onto
 * an already-synthetic image. Dropped 2026-09-12 after a real, measured
 * complaint ("face of the boy [couple shot] doesn't correctly match... as
 * like single one [his solo shot]"): side-by-side comparison showed
 * whichever person landed in pass 'second' came back with visibly lower
 * fidelity — softer, flatter, less textured — than either their own solo
 * portrait or the pass-'first' person, across three independent live
 * tests, even after two targeted prompt fixes aimed at that pass
 * specifically. That ruled out wording as the cause: editing an
 * already-regenerated image is a well-documented way for a second
 * generation pass to drift, and no amount of prompt text changes what
 * image bytes the model is actually looking at. The real fix is
 * buildTemplateCompositePrompt below — this function now ONLY ever plays
 * the 'first' role, always against the pristine original template, so
 * every call gets the same one-clean-edit fidelity a solo portrait gets.
 */
export function buildTemplateFaceSwapPrompt(input: {
  styleKey: string;
  description?: string;
  /** How many of this call's own attached reference images (positions 2+,
   * after the template photo at position 1) belong to the one person this
   * call targets — see promptBuilder.ts's PromptInput.photoACount doc
   * comment for the multi-angle identity-lock technique this feeds. */
  photoCount: number;
}): string {
  const styleLine = `Style: ${stylePromptFor(input.styleKey)}.`;
  const additionalNoteLine = buildAdditionalNoteLine(input.description);
  const formatLine = buildFormatLine('COUPLE');
  const modestyLine = 'Never remove, alter, or extend past a person’s actual clothing as shown in the attached photo.';
  const referenceImages = describeReferenceImages(2, input.photoCount);

  const targetDescription = `Exactly ONE of the two people should have their entire head — face AND hair — replaced: look at ${referenceImages} and pick whichever of the two people in the first image they most plausibly correspond to (matching apparent gender, age, and build) — replace ONLY that person's face and hair with it, and recolor all their exposed body skin (arms, neck, chest, legs) to match their real skin tone from their reference photo. Leave the other person completely untouched — their face, hair, pose, skin tone, and clothing must stay exactly as shown in the template, pixel for pixel.`;

  // Same root-caused fix as buildTemplateEditPrompt above (see that
  // function's own doc comment for the real, visually-confirmed failure
  // this answers: a live generation came back nearly identical to the
  // template's own two stock models). Both the missing-hair gap and the
  // "model prefers to keep an already-coherent placeholder face" bias
  // apply equally here — this is the SAME two-person template photo, just
  // touching one face instead of doing a solo crop.
  const templateModelReplacementLine =
    'The person you are NOT touching keeps their template appearance exactly. The person you ARE touching is a PLACEHOLDER model whose face, hairstyle, skin tone, and identity must be COMPLETELY discarded, not partially kept or blended with the real reference person.';

  const subjectLine = `This is an image-EDITING task, not a new image-generation task. The FIRST attached image shows two people together — preserve it exactly: background, lighting, camera angle, composition, both people's pose, body position, and clothing. ${targetDescription} ${templateModelReplacementLine} Match their exact facial structure, eye shape, nose shape, jawline, skin tone, hair color/length/style, AND any bindi, facial piercing, earring, nose ring, mole, freckle, or scar visible in their reference photos — do not idealize, slim, beautify, or alter proportions, and do not blend it with the face or hair already there. Preserve their actual facial features precisely, not a generic or "improved" version, and use their reference photos' real skin tone and texture across face and all exposed body skin, not the original photo's tone or the placeholder's hairstyle. Render the new head, hair, neck, and shoulders continuously as one single unified photograph — seamlessly integrating the new head into their neck and shoulders with no edge boundary, halo, dark outline, or sticker effect. Head scale must fit their shoulder width naturally.`;

  return [subjectLine, BODY_TYPE_HARD_CONSTRAINT, FACIAL_ACCESSORY_LINE, HEAD_SCALE_HARD_CONSTRAINT, FULL_BODY_SKIN_TONE_HARD_CONSTRAINT, SEAMLESS_INTEGRATION_HARD_CONSTRAINT, styleLine, additionalNoteLine, formatLine, modestyLine]
    .filter(Boolean)
    .join(' ');
}

/**
 * The actual fix for the fidelity-drift bug documented above
 * buildTemplateFaceSwapPrompt: instead of a second pass editing the FIRST
 * pass's own rendered pixels (an already-synthetic image, which measurably
 * degrades whoever's face is applied there), this edits the PRISTINE
 * original template ONE more time — applying the second person's face via
 * normal reference photos (same as buildTemplateFaceSwapPrompt), while the
 * FIRST person's face is applied by literally copying it from
 * `identityReferenceImage` (provider.ts's FusionInput field; that's
 * `stepOne`'s own output, generationJob.ts) instead of re-deriving it from
 * a real-world photo a second time.
 *
 * Why this actually fixes the drift rather than just describing it away
 * (which the earlier, abandoned secondPassFidelityLine tried and a real
 * test showed did nothing): "copy this exact face from an attached image"
 * and "replicate this real person's likeness from their photo" are
 * different-difficulty tasks for the model. The first person's face was
 * already solved correctly by stepOne — this call only has to reproduce a
 * flat copy of already-rendered pixels, not re-solve identity-matching a
 * second time under the added constraint of not disturbing a neighboring
 * edit. Both people's faces are therefore always exactly one clean edit
 * away from the original template, same as their solo portraits get.
 */
export function buildTemplateCompositePrompt(input: {
  styleKey: string;
  description?: string;
  /** How many reference photos (positions 2+) belong to the person getting
   * a normal reference-photo face-swap this call — the OTHER person comes
   * from identityReferenceImage instead, so isn't counted here. */
  photoCount: number;
}): string {
  const styleLine = `Style: ${stylePromptFor(input.styleKey)}.`;
  const additionalNoteLine = buildAdditionalNoteLine(input.description);
  const formatLine = buildFormatLine('COUPLE');
  const modestyLine = 'Never remove, alter, or extend past a person’s actual clothing as shown in the attached photo.';
  const referenceImages = describeReferenceImages(2, input.photoCount);

  const templateModelReplacementLine =
    'Both people in the scene must be rendered as FULL, anatomically seamless human beings — their face, hair, neck, shoulders, chest, arms, and posture must belong to the exact same continuous photograph with unified skin tone. Do NOT perform a localized cutout or pasted head swap, and do not leave a sharp boundary at the neck or mismatched body skin tone. The placeholder models are COMPLETELY discarded and replaced with the real reference individuals.';

  const referencePhotoTargetLine = `One of the two people should be rendered using ${referenceImages}: look at those reference photos and identify whichever person they correspond to — match their exact facial structure, eye shape, nose shape, jawline, skin tone across face and body, hair color/length/style, AND any bindi, facial piercing, earring, nose ring, mole, freckle, or scar visible in their reference photos.`;
  const identityReferenceTargetLine =
    'The LAST attached image shows a person\'s face, hair, and skin tone from an earlier pass — identify which person that face belongs to, and render them with that exact facial identity, hairstyle, and continuous body skin tone. Treat their facial identity as fixed and locked.';

  const subjectLine = `This is a high-fidelity photo-fusion task. Preserve the theme, mood, composition, and setting of the FIRST attached template image, but render both people as complete, realistic, anatomically integrated human beings with unified skin tones across face and body. ${referencePhotoTargetLine} ${identityReferenceTargetLine} ${templateModelReplacementLine} Match ambient scene lighting, highlights, shadows, skin texture, and film grain continuously across head, neck, shoulders, arms, legs, and clothing with no visible cutouts or edge seams.`;

  return [subjectLine, BODY_TYPE_HARD_CONSTRAINT, FACIAL_ACCESSORY_LINE, HEAD_SCALE_HARD_CONSTRAINT, FULL_BODY_SKIN_TONE_HARD_CONSTRAINT, SEAMLESS_INTEGRATION_HARD_CONSTRAINT, styleLine, additionalNoteLine, formatLine, modestyLine]
    .filter(Boolean)
    .join(' ');
}
