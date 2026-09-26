import { GoogleGenAI } from '@google/genai';

import { env } from '../../env.js';

/**
 * The verifier that decides whether a generated portrait is actually the
 * person the user uploaded — added 2026-09-26 to fix the pipeline's core
 * reliability problem: a templated generation could come back showing the
 * TEMPLATE'S OWN stock model (same hair, same face) instead of the user,
 * and the pipeline shipped it anyway. Reproduced repeatedly with real
 * inputs: 3 of 3 fresh runs, plus the failure the user hit live.
 *
 * Why this exact shape (all measured, not assumed):
 * - The previous check (outputQuality.ts's `identityMismatch`) asked a
 *   yes/no "does this plausibly look like the reference?" — and (a) a cheap
 *   model confidently answered "yes" for a result that had kept the template
 *   woman's brown wavy hair against a reference with long straight black
 *   hair, and (b) even when it said no, generationParts.ts retried ONCE and
 *   shipped the retry without checking it. A yes/no question about a
 *   subjective resemblance is easy to wave through.
 * - The failure this app actually has is specific: the model KEEPS THE
 *   PLACEHOLDER. So this asks a forced choice between exactly the outcomes
 *   that matter — the reference person, the template's placeholder model, or
 *   someone else — and makes the model write down each person's hair and
 *   face first (the product spec requires the reference person's hair as
 *   well as face, so a hair mismatch is a real, checkable failure).
 * - Validated against 8 hand-labeled real results x 3 runs each before being
 *   wired in: gemini-3.8-flash + this checklist agreed with the human label
 *   24/24, including the live wrong-person image and the tplA3 case the old
 *   check passed. The cheap lite model on the same checklist was flaky on
 *   one case, hence env.GEMINI_JUDGE_MODEL being its own, stronger setting.
 *
 * Fails OPEN (`verdict: 'unknown'`, treated as a pass by callers) on any API
 * or parse error — same reasoning as every other vision gate here: a judge
 * outage must never turn every generation into a failure. A false pass is
 * just the old behaviour; a false fail costs a paid retry and can fail a
 * good job.
 */
export type IdentityVerdict = {
  /** 'reference' = recognizably the uploaded person (pass). 'placeholder' =
   * the template's stock model came back. 'neither' = some other person.
   * 'unknown' = the judge itself failed (callers treat as pass). */
  verdict: 'reference' | 'placeholder' | 'neither' | 'unknown';
  reason: string;
};

type Img = { bytes: Buffer; mimeType: string };

const toPart = (img: Img) => ({ inlineData: { mimeType: img.mimeType, data: img.bytes.toString('base64') } });

function buildPrompt(hasTemplate: boolean): string {
  const templateImageLine = hasTemplate
    ? 'IMAGE 2 = TEMPLATE: the original stock photo that was edited. Its people are PLACEHOLDER MODELS who must be fully replaced.'
    : '';
  const resultNumber = hasTemplate ? 3 : 2;
  const templateStep = hasTemplate
    ? '2. Describe the hair and face of the closest-matching placeholder model in the TEMPLATE (the one of the same apparent gender as the reference).\n'
    : '';
  const decideStep = hasTemplate
    ? `4. Decide: is the RESULT closer to the REFERENCE, or to the placeholder? If the result's hair color/length/style clearly differs from the reference's but matches the placeholder's, the swap FAILED.`
    : `4. Decide: is the RESULT the same person as the REFERENCE?`;
  const verdicts = hasTemplate
    ? '"verdict" "reference" = recognizably the reference person (face AND hair). "placeholder" = the result is the template\'s placeholder (swap failed). "neither" = a different person from both.'
    : '"verdict" "reference" = recognizably the reference person (face AND hair). "neither" = a different person.';
  const jsonShape = hasTemplate
    ? '{"referenceHair": "...", "placeholderHair": "...", "resultHair": "...", "verdict": "reference" | "placeholder" | "neither", "reason": "one short sentence"}'
    : '{"referenceHair": "...", "resultHair": "...", "verdict": "reference" | "neither", "reason": "one short sentence"}';

  return `You are a strict verifier of an AI portrait. Images, in order:
IMAGE 1 = REFERENCE: one or more photos of the SAME real person who should appear in the result.
${templateImageLine}
IMAGE ${resultNumber} = RESULT: the AI output (one person).
The product spec requires the result person to have the REFERENCE person's face AND hair (color, length, texture/style). Clothing, pose and background are irrelevant.
Work through this checklist by describing each item, then decide:
1. Describe the REFERENCE person's hair (color, length, straight/wavy/curly, fringe/bangs) and face (shape, eyes, nose, mouth, jaw).
${templateStep}3. Describe the RESULT person's hair and face.
${decideStep}
Respond with ONLY compact JSON: ${jsonShape}
${verdicts}`;
}

export async function judgeIdentity(params: {
  /** All of this person's reference photos (different angles of one person). */
  referencePhotos: Img[];
  /** The template photo the result was edited from. Omit for freeform
   * (no-template) results, where there is no placeholder to compare against. */
  templateImage?: Img;
  resultBytes: Buffer;
  resultMimeType: string;
}): Promise<IdentityVerdict> {
  if (!env.GEMINI_API_KEY || params.referencePhotos.length === 0) return { verdict: 'unknown', reason: '' };

  const hasTemplate = !!params.templateImage;
  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: env.GEMINI_JUDGE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildPrompt(hasTemplate) },
            { text: 'IMAGE 1 (REFERENCE — all the same person):' },
            ...params.referencePhotos.slice(0, 4).map(toPart),
            ...(params.templateImage ? [{ text: 'IMAGE 2 (TEMPLATE):' }, toPart(params.templateImage)] : []),
            { text: `IMAGE ${hasTemplate ? 3 : 2} (RESULT):` },
            toPart({ bytes: params.resultBytes, mimeType: params.resultMimeType }),
          ],
        },
      ],
    });

    // Same markdown-fence tolerance as the other vision gates.
    const cleaned = (response.text ?? '')
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as { verdict?: string; reason?: string };
    if (parsed.verdict === 'reference' || parsed.verdict === 'placeholder' || parsed.verdict === 'neither') {
      return { verdict: parsed.verdict, reason: parsed.reason ?? '' };
    }
    return { verdict: 'unknown', reason: '' };
  } catch (err) {
    console.error('Identity judge failed, accepting result through:', err);
    return { verdict: 'unknown', reason: '' };
  }
}
