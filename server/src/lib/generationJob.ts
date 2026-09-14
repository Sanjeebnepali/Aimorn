import { putObjectBytes } from './storage.js';
import { buildFusionPrompt } from './promptBuilder.js';
import { templateImageFor } from '../data/templateImages.js';
import { generateSoloPart, generateTogetherPart, loadPersonPhotos } from './generationParts.js';
import type { FusionOutput, ImageFusionProvider } from './ai/provider.js';

/**
 * The actual AI-fusion orchestration for one generation — split out of
 * routes/generations.ts 2026-09-11 to keep that route file under the
 * workspace's 350-line module limit as more routes (delete, etc.) were
 * added to it. This file owns "how a job actually runs"; the route still
 * owns request validation, the credit check/transaction, and points payout.
 *
 * The actual per-image generate/correct/verify/retry logic was pulled out
 * again 2026-09-13, into generationParts.ts's generateSoloPart/
 * generateTogetherPart, so routes/generationsRegenerate.ts's "regenerate
 * just this one image" feature calls the exact same tested pipeline instead
 * of a hand-copied second version — this file now only wires those together
 * for a fresh 3-image (or 1-image) job and handles the upload/DB-row shape.
 */

function extensionFor(mimeType: string): string {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

/** A generated image plus the storage key it was uploaded to, kept together
 * so the DB update and the response can both be built from one small array
 * instead of three sets of near-identical variables. */
export type UploadedResult = FusionOutput & { key: string };

async function uploadResult(params: {
  userId: string;
  generationId: string;
  /** Distinguishes the 3 possible files for one generation — '' for the
   * single-image SOLO case (and COUPLE's "together" shot), 'a'/'b' for the
   * two solo-in-couple-session portraits. */
  suffix: '' | 'a' | 'b';
  result: FusionOutput;
}): Promise<UploadedResult> {
  const extension = extensionFor(params.result.mimeType);
  const key = `results/${params.userId}/${params.generationId}${params.suffix ? `-${params.suffix}` : ''}.${extension}`;
  await putObjectBytes({ key, body: params.result.imageBytes, contentType: params.result.mimeType });
  return { ...params.result, key };
}

export type FusionJobInput = {
  userId: string;
  generationId: string;
  subjectMode: 'SOLO' | 'COUPLE' | 'GROUP';
  templateId?: string;
  styleKey: string;
  description?: string;
  /** One or more storage keys — different angles of the SAME "You" person.
   * Changed from a single key 2026-09-12 for multi-angle identity lock; see
   * provider.ts's FusionInput.photoA doc comment for why. Always ≥1. */
  photoAKeys: string[];
  /** Same idea as photoAKeys, for "Partner". Absent for SOLO. */
  photoBKeys?: string[];
  provider: ImageFusionProvider;
  /** See promptBuilder.ts's PromptInput.freeform doc comment — the
   * "General" create mode's flag, threaded straight through to the one
   * buildFusionPrompt call that can ever actually receive it (the bottom,
   * no-template SOLO branch below; General mode never has a photoB). */
  freeform?: boolean;
};

export type FusionJobResult = {
  seed: number;
  together: UploadedResult;
  a?: UploadedResult;
  b?: UploadedResult;
};

/**
 * Runs the whole fusion job synchronously within the request. That's the
 * right tradeoff for now — a queue (BullMQ/Redis, or SQS+Lambda on AWS
 * later) is real infra we don't need until real concurrent load shows up.
 * Swap this for a queued worker without changing the route's request/
 * response shape: POST still returns a generation id immediately-ish, GET
 * still polls it.
 *
 * COUPLE mode produces THREE images from one job — together, solo "You",
 * solo "Partner" — not one. This is deliberately NOT an async batch-queue
 * architecture (the kind Nano Banana PRO's 15-30s/image tier would actually
 * need): Nano Banana Flash calls here are fast (~14s observed for one call,
 * real test 2026-09-10) and independent, so running all 3 concurrently via
 * Promise.all keeps total wall-clock time close to ONE call instead of
 * three, with no queue/push-notification infra to build or operate. A
 * future move to a slower/pricier provider (or PRO for higher fidelity) can
 * revisit this without changing what the route returns.
 */
export async function runFusionJob(input: FusionJobInput): Promise<FusionJobResult> {
  const { userId, generationId, subjectMode, templateId, styleKey, description, photoAKeys, photoBKeys, provider, freeform } = input;

  const [photoA, photoB] = await Promise.all([
    loadPersonPhotos(photoAKeys),
    photoBKeys ? loadPersonPhotos(photoBKeys) : Promise.resolve(undefined),
  ]);

  // One seed for every image in this session (see FusionInput.seed's doc
  // comment) — fal.ai's own docs confirm the same seed + same prompt on the
  // same model version reproduces the same image, which is exactly what
  // keeps the together/solo-A/solo-B shots looking like one shoot instead
  // of three unrelated renders.
  const seed = Math.floor(Math.random() * 2 ** 31);

  // The exact template photo (src/data/templateImages.ts) to send as an
  // editing target, so "recreate this template" actually matches its
  // background/pose/clothing instead of only a text description of it
  // (promptBuilder.ts's template-image branch). undefined for no template,
  // or one with no real photo yet (Cartoon Us) — every buildFusionPrompt/
  // provider.generate call below stays correct either way.
  const templateImage = templateImageFor(templateId);

  if (subjectMode === 'COUPLE' && photoB) {
    // Same "solo portrait, this theme/style" instruction shape for both
    // sides, but built TWICE now (not once and reused) — each side's own
    // photo count can differ (e.g. "You" uploaded 3 angles, "Partner"
    // uploaded 1), and promptBuilder.ts's photoACount has to match how many
    // reference images THIS call is actually attaching or the "these N
    // images are the same person" wording would be counting the wrong
    // photos. With a template image attached, the prompt has each call
    // independently identify which of the template's two people ITS OWN
    // attached reference photo(s) match (promptBuilder.ts's
    // buildTemplateEditPrompt) — no left/right label needed.
    const soloPromptA = buildFusionPrompt({
      subjectMode: 'SOLO',
      templateId,
      styleKey,
      description,
      hasTemplateImage: !!templateImage,
      photoACount: photoA.length,
    });
    const soloPromptB = buildFusionPrompt({
      subjectMode: 'SOLO',
      templateId,
      styleKey,
      description,
      hasTemplateImage: !!templateImage,
      photoACount: photoB.length,
    });

    const [together, a, b] = await Promise.all([
      generateTogetherPart({ photoA, photoB, templateImage, templateId, styleKey, description, seed, provider }),
      generateSoloPart({ photos: photoA, templateImage, prompt: soloPromptA, seed, retrySeedOffset: 101, styleKey, provider }),
      generateSoloPart({ photos: photoB, templateImage, prompt: soloPromptB, seed, retrySeedOffset: 202, styleKey, provider }),
    ]);

    const [uploadedTogether, uploadedA, uploadedB] = await Promise.all([
      uploadResult({ userId, generationId, suffix: '', result: together }),
      uploadResult({ userId, generationId, suffix: 'a', result: a }),
      uploadResult({ userId, generationId, suffix: 'b', result: b }),
    ]);
    return { seed, together: uploadedTogether, a: uploadedA, b: uploadedB };
  }

  const togetherPrompt = buildFusionPrompt({
    subjectMode,
    templateId,
    styleKey,
    description,
    hasTemplateImage: !!templateImage,
    freeform,
    photoACount: photoA.length,
    groupPhotoCount: subjectMode === 'GROUP' ? photoA.length : undefined,
  });

  const solo = await generateSoloPart({ photos: photoA, templateImage, prompt: togetherPrompt, seed, retrySeedOffset: 303, styleKey, provider });

  return { seed, together: await uploadResult({ userId, generationId, suffix: '', result: solo }) };
}
