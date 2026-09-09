/**
 * Couple Premium gate — ported as an inert stub, per the scoped decision for
 * this feature: Amora has no billing/entitlements infrastructure at all
 * today (no Stripe/RevenueCat, no purchases table — `User.credits` in
 * server/prisma/schema.prisma is explicitly "a placeholder economy, not a
 * real purchases/ledger system yet"), so there's nothing real to gate
 * against. The source feature this was ported from has the equivalent flag
 * (`SUBSCRIPTIONS_ENABLED`) OFF by default for the same reason.
 *
 * This exists purely as the code-level seam: flipping `ENABLED` to `true`
 * and wiring `hasCouplePremium()` to a real entitlement check is a one-line
 * change wherever a real purchase flow gets built, without touching the
 * call site in preview.tsx. Deliberately NOT paired with a visible "Premium"
 * lock badge anywhere — a badge that can never actually lock anything is
 * chrome with no function, not real scaffolding.
 */
const ENABLED = false;

export function hasCouplePremium(): boolean {
  return !ENABLED;
}
