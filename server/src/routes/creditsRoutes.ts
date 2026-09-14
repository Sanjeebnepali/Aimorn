import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { toProfileJson } from './profile.js';
import {
  AD_WATCHES_PER_CREDIT,
  DAILY_AD_REWARD_CAP,
  DAILY_CHECKIN_CREDITS,
  TRIAL_ADS_REQUIRED,
  TRIAL_DURATION_DAYS,
  TRIAL_CREDITS,
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
} from '../lib/creditsConfig.js';

/**
 * The credits/points/monetization surface — every route that moves a
 * balance (`credits`, `points`, `subscriptionTier`) without also touching
 * profile identity. Split out of profile.ts 2026-09-11 to keep that file
 * under the workspace's 350-line module limit; every response here is still
 * shaped by profile.ts's own `toProfileJson`, so a `ProfileResponse` on the
 * client looks identical no matter which route produced it.
 */
export const creditsRouter = Router();

const redeemPointsSchema = z.object({
  // Omit to redeem everything available — the common case from a single
  // "Redeem" button with no amount picker. An explicit amount is still
  // accepted for a future "redeem some of it" UI without a route change.
  amount: z.number().int().positive().optional(),
});

/**
 * Converts earned points into spendable credits, 1:1, on request — the
 * user's own spec: "make the earning point system so it can be used to
 * generate other image later." Deliberately a separate explicit action
 * rather than auto-merging points into credits the moment they're earned
 * (generations.ts's awardPointsForRegeneration): keeping the two ledgers
 * distinct until redemption is what lets Profile honestly show "earned from
 * the community" separately from "credits you have to spend," rather than
 * silently blending them.
 */
creditsRouter.post('/profile/redeem-points', requireUser, asyncHandler(async (req, res) => {
  const parsed = redeemPointsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const amount = parsed.data.amount ?? user.points;
  if (amount <= 0) {
    res.status(400).json({ error: 'You don’t have any points to redeem yet.' });
    return;
  }

  // A conditional update (not a plain `update` after the read above) so two
  // concurrent redeem taps can't both pass the balance check against the
  // same stale read and jointly push `points` negative — `updateMany`'s
  // `where` is re-checked against the row's CURRENT value at write time,
  // and Postgres only lets one of two racing writers win it.
  const result = await db.user.updateMany({
    where: { id: userId, points: { gte: amount } },
    data: { points: { decrement: amount }, credits: { increment: amount } },
  });
  if (result.count === 0) {
    res.status(409).json({ error: 'You don’t have that many points.' });
    return;
  }

  const updated = await db.user.findUniqueOrThrow({ where: { id: userId } });
  res.json({ credits: updated.credits, points: updated.points });
}));

/**
 * Counts one watched rewarded ad, granting +1 AI credit every
 * AD_WATCHES_PER_CREDIT-th watch (not every watch — see creditsConfig.ts
 * for why 1-ad-per-credit was an uncapped-per-ad loss at real rewarded-
 * video rates). `adWatchesToday` already tracks the raw watch count, so
 * this reuses it as the ratio's counter rather than adding a schema
 * column: whether THIS watch earns a credit is just "does the new count
 * divide evenly by the ratio". Ad watch count resets daily, capped at
 * DAILY_AD_REWARD_CAP watches per day.
 */
creditsRouter.post('/profile/ad-reward', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const user = (await db.user.findUniqueOrThrow({ where: { id: userId } })) as any;

  const now = new Date();
  const lastReset = user.lastAdWatchReset ? new Date(user.lastAdWatchReset) : null;
  const isSameDay = lastReset && lastReset.toDateString() === now.toDateString();
  const adsWatchedSoFar = isSameDay ? (user.adWatchesToday ?? 0) : 0;

  if (adsWatchedSoFar >= DAILY_AD_REWARD_CAP) {
    res.status(429).json({
      error: `You've hit today's ${DAILY_AD_REWARD_CAP}-ad limit. Come back tomorrow for more free credits.`,
      adWatchesToday: adsWatchedSoFar,
    });
    return;
  }

  const newAdsWatchedToday = adsWatchedSoFar + 1;
  const earnsCredit = newAdsWatchedToday % AD_WATCHES_PER_CREDIT === 0;

  const updatedUser = (await db.user.update({
    where: { id: userId },
    data: {
      ...(earnsCredit ? { credits: { increment: 1 } } : {}),
      adWatchesToday: newAdsWatchedToday,
      lastAdWatchReset: now,
    } as any,
  })) as any;

  res.json({
    success: true,
    addedCredits: earnsCredit ? 1 : 0,
    adWatchesToday: newAdsWatchedToday,
    // Lets the client show "1 more ad to earn a credit" instead of just
    // silently watching the counter tick with no reward this time.
    adsUntilNextCredit: AD_WATCHES_PER_CREDIT - (newAdsWatchedToday % AD_WATCHES_PER_CREDIT || AD_WATCHES_PER_CREDIT),
    profile: toProfileJson(updatedUser),
  });
}));

