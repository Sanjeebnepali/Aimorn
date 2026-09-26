import { getObjectBytes } from './storage.js';
import { buildTemplateCompositePrompt, buildTemplateFaceSwapPrompt, buildFusionPrompt } from './promptBuilder.js';
import { COUPLE_PEOPLE_RETRY_NOTE, SINGLE_PERSON_RETRY_NOTE } from './promptQualityConstraints.js';
import { reduceEditSeam } from './imagePostProcess.js';
import { assessGenerationOutput } from './ai/outputQuality.js';
import { countPeopleInImage } from './ai/personCount.js';
import { correctFaceToneAndScale } from './faceGeometry.js';
import type { TemplateImage } from '../data/templateImages.js';
import type { FusionOutput, ImageFusionProvider } from './ai/provider.js';

/**
 * The actual "generate one image, then correct/verify/retry it" logic —
 * split out of generationJob.ts 2026-09-13 so the "regenerate just this one
 * image" feature (routes/generationsRegenerate.ts) can call the EXACT same,
 * already-tested pipeline a fresh 3-image job uses, instead of a second
 * hand-copied version that could silently drift from it. generationJob.ts
 * itself was also rewritten to call these instead of its own inline
 * closures — this is a pure extraction, not a behavior change; see git
 * history for the pre-split version if a diff is ever needed.
 */

export type PersonPhotos = { bytes: Buffer; mimeType: string }[];

/** Fetches every key in a person's photo-array from storage in parallel and
 * returns them as the {bytes, mimeType}[] shape every provider expects (see
 * provider.ts's FusionInput.photoA doc comment for why this is an array of
 * ANGLES of one person, not one photo). */
export async function loadPersonPhotos(keys: string[]): Promise<PersonPhotos> {
  const allBytes = await Promise.all(keys.map((key) => getObjectBytes(key)));
  return allBytes.map((bytes, i) => ({ bytes, mimeType: keys[i].endsWith('.png') ? 'image/png' : 'image/jpeg' }));
}

/**
 * Headcount gate — the safety net behind the SINGLE_PERSON_ONLY prompt
 * constraint (promptQualityConstraints.ts), added 2026-09-26 after a real,
 * reproduced bug where a couple session's "solo" portraits came back as
 * two-person images. A prompt can only ask; this actually checks. If the
 * result's headcount is wrong, `retry` regenerates once (callers pass a
 * retry that also appends a correction note naming the failure — a retry
 * with only a new seed can just reproduce the same misread of the scene).
 * If the retry is STILL wrong, this throws rather than shipping it: a
 * "solo" image with two people in it is a broken result, not a
 * lower-quality one, and both callers (POST /generations and the regenerate
 * route) only charge credits AFTER this returns, so throwing costs the user
 * nothing while returning a wrong-headcount image as a success would.
 *
 * `count === null` (the vision call itself failed) is treated as "unknown,
 * don't block" — see personCount.ts for why this fails open.
 */
async function ensureHeadcount(params: {
  result: FusionOutput;
  expected: number;
  retry: () => Promise<FusionOutput>;
  failureMessage: string;
}): Promise<FusionOutput> {
  const { result, expected, retry, failureMessage } = params;
  const count = await countPeopleInImage(result.imageBytes, result.mimeType);
  if (count === null || count === expected) return result;

  console.warn(`Headcount check failed (expected ${expected}, saw ${count}) — retrying once with a correction note and perturbed seed.`);
  const retried = await retry();
  const retriedCount = await countPeopleInImage(retried.imageBytes, retried.mimeType);
  if (retriedCount === null || retriedCount === expected) return retried;

  console.error(`Headcount check failed again after retry (expected ${expected}, saw ${retriedCount}) — failing the job instead of shipping it.`);
  throw new Error(failureMessage);
}

/**
 * One person's solo portrait: generate → (if templated) correct face tone/
 * scale → verify via assessGenerationOutput → retry once with a perturbed
 * seed if that check failed → (if `singlePerson`) verify the headcount. Used for COUPLE's two solo portraits, for a plain SOLO
 * generation, and for GROUP (whose "prompt" already encodes all N people via
 * promptGroup.ts — this function doesn't need to know GROUP exists, it just
 * runs whatever prompt it's handed against whatever photos it's handed).
 * `photos` is deliberately generic ("this call's own subject", not always
 * literally "You") so the same function serves photoA, photoB, or a
 * solo/group photoA with no partner at all.
 */
