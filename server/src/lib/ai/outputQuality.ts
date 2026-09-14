import { GoogleGenAI } from '@google/genai';

import { env } from '../../env.js';
import { stylePromptFor } from '../../data/styles.js';

/**
 * Builds the checker prompt with the ACTUAL requested style named up front —
 * added 2026-09-13 after a real, confirmed false-positive: an Anime-styled
 * generation (both solo portraits + together shot correctly cel-shaded, per
 * the user's own request) got flagged twice under `identityMismatch` with
 * the model's own reason text literally saying "cartoon/illustration style
 * rather than a realistic photo" — the checker had no idea a non-realistic
 * style was ever asked for, so it judged every stylized result against an
 * implicit "should look like a real photo" assumption baked into the old
 * fixed prompt. That cost two real, paid retries (extra Gemini calls +
 * ~30-70s latency each) for output that was already correct.
 *
 * The fix is two-part, not just "loosen the check": naming the intended
 * style lets identityMismatch/pastedLookArtifact/hairColorWrong stay
 * strict about actual identity while explicitly excluding "it's stylized"
 * as a valid reason to trip them — but that alone would silently swallow a
 * DIFFERENT real bug this same test run also surfaced: one of the two solo
 * portraits ignored the requested style entirely and rendered fully
 * photorealistic while its sibling correctly went full Anime. Nothing in
 * this pipeline checked for that at all. `styleMismatch` below is a new,
 * dedicated check for exactly that failure mode, using the existing
 * retry-once machinery (generationJob.ts) to actually catch it instead of
 * shipping whichever style the model felt like that call.
 */
function buildOutputQualityPrompt(styleKey: string): string {
  const isRealistic = styleKey === 'realistic';
  const styleDescription = stylePromptFor(styleKey);
  const styleContextLine = isRealistic
    ? 'The requested rendering style for this generation is photorealistic — it should look like a real, unedited photograph.'
    : `The requested rendering style for this generation is intentionally NOT photorealistic: "${styleDescription}". A stylized, illustrated, painterly, or otherwise non-photographic look is exactly what was asked for and correct — do NOT treat that stylization itself as identityMismatch, pastedLookArtifact, or hairColorWrong. Only flag those if the person's actual identifying features (face shape, proportions, markings) are wrong even after accounting for the requested art style.`;

  return `You are a strict quality-control checker for an AI photo-fusion app. You will see one or more REFERENCE photos of real people, followed by one GENERATED photo that is supposed to show those same people in a new scene, with their identity, distinctive markings, and body proportions preserved exactly.

${styleContextLine}

Compare the generated photo against the reference photo(s) and check exactly these things:
1. identityMismatch: true if any person in the generated photo does NOT plausibly look like the same individual as their reference photo (a clearly different face shape, or a face so generic/idealized it no longer resembles the reference) — judged against their real features, not against how photorealistic the rendering is.
2. missingMarking: true if any reference photo clearly shows a distinctive marking or eyewear (bindi, facial piercing, earring, nose ring, mole, freckle, scar, eyeglasses, sunglasses) that is missing from that SAME person in the generated photo.
3. fabricatedMarking: true if the generated photo shows a distinctive marking or eyewear (piercing, nose ring, earring, mole, scar, eyeglasses, sunglasses) on a person whose OWN reference photo does NOT show that item at all — either invented outright, or (a real, confirmed failure mode this app has hit) copied onto the WRONG person, e.g. one person's real glasses showing up on the other person instead while that person's own face has none. Check each person's markings/eyewear against THEIR OWN reference photo specifically, not just "does someone in this photo have glasses."
4. headScaleWrong: true if any person's head looks obviously oversized or undersized relative to their own body in the generated photo — a clear anatomical mismatch, not a subjective style opinion.
5. pastedLookArtifact: true if any person's head/face region looks visibly blurrier, softer, or a different color tone/lighting than the REST OF THE GENERATED PHOTO ITSELF (not compared to a real photo), like it was pasted on rather than part of the same single image.
6. hairColorWrong: true if any person's hair in the generated photo is a noticeably different base color than their reference photo shows (e.g. a real tint, streak, or color cast not present in the reference — not just a lighting-driven highlight/shine, and not just the expected recoloring a painterly/illustrated style naturally applies).
7. distortedAnatomy: true if there are extra/missing fingers, distorted hands, cut-off neck band, floating limbs, or severe facial warping in the generated photo.
8. unmatchedBodySkin: true if any person's body skin tone (neck, chest, arms, legs) visually mismatches their facial skin tone (e.g. brown face with white legs/neck).
9. styleMismatch: true if the generated photo's overall rendering treatment (photorealistic vs. illustrated/painterly/cel-shaded/stylized) does NOT match the requested style described above — e.g. a plain photorealistic render when a stylized look was requested, or vice versa. This is the ONLY check that should fire for a style/realism disagreement; do not double-report it as identityMismatch too.

Respond with ONLY compact JSON, no markdown fences, no explanation outside the JSON: {"identityMismatch": boolean, "missingMarking": boolean, "fabricatedMarking": boolean, "headScaleWrong": boolean, "pastedLookArtifact": boolean, "hairColorWrong": boolean, "distortedAnatomy": boolean, "unmatchedBodySkin": boolean, "styleMismatch": boolean, "reason": "one short sentence naming the worst issue, or empty string if none"}`;
}

