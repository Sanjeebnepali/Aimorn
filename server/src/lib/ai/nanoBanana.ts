import { GoogleGenAI } from '@google/genai';

import { env } from '../../env.js';
import type { FusionInput, FusionOutput, ImageFusionProvider } from './provider.js';

const PROVIDER_NAME = 'google-gemini';

/**
 * Google's Gemini image model (marketed as "Nano Banana"). Chosen over
 * narrower open-source identity-preservation models (InstantID, PhotoMaker)
 * because it natively blends MULTIPLE reference photos into one scene while
 * following arbitrary style instructions — see docs/ai-generation-plan.md
 * for the full comparison and the free-tier testing steps to run BEFORE
 * this code is ever exercised against a real key.
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
    const parts = [
      { text: input.prompt },
      { inlineData: { mimeType: input.photoA.mimeType, data: input.photoA.bytes.toString('base64') } },
      ...(input.photoB
        ? [{ inlineData: { mimeType: input.photoB.mimeType, data: input.photoB.bytes.toString('base64') } }]
        : []),
    ];

    const response = await this.client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
    });

    // `response.data` is a convenience getter that concatenates inline-data
    // parts from the first candidate — but it drops the mime type, and we
    // need that to store/serve the result correctly, so we also walk
    // `candidates` directly for it.
    const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    const base64 = imagePart?.inlineData?.data ?? response.data;

    if (!base64) {
      // Most likely cause: the prompt/photos were blocked by safety
      // filtering rather than a transport error — surface whatever the API
      // told us instead of a generic failure.
      const blockReason = response.promptFeedback?.blockReason;
      throw new Error(
        blockReason
          ? `Gemini blocked this generation (${blockReason}).`
          : 'Gemini returned no image data for this generation.',
      );
    }

    return {
      imageBytes: Buffer.from(base64, 'base64'),
      mimeType: imagePart?.inlineData?.mimeType ?? 'image/png',
      provider: PROVIDER_NAME,
      model: env.GEMINI_MODEL,
    };
  }
}
