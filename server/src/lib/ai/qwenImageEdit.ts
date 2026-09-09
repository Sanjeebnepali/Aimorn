import { getProviderHelper, makeRequestOptions } from '@huggingface/inference';

import { env } from '../../env.js';
import type { FusionInput, FusionOutput, ImageFusionProvider } from './provider.js';

const PROVIDER_NAME = 'qwen-image-edit';
const HF_PROVIDER = 'fal-ai' as const;

/**
 * Qwen-Image-Edit-2511 via Hugging Face's Inference Providers (routed to
 * fal.ai) — the provider actually verified end-to-end with a real two-person
 * fusion call, for $0.05 of usage / $0.00 billed against HF's free monthly
 * allowance (see docs/ai-generation-plan.md §3a and the working reference
 * script at server/scripts/test-qwen-fusion.py). This is the *proven* path;
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

    const imageUrls = [toDataUri(input.photoA), ...(input.photoB ? [toDataUri(input.photoB)] : [])];

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
