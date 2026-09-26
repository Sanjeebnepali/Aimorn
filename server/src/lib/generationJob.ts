import { putObjectBytes } from './storage.js';
import { buildFusionPrompt } from './promptBuilder.js';
import { templateImageFor } from '../data/templateImages.js';
import { sceneBriefFor } from './sceneBrief.js';
import { enhanceScene } from './promptEnhancer.js';
import type { TemplateMode } from './templateMode.js';
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
  /** 'inspired' = v2 scene-brief mode (promptSceneBrief.ts): the template PHOTO is never sent, only its text brief.
   * Resolved by the caller (templateMode.ts). Omitted = 'exact', today's behavior. */
  templateMode?: TemplateMode;
};

export type FusionJobResult = {
  seed: number;
  /** Set when the user's short description was expanded (lib/promptEnhancer.ts); the caller stores it on the row. */
  enhancedDescription?: string;
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
  const { userId, generationId, subjectMode, templateId, styleKey, description: rawDescription, photoAKeys, photoBKeys, provider, freeform, templateMode } = input;

  // Plain Generate mode only (no template, not the General mode whose description already has full creative authority,
  // not GROUP): a short idea is expanded into a richer scene. Runs IN PARALLEL with loading the photos so the ~4s text call
  // adds no wait. Falls back to the user's own text on any problem (see promptEnhancer.ts). Clothing is not invented here:
  // people keep the clothes from their own photos unless the user asked for something.
  const wantsEnhance = !templateId && !freeform && subjectMode !== 'GROUP' && !!rawDescription?.trim();
  const [photoA, photoB, enhancement] = await Promise.all([
    loadPersonPhotos(photoAKeys),
    photoBKeys ? loadPersonPhotos(photoBKeys) : Promise.resolve(undefined),
    wantsEnhance ? enhanceScene({ description: rawDescription!, subjectMode: subjectMode as 'SOLO' | 'COUPLE', includeOutfit: false }) : Promise.resolve(null),
  ]);
  const description = enhancement?.enhanced ? enhancement.text : rawDescription;
  const enhancedDescription = enhancement?.enhanced ? enhancement.text : undefined;

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
  // v2: with a scene brief for this template, the template photo is withheld entirely (see promptSceneBrief.ts for
  // why); a template with no brief, GROUP, or 'exact' mode all fall through to today's behavior unchanged.
  const sceneBrief = templateMode === 'inspired' && subjectMode !== 'GROUP' ? sceneBriefFor(templateId) : undefined;
  const templateImage = sceneBrief ? undefined : templateImageFor(templateId);

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
      sceneBrief,
      photoACount: photoA.length,
    });
    const soloPromptB = buildFusionPrompt({
      subjectMode: 'SOLO',
      templateId,
      styleKey,
      description,
      hasTemplateImage: !!templateImage,
      sceneBrief,
      photoACount: photoB.length,
    });

    const soloA = () => generateSoloPart({ photos: photoA, templateImage, prompt: soloPromptA, seed, retrySeedOffset: 101, styleKey, provider, singlePerson: true });
    const soloB = () => generateSoloPart({ photos: photoB, templateImage, prompt: soloPromptB, seed, retrySeedOffset: 202, styleKey, provider, singlePerson: true });

    let together: FusionOutput;
    let a: FusionOutput;
    let b: FusionOutput;
    if (templateImage) {
      // Exact-template mode keeps its own together flow (a template composite); unchanged.
      [together, a, b] = await Promise.all([
        generateTogetherPart({ photoA, photoB, templateImage, templateId, styleKey, description, seed, provider, sceneBrief }),
        soloA(),
        soloB(),
      ]);
    } else {
      // CHAINED together shot (plain and v2 modes — no template photo). The two solo portraits go first and are verified
      // as before; the couple photo is then built from THOSE portraits instead of the raw uploads. Measured on a real
      // device job (2026-09-26): with raw uploads the same person's face drifted from image to image (and one woman got
      // an invented bindi); with the verified solos as references the man's face was closer to his real photo in 12/16
      // pairwise comparisons and closer to his own solo in 16/16, and the faces held steady across attempts. The raw
      // photos are often poor references (screenshots, filters, wide-angle selfies); the solos are clean, front-facing
      // portraits of the same person. Cost is unchanged (still 3 images); latency roughly doubles for the together shot
      // because it now waits for the solos.
      [a, b] = await Promise.all([soloA(), soloB()]);
      together = await generateTogetherPart({
        photoA: [{ bytes: a.imageBytes, mimeType: a.mimeType }],
        photoB: [{ bytes: b.imageBytes, mimeType: b.mimeType }],
        templateImage,
        templateId,
        styleKey,
        description,
        seed,
        provider,
        sceneBrief,
      });
    }

    const [uploadedTogether, uploadedA, uploadedB] = await Promise.all([
      uploadResult({ userId, generationId, suffix: '', result: together }),
      uploadResult({ userId, generationId, suffix: 'a', result: a }),
      uploadResult({ userId, generationId, suffix: 'b', result: b }),
    ]);
    return { seed, enhancedDescription, together: uploadedTogether, a: uploadedA, b: uploadedB };
  }

  const togetherPrompt = buildFusionPrompt({
    subjectMode,
    templateId,
    styleKey,
    description,
    hasTemplateImage: !!templateImage,
    sceneBrief,
    freeform,
    photoACount: photoA.length,
    groupPhotoCount: subjectMode === 'GROUP' ? photoA.length : undefined,
  });

  // GROUP's headcount is N (its prompt encodes every person), so only a real
  // SOLO gets the exactly-one-person gate — see generateSoloPart's own
  // `singlePerson` doc comment.
  const solo = await generateSoloPart({ photos: photoA, templateImage, prompt: togetherPrompt, seed, retrySeedOffset: 303, styleKey, provider, singlePerson: subjectMode === 'SOLO' });

  return { seed, enhancedDescription, together: await uploadResult({ userId, generationId, suffix: '', result: solo }) };
}
