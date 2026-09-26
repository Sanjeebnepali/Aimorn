import { getObjectBytes } from './storage.js';
import { buildTemplateCompositePrompt, buildTemplateFaceSwapPrompt, buildFusionPrompt } from './promptBuilder.js';
import { COUPLE_PEOPLE_RETRY_NOTE, IDENTITY_RETRY_NOTE, SINGLE_PERSON_RETRY_NOTE } from './promptQualityConstraints.js';
import { reduceEditSeam } from './imagePostProcess.js';
import { assessGenerationOutput } from './ai/outputQuality.js';
import { countPeopleInImage } from './ai/personCount.js';
import { UserFacingError } from './generationErrors.js';
import { judgeIdentity } from './ai/identityJudge.js';
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
  throw new UserFacingError(failureMessage);
}

/** Hard failures (wrong person / wrong headcount) keep retrying up to this many
 * total attempts and then FAIL the job; soft failures get one retry only. 3
 * balances "a stochastic generator usually lands within a couple of tries"
 * against cost: every extra attempt is another paid image call, and the job
 * is only charged to the user on success. */
const MAX_SOLO_ATTEMPTS = 3;

/**
 * One person's solo portrait: generate → (if templated) correct face tone/
 * scale → EVALUATE → retry with a correction note until it passes → or fail.
 *
 * Rewritten 2026-09-26 (identity reliability). It used to generate, run one
 * fuzzy quality check, retry ONCE if that failed, and ship the retry
 * UNCHECKED — so a result that kept the template's stock model instead of
 * the user (reproduced 3/3 with a screenshot reference, and hit live) went
 * out the door whenever the retry was also wrong. Now every attempt is
 * evaluated the same way and nothing that fails a HARD check ships:
 *   - identity (ai/identityJudge.ts): is the person the reference, or the
 *     template's placeholder? Only for realistic styles — a stylized result
 *     legitimately doesn't resemble a photograph — and only when
 *     `singlePerson`, since GROUP's `photos` are different people.
 *   - headcount (ai/personCount.ts): exactly one person.
 *   - soft (ai/outputQuality.ts, templated only): accessories, anatomy, skin
 *     tone, hair color. Keeps its old semantics — one retry, then ship.
 * If no attempt passes the hard checks the job throws; both callers (POST
 * /generations, the regenerate route) charge credits only AFTER this
 * returns, so a failed job costs the user nothing.
 *
 * Also used for GROUP (whose "prompt" already encodes all N people via
 * promptGroup.ts — this function doesn't need to know GROUP exists; it just
 * skips the person-specific checks). `photos` is deliberately generic
 * ("this call's own subject", not always literally "You").
 */
export async function generateSoloPart(params: {
  photos: PersonPhotos;
  templateImage: TemplateImage | undefined;
  prompt: string;
  seed: number;
  /** Base for the perturbed seed of each retry — callers pass a different
   * offset per call-site (101/202/303) purely so two concurrent solo calls
   * sharing a base seed don't retry onto the SAME seed as each other by
   * coincidence. Cosmetic, not load-bearing. */
  retrySeedOffset: number;
  styleKey: string;
  provider: ImageFusionProvider;
  /** True for every real solo portrait (COUPLE's two solos, a plain SOLO):
   * exactly one person, and `photos` are all angles of that one person. A
   * caller-supplied flag rather than always-on because this function also
   * serves GROUP, where the right headcount is N and the reference photos are
   * different people — the person-specific checks must NOT run there. Omitted
   * = no headcount or identity check. */
  singlePerson?: boolean;
}): Promise<FusionOutput> {
  const { photos, templateImage, prompt, seed, retrySeedOffset, styleKey, provider, singlePerson } = params;
  const checkIdentity = !!singlePerson && styleKey === 'realistic';

  // One generate (+ template face/skin correction) attempt.
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

  // Runs every applicable check IN PARALLEL (they're independent, cheap
  // vision calls) and reports which kinds failed.
  const evaluate = async (candidate: FusionOutput) => {
    const [identity, count, soft] = await Promise.all([
      checkIdentity
        ? judgeIdentity({ referencePhotos: photos, templateImage, resultBytes: candidate.imageBytes, resultMimeType: candidate.mimeType })
        : Promise.resolve(null),
      singlePerson ? countPeopleInImage(candidate.imageBytes, candidate.mimeType) : Promise.resolve(null),
      // Templated-only, exactly as before: a plain freeform result has never
      // gone through this, and enabling it would add paid retries.
      templateImage
        ? assessGenerationOutput({ resultBytes: candidate.imageBytes, resultMimeType: candidate.mimeType, referencePhotos: photos, styleKey })
        : Promise.resolve(null),
    ]);
    return {
      // 'unknown' (judge itself failed) and a null count deliberately pass.
      wrongPerson: identity && (identity.verdict === 'placeholder' || identity.verdict === 'neither') ? identity : null,
      wrongHeadcount: count !== null && count !== 1 ? count : null,
      softFail: soft && !soft.ok ? soft.reason : null,
    };
  };

  const notes: string[] = [];
  let softOnlyFallback: FusionOutput | undefined;
  let sawWrongPerson = false;

  for (let attempt = 0; attempt < MAX_SOLO_ATTEMPTS; attempt++) {
    // A different, well-separated seed per attempt: resending the same seed
    // with a near-identical prompt risks reproducing the exact same failure.
    const attemptSeed = attempt === 0 ? seed : seed + retrySeedOffset + attempt * 5000;
    const candidate = await produce(attemptSeed, notes.length ? `${prompt} ${notes.join(' ')}` : prompt);
    const verdict = await evaluate(candidate);

    if (verdict.wrongPerson) {
      sawWrongPerson = true;
      console.warn(`Solo identity check failed on attempt ${attempt + 1}/${MAX_SOLO_ATTEMPTS} (${verdict.wrongPerson.verdict}: ${verdict.wrongPerson.reason}).`);
      if (!notes.includes(IDENTITY_RETRY_NOTE)) notes.push(IDENTITY_RETRY_NOTE);
    }
    if (verdict.wrongHeadcount !== null) {
      console.warn(`Solo headcount check failed on attempt ${attempt + 1}/${MAX_SOLO_ATTEMPTS} (expected 1, saw ${verdict.wrongHeadcount}).`);
      if (!notes.includes(SINGLE_PERSON_RETRY_NOTE)) notes.push(SINGLE_PERSON_RETRY_NOTE);
    }

    if (!verdict.wrongPerson && verdict.wrongHeadcount === null) {
      if (!verdict.softFail) return candidate;
      // Right person, right headcount, but a cosmetic defect: old semantics —
      // one retry allowed, then ship what we have rather than fail a job over
      // a cosmetic issue.
      console.warn(`Solo quality check failed on attempt ${attempt + 1} (${verdict.softFail}).`);
      if (attempt >= 1) return candidate;
      softOnlyFallback = candidate;
    }
  }

  // No attempt passed every hard check. A cosmetic-only earlier attempt is
  // still a correct-person, correct-headcount image, so prefer shipping that
  // over failing; otherwise fail the job (nothing is charged on failure).
  if (softOnlyFallback) return softOnlyFallback;
  console.error(`Solo generation failed all ${MAX_SOLO_ATTEMPTS} attempts — failing the job instead of shipping a wrong result.`);
  throw new UserFacingError(
    sawWrongPerson
      ? "We couldn't match your photo closely enough this time. Try a clearer, front-facing photo (no screenshots or heavy filters). You weren't charged."
      : "We couldn't get a clean single-person portrait this time. You weren't charged — please try again.",
  );
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
