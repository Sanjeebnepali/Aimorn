import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { env } from '../env.js';
import { isStorageConfigured, publicUrlForBusted, putObjectBytes } from '../lib/storage.js';
import { sendToUser } from '../realtime/coupleSocket.js';
import { buildFusionPrompt } from '../lib/promptBuilder.js';
import { templateImageFor } from '../data/templateImages.js';
import { generateSoloPart, generateTogetherPart, loadPersonPhotos } from '../lib/generationParts.js';
import { NanoBananaProvider } from '../lib/ai/nanoBanana.js';
import type { ImageFusionProvider } from '../lib/ai/provider.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const generationsRegenerateRouter = Router();

// Same reasoning as generations.ts's own module-level instance.
const provider: ImageFusionProvider = new NanoBananaProvider();

const regenerateSchema = z.object({
  part: z.enum(['together', 'a', 'b']),
  // Added for the "Regenerate & Refine" screen's custom-edit-instructions
  // and per-section replacement-photo features (src/app/regenerate/[id].tsx)
  // — these three were being sent by the client and destructured below
  // already, but were missing from this schema, so zod's default
  // unknown-key stripping silently dropped all three before the handler
  // ever saw them (confirmed via tsc: `parsed.data` had no such properties
  // at all). That made both features silent no-ops: the request succeeded
  // and re-rolled the image, but the user's typed instructions and chosen
  // replacement photo were never actually used.
  prompt: z.string().trim().max(500).optional(),
  overridePhotoAKey: z.string().optional(),
  overridePhotoBKey: z.string().optional(),
});

/**
 * Regenerates ONE image of an already-COMPLETE generation, in place — the
 * user's own real ask: a couple session makes 3 images, and not liking one
 * of them (a bad Solo B, say) shouldn't mean redoing all 3 from scratch at
 * 3x the cost/time. Reuses generateSoloPart/generateTogetherPart
 * (generationParts.ts) — the EXACT same generate → correct → verify → retry
 * pipeline a fresh job runs — so this can't silently drift from what a
 * normal generation does.
 *
 * "Stick to that specific niche, don't change the others": the other two
 * images are never touched (their own DB columns and R2 objects are left
 * completely alone), and this call reuses the ORIGINAL generation's own
 * templateId/styleKey/description/reference photos verbatim — only the
 * random seed is deliberately perturbed (see below), so the regenerated
 * image lands in the same template/style/scene "family" as its unchanged
 * siblings, just a fresh roll of the dice for the one part that needed it.
 *
 * Overwrites the SAME storage key the original image lived at (not a new
 * key) — R2 doesn't care that the new bytes' natural extension might differ
 * from the key's own suffix (that's just a filename, `contentType` is what
 * actually controls how it's served), and reusing the key means nothing
 * else that already reads outputKey/outputKeyA/outputKeyB ever needs to
 * learn about this feature. The response's URL for the regenerated slot
 * only carries a cache-busting query string (`?t=...`) so the CLIENT's own
 * image cache (keyed by full URL) doesn't keep showing the old bytes at an
 * unchanged URL — the other two slots' URLs are returned plain, since nothing
 * about them changed and their existing cached copy is still correct.
 */
