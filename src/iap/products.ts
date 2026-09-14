/**
 * RevenueCat product identifiers this app knows how to sell. Must match, by
 * hand, three separate places that have no shared package to enforce it:
 *   1. The Product ID configured in App Store Connect / Google Play Console
 *   2. That same product's "Identifier" in the RevenueCat dashboard
 *   3. server/src/lib/creditsConfig.ts's REVENUECAT_PRODUCT_MAP keys
 * Changing a value here without updating all three breaks purchases for
 * whichever product's id now disagrees.
 */
export const PRODUCT_IDS = {
  STARTER: 'amora_credits_starter',
  VALUE: 'amora_credits_value',
  MEGA: 'amora_credits_mega',
  PRO_WEEKLY: 'amora_pro_weekly',
  PRO_MONTHLY: 'amora_pro_monthly',
} as const;

/** The RevenueCat Entitlement identifier both subscription products must be
 * attached to in the dashboard — mirrors server's REVENUECAT_ENTITLEMENT_ID. */
export const ENTITLEMENT_ID = 'pro';
