import { getObjectBytes } from './storage.js';
import { buildTemplateCompositePrompt, buildTemplateFaceSwapPrompt, buildFusionPrompt } from './promptBuilder.js';
import { reduceEditSeam } from './imagePostProcess.js';
import { assessGenerationOutput } from './ai/outputQuality.js';
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
 * One person's solo portrait: generate → (if templated) correct face tone/
 * scale → verify via assessGenerationOutput → retry once with a perturbed
 * seed if that check failed. Used for COUPLE's two solo portraits, for a
 * plain SOLO generation, and for GROUP (whose "prompt" already encodes all
 * N people via promptGroup.ts — this function doesn't need to know GROUP
 * exists, it just runs whatever prompt it's handed against whatever photos
 * it's handed). `photos` is deliberately generic ("this call's own subject",
 * not always literally "You") so the same function serves photoA, photoB,
 * or a solo/group photoA with no partner at all.
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
}): Promise<FusionOutput> {
  const { photos, templateImage, prompt, seed, retrySeedOffset, styleKey, provider } = params;
  let currentSeed = seed;
  let res = await provider.generate({ photoA: photos, templateImage, prompt, seed: currentSeed });
  if (!templateImage) return res;

  let corrected = await correctFaceToneAndScale({
    templateImageBytes: templateImage.bytes,
    generatedImageBytes: res.imageBytes,
    referencePhotos: [photos[0]?.bytes].filter((b): b is Buffer => !!b),
  });
  const check = await assessGenerationOutput({
    resultBytes: corrected.imageBytes,
    resultMimeType: res.mimeType,
    referencePhotos: photos,
    styleKey,
  });
  if (!check.ok) {
    console.warn(`Solo quality check failed (${check.reason}) — retrying once with perturbed seed.`);
    currentSeed = seed + retrySeedOffset;
    res = await provider.generate({ photoA: photos, templateImage, prompt, seed: currentSeed });
    corrected = await correctFaceToneAndScale({
      templateImageBytes: templateImage.bytes,
      generatedImageBytes: res.imageBytes,
      referencePhotos: [photos[0]?.bytes].filter((b): b is Buffer => !!b),
    });
  }
  return { ...res, imageBytes: corrected.imageBytes };
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
    return provider.generate({
      photoA,
      photoB,
      prompt: buildFusionPrompt({
        subjectMode: 'COUPLE',
        templateId,
        styleKey,
        description,
        hasTemplateImage: false,
        photoACount: photoA.length,
        photoBCount: photoB.length,
      }),
      seed,
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
