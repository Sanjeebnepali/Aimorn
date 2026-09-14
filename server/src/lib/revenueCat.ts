import { env } from '../env.js';
import { db } from './db.js';
import {
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  REVENUECAT_PRODUCT_MAP,
  type RevenueCatProductId,
} from './creditsConfig.js';

/**
 * Shared RevenueCat purchase-application logic — the ONE place both
 * routes/revenueCatWebhook.ts (server-to-server, authoritative but can lag
 * seconds behind a real purchase) and routes/iapSync.ts (client-triggered,
 * immediate, right after `Purchases.purchasePackage()` resolves) funnel
 * through, so a real purchase is granted exactly once no matter which path
 * gets there first — see schema.prisma's ProcessedPurchase doc comment for
 * why that's not automatic.
 */

export function isRevenueCatConfigured(): boolean {
  return !!env.REVENUECAT_SECRET_API_KEY;
}

/**
 * Applies one already-verified RevenueCat purchase/renewal to a user's
 * balance — idempotent via ProcessedPurchase's unique `transactionId`.
 * Returns the credits actually granted (0 if this transactionId was already
 * processed, so a caller can tell "real grant" from "no-op replay" without
 * a separate lookup).
 *
 * Deliberately takes already-parsed, already-authenticated fields rather
 * than a raw RevenueCat payload — the two callers get those fields from
 * very different shapes (a webhook event vs. the GET /subscribers REST
 * response), and reconciling that here would make this function trust
 * whichever shape it was written against first.
 */
export async function applyPurchase(params: {
  userId: string;
  productId: string;
  transactionId: string;
  /** True for a subscription (auto-renewing) purchase/renewal; false for a
   * one-time consumable credit pack. Determines whether this call also
   * updates subscriptionTier/subscriptionExpiresAt or just tops up credits. */
  isSubscription: boolean;
  /** Only meaningful when isSubscription is true — RevenueCat's own
   * `expires_date`/`expiration_at_ms` for this period, so our own
   * subscriptionExpiresAt matches what Apple/Google actually billed for
   * rather than us re-deriving it from "now + durationDays" and drifting
   * out of sync with a plan change, a billing retry, or a store-granted
   * grace period. */
  expiresAt?: Date;
}): Promise<{ creditsGranted: number; alreadyProcessed: boolean }> {
  const mapping = REVENUECAT_PRODUCT_MAP[params.productId as RevenueCatProductId] as
    | (typeof REVENUECAT_PRODUCT_MAP)[RevenueCatProductId]
    | undefined;
  if (!mapping) {
    // An unrecognized product id (a store product that exists but was never
    // added to REVENUECAT_PRODUCT_MAP, or a stale/renamed one) — log and
    // no-op rather than throw, so one bad/unmapped event can't take the
    // whole webhook handler down for every OTHER user's real purchase in
    // the same delivery batch.
    console.error(`RevenueCat: unrecognized product id "${params.productId}" — not in REVENUECAT_PRODUCT_MAP`);
    return { creditsGranted: 0, alreadyProcessed: false };
  }

  const credits =
    mapping.kind === 'consumable' ? CREDIT_PACKS[mapping.pack].credits : SUBSCRIPTION_PLANS[mapping.plan].credits;

  try {
    // The INSERT is the actual idempotency check — its unique constraint on
    // transactionId is what atomically rejects a second attempt at the same
    // purchase, even under a genuine race between the webhook and the
    // client's own /iap/sync call both landing at once. A prior SELECT
    // would only narrow the race window, not close it.
    await db.processedPurchase.create({
      data: {
        transactionId: params.transactionId,
        userId: params.userId,
        productId: params.productId,
        creditsGranted: credits,
      },
    });
  } catch (err) {
    const isUniqueConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
    if (isUniqueConflict) {
      return { creditsGranted: 0, alreadyProcessed: true };
    }
    throw err;
  }

  await db.user.update({
    where: { id: params.userId },
    data: {
      credits: { increment: credits },
      ...(params.isSubscription
        ? {
            subscriptionTier: 'PRO' as const,
            subscriptionExpiresAt: params.expiresAt,
          }
        : {}),
    },
  });

  return { creditsGranted: credits, alreadyProcessed: false };
}

/**
 * Downgrades a user back to FREE — called on RevenueCat's EXPIRATION event
 * (the subscription actually lapsed, not just "user cancelled auto-renew
 * but is still inside the period they already paid for", which RevenueCat
 * reports separately as CANCELLATION and which this deliberately does NOT
 * act on: a cancelled-but-not-yet-expired subscriber should keep their
 * access until subscriptionExpiresAt, same as Apple/Google's own behavior).
 */
export async function expireSubscription(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { subscriptionTier: 'FREE' },
  });
}

/**
 * Fetches a user's authoritative purchase/entitlement state directly from
 * RevenueCat's own REST API — used by routes/iapSync.ts right after a
 * client-side purchase, instead of trusting whatever the client itself
 * reports its own CustomerInfo to be (a compromised or modified client
 * could claim any entitlement it likes; RevenueCat's server answer can't be
 * spoofed that way). Requires REVENUECAT_SECRET_API_KEY.
 */
export async function fetchSubscriberFromRevenueCat(userId: string): Promise<RevenueCatSubscriber> {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}` },
  });
  if (!response.ok) {
    throw new Error(`RevenueCat subscriber lookup failed (${response.status})`);
  }
  const body = (await response.json()) as { subscriber: RevenueCatSubscriber };
  return body.subscriber;
}

/** The subset of RevenueCat's GET /subscribers response this app actually
 * reads — see https://www.revenuecat.com/docs/api-v1#tag/subscribers for
 * the full shape. */
export type RevenueCatSubscriber = {
  subscriptions: Record<string, { expires_date: string | null; original_transaction_id: string }>;
  non_subscriptions: Record<string, { id: string; purchase_date: string }[]>;
};
