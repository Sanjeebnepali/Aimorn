import { Router } from 'express';

import { env } from '../env.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { applyPurchase, expireSubscription } from '../lib/revenueCat.js';

export const revenueCatWebhookRouter = Router();

/** The subset of RevenueCat's webhook event payload this route reads — see
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 * for the full shape. `app_user_id` is our own Clerk user id verbatim,
 * because the client calls `Purchases.logIn(clerkUserId)` right after
 * signing in (src/iap/purchases.ts) — RevenueCat never needs its own
 * separate identity mapping table this way. */
type RevenueCatWebhookEvent = {
  event: {
    id: string;
    type: string;
    app_user_id: string;
    product_id: string;
    transaction_id: string;
    expiration_at_ms: number | null;
  };
};

/**
 * RevenueCat → us, server-to-server, on every purchase/renewal/cancellation/
 * expiration event, for every user, regardless of whether their app is even
 * open at the time. This is the AUTHORITATIVE path — the only one that
 * fires for a renewal that happens while the app is closed, or a
 * cancellation/refund a support agent processes from the App Store side.
 * routes/iapSync.ts covers the "give the UI its credits within a second of
 * purchase" case this can't (webhook delivery isn't instant); both funnel
 * through lib/revenueCat.ts's applyPurchase so neither can double-grant.
 *
 * Must be registered with `express.json()` already applied (see index.ts) —
 * no raw-body/HMAC verification the way Stripe's webhooks need, since
 * RevenueCat's own scheme is a plain shared-secret Authorization header
 * instead (set as this webhook's "Authorization header value" in the
 * RevenueCat dashboard, Project Settings → Webhooks).
 */
revenueCatWebhookRouter.post(
  '/webhooks/revenuecat',
  asyncHandler(async (req, res) => {
    if (!env.REVENUECAT_WEBHOOK_AUTHORIZATION) {
      // Not configured yet — same "clear 503, not a confusing crash" shape
      // as isStorageConfigured()'s callers elsewhere in this codebase.
      // RevenueCat retries a non-2xx delivery on its own schedule, so this
      // self-heals the moment the env var is actually set, with nothing
      // lost in between.
      res.status(503).json({ error: 'RevenueCat webhook is not configured on this server yet.' });
      return;
    }
    // Constant-shape comparison isn't needed here the way it would be for a
    // signature (this is a single shared string, not a per-request HMAC) —
    // a plain strict equality check against a header only an authorized
    // sender (RevenueCat's own dashboard config) knows is exactly what
    // RevenueCat's own docs specify for this auth model.
    if (req.header('Authorization') !== env.REVENUECAT_WEBHOOK_AUTHORIZATION) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as RevenueCatWebhookEvent;
    const { event } = body;
    if (!event?.app_user_id || !event.product_id || !event.transaction_id) {
      // Malformed payload (or an event type this app doesn't otherwise
      // recognize, like TEST) — ack it anyway so RevenueCat doesn't keep
      // retrying something that will never parse differently.
      res.status(200).json({ received: true, ignored: 'missing required fields' });
      return;
    }

    const isSubscriptionEvent = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION'].includes(
      event.type,
    );
    const isConsumableEvent = event.type === 'NON_RENEWING_PURCHASE';

    if (isSubscriptionEvent || isConsumableEvent) {
      const result = await applyPurchase({
        userId: event.app_user_id,
        productId: event.product_id,
        transactionId: event.transaction_id,
        isSubscription: isSubscriptionEvent,
        expiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : undefined,
      });
      res.status(200).json({ received: true, ...result });
      return;
    }

    if (event.type === 'EXPIRATION') {
      await expireSubscription(event.app_user_id);
      res.status(200).json({ received: true, expired: true });
      return;
    }

    // CANCELLATION (still active until expiry, deliberately a no-op — see
    // expireSubscription's own doc comment), BILLING_ISSUE, TRANSFER, etc.
    // — acknowledged but not acted on yet.
    res.status(200).json({ received: true, ignored: event.type });
  }),
);