/**
 * One step of unlocking the 3-day free trial: counts one watched ad toward
 * TRIAL_ADS_REQUIRED. On the ad that reaches the threshold, activates the
 * trial in the same request (grants TRIAL_CREDITS, sets subscriptionTier to
 * TRIAL for TRIAL_DURATION_DAYS, and marks `trialUsedAt` so it can't be
 * unlocked a second time on this account). Separate from the per-day
 * `/profile/ad-reward` counter above — this is a one-time lifetime unlock,
 * not a daily-repeatable reward.
 *
 * NOTE: like the existing /profile/ad-reward, this does not yet verify a
 * real ad actually played client-side — no ad SDK is wired into the app yet
 * (see the Amora Pricing Playbook, Phase 2). The economics and the one-time
 * cap here are real; the ad itself is still a placeholder until AdMob (or
 * equivalent) is integrated.
 */
creditsRouter.post('/profile/trial/watch-ad', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const user = (await db.user.findUniqueOrThrow({ where: { id: userId } })) as any;

  if (user.trialUsedAt) {
    res.status(400).json({ error: "You've already used your one-time free trial." });
    return;
  }

  const adsWatched = (user.trialAdsWatched ?? 0) + 1;
  const activates = adsWatched >= TRIAL_ADS_REQUIRED;
  const now = new Date();

  const updatedUser = (await db.user.update({
    where: { id: userId },
    data: activates
      ? {
          trialAdsWatched: adsWatched,
          trialUsedAt: now,
          subscriptionTier: 'TRIAL',
          subscriptionExpiresAt: new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000),
          credits: { increment: TRIAL_CREDITS },
        }
      : { trialAdsWatched: adsWatched },
  })) as any;

  res.json({
    success: true,
    activated: activates,
    adsWatched,
    adsRequired: TRIAL_ADS_REQUIRED,
    addedCredits: activates ? TRIAL_CREDITS : 0,
    trialExpiresAt: activates ? updatedUser.subscriptionExpiresAt : null,
    profile: toProfileJson(updatedUser),
  });
}));

/**
 * Grants DAILY_CHECKIN_CREDITS free credits if 24 hours have passed since
 * last reset.
 */
creditsRouter.post('/profile/daily-checkin', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const user = (await db.user.findUniqueOrThrow({ where: { id: userId } })) as any;

  const now = new Date();
  const lastReset = user.lastDailyCreditReset ? new Date(user.lastDailyCreditReset) : null;
  const isEligible = !lastReset || (now.getTime() - lastReset.getTime() >= 24 * 60 * 60 * 1000);

  if (!isEligible) {
    const nextCheckinMs = lastReset ? (lastReset.getTime() + 24 * 60 * 60 * 1000 - now.getTime()) : 0;
    res.status(400).json({
      error: 'Daily credits already claimed today.',
      nextCheckinHours: Math.ceil(nextCheckinMs / (1000 * 60 * 60)),
    });
    return;
  }

  const updatedUser = (await db.user.update({
    where: { id: userId },
    data: {
      credits: { increment: DAILY_CHECKIN_CREDITS },
      lastDailyCreditReset: now,
    } as any,
  })) as any;

  res.json({
    success: true,
    claimed: true,
    addedCredits: DAILY_CHECKIN_CREDITS,
    profile: toProfileJson(updatedUser),
  });
}));

const packSchema = z.object({
  packId: z.enum(['STARTER', 'VALUE', 'MEGA']),
});

/**
 * Handles consumable credit pack purchases — amounts come from
 * CREDIT_PACKS (creditsConfig.ts), the single source of truth for what
 * each pack actually grants, priced with a real cost basis. Renamed from
 * the old STARTER_17/BUNDLE_50/MEGAPACK_120 (2026-09-13 global-pricing
 * pass) since those names baked in the OLD credit counts — a pack whose id
 * still said "_17" after being repriced to 20 credits would be a confusing
 * thing to find in a support ticket a year from now.
 */
creditsRouter.post('/profile/buy-credits', requireUser, asyncHandler(async (req, res) => {
  const parsed = packSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const creditsToAdd = CREDIT_PACKS[parsed.data.packId].credits;

  const updatedUser = (await db.user.update({
    where: { id: userId },
    data: {
      credits: { increment: creditsToAdd },
    },
  })) as any;

  res.json({
    success: true,
    addedCredits: creditsToAdd,
    profile: toProfileJson(updatedUser),
  });
}));

const subscribeSchema = z.object({
  tier: z.enum(['PRO', 'ULTRA']),
  duration: z.enum(['WEEKLY', 'MONTHLY']),
});

/**
 * Activates or renews a Pro/Ultra subscription tier. Credit allotments come
 * from SUBSCRIPTION_PLANS (creditsConfig.ts) — sized so even a subscriber
 * who spends every credit in the period still clears real cost after the
 * assumed store commission (see that file's own doc comment for the math).
 */
creditsRouter.post('/profile/subscribe', requireUser, asyncHandler(async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const { tier, duration } = parsed.data;
  const plan = duration === 'WEEKLY' ? SUBSCRIPTION_PLANS.PRO_WEEKLY : SUBSCRIPTION_PLANS.PRO_MONTHLY;

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

  const bonusCredits = plan.credits;

  const updatedUser = (await db.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionExpiresAt: expiresAt,
      credits: { increment: bonusCredits },
    } as any,
  })) as any;

  res.json({
    success: true,
    tier,
    expiresAt,
    addedCredits: bonusCredits,
    profile: toProfileJson(updatedUser),
  });
}));
