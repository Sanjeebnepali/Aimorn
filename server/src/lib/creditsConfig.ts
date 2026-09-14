/**
 * Shared monetization constants — pulled out of routes/creditsRoutes.ts so
 * routes/profile.ts's toProfileJson (which needs TRIAL_ADS_REQUIRED to shape
 * its response) can read them without importing the routes file itself and
 * creating a circular profile.ts <-> creditsRoutes.ts dependency.
 *
 * Rewritten 2026-09-13 for global launch — the previous version priced
 * everything in Korean Won (₩1,000 packs, ₩90/credit) with no real cost
 * basis attached, which quietly sold credits BELOW what they actually cost:
 * ₩1,000 for 17 credits is ₩58.8/credit (~$0.043), but a delivered credit's
 * real API cost (below) is closer to $0.10 — every Starter Pack sold was a
 * loss before Apple/Google's own cut. USD is the base currency now (a real
 * global launch needs App Store/Play Store per-territory pricing via actual
 * IAP products, which isn't wired up yet — see paywall-modal.tsx's own
 * footer note — so USD is the honest single reference price until then,
 * not a claim that every region should be charged literal USD).
 *
 * Real cost basis, verified against Google's published pricing (Sept 2026):
 * gemini-3.1-flash-image (the exact model NanoBananaProvider calls) is
 * $0.067 per 1K-resolution image. A delivered "credit" also carries the
 * output-quality checker's own cheap vision call (outputQuality.ts) plus
 * this pipeline's retry-on-failure logic (assessGenerationOutput firing a
 * second paid generation call on roughly a third of jobs, historically) —
 * so ~$0.10/credit is the realistic blended cost, not just the raw
 * per-image API price. A templated COUPLE "Together" shot costs roughly
 * double that: generateTogetherPart's 2-step face-swap + composite
 * (generationParts.ts) is 2 raw model calls for one delivered image.
 *
 * These are still a MODELED estimate, not verified against real ad-network
 * eCPM or App Store/Play Store commission data — re-tune once real billing
 * and an ad SDK are actually integrated (nothing here charges a card or
 * plays a real ad yet).
 */
export const ESTIMATED_COST_PER_CREDIT_USD = 0.10;
export const ESTIMATED_COST_PER_TOGETHER_CREDIT_USD = 0.18;

/** Assumed store commission for pricing math below — 15%, not the 30%
 * headline rate, because Apple's and Google's Small Business Program (both
 * one-time and subscription purchases) drops to 15% for any developer under
 * $1M/year in that store, which is the realistic bracket for a new global
 * launch. Only used in the doc-comment math on each price below, not read
 * anywhere at runtime — there's no real store integration yet to apply it to. */
export const ASSUMED_STORE_COMMISSION = 0.15;

/**
 * Rewarded-ad credits (POST /profile/ad-reward). Previously 1 ad = 1 credit,
 * uncapped in ratio (only a daily COUNT cap existed) — at a realistic
 * blended global rewarded-video eCPM (~$5-12, i.e. ~$0.005-0.012 per view),
 * one ad view earns roughly a TENTH of what a credit actually costs
 * ($0.10), so giving a full credit per ad was a guaranteed, uncapped-per-ad
 * loss. Moving to 2 ads per credit doesn't make the mechanic self-funding
 * (it still isn't, and realistically can't be at rewarded-video rates) —
 * it halves the subsidy while staying well short of "too many ads like
 * other apps": still just two short optional videos, never a forced
 * interstitial. Ad-supported free credits are a retention/re-engagement
 * hook by design, not the profit center — real margin comes from the
 * packs/subscriptions below; this constant just keeps the hook from
 * bleeding faster than it needs to.
 */
export const AD_WATCHES_PER_CREDIT = 2;
/** Daily cap on ad WATCHES (not credits) — 6 watches × 1 credit per
 * AD_WATCHES_PER_CREDIT caps a single day's ad-funded credits at 3, down
 * from the previous model's 5, while still being an even multiple so a
 * user is never left with an "almost earned" watch stranded at reset. */
export const DAILY_AD_REWARD_CAP = 6;

/** Ads required to unlock the one-time 3-day free trial (POST
 * /profile/trial/watch-ad). Deliberately NOT sized to the ratio above —
 * this is a one-time acquisition/conversion funnel (get a new user hooked
 * enough to subscribe before it expires), not a repeatable reward, so it's
 * fine for it to run at a real loss on paper: TRIAL_CREDITS(12) × the
 * ~$0.10/credit cost above is a ~$1.20 cost funded by only 5 ad views'
 * worth of real revenue (maybe $0.03-0.06) — the gap is the intended,
 * bounded (once-per-account, ever) cost of the funnel, not an oversight. */
