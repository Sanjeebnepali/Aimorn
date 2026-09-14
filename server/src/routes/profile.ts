import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { generatePairingCode, generateUsername } from '../lib/codes.js';
import { sendToUser } from '../realtime/coupleSocket.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { TRIAL_ADS_REQUIRED } from '../lib/creditsConfig.js';

export const profileRouter = Router();

// Only the fields onboarding/pairing ever need on the client — never spread
// the raw Prisma row into a response, so a future column (email, credits
// internals, whatever) doesn't leak out just because it exists on the table.
// Exported: creditsRoutes.ts (ad-reward/trial/buy-credits/subscribe/etc. —
// split out 2026-09-11 to keep this file under the workspace's 350-line
// module limit) builds every one of its responses through this same shape,
// so a client parsing a ProfileResponse never has to care which route it
// came from.
export function toProfileJson(user: {
  id: string;
  displayName: string | null;
  avatarKey: string | null;
  stylePreference: string | null;
  usageMode: string | null;
  username: string | null;
  pairingCode: string | null;
  partnerId: string | null;
  onboardedAt: Date | null;
  credits: number;
  points: number;
  subscriptionTier?: 'FREE' | 'TRIAL' | 'PRO' | 'ULTRA';
  subscriptionExpiresAt?: Date | null;
  lastDailyCreditReset?: Date | null;
  adWatchesToday?: number;
  trialAdsWatched?: number;
  trialUsedAt?: Date | null;
  partner?: any;
}) {
  const isSelfSubscribed = !!(user.subscriptionTier && user.subscriptionTier !== 'FREE' &&
    (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date()));

  const isPartnerSubscribed = !!(user.partner && user.partner.subscriptionTier && user.partner.subscriptionTier !== 'FREE' &&
    (!user.partner.subscriptionExpiresAt || new Date(user.partner.subscriptionExpiresAt) > new Date()));

  const isSubscribed = isSelfSubscribed || isPartnerSubscribed;
  const activeTier = isSelfSubscribed ? user.subscriptionTier : (isPartnerSubscribed ? user.partner.subscriptionTier : 'FREE');

  return {
    id: user.id,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    stylePreference: user.stylePreference,
    usageMode: user.usageMode,
    username: user.username,
    pairingCode: user.pairingCode,
    hasPartner: user.partnerId !== null,
    onboarded: user.onboardedAt !== null,
    credits: user.credits,
    points: user.points,
    subscriptionTier: isSubscribed ? (activeTier ?? 'PRO') : 'FREE',
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? user.partner?.subscriptionExpiresAt ?? null,
    isSubscribed,
    sharedViaPartner: !isSelfSubscribed && isPartnerSubscribed,
    adWatchesToday: user.adWatchesToday ?? 0,
    lastDailyCreditReset: user.lastDailyCreditReset ?? null,
    // Free-trial progress — see POST /profile/trial/watch-ad in
    // creditsRoutes.ts. `trialEligible` is the one field the client actually
    // needs to decide what to show (still collecting ads vs. already used,
    // ever); the raw watched/required pair drives the progress bar.
    trialAdsWatched: user.trialUsedAt ? TRIAL_ADS_REQUIRED : (user.trialAdsWatched ?? 0),
    trialAdsRequired: TRIAL_ADS_REQUIRED,
    trialEligible: !user.trialUsedAt,
  };
}

/** Lets the client check onboarding status on app boot without re-submitting
 * the form. Also the one place Profile's stat row (src/app/(tabs)/profile/
 * index.tsx) gets its real numbers from — added 2026-09-11: those three
 * cards ("18 Wallpapers", "6 Credits Left", paired status) used to be two
 * hardcoded literals and one real value, so no amount of generating or
 * spending ever moved them. `generationCount` only counts COMPLETE
 * generations — a still-PROCESSING or FAILED one was never a wallpaper you
 * actually got. */