export async function generateSoloPart(params: {
  photos: PersonPhotos;
  templateImage: TemplateImage | undefined;
  prompt: string;
  seed: number;
  /** Added to `seed` for the one retry attempt — callers pass a different
   * offset per call-site (101/202/303 in the original code) purely so two
   * concurrent solo calls sharing a base seed don't retry onto the SAME
   * perturbed seed as each other by coincidence. Cosmetic, not load-bearing. */
  retrySeedOffset: number;
  styleKey: string;
  provider: ImageFusionProvider;
  /** True for every real solo portrait (COUPLE's two solos, a plain SOLO):
   * the finished image must show exactly one person. A caller-supplied flag
   * rather than always-on because this same function also serves GROUP,
   * where the right headcount is N and this check must NOT run — a boolean
   * (not a free-form count) because the retry's correction note
   * (SINGLE_PERSON_RETRY_NOTE) is only correct for "exactly one." Omitted =
   * no headcount check, same as before this option existed. */
  singlePerson?: boolean;
}): Promise<FusionOutput> {
  const { photos, templateImage, prompt, seed, retrySeedOffset, styleKey, provider, singlePerson } = params;

  // One generate (+ template face/skin correction) attempt, factored out so
  // the quality-check retry and the headcount retry below both rerun exactly
  // the same steps with only the seed/prompt changed.
  const produce = async (attemptSeed: number, attemptPrompt: string): Promise<FusionOutput> => {
    const res = await provider.generate({ photoA: photos, templateImage, prompt: attemptPrompt, seed: attemptSeed });
    if (!templateImage) return res;
    const corrected = await correctFaceToneAndScale({
      templateImageBytes: templateImage.bytes,
      generatedImageBytes: res.imageBytes,
      referencePhotos: [photos[0]?.bytes].filter((b): b is Buffer => !!b),
    });
    return { ...res, imageBytes: corrected.imageBytes };
  };

  let result = await produce(seed, prompt);

  // Fidelity check is templated-only, exactly as before this refactor: a
  // plain freeform result has never gone through assessGenerationOutput, and
  // turning it on there would add paid retries the user never asked for.
  if (templateImage) {
    const check = await assessGenerationOutput({
      resultBytes: result.imageBytes,
      resultMimeType: result.mimeType,
      referencePhotos: photos,
      styleKey,
    });
    if (!check.ok) {
      console.warn(`Solo quality check failed (${check.reason}) — retrying once with perturbed seed.`);
      result = await produce(seed + retrySeedOffset, prompt);
    }
  }

  if (!singlePerson) return result;
  return ensureHeadcount({
    result,
    expected: 1,
    // A different offset than the fidelity retry above (+5000), so a job
    // that already burned that retry doesn't land on the same seed again.
    retry: () => produce(seed + retrySeedOffset + 5000, `${prompt} ${SINGLE_PERSON_RETRY_NOTE}`),
    failureMessage: "We couldn't get a clean single-person portrait this time. You weren't charged — please try again.",
  });
}

/**
 * The COUPLE "together" shot — the two genuinely different strategies
 * (templated 2-step composite vs. a single freeform fusion call) live here
 * exactly as they did in generationJob.ts; see buildTemplateCompositePrompt/
 * buildTemplateFaceSwapPrompt's own doc comments for why the templated path
 * is two edits of the SAME pristine template rather than a chain.
 */
export async function generateTogetherPart(params: {
  photoA: PersonPhotos;
  photoB: PersonPhotos;
  templateImage: TemplateImage | undefined;
  templateId?: string;
  styleKey: string;
  description?: string;
  seed: number;
  provider: ImageFusionProvider;
}): Promise<FusionOutput> {
  const { photoA, photoB, templateImage, templateId, styleKey, description, seed, provider } = params;

  if (!templateImage) {
    const freeformPrompt = buildFusionPrompt({
      subjectMode: 'COUPLE',
      templateId,
      styleKey,
      description,
      hasTemplateImage: false,
      photoACount: photoA.length,
      photoBCount: photoB.length,
    });
    const first = await provider.generate({ photoA, photoB, prompt: freeformPrompt, seed });

    // Headcount gate for the same reason as generateSoloPart's — here the
    // model composes the whole scene from scratch, so it can just as easily
    // return one person or an invented third. Deliberately NOT applied to
    // the templated branch below: the template photo itself already fixes
    // that scene at exactly two people, so the failure this guards against
    // can't occur there.
    return ensureHeadcount({
      result: first,
      expected: 2,
      retry: () => provider.generate({ photoA, photoB, prompt: `${freeformPrompt} ${COUPLE_PEOPLE_RETRY_NOTE}`, seed: seed + 3000 }),
      failureMessage: "We couldn't get a clean couple photo this time. You weren't charged — please try again.",
    });
  }

  const attemptTogether = async (attemptSeed: number) => {
    const stepOnePrompt = buildTemplateFaceSwapPrompt({ styleKey, description, photoCount: photoA.length });
    const stepOne = await provider.generate({ photoA, templateImage, prompt: stepOnePrompt, seed: attemptSeed });

    const compositePrompt = buildTemplateCompositePrompt({ styleKey, description, photoCount: photoB.length });
    return provider.generate({
      photoA: photoB,
      templateImage,
      identityReferenceImage: { bytes: stepOne.imageBytes, mimeType: stepOne.mimeType },
      prompt: compositePrompt,
      seed: attemptSeed,
    });
  };

  let composite = await attemptTogether(seed);
  const check = await assessGenerationOutput({
    resultBytes: composite.imageBytes,
    resultMimeType: composite.mimeType,
    referencePhotos: [...photoA, ...photoB],
    styleKey,
  });
  if (!check.ok) {
    console.warn(`Together-shot quality check failed (${check.reason}) — retrying once with a perturbed seed.`);
    composite = await attemptTogether(seed + 1);
  }

  const toneCorrected = await correctFaceToneAndScale({
    templateImageBytes: templateImage.bytes,
    generatedImageBytes: composite.imageBytes,
    referencePhotos: [photoA[0]?.bytes, photoB[0]?.bytes].filter((b): b is Buffer => !!b),
  });
  if (toneCorrected.report.scaleCorrected.length > 0) {
    console.warn('Face scale corrected:', JSON.stringify(toneCorrected.report.scaleCorrected));
  }
  if (toneCorrected.report.scaleWarnings.length > 0) {
    console.warn('Face scale warning (measured, not corrected):', JSON.stringify(toneCorrected.report.scaleWarnings));
  }

  const seamReduced = await reduceEditSeam(toneCorrected.imageBytes);
  return { ...composite, imageBytes: seamReduced, mimeType: 'image/jpeg' };
}
