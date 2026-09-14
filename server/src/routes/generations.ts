import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { env } from '../env.js';
import { isStorageConfigured, publicUrlFor, publicUrlForBusted } from '../lib/storage.js';
import { checkContentPolicy, messageForViolation } from '../lib/contentPolicy.js';
import { runFusionJob } from '../lib/generationJob.js';
import { awardPointsForRegeneration } from '../lib/points.js';
import { NanoBananaProvider } from '../lib/ai/nanoBanana.js';
import type { ImageFusionProvider } from '../lib/ai/provider.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const generationsRouter = Router();

// One instance, reused across requests — the SDK client itself holds no
// per-request state. Nano Banana over Qwen: verified working end-to-end
// against a real key (2026-09-10 — real photorealistic couple photo, correct
// 9:16 aspect ratio, no identity/pasted-together artifacts), on billing
// that's actually paid for right now. Qwen (qwenImageEdit.ts) remains a
// real, coded, previously-proven alternative — just blocked on its own
// account's HF Inference Providers credit being exhausted (docs/
// ai-generation-plan.md §3a). Swapping back means changing this one line
// and the isConfigured check below.
const provider: ImageFusionProvider = new NanoBananaProvider();

const createSchema = z
  .object({
    templateId: z.string().optional(),
    styleKey: z.string().min(1),
    subjectMode: z.enum(['SOLO', 'COUPLE', 'GROUP']),
    description: z.string().max(500).optional(),
    // Arrays, not single keys, since 2026-09-12. For SOLO/COUPLE this is
    // different angles/expressions of the SAME person, sent together for
    // materially better identity lock than one photo alone (see
    // promptBuilder.ts's PromptInput.photoACount doc comment for the
    // research this is built against). For GROUP (added the same day —
    // real request: "three faces in one photo") this SAME array instead
    // holds one photo EACH from 2-4 DISTINCT people — see
    // promptGroup.ts's buildGroupScenePrompt for how groupPhotoCount tells
    // the prompt which meaning applies. Capped at 4: Google's own guidance
    // says up to 14 (6 at high fidelity) reference images actually helps
    // identity lock, but that's for deliberately curated single-person
    // reference sets — 4 is already past where most casual uploads (angles
    // OR a real group's headcount) have more to add.
    photoAKeys: z.array(z.string().min(1)).min(1).max(4),
    photoBKeys: z.array(z.string().min(1)).min(1).max(3).optional(),
    // Set when this generation started from a post's "Recreate" button
    // (src/app/post/[id].tsx) rather than from scratch — see
    // lib/points.ts's awardPointsForRegeneration for what this triggers on
    // success. Any post can be the source, not just the caller's own
    // (recreating someone else's IS the point of the community feed).
    sourcePostId: z.string().min(1).optional(),
    // Set by the "General" create mode (src/components/create/freeform-form.tsx)
    // — see promptBuilder.ts's PromptInput.freeform doc comment for what it
    // actually changes. Restricted below to the one shape that mode can ever
    // send: refused rather than silently ignored for any other combination,
    // since letting a template-driven or COUPLE request quietly opt into
    // "the description fully controls pose/outfit" would undermine the
    // identity-fidelity guarantees those modes are actually built on.
    freeform: z.boolean().optional(),
  })
  .refine((v) => v.subjectMode !== 'COUPLE' || !!v.photoBKeys?.length, {
    message: 'photoBKeys is required when subjectMode is COUPLE',
    path: ['photoBKeys'],
  })
  .refine((v) => !v.freeform || (v.subjectMode === 'SOLO' && !v.templateId), {
    message: 'freeform is only valid for a templateless SOLO generation',
    path: ['freeform'],
  })
  // GROUP has no bundled Template to recreate (every existing Template is
  // a 1- or 2-person scene) and no separate "Partner" slot — it's 2-4
  // distinct people packed into photoAKeys instead (see that field's own
  // comment above).
  .refine((v) => v.subjectMode !== 'GROUP' || (v.photoAKeys.length >= 2 && !v.photoBKeys?.length && !v.templateId), {
    message: 'GROUP requires 2-4 photoAKeys, no photoBKeys, and no templateId',
    path: ['subjectMode'],
  });

/**
 * Creates a generation and runs the AI fusion job for it. The actual
 * multi-image orchestration lives in lib/generationJob.ts's runFusionJob
 * (split out 2026-09-11 to keep this route file under the workspace's
 * 350-line module limit) — this handler owns request validation, the
 * credit check, and turning that job's result into the DB update + points
 * payout + response.
 */
