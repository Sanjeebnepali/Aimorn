import { GoogleGenAI } from '@google/genai';

import { env } from '../../env.js';

/**
 * Counts how many people are the actual subjects of a generated image —
 * added 2026-09-26 after a real, reproduced bug where a couple session's two
 * "solo" portraits came back as two-person images (see promptQualityConstraints.ts's
 * SINGLE_PERSON_ONLY_HARD_CONSTRAINT for the prompt-side half of the fix).
 *
 * Why a separate call instead of another field on outputQuality.ts's
 * assessGenerationOutput: that check only runs for TEMPLATED generations
 * (generationParts.ts returns early for a plain freeform one), and it judges
 * identity/fidelity against reference photos. Headcount needs neither — the
 * bug it catches is independent of whether a template was used, so it has to
 * run on every path, and adding it to the existing 9-question checker would
 * either force that whole checker (and its extra paid retries) onto freeform
 * results that never had it, or leave the freeform path unguarded.
 *
 * Uses env.GEMINI_VISION_MODEL (cheap, per-token) — a "count the people"
 * question is a classification task, not a generation task, same reasoning as
 * photoQuality.ts/outputQuality.ts.
 *
 * Returns null (unknown) on ANY failure — network error, malformed JSON,
 * missing key — and callers treat null as "don't block": same fail-open
 * philosophy as the other two vision gates. A false positive here would burn
 * an extra paid image call and can fail an otherwise fine generation; a false
 * negative just means one bad image slips through to exactly where it always
 * would have before this check existed.
 */
const PEOPLE_COUNT_PROMPT = `Count the people who are the actual SUBJECTS of this image and respond with ONLY compact JSON, no markdown fences: {"count": <integer>}.

Rules:
- Count every real or realistically depicted human being, and every human-like character if the image is illustrated, cartoon, anime, or otherwise stylized, whose face or body is clearly visible as a main or supporting subject — including a person shown only partly (cropped at the edge of the frame, or seen from the side or back) as long as it is clearly a specific person.
- Do NOT count: tiny, distant, or heavily out-of-focus background figures far from the camera; people who only appear inside a picture, poster, or screen within the scene; statues, mannequins, or drawings on objects.
- If you are unsure whether a background figure is a subject, do not count it.`;

export async function countPeopleInImage(imageBytes: Buffer, mimeType: string): Promise<number | null> {
  if (!env.GEMINI_API_KEY) return null;

  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: env.GEMINI_VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: PEOPLE_COUNT_PROMPT },
            { inlineData: { mimeType, data: imageBytes.toString('base64') } },
          ],
        },
      ],
    });

    // Same markdown-fence-stripping tolerance as outputQuality.ts/
    // photoQuality.ts — cheap models don't always follow "no fences."
    const cleaned = (response.text ?? '')
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as { count?: unknown };
    return typeof parsed.count === 'number' && Number.isInteger(parsed.count) && parsed.count >= 0 ? parsed.count : null;
  } catch (err) {
    console.error('People-count check failed, accepting result through:', err);
    return null;
  }
}