export type OutputQualityResult = {
  /** False only for a confident, specific defect the model actually named
   * — see this file's own doc comment for why every other outcome (a
   * network hiccup, malformed JSON, an ambiguous case) defaults to true,
   * same fail-open philosophy as photoQuality.ts. */
  ok: boolean;
  /** Human-readable reason, non-empty only when ok is false. */
  reason: string;
};

/**
 * A cheap, separate vision call AFTER the expensive image-generation call —
 * the output-side counterpart to photoQuality.ts's own input-side gate.
 * Added 2026-09-12 directly off a real, independently-produced review of
 * this pipeline (a "senior developer" report the user brought in) that
 * correctly named the actual gap: every hard constraint in promptBuilder.ts
 * is prompt text ONLY — nothing anywhere in this pipeline had ever checked
 * whether the model actually complied before shipping the result. That gap
 * was directly visible earlier this same session: a live generation
 * dropped a reference photo's bindi in the final composite even though the
 * exact same reference photos produced it correctly in a solo portrait
 * moments earlier — a plain per-call miss that nothing caught.
 *
 * `fabricatedMarking` and `hairColorWrong` added the same day, after a real
 * batch of test generations (this session's own on-device + scripted
 * testing) surfaced two more per-call misses this gate's first version
 * didn't check for: an invented nose ring that wasn't in the reference
 * photo at all, and a recurring blue/teal tint on dark hair specific to
 * one template's own night-scene ambient lighting (traced to
 * SEAMLESS_INTEGRATION_HARD_CONSTRAINT's own "match the scene's lighting"
 * wording being read too literally — see that constant's own doc comment
 * in promptBuilder.ts for the fix on the prompt side; this is the
 * detection-side half of the same fix).
 *
 * Deliberately uses env.GEMINI_VISION_MODEL (cheap, per-token pricing), not
 * env.GEMINI_MODEL (per-image generation pricing) — this is a "look and
 * answer several yes/no questions" comparison task, not a generation task,
 * same reasoning as photoQuality.ts's own model choice.
 *
 * Fails OPEN, not closed, for the same reason photoQuality.ts does: a
 * false negative here just means one bad generation slips through to
 * exactly where it always would have (no gate at all); a false positive
 * would burn an extra paid generation call and add latency for every user
 * every time the classifier merely disagrees with a fine result — a much
 * worse failure mode for people actually trying to use the app. Callers
 * decide what to do with `ok: false` (generationJob.ts retries once with a
 * perturbed seed); this function only reports, it never blocks anything
 * itself.
 */
export async function assessGenerationOutput(params: {
  resultBytes: Buffer;
  resultMimeType: string;
  referencePhotos: { bytes: Buffer; mimeType: string }[];
  /** Which style this generation actually requested (create-form.tsx's
   * `styleKey`, e.g. 'realistic', 'anime', 'cyberpunk') — see
   * buildOutputQualityPrompt's own doc comment for why the checker needs to
   * know this instead of always assuming a photorealistic target. */
  styleKey: string;
}): Promise<OutputQualityResult> {
  if (!env.GEMINI_API_KEY || params.referencePhotos.length === 0) return { ok: true, reason: '' };

  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: env.GEMINI_VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildOutputQualityPrompt(params.styleKey) },
            ...params.referencePhotos.map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.bytes.toString('base64') } })),
            { text: 'The image below is the GENERATED result to check against the reference photo(s) above:' },
            { inlineData: { mimeType: params.resultMimeType, data: params.resultBytes.toString('base64') } },
          ],
        },
      ],
    });

    // Same markdown-fence-stripping tolerance as photoQuality.ts — cheap
    // models don't always follow "no markdown fences" perfectly.
    const cleaned = (response.text ?? '')
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as {
      identityMismatch?: boolean;
      missingMarking?: boolean;
      fabricatedMarking?: boolean;
      headScaleWrong?: boolean;
      pastedLookArtifact?: boolean;
      hairColorWrong?: boolean;
      distortedAnatomy?: boolean;
      unmatchedBodySkin?: boolean;
      styleMismatch?: boolean;
      reason?: string;
    };

    if (parsed.identityMismatch) return { ok: false, reason: parsed.reason || 'Generated face does not match the reference photo.' };
    if (parsed.missingMarking) return { ok: false, reason: parsed.reason || 'A distinctive marking from the reference photo is missing.' };
    if (parsed.fabricatedMarking) return { ok: false, reason: parsed.reason || 'A marking appears that is not in the reference photo.' };
    if (parsed.headScaleWrong) return { ok: false, reason: parsed.reason || "A person's head looks the wrong size for their body." };
    if (parsed.pastedLookArtifact) return { ok: false, reason: parsed.reason || 'A face looks pasted on rather than part of the photo.' };
    if (parsed.hairColorWrong) return { ok: false, reason: parsed.reason || "A person's hair color does not match their reference photo." };
    if (parsed.distortedAnatomy) return { ok: false, reason: parsed.reason || 'Anatomical distortion or extra/missing fingers detected.' };
    if (parsed.unmatchedBodySkin) return { ok: false, reason: parsed.reason || 'Body skin tone mismatches facial skin tone.' };
    if (parsed.styleMismatch) return { ok: false, reason: parsed.reason || "The image's rendering style doesn't match what was requested." };
    return { ok: true, reason: '' };
  } catch (err) {
    console.error('Output quality check failed, accepting result through:', err);
    return { ok: true, reason: '' };
  }
}