profileRouter.get('/profile/me', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const [user, generationCount] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { partner: true },
    }),
    db.generation.count({ where: { userId, status: 'COMPLETE' } }),
  ]);
  res.json({ ...toProfileJson(user), generationCount });
}));

const onboardingSchema = z.object({
  displayName: z.string().min(1).max(60),
  avatarKey: z.string().min(1).optional(),
  stylePreference: z.string().min(1),
  usageMode: z.enum(['SOLO', 'COUPLE']),
});

/**
 * Completes onboarding: saves the survey answers and, the first time this
 * is called for an account, mints its username + pairing code. Safe to call
 * again (e.g. the client retrying after a dropped connection) — an existing
 * username/pairingCode is left untouched rather than replaced, since either
 * one changing out from under a user who already shared it would break
 * whatever they shared it into.
 */
profileRouter.post('/profile/onboarding', requireUser, asyncHandler(async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const existing = await db.user.findUniqueOrThrow({ where: { id: userId } });

  // Retried collisions are astronomically unlikely at this code length (see
  // codes.ts) but the unique constraint is the real guarantee — this loop
  // is just so a collision produces a retry instead of a 500.
  async function withRetriedUniqueCode<T>(assign: (code: string) => Promise<T>, generate: () => string): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await assign(generate());
      } catch (err) {
        const isUniqueConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
        if (!isUniqueConflict || attempt === 4) throw err;
      }
    }
    throw new Error('unreachable');
  }

  const user = existing.username && existing.pairingCode
    ? await db.user.update({
        where: { id: userId },
        data: {
          displayName: parsed.data.displayName,
          avatarKey: parsed.data.avatarKey,
          stylePreference: parsed.data.stylePreference,
          usageMode: parsed.data.usageMode,
          onboardedAt: existing.onboardedAt ?? new Date(),
        },
      })
    : await withRetriedUniqueCode(
        (username) =>
          withRetriedUniqueCode(
            (pairingCode) =>
              db.user.update({
                where: { id: userId },
                data: {
                  displayName: parsed.data.displayName,
                  avatarKey: parsed.data.avatarKey,
                  stylePreference: parsed.data.stylePreference,
                  usageMode: parsed.data.usageMode,
                  username: existing.username ?? username,
                  pairingCode: existing.pairingCode ?? pairingCode,
                  onboardedAt: existing.onboardedAt ?? new Date(),
                },
              }),
            generatePairingCode,
          ),
        generateUsername,
      );

  res.json(toProfileJson(user));
}));

const pairSchema = z.object({
  code: z.string().min(1),
});

/**
 * Redeems a partner's pairing code. One-directional: only the redeemer's
 * `partnerId` is set (see the schema comment on `partnerOf` for why that's
 * enough for a 1:1 link), and the code is cleared from the sharer's account
 * in the same transaction so it can't also be redeemed by a second person
 * racing the first.
 */
profileRouter.post('/profile/pair', requireUser, asyncHandler(async (req, res) => {
  const parsed = pairSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const code = parsed.data.code.trim().toUpperCase();

  const partner = await db.user.findUnique({ where: { pairingCode: code } });
  if (!partner) {
    res.status(404).json({ error: 'That code doesn’t match anyone — double check it and try again.' });
    return;
  }
  if (partner.id === userId) {
    res.status(400).json({ error: 'That’s your own code — share it with your partner instead.' });
    return;
  }

  const self = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (self.partnerId) {
    res.status(409).json({ error: 'You’re already paired with someone.' });
    return;
  }

  const [updatedSelf] = await db.$transaction([
    db.user.update({ where: { id: userId }, data: { partnerId: partner.id } }),
    db.user.update({ where: { id: partner.id }, data: { pairingCode: null } }),
  ]);

  // Let the code-sharer's Couple dashboard (if open) know the instant their
  // partner accepts, instead of waiting for its own poll — see
  // realtime/coupleSocket.ts.
  sendToUser(partner.id, { type: 'linked', partnerId: userId, partnerDisplayName: updatedSelf.displayName });

  res.json(toProfileJson(updatedSelf));
}));
