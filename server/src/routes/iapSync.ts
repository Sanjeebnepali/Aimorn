import { Router } from 'express';

import { requireUser } from '../middleware/requireUser.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { toProfileJson } from './profile.js';
import { db } from '../lib/db.js';
import { applyPurchase, fetchSubscriberFromRevenueCat, isRevenueCatConfigured } from '../lib/revenueCat.js';
import { REVENUECAT_PRODUCT_MAP, type RevenueCatProductId } from '../lib/creditsConfig.js';

export const iapSyncRouter = Router();

/**
 * Called by the client right after `Purchases.purchasePackage()` resolves
 * (src/iap/purchases.ts) — gives the UI its credits within a second of a
 * real purchase, instead of waiting on webhook delivery (which RevenueCat
 * doesn't guarantee is instant). Deliberately does NOT trust anything the
 * client sends about what it bought: it re-fetches this user's subscriber
 * record directly from RevenueCat's own REST API
 * (fetchSubscriberFromRevenueCat) and applies whatever RevenueCat itself
 * says is true, the same way the webhook does — a modified client claiming
 * "I bought the Mega pack" with no matching RevenueCat record simply finds
 * nothing to apply. Safe to call at any time, not just after a purchase
 * (e.g. app resume) — it always reconciles against the current subscriber
 * state, and applyPurchase's own idempotency means re-syncing an
 * already-applied purchase just costs one no-op DB write.
 */
iapSyncRouter.post(
  '/iap/sync',
  requireUser,
  asyncHandler(async (req, res) => {
    if (!isRevenueCatConfigured()) {
      res.status(503).json({ error: 'RevenueCat isn’t configured on this server yet.' });
      return;
    }

    const userId = res.locals.userId as string;
    const subscriber = await fetchSubscriberFromRevenueCat(userId);

    // Active (not-yet-expired) subscriptions — RevenueCat's own
    // `expires_date` is the one source of truth for whether a period is
    // still current, not "did we see a RENEWAL event for it" (a device
    // that was offline through a renewal would otherwise look expired here
    // even though the store already billed it).
    for (const [productId, sub] of Object.entries(subscriber.subscriptions)) {
      const mapping = REVENUECAT_PRODUCT_MAP[productId as RevenueCatProductId];
      if (!mapping || mapping.kind !== 'subscription') continue;
      const expiresAt = sub.expires_date ? new Date(sub.expires_date) : undefined;
      if (expiresAt && expiresAt.getTime() < Date.now()) continue; // lapsed — let expireSubscription (webhook) handle it
      await applyPurchase({
        userId,
        productId,
        transactionId: sub.original_transaction_id,
        isSubscription: true,
        expiresAt,
      });
    }

    // One-time consumable packs — RevenueCat lists every non-subscription
    // purchase ever made under this product id, so this only ever grants
    // NEW ones (each with its own transaction id already-processed by a
    // prior sync or the webhook is a guaranteed no-op via applyPurchase's
    // idempotency, not re-checked here).
    for (const [productId, purchases] of Object.entries(subscriber.non_subscriptions)) {
      const mapping = REVENUECAT_PRODUCT_MAP[productId as RevenueCatProductId];
      if (!mapping || mapping.kind !== 'consumable') continue;
      for (const purchase of purchases) {
        await applyPurchase({ userId, productId, transactionId: purchase.id, isSubscription: false });
      }
    }

    const updated = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { partner: true } });
    res.json(toProfileJson(updated));
  }),
);
