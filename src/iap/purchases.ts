import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

/**
 * Thin wrapper around the RevenueCat SDK's own module-level singleton — kept
 * as its own module (not called straight from _layout.tsx) so every other
 * file that needs a purchase (paywall-modal.tsx) imports one place, and so
 * `configured` below is the single flag deciding whether any of this ran at
 * all, for a dev/local build with no API key set yet.
 */

// Client-side, EXPO_PUBLIC_-prefixed and inlined into the bundle, same as
// EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (see .env.example) — a RevenueCat
// PUBLIC SDK key is meant to ship in client code, unlike the secret key
// server/src/env.ts's REVENUECAT_SECRET_API_KEY reads (never put that one
// here). Two separate keys because RevenueCat issues one per platform.
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

let configured = false;

/** Whether `configurePurchases()` actually turned the SDK on — checked by
 * paywall-modal.tsx before calling anything else here, so a build with no
 * RevenueCat key set yet shows "purchases unavailable" instead of throwing
 * on every SDK call (the same "fail soft, not hard, on missing optional
 * config" shape as the server's isStorageConfigured()/isRevenueCatConfigured()). */
export function isPurchasesConfigured(): boolean {
  return configured;
}

/**
 * Boots the RevenueCat SDK — called once from RootLayout (src/app/_layout.tsx)
 * on cold start, before any sign-in state is known. Deliberately NOT where
 * `Purchases.logIn()` happens (see loginPurchases below): configure() sets
 * up the SDK itself, logIn() attaches it to a specific known user, and the
 * two need to happen at different points in the app's own lifecycle.
 */
export function configurePurchases(): void {
  if (configured) return;
  const apiKey = Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
  if (!apiKey) {
    // Expected on a local/dev build before real keys exist yet — every
    // caller below checks isPurchasesConfigured() first rather than this
    // throwing partway through app boot.
    console.warn(`RevenueCat: no ${Platform.OS} API key set (EXPO_PUBLIC_REVENUECAT_${Platform.OS.toUpperCase()}_API_KEY) — purchases disabled.`);
    return;
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  configured = true;
}

/**
 * Attaches the SDK to this Clerk user's id, called from RootLayout's own
 * auth-state effect (alongside bootstrapCoupleFeature) the moment `userId`
 * is known. Using the SAME id RevenueCat calls `app_user_id` is what lets
 * the server's webhook (routes/revenueCatWebhook.ts) and sync route
 * (routes/iapSync.ts) credit the right account with zero extra identity-
 * mapping table — RevenueCat's `app_user_id` on every event already IS this
 * app's own user id.
 */
export async function loginPurchases(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    // Best-effort — a failed logIn leaves the SDK on its own anonymous id,
    // which still lets Purchases.getOfferings()/purchasePackage() work for
    // browsing/buying; it just means this device's purchase won't
    // automatically resolve to the signed-in account until the next
    // successful logIn (e.g. app restart). Not worth crashing app boot over.
    console.warn('RevenueCat logIn failed:', err);
  }
}

/** Called on sign-out (RootLayout's teardown branch) so the NEXT person to
 * sign in on this device doesn't inherit the previous user's RevenueCat
 * identity/purchase history. */
export async function logoutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    // Guard with isAnonymous() first — RootLayout's teardown effect fires
    // on every cold boot that resolves `isSignedIn === false` (a fresh
    // install, or any launch before ever signing in), not just a real
    // sign-out of a previously logged-in RevenueCat identity. Calling
    // logOut() unconditionally there hit the SDK's own "Called logOut but
    // the current user is anonymous" warning on literally every one of
    // those boots — confirmed live 2026-09-16, it's not just a console
    // line: Expo's LogBox notification banner it triggers sits fixed at
    // the bottom of the screen and overlaps the real tab bar, blocking
    // taps on it for as long as the banner stays up (same interference
    // class as this file's neighbor _layout.tsx already silences for a
    // known Clerk dev-key warning).
    if (await Purchases.isAnonymous()) return;
    await Purchases.logOut();
  } catch {
    // Same reasoning as loginPurchases — non-fatal either way.
  }
}
