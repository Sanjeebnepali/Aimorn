import { Router } from 'express';
import { clerkClient } from '@clerk/express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { deleteObjects } from '../lib/storage.js';
import { sendToUser } from '../realtime/coupleSocket.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const accountDeleteRouter = Router();

const DeleteAccountSchema = z.object({
  // A cheap, meaningful defense-in-depth check for the single most
  // destructive, irreversible route in this whole API — the real
  // protection is Clerk's bearer-token auth (requireUser below), but
  // requiring the client to deliberately send this exact string (matching
  // the "type DELETE to confirm" step in src/app/delete-account/index.tsx)
  // means no accidental/automated DELETE /account call — a stray retry, a
  // misrouted request, a future bug — can ever wipe an account without the
  // caller having gone through that same confirmation on purpose.
  confirm: z.literal('DELETE'),
});

/**
 * Permanently deletes the caller's account and everything that belongs to
 * it ONLY to them — added 2026-09-14 for real Play Store / App Store
 * compliance (Play Console's Data Safety policy and Apple's Guideline
 * 5.1.1(v) both require an in-app path to delete your account once an app
 * lets you create one; this is that path, not a nice-to-have).
 *
 * Ordering, and why: everything that can violate a foreign-key constraint
 * if deleted out of order happens FIRST, inside one transaction, so a
 * partial failure leaves nothing orphaned or half-deleted:
 *   1. Any OTHER user's Generation.sourcePostId pointing at one of my Posts
 *      (their "Recreate" of something I shared) is nulled — a Post can't
 *      be deleted while still referenced there.
 *   2. My Posts are deleted (Post.generationId is a required FK — deleting
 *      a Generation while its Post still exists would fail).
 *   3. If I'm paired, the couple link is torn down exactly like POST
 *      /couple/unlink does (see that route's own doc comment): the
 *      partner's coupleId/coupleRole/partnerId cleared, both location
 *      rows and the shared Couple row deleted, and the partner gets the
 *      SAME real-time `'unlinked'` push unlink already sends — deleting
 *      your own account shouldn't leave your ex-partner's app silently
 *      confused about why proximity wallpapers stopped working.
 *   4. Any Couple row whose active custom pack pointed at one of my
 *      generations gets that reset to null — same reasoning as
 *      generationsDelete.ts's identical cleanup for a single generation.
 *   5. My ProcessedPurchase rows (billing history) and Generations are
 *      deleted, then finally my own User row (CoupleLocation for my own
 *      id cascades automatically — see schema.prisma).
 *
 * R2 object cleanup and the actual Clerk identity deletion both happen
 * AFTER that transaction commits, best-effort, same "rows already gone,
 * don't fail the request over a secondary cleanup step" reasoning as
 * generationsDelete.ts's own R2 cleanup — which is also why every R2 key
 * is read out BEFORE the transaction runs (once it commits, the rows that
 * held those keys no longer exist to read them from). Clerk specifically
 * is deleted last, not first: if it were deleted before the DB transaction
 * and that transaction then failed, the user would be locked out with
 * their data still sitting here and no way to log back in and ask again.
 * Doing the DB deletion first guarantees the data is actually gone even in
 * the rare case the Clerk call itself fails (logged, not surfaced) — the
 * client calls Clerk's own `signOut()` immediately after either way, so
 * the user's local session ends regardless of whether this succeeds.
 *
 * Deliberately does NOT touch RevenueCat/the App Store/Play Store
 * subscription — no server-side call can cancel a real platform billing
 * subscription (RevenueCat's own docs are explicit about this: it reads
 * and reports store state, it doesn't own it), so an active subscription
 * keeps renewing until the user cancels it themselves from their
 * Apple/Google account. The confirmation screen (delete-account/index.tsx)
 * says this plainly before anyone taps delete, rather than implying this
 * button also stops billing.
 */
accountDeleteRouter.delete(
  '/account',
  requireUser,
  asyncHandler(async (req, res) => {
    const userId = res.locals.userId as string;
    const parsed = DeleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid confirmation.' });
      return;
    }

    const me = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        avatarKey: true,
        coupleId: true,
        partner: { select: { id: true, coupleId: true } },
        partnerOf: { select: { id: true, coupleId: true } },
        posts: { select: { id: true } },
        generations: {
          select: {
            id: true,
            photoAKey: true,
            photoBKey: true,
            photoAExtraKeys: true,
            photoBExtraKeys: true,
            outputKey: true,
            outputKeyA: true,
            outputKeyB: true,
          },
        },
      },
    });

    // Same single-sided-partnerId resolution as couple.ts's resolvePartner —
    // whichever of `partner`/`partnerOf` is non-null is my actual partner,
    // regardless of which of us originally shared vs. redeemed the code.
    const partner = me.partner ?? me.partnerOf ?? null;
    const coupleId = me.coupleId ?? partner?.coupleId ?? null;
    const myGenerationIds = me.generations.map((g) => g.id);
    const myPostIds = me.posts.map((p) => p.id);

    // Read out every R2 object key this account owns BEFORE the rows that
    // hold them are deleted below — every photo (including extra reference
    // angles), every generated result image, and the profile avatar.
    const r2Keys = [
      me.avatarKey,
      ...me.generations.flatMap((g) => [
        g.photoAKey,
        g.photoBKey,
        ...g.photoAExtraKeys,
        ...g.photoBExtraKeys,
        g.outputKey,
        g.outputKeyA,
        g.outputKeyB,
      ]),
    ].filter((key): key is string => !!key);

    await db.$transaction(async (tx) => {
      if (myPostIds.length > 0) {
        await tx.generation.updateMany({
          where: { sourcePostId: { in: myPostIds } },
          data: { sourcePostId: null },
        });
        await tx.post.deleteMany({ where: { id: { in: myPostIds } } });
      }

      if (partner) {
        // Mirrors POST /couple/unlink exactly (see that route) — whichever
        // of us holds the real `partnerId` column, both sides' coupleId/
        // coupleRole get cleared and the shared rows removed. My own row
        // is deleted a few lines down regardless, so only the PARTNER's
        // columns need an explicit update here.
        await tx.user.update({ where: { id: partner.id }, data: { partnerId: null, coupleId: null, coupleRole: null } });
        if (coupleId) {
          await tx.coupleLocation.deleteMany({ where: { userId: { in: [userId, partner.id] } } });
          await tx.couple.delete({ where: { id: coupleId } });
        }
      }

      if (myGenerationIds.length > 0) {
        await tx.couple.updateMany({
          where: { packId: { in: myGenerationIds } },
          data: { packId: null, customPackTogetherUrl: null, customPackAUrl: null, customPackBUrl: null },
        });
      }

      await tx.processedPurchase.deleteMany({ where: { userId } });
      await tx.generation.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    if (partner) {
      sendToUser(partner.id, { type: 'unlinked' });
    }

    try {
      await deleteObjects(r2Keys);
    } catch (err) {
      console.error(`Failed to delete R2 objects for deleted account ${userId}:`, err);
    }

    try {
      await clerkClient.users.deleteUser(userId);
    } catch (err) {
      console.error(`Failed to delete Clerk user ${userId} after account deletion:`, err);
    }

    res.status(204).end();
  }),
);
