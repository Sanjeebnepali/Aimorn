import { getProviderHelper, makeRequestOptions } from '@huggingface/inference';

import { env } from '../../env.js';
import type { FusionInput, FusionOutput, ImageFusionProvider } from './provider.js';

const PROVIDER_NAME = 'qwen-image-edit';
const HF_PROVIDER = 'fal-ai' as const;

/**
 * Qwen-Image-Edit-2511 via Hugging Face's Inference Providers (routed to
 * fal.ai) — the provider actually verified end-to-end with a real two-person
 * fusion call, for $0.05 of usage / $0.00 billed against HF's free monthly
 * allowance (see docs/ai-generation-plan.md §3a — the one-off Python script
 * that proved it has since been removed, its flow ported here). This is the
 * *proven* path;
 * NanoBananaProvider remains a real, un-blocked-by-money future option, not
 * a dead end — see that file and §3 for the comparison.
 *
 * This is NOT a straight port of test-qwen-fusion.py's Python
 * `client.image_to_image()` call. That convenience method exists in the JS
 * SDK too, but reading its *actual installed source*
 * (@huggingface/inference/dist/commonjs/providers/fal-ai.js,
 * FalAIImageToImageTask.preparePayloadAsync) shows it always finishes with
 * a hardcoded `image_urls: [<the single input image>]` as the LAST key in
 * the returned object — which silently overrides any two-image
 * `image_urls` passed in, unlike the Python client's documented (and
 * verified) merge order. Confirmed real, not assumed.
 *
 * The fix is to skip that convenience layer, not patch around it: the SDK
 * separately exports `makeRequestOptions()`, and tracing it down
 * (lib/makeRequestOptions.js → providers/providerHelper.js `makeBody`)
 * shows it builds the request body via the *synchronous* `preparePayload()`
 * — which for fal-ai's image-to-image task is a plain
 * `return params.args` passthrough with none of the async version's
 * auto-image-url logic. Calling `makeRequestOptions()` directly with our
 * own plain object (prompt + a real two-item `image_urls`, no `inputs`
 * Blob at all) goes through that clean path untouched, then
 * `providerHelper.getResponse()` — also a real public method — is reused
 * as-is for fal.ai's async queue polling and final blob fetch, so none of
 * that non-trivial logic gets hand-duplicated or guessed at.
 *
 * Not yet run against a real token — needs the same kind of real,
 * documented verification test-qwen-fusion.py got before this should be
 * trusted for real user traffic.
 */
export class QwenImageEditProvider implements ImageFusionProvider {
  async generate(input: FusionInput): Promise<FusionOutput> {
    const providerHelper = getProviderHelper(HF_PROVIDER, 'image-to-image');

    // Same data-URI shape test-qwen-fusion.py's data_uri() produces —
    // that's what's actually been exercised against the real fal.ai
    // endpoint, so it's what this keeps sending rather than a plain HTTPS
    // URL (which would need the photos to be public first).
    const toDataUri = (photo: { bytes: Buffer; mimeType: string }) =>
      `data:${photo.mimeType};base64,${photo.bytes.toString('base64')}`;

    // Same ordering requirement as nanoBanana.ts: promptBuilder.ts's
    // template-image branch describes the template photo as the "FIRST
    // attached image," so it has to lead this array too. Qwen-Image-Edit-
    // 2511 is documented for up to 3 reference images (see this file's
    // class comment), which template+photoA+photoB fits exactly — that cap
    // is also why, unlike nanoBanana.ts, this only ever sends ONE photo per
    // person (photoA[0]/photoB[0]) even though FusionInput.photoA/photoB
    // are now multi-angle arrays (provider.ts): this is not the active
    // provider (generations.ts uses NanoBananaProvider), so it stays a
    // simple, correct degradation rather than getting the same multi-image
    // treatment an inactive path would never actually exercise.
    // identityReferenceImage (see provider.ts's FusionInput doc comment) —
    // kept last, same ordering contract as nanoBanana.ts, though this
    // inactive provider was already capped at 3 images before this field
    // existed; a caller that actually needs it here would exceed that cap.
    const imageUrls = [
      ...(input.templateImage ? [toDataUri(input.templateImage)] : []),
      toDataUri(input.photoA[0]),
      ...(input.photoB?.[0] ? [toDataUri(input.photoB[0])] : []),
      ...(input.identityReferenceImage ? [toDataUri(input.identityReferenceImage)] : []),
    ];

    // Everything here becomes the literal JSON body (see the class comment
    // above for why `preparePayload` just passes this through unchanged).
    // `image_url` (singular) is kept too, as a same-image fallback for
    // whichever fal.ai model variant reads that key instead — costs
    // nothing to include, and it's what the SDK's own auto-built payload
    // always sets alongside `image_urls`.
    const requestArgs = {
      accessToken: env.HF_TOKEN,
      provider: HF_PROVIDER,
      model: env.HF_QWEN_MODEL,
      prompt: input.prompt,
      image_url: imageUrls[0],
      image_urls: imageUrls,
      // Every prompt here already says "vertical phone wallpaper" — without
      // this the fal.ai endpoint defaults to `square_hd`, actively fighting
      // that instruction. Verified against fal.ai's own qwen-image-edit-plus
      // schema (the model HF_QWEN_MODEL maps to), not assumed.
      image_size: 'portrait_16_9',
      ...(input.seed != null ? { seed: input.seed } : {}),
    };

    const { url, info } = await makeRequestOptions(requestArgs, providerHelper, { task: 'image-to-image' });

    const submitResponse = await fetch(url, info);
    if (!submitResponse.ok) {
      const body = await submitResponse.text().catch(() => '');
      throw new Error(`Qwen fusion request failed (${submitResponse.status}): ${body || submitResponse.statusText}`);
    }
    const submitData: unknown = await submitResponse.json();

    // Reuses the SDK's own fal.ai queue-polling + result-blob-fetch logic —
    // see the class comment above for why this is safe to call directly.
    const blob = (await providerHelper.getResponse(submitData, url, info.headers, undefined)) as Blob;
    const imageBytes = Buffer.from(await blob.arrayBuffer());

    return {
      imageBytes,
      mimeType: blob.type || 'image/png',
      provider: PROVIDER_NAME,
      model: env.HF_QWEN_MODEL,
    };
  }
}