generationsRouter.post('/generations', requireUser, asyncHandler(async (req, res) => {
  // Matches whichever provider is actually active above — Nano Banana needs
  // GEMINI_API_KEY, Qwen needs HF_TOKEN. Update this alongside the `provider`
  // line if that's swapped again.
  if (!isStorageConfigured() || !env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'The AI fusion pipeline isn’t configured on this server yet.' });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const input = parsed.data;

  // Content-policy gate — checked before anything else costs money (credit
  // check, AI call). Only the free-text description can carry prohibited
  // content; the photos and template/style are all closed sets we already
  // control. See lib/contentPolicy.ts's own doc comment for why this is a
  // separate module from promptBuilder.ts's prompt-injection guard, and why
  // a violation is refused outright (with a reason) rather than silently
  // stripped the way an injection attempt is.
  const policyViolation = checkContentPolicy(input.description);
  if (policyViolation) {
    res.status(400).json({ error: messageForViolation(policyViolation) });
    return;
  }

  // Fail before spending anything (a credit check, an AI call) on a bad id —
  // any post can be a source (recreating someone else's is the point), but
  // it has to actually exist. Resolved once here and reused below for the
  // points-award step, rather than re-querying it after the job finishes.
  const sourcePost = input.sourcePostId
    ? await db.post.findUnique({ where: { id: input.sourcePostId }, select: { id: true, userId: true } })
    : null;
  if (input.sourcePostId && !sourcePost) {
    res.status(404).json({ error: 'That post no longer exists.' });
    return;
  }

  // COUPLE is 3 images (together + 2 solos) for one credit-cost decision;
  // SOLO stays 1. Mirrors the real unit-economics multiplier a 3-image
  // session actually costs, rather than under-charging couple sessions at
  // the same price as a single solo image. GROUP (added 2026-09-12) is
  // still only ONE output image (the user's own explicit choice — just the
  // group photo, no per-person solos, to keep it fast/cheap), so it isn't
  // priced by output-image count the way COUPLE is; 2 credits reflects the
  // real extra AI-side difficulty/retry-risk of fusing 2-4 distinct
  // identities into one coherent scene instead of one or two, without
  // charging SOLO-level pricing for a harder task.
  const creditCost = input.subjectMode === 'COUPLE' ? 3 : input.subjectMode === 'GROUP' ? 2 : 1;

  const user = (await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { partner: true },
  })) as any;

  const isSelfSubscribed = !!(user.subscriptionTier && user.subscriptionTier !== 'FREE' &&
    (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date()));

  const isPartnerSubscribed = !!(user.partner && user.partner.subscriptionTier && user.partner.subscriptionTier !== 'FREE' &&
    (!user.partner.subscriptionExpiresAt || new Date(user.partner.subscriptionExpiresAt) > new Date()));

  // FIX (2026-09-11): a subscription used to bypass the credit check
  // entirely, so a subscribed user — or their partner via the Couple Share
  // Bonus — could generate an unlimited number of images against a metered
  // Gemini bill. Subscribers are NOT unlimited: `/profile/subscribe` already
  // grants a bonus-credit allotment on activation, and that allotment is now
  // the actual cap, same as everyone else. The Couple Share Bonus still
  // works, but as a SHARED pool: when only the partner is subscribed, this
  // generation draws from the partner's `credits` balance (the account the
  // subscription actually replenished) instead of granting this account free
  // generation. Exactly one account's balance is ever decremented below.
  const payerId = !isSelfSubscribed && isPartnerSubscribed ? user.partner.id : userId;
  const payerCredits = !isSelfSubscribed && isPartnerSubscribed ? user.partner.credits : user.credits;

  if (payerCredits < creditCost) {
    res.status(402).json({ error: 'Not enough credits' });
    return;
  }

  const generation = await db.generation.create({
    data: {
      userId,
      templateId: input.templateId,
      styleKey: input.styleKey,
      subjectMode: input.subjectMode,
      description: input.description,
      // photoAKey/photoBKey stay the single PRIMARY photo (everything else
      // in the app — thumbnails, the DELETE handler's R2 cleanup below,
      // points.ts, posts.ts — already reads these as one key each, and
      // none of that needs to know or care about extra angles) — any
      // additional reference angles go in the new ...ExtraKeys arrays
      // instead of replacing these, so this stays a purely additive schema
      // change. See prisma/schema.prisma's own doc comment on those fields.
      photoAKey: input.photoAKeys[0],
      photoBKey: input.photoBKeys?.[0],
      photoAExtraKeys: input.photoAKeys.slice(1),
      photoBExtraKeys: input.photoBKeys?.slice(1) ?? [],
      sourcePostId: input.sourcePostId,
      provider: 'pending',
      model: 'pending',
      status: 'PROCESSING',
      creditCost,
    },
  });

  try {
    const job = await runFusionJob({
      userId,
      generationId: generation.id,
      subjectMode: input.subjectMode,
      templateId: input.templateId,
      styleKey: input.styleKey,
      description: input.description,
      photoAKeys: input.photoAKeys,
      photoBKeys: input.photoBKeys,
      provider,
      freeform: input.freeform,
    });

    const updated = await db.$transaction([
      db.generation.update({
        where: { id: generation.id },
        data: {
          status: 'COMPLETE',
          outputKey: job.together.key,
          outputKeyA: job.a?.key,
          outputKeyB: job.b?.key,
          seed: job.seed,
          provider: job.together.provider,
          model: job.together.model,
        },
      }),
      db.user.update({ where: { id: payerId }, data: { credits: { decrement: creditCost } } }),
    ]);

    // Only pays out when recreating SOMEONE ELSE'S post — otherwise a user
    // could farm their own post's "regenerations" (and the points that come
    // from them) for free just by tapping Recreate on their own share
    // repeatedly. Awarded after the transaction above so a failure here
    // (this post got deleted mid-request, say) can't roll back a generation
    // the user already paid credits for and successfully received.
    if (sourcePost && sourcePost.userId !== userId) {
      try {
        await awardPointsForRegeneration(sourcePost.id);
      } catch (err) {
        console.error(`Failed to award regeneration points for post ${sourcePost.id}:`, err);
      }
    }

    res.status(201).json({
      ...updated[0],
      outputUrl: publicUrlFor(job.together.key),
      outputUrlA: job.a ? publicUrlFor(job.a.key) : null,
      outputUrlB: job.b ? publicUrlFor(job.b.key) : null,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Generation failed';
    await db.generation.update({ where: { id: generation.id }, data: { status: 'FAILED', errorMessage } });
    res.status(502).json({ error: errorMessage, generationId: generation.id });
  }
}));