generationsRegenerateRouter.post('/generations/:id/regenerate', requireUser, asyncHandler(async (req, res) => {
  if (!isStorageConfigured() || !env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'The AI fusion pipeline isn’t configured on this server yet.' });
    return;
  }

  const parsed = regenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { part, prompt: customPrompt, overridePhotoAKey, overridePhotoBKey } = parsed.data;

  const userId = res.locals.userId as string;
  const generation = await db.generation.findFirst({ where: { id: req.params.id, userId } });
  if (!generation) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (generation.status !== 'COMPLETE') {
    res.status(409).json({ error: 'Only a completed generation can have one image regenerated.' });
    return;
  }
  if ((part === 'a' || part === 'b') && (generation.subjectMode !== 'COUPLE' || !generation.outputKeyA || !generation.outputKeyB)) {
    res.status(400).json({ error: 'This generation has no separate You/Partner portraits to regenerate.' });
    return;
  }
  const existingKey = part === 'a' ? generation.outputKeyA : part === 'b' ? generation.outputKeyB : generation.outputKey;
  if (!existingKey) {
    res.status(400).json({ error: 'This generation has no image in that slot yet.' });
    return;
  }

  // One image = one credit, the same real cost a SOLO generation charges —
  // regardless of which slot (together/a/b) is being redone, it's still
  // exactly one paid Gemini call (plus, for a templated together shot, the
  // same 2-step composite a fresh one would run). Same self-vs-partner
  // subsidized-credit resolution as generations.ts's own POST, so a
  // subscribed partner's shared pool still covers this the same way.
  const creditCost = 1;
  const user = (await db.user.findUniqueOrThrow({ where: { id: userId }, include: { partner: true } })) as any;
  const isSelfSubscribed = !!(user.subscriptionTier && user.subscriptionTier !== 'FREE' &&
    (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date()));
  const isPartnerSubscribed = !!(user.partner && user.partner.subscriptionTier && user.partner.subscriptionTier !== 'FREE' &&
    (!user.partner.subscriptionExpiresAt || new Date(user.partner.subscriptionExpiresAt) > new Date()));
  const payerId = !isSelfSubscribed && isPartnerSubscribed ? user.partner.id : userId;
  const payerCredits = !isSelfSubscribed && isPartnerSubscribed ? user.partner.credits : user.credits;
  if (payerCredits < creditCost) {
    res.status(402).json({ error: 'Not enough credits' });
    return;
  }

  try {
    const photoAKeys = overridePhotoAKey
      ? [overridePhotoAKey]
      : [generation.photoAKey, ...generation.photoAExtraKeys];
    const photoBKeys = overridePhotoBKey
      ? [overridePhotoBKey]
      : generation.photoBKey ? [generation.photoBKey, ...generation.photoBExtraKeys] : undefined;

    const [photoA, photoB] = await Promise.all([
      loadPersonPhotos(photoAKeys),
      photoBKeys ? loadPersonPhotos(photoBKeys) : Promise.resolve(undefined),
    ]);
    const templateImage = templateImageFor(generation.templateId ?? undefined);

    // Deliberately perturbed, never the original seed: resending the exact
    // same seed + prompt + photos to the same model risks reproducing the
    // very image the user didn't like (fal.ai's and Gemini's own determinism
    // is the whole reason the 3-image session shares one seed in the first
    // place — see FusionInput.seed's doc comment). A small offset (not a
    // huge random jump) keeps it in the same seed "neighborhood" as its
    // unchanged siblings rather than rolling a completely unrelated look —
    // the same small-offset philosophy the automatic quality-check retries
    // already use (seed+101/202/303/1 elsewhere in this pipeline).
    const baseSeed = generation.seed ?? Math.floor(Math.random() * 2 ** 31);
    const seed = baseSeed + 400 + Math.floor(Math.random() * 100);

    const effectiveDescription = [
      generation.description,
      customPrompt
        ? `[USER REFINEMENT EDIT: "${customPrompt}". Lock theme/style to "${generation.styleKey}". Keep original scene lighting and quality high while updating clothing, dress, expression, or section details as specified.]`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    let result;
    if (part === 'together') {
      if (generation.subjectMode === 'COUPLE' && photoB) {
        result = await generateTogetherPart({
          photoA,
          photoB,
          templateImage,
          templateId: generation.templateId ?? undefined,
          styleKey: generation.styleKey,
          description: effectiveDescription,
          seed,
          provider,
        });
      } else {
        const prompt = buildFusionPrompt({
          subjectMode: generation.subjectMode,
          templateId: generation.templateId ?? undefined,
          styleKey: generation.styleKey,
          description: effectiveDescription,
          hasTemplateImage: !!templateImage,
          photoACount: photoA.length,
          groupPhotoCount: generation.subjectMode === 'GROUP' ? photoA.length : undefined,
        });
        result = await generateSoloPart({
          photos: photoA,
          templateImage,
          prompt,
          seed,
          retrySeedOffset: 1,
          styleKey: generation.styleKey,
          provider,
        });
      }
    } else {
      const photos = part === 'a' ? photoA : (photoB as NonNullable<typeof photoB>);
      const prompt = buildFusionPrompt({
        subjectMode: 'SOLO',
        templateId: generation.templateId ?? undefined,
        styleKey: generation.styleKey,
        description: effectiveDescription,
        hasTemplateImage: !!templateImage,
        photoACount: photos.length,
      });
      result = await generateSoloPart({
        photos,
        templateImage,
        prompt,
        seed,
        retrySeedOffset: 1,
        styleKey: generation.styleKey,
        provider,
      });
    }

    // Overwrite the existing object in place — see this file's own doc
    // comment above for why a new key isn't needed.
    await putObjectBytes({ key: existingKey, body: result.imageBytes, contentType: result.mimeType });

    const [updated] = await db.$transaction([
      db.generation.update({ where: { id: generation.id }, data: { provider: result.provider, model: result.model } }),
      db.user.update({ where: { id: payerId }, data: { credits: { decrement: creditCost } } }),
    ]);

    // BUG FIX (reported 2026-09-14): a regenerate visibly "worked" — the
    // toast said so, and the screen that triggered it showed the new image
    // — but the very next time this generation was read back (reopening the
    // app, pulling Gallery to refresh, the Couple Dashboard) it silently
    // reverted to the pre-regenerate image. Root cause: `existingKey` is
    // the SAME R2 key as before (this route overwrites in place, by
    // design — see the file's own top comment), so every OTHER reader of
    // this generation (GET /generations, GET /generations/:id) was still
    // building `publicUrlFor(existingKey)` — the exact same URL string the
    // client's image cache (and R2's own edge cache) already had bytes
    // cached for. Only THIS response ever carried a busted URL, and only
    // once. Fixed at the source (storage.ts's publicUrlForBusted, keyed off
    // `updatedAt` — see its doc comment) so every future read is ALSO
    // guaranteed a fresh URL, not just this one response — using the same
    // helper here (rather than the old ad hoc `?t=Date.now()`) so this
    // response and the next GET agree on the exact same URL instead of two
    // independently-busted values that both happen to work.
    const busted = (key: string | null) => (key ? publicUrlForBusted(key, updated.updatedAt) : null);

    // Second half of the same bug: if this generation is ALSO the caller's
    // couple's currently-active wallpaper pack, PATCH /couple/settings
    // copied its URLs onto the Couple row ONCE at pick-time (schema.prisma's
    // own doc comment on customPackTogetherUrl explains why — the partner
    // can't re-resolve a private generation id on their own). Regenerating
    // one slot never touched that copy, so the couple dashboard/wallpaper
    // kept the pre-regenerate image forever, not just until the next GET —
    // there was no later read that would have self-corrected it. Refresh it
    // here, and push it over the same 'settings' socket channel
    // PATCH /couple/settings already uses, so both phones (not just
    // whichever one re-opens the dashboard) pick up the new image right
    // away instead of waiting on the next proximity tick.
    if (generation.subjectMode === 'COUPLE') {
      const couple = await db.couple.findFirst({ where: { packId: generation.id } });
      if (couple) {
        const field =
          part === 'together' ? 'customPackTogetherUrl' : part === 'a' ? 'customPackAUrl' : 'customPackBUrl';
        const updatedCouple = await db.couple.update({
          where: { id: couple.id },
          data: { [field]: busted(existingKey) },
        });
        const members = await db.user.findMany({ where: { coupleId: couple.id }, select: { id: true } });
        const settingsPayload = {
          type: 'settings' as const,
          packId: updatedCouple.packId,
          customPackTogetherUrl: updatedCouple.customPackTogetherUrl,
          customPackAUrl: updatedCouple.customPackAUrl,
          customPackBUrl: updatedCouple.customPackBUrl,
          paused: updatedCouple.paused,
          thresholdM: updatedCouple.thresholdM,
        };
        for (const member of members) sendToUser(member.id, settingsPayload);
      }
    }

    // Full row, same response shape as POST/GET /generations, so the client
    // can treat this exactly like any other GenerationResponse and just
    // replace its cached copy — rather than a bespoke partial shape it would
    // need its own special-case merge logic for.
    res.status(200).json({
      ...updated,
      outputUrl: busted(updated.outputKey),
      outputUrlA: busted(updated.outputKeyA),
      outputUrlB: busted(updated.outputKeyB),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Regeneration failed';
    res.status(502).json({ error: errorMessage });
  }
}));
