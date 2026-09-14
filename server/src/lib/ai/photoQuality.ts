import { GoogleGenAI } from '@google/genai';

import { env } from '../../env.js';

const QUALITY_PROMPT = `You are a strict but fair photo-quality gate for an AI portrait app. Look at the attached photo and assess it ONLY as a REFERENCE PHOTO for recreating this person's likeness in a new AI-generated scene — not as art criticism.

Check exactly these things:
1. blurry: true if the photo is out of focus or motion-blurred enough that facial features (eyes, nose, mouth shape) are NOT clearly distinguishable. Minor softness typical of a normal phone camera is NOT blurry.
2. hasClearFace: true if there is at least one real human face, reasonably sized in the frame (not a tiny distant figure), with visible facial features.
3. tooLowQuality: true if the image is so heavily pixelated, compressed, or low-resolution that fine facial detail is lost, independent of blur.

Respond with ONLY compact JSON, no markdown fences, no explanation outside the JSON: {"blurry": boolean, "hasClearFace": boolean, "tooLowQuality": boolean, "reason": "one short sentence naming the worst issue, or empty string if none"}`;

export type PhotoQualityResult = {
  /** False only for a confident, specific quality problem the model
   * actually named — see this file's own doc comment for the "fail open"
   * philosophy behind every other outcome defaulting to true. */
  usable: boolean;
  /** Human-readable reason, non-empty only when usable is false. */
  reason: string;
};

/**
 * A cheap, separate vision call BEFORE the expensive image-generation call —
 * added 2026-09-12 in direct response to a real complaint: users uploading
 * blurry/low-quality photos and getting unrecognizable, low-quality
 * generations back, silently burning a credit on an input that was never
 * going to work. Deliberately uses its own lightweight model
 * (env.GEMINI_VISION_MODEL, default gemini-2.5-flash-lite — per-token
 * classification pricing) instead of env.GEMINI_MODEL (per-image generation
 * pricing) since this is a plain "look and answer three yes/no questions"
 * task, not an editing or generation task — see env.ts's own comment on
 * that split for the actual pricing difference.
 *
 * Fails OPEN, not closed: any error (network hiccup, malformed JSON, no
 * API key configured, the model declining to answer) is treated as
 * "usable" rather than blocking a real user over a classifier hiccup — a
 * false negative here just means one bad photo slips through to exactly
 * where it always would have; a false positive would mean this feature
 * breaks generation entirely for everyone the moment the classifier has an
 * off day, which is a strictly worse failure mode for an app people are
 * actually trying to use.
 */
export async function assessPhotoQuality(bytes: Buffer, mimeType: string): Promise<PhotoQualityResult> {
  if (!env.GEMINI_API_KEY) return { usable: true, reason: '' };

  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: env.GEMINI_VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: QUALITY_PROMPT }, { inlineData: { mimeType, data: bytes.toString('base64') } }],
        },
      ],
    });

    // Cheap models don't always follow "no markdown fences" perfectly —
    // stripping one costs nothing and avoids a JSON.parse failure (which
    // would just fail open anyway, but a fence is a predictable enough
    // format slip to actually handle rather than discard the answer over).
    const cleaned = (response.text ?? '')
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as {
      blurry?: boolean;
      hasClearFace?: boolean;
      tooLowQuality?: boolean;
      reason?: string;
    };

    if (parsed.hasClearFace === false) {
      return { usable: false, reason: parsed.reason || 'No clear face found in this photo.' };
    }
    if (parsed.blurry) {
      return { usable: false, reason: parsed.reason || 'This photo looks too blurry to use as a reference.' };
    }
    if (parsed.tooLowQuality) {
      return { usable: false, reason: parsed.reason || "This photo's quality is too low to use as a reference." };
    }
    return { usable: true, reason: '' };
  } catch (err) {
    console.error('Photo quality check failed, allowing photo through:', err);
    return { usable: true, reason: '' };
  }
}