/**
 * Lists the caller's own generations, most recent first — the real
 * server-side source of truth Gallery, the Couple Dashboard's pack picker,
 * and Profile's wallpaper count all need. Added 2026-09-11: before this,
 * every one of those screens relied entirely on `useGalleryStore`'s local
 * AsyncStorage cache (src/data/gallery-store.ts) with no server fetch to
 * fall back on — so a fresh install, a cleared app, or two screens simply
 * disagreeing about what's in that cache all looked like "my generated
 * images randomly disappeared," when the rows were always safe in Postgres/
 * R2 the whole time. Capped at 200 (a single self-hosted user's realistic
 * lifetime volume at this app's current scale) rather than true cursor
 * pagination — revisit if that cap is ever actually hit.
 */
generationsRouter.get('/generations', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const generations = await db.generation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // publicUrlForBusted, not publicUrlFor: outputKey/outputKeyA/outputKeyB
  // can hold bytes that were OVERWRITTEN in place by a later regenerate
  // (generationsRegenerate.ts reuses the same key on purpose). A plain
  // publicUrlFor() here would return the exact same URL the client (and
  // R2's own edge cache) already had cached from before that regenerate —
  // see publicUrlForBusted's doc comment (storage.ts) for the full bug this
  // fixes. `updatedAt` bumps on ANY change to the row, so this naturally
  // busts every slot's URL together rather than tracking which specific
  // slot last changed — a harmless occasional extra fetch of unchanged
  // bytes, not a correctness issue.
  res.json(
    generations.map((generation) => ({
      ...generation,
      outputUrl: generation.outputKey ? publicUrlForBusted(generation.outputKey, generation.updatedAt) : null,
      outputUrlA: generation.outputKeyA ? publicUrlForBusted(generation.outputKeyA, generation.updatedAt) : null,
      outputUrlB: generation.outputKeyB ? publicUrlForBusted(generation.outputKeyB, generation.updatedAt) : null,
    })),
  );
}));

generationsRouter.get('/generations/:id', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const generation = await db.generation.findFirst({ where: { id: req.params.id, userId } });

  if (!generation) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Same publicUrlForBusted reasoning as the list route above.
  res.json({
    ...generation,
    outputUrl: generation.outputKey ? publicUrlForBusted(generation.outputKey, generation.updatedAt) : null,
    outputUrlA: generation.outputKeyA ? publicUrlForBusted(generation.outputKeyA, generation.updatedAt) : null,
    outputUrlB: generation.outputKeyB ? publicUrlForBusted(generation.outputKeyB, generation.updatedAt) : null,
  });
}));

// The DELETE /generations/:id handler lives in generationsDelete.ts as its
// own router now (split out 2026-09-12 to keep this file under the
// workspace's 350-line module cap — see that file's own doc comment).
// Mounted separately in index.ts.