export const TRIAL_ADS_REQUIRED = 5;
export const TRIAL_DURATION_DAYS = 3;
export const TRIAL_CREDITS = 12;

/** Free daily check-in reward — halved from 2 to 1 credit. At $0.10/credit
 * this is still a real, uncapped-by-purchase cost for every daily-active
 * free user (2/day was a ~$0.20/day-per-user liability with nothing
 * recouping it); 1/day keeps the login-streak habit hook while halving
 * that leak. */
export const DAILY_CHECKIN_CREDITS = 1;

/**
 * Consumable credit packs (POST /profile/buy-credits). Priced so post-
 * commission revenue (list × (1 - ASSUMED_STORE_COMMISSION)) clears
 * ESTIMATED_COST_PER_CREDIT_USD with real margin on the entry pack, and
 * still stays profitable (thinner % margin, but positive) on the bulk
 * packs — the standard shape for a consumable pack ladder: smaller packs
 * carry the healthiest per-unit margin, bigger ones win on absolute
 * revenue per purchase rather than per-credit rate.
 *   STARTER: 20 credits, $3.99 → $0.1995/credit list, $0.1696 post-cut
 *            (~70% margin over cost)
 *   VALUE:   60 credits, $9.99 → $0.1665/credit list, $0.1415 post-cut
 *            (~42% margin)
 *   MEGA:   150 credits, $19.99 → $0.1333/credit list, $0.1133 post-cut
 *            (~13% margin — thin per-credit, but $3/pack absolute profit,
 *            and this tier is aimed at users who'd otherwise subscribe)
 */
export const CREDIT_PACKS = {
  STARTER: { credits: 20, priceUsd: 3.99 },
  VALUE: { credits: 60, priceUsd: 9.99 },
  MEGA: { credits: 150, priceUsd: 19.99 },
} as const;

/**
 * Subscription tiers (POST /profile/subscribe). Sized so even WORST-CASE
 * full usage (every credit in the allotment actually spent) still clears
 * cost after the assumed store commission — real subscribers typically use
 * well under their full allotment, so realized margin in practice should
 * run meaningfully above the worst-case numbers below. Also funds the
 * "Couple Share Bonus" (one subscription's credit pool covers both linked
 * partners, see generations.ts/generationsRegenerate.ts's payer resolution)
 * — that's still just this same shared pool, not doubled credits, so it
 * doesn't change the worst-case math, only who can draw from it.
 *   WEEKLY:  40 credits/wk, $4.99/wk  → worst-case cost $4.00, post-cut
 *            revenue $4.24 (~6% margin worst-case)
 *   MONTHLY: 100 credits/mo, $12.99/mo → worst-case cost $10.00, post-cut
 *            revenue $11.04 (~10% margin worst-case)
 */
export const SUBSCRIPTION_PLANS = {
  PRO_WEEKLY: { credits: 40, priceUsd: 4.99, durationDays: 7 },
  PRO_MONTHLY: { credits: 100, priceUsd: 12.99, durationDays: 30 },
} as const;

/**
 * RevenueCat product identifiers — these EXACT strings must be the Product
 * ID configured in App Store Connect / Google Play Console AND the
 * "Identifier" of the matching Product in the RevenueCat dashboard. This
 * object is the one place that mapping lives; src/lib/revenueCat.ts reads
 * it to turn a webhook/sync's `product_id` back into "how many credits,
 * which plan" without a second copy of the numbers to drift out of sync
 * with CREDIT_PACKS/SUBSCRIPTION_PLANS above.
 *
 * `entitlementId` is the RevenueCat Entitlement (not product) identifier
 * that both amora_pro_weekly and amora_pro_monthly must be attached to in
 * the dashboard — the client checks `customerInfo.entitlements.active['pro']`
 * to decide "is this device's user currently Pro," independent of which of
 * the two plans they're on.
 */
export const REVENUECAT_ENTITLEMENT_ID = 'pro';

export const REVENUECAT_PRODUCT_MAP = {
  amora_credits_starter: { kind: 'consumable', pack: 'STARTER' },
  amora_credits_value: { kind: 'consumable', pack: 'VALUE' },
  amora_credits_mega: { kind: 'consumable', pack: 'MEGA' },
  amora_pro_weekly: { kind: 'subscription', plan: 'PRO_WEEKLY' },
  amora_pro_monthly: { kind: 'subscription', plan: 'PRO_MONTHLY' },
} as const satisfies Record<
  string,
  { kind: 'consumable'; pack: keyof typeof CREDIT_PACKS } | { kind: 'subscription'; plan: keyof typeof SUBSCRIPTION_PLANS }
>;

export type RevenueCatProductId = keyof typeof REVENUECAT_PRODUCT_MAP;
