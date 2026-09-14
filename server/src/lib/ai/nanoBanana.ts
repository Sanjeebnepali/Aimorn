import { GoogleGenAI } from '@google/genai';

import { env } from '../../env.js';
import type { FusionInput, FusionOutput, ImageFusionProvider } from './provider.js';

const PROVIDER_NAME = 'google-gemini';

/**
 * Google's Gemini image model (marketed as "Nano Banana"). Chosen over
 * narrower open-source identity-preservation models (InstantID, PhotoMaker)
 * because it natively blends MULTIPLE reference photos into one scene while
 * following arbitrary style instructions — see docs/ai-generation-plan.md
 * for the full provider comparison. Verified working end-to-end 2026-09-10
 * against a real billed account — this is the active provider
 * (generations.ts), not a future option anymore.
 *
 * Uses `generateContent` (not `generateImages`) because that's the
 * multimodal in-and-out entry point — `generateImages` is for pure
 * text-to-image (Imagen) models and doesn't accept reference photos.
 * Verified directly against the installed @google/genai type definitions
 * rather than assumed, per this repo's "never guess an API" rule.
 */
export class NanoBananaProvider implements ImageFusionProvider {
  private readonly client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generate(input: FusionInput): Promise<FusionOutput> {
    // Order matters: promptBuilder.ts's template-image branch tells the
    // model "the FIRST attached image is the template, the SECOND/THIRD are
    // the reference faces" — templateImage has to come before photoA/photoB
    // for that wording to actually match what the model receives.
    const toInlineData = (photo: { bytes: Buffer; mimeType: string }) => ({
      inlineData: { mimeType: photo.mimeType, data: photo.bytes.toString('base64') },
    });

    // photoA/photoB are now arrays (multi-angle identity lock — see
    // provider.ts's FusionInput.photoA doc comment) — every one of a
    // person's photos goes in as its own image part, all together, so the
    // model sees them as one identity to match rather than one-photo-per-
    // call. Order still matches promptBuilder.ts's "Nth attached image"
    // wording exactly: template first, then all of photoA's images, then
    // all of photoB's.
    // identityReferenceImage (see provider.ts's FusionInput doc comment)
    // goes LAST — buildTemplateCompositePrompt's wording is "the LAST
    // attached image" specifically so it never has to be recounted every
    // time photoA/photoB's own multi-angle length changes.
    const parts = [
      { text: input.prompt },
      ...(input.templateImage ? [toInlineData(input.templateImage)] : []),
      ...input.photoA.map(toInlineData),
      ...(input.photoB ?? []).map(toInlineData),
      ...(input.identityReferenceImage ? [toInlineData(input.identityReferenceImage)] : []),
    ];

    // Confirmed live 2026-09-11: a real call with these exact inputs came
    // back with a TEXT-only response (no image part at all, no
    // promptFeedback.blockReason either — the model just didn't produce an
    // image that time) on the first attempt, then succeeded on an
    // identical retry. Not a safety block, not a code bug — this specific
    // "3-image template edit" task is a harder, less reliable ask than a
    // plain 2-photo fusion, and Gemini occasionally responds with
    // explanation text instead of doing the edit. Retrying (with a fresh
    // seed — see below) is the correct response to THAT failure mode; a
    // real safety block is not retried, since trying again won't change
    // Google's own content-policy verdict.
    const MAX_ATTEMPTS = 3;
    let lastError: Error = new Error('Gemini returned no image data for this generation.');

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.client.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: [{ role: 'user', parts }],
          // seed: same reproducibility contract as qwenImageEdit.ts's fal.ai
          // call — a 3-image couple session passes the same seed to all 3 so
          // together/solo-A/solo-B share lighting and color grade. On a
          // RETRY specifically, deliberately perturb it instead of resending
          // the identical seed: same seed + same prompt + same images risks
          // deterministically reproducing the exact same failure, which
          // would make retrying pointless. Losing perfect lighting
          // continuity on a retried call is a fine trade against getting no
          // image at all. imageConfig.aspectRatio: every prompt says
          // "vertical phone wallpaper"; without this the model has no actual
          // aspect-ratio instruction to follow. .imageSize: raised back to
          // '2K' 2026-09-12 — a real, independently-produced review of this
          // exact pipeline flagged the '1K' setting (dropped for this
          // session's own cheap-iteration testing pass, see the removed
          // comment this replaces) as a direct, compounding cause of the
          // identity-fidelity complaints under active investigation this
          // same session: less resolution genuinely means less room for the
          // model to render fine facial detail, and less headroom for any
          // color/tone-matching to be precise. Real per-image pricing on
          // gemini-3.1-flash-image is $0.067 (1K) / $0.101 (2K) / $0.151
          // (4K) — a 3-image couple session (plus the 4th "identity
          // reference" composite call for COUPLE+template) now runs
          // ~$0.40 instead of ~$0.27, a real, deliberate cost increase
          // traded for the fidelity this session has been chasing. All
          // three verified against the installed @google/genai type
          // definitions (GenerateContentConfig.seed,
          // ImageConfig.aspectRatio/imageSize).
          config: {
            ...(input.seed != null ? { seed: attempt === 1 ? input.seed : input.seed + attempt } : {}),
            imageConfig: { aspectRatio: '9:16', imageSize: '2K' },
          },
        });

        // `response.data` is a convenience getter that concatenates inline-data
        // parts from the first candidate — but it drops the mime type, and we
        // need that to store/serve the result correctly, so we also walk
        // `candidates` directly for it.
        const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        const base64 = imagePart?.inlineData?.data ?? response.data;

        if (base64) {
          return {
            imageBytes: Buffer.from(base64, 'base64'),
            mimeType: imagePart?.inlineData?.mimeType ?? 'image/png',
            provider: PROVIDER_NAME,
            model: env.GEMINI_MODEL,
          };
        }

        // A real safety block is a verdict, not a glitch — retrying the
        // exact same content won't change Google's answer, so fail
        // immediately instead of burning 2 more paid calls on a foregone
        // conclusion.
        const blockReason = response.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(`Gemini blocked this generation (${blockReason}).`);
        }

        lastError = new Error('Gemini returned no image data for this generation.');
      } catch (err) {
        // Confirmed live 2026-09-11, twice: (1) a text-only response with
        // no blockReason (the model just didn't do the edit that time —
        // succeeded on an identical retry — handled above, doesn't throw),
        // and (2) a transient 503 "high demand" ApiError straight from
        // Google's own servers — worth retrying. Anything else (the safety
        // block thrown just above with no `.status`; a real 4xx like bad
        // auth or a malformed request) is a verdict, not a glitch — retried
        // 429/5xx aside, rethrow immediately rather than burn 2 more paid
        // calls on a foregone conclusion.
        const status = (err as { status?: number })?.status;
        const isTransient = status === 429 || (typeof status === 'number' && status >= 500);
        if (!isTransient) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < MAX_ATTEMPTS) {
        console.warn(`NanoBanana attempt ${attempt}/${MAX_ATTEMPTS} failed (${lastError.message}) — retrying.`);
      }
    }

    throw lastError;
  }
}
