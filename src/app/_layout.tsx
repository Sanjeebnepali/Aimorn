import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import {
  PlayfairDisplay_500Medium_Italic,
  PlayfairDisplay_600SemiBold_Italic,
} from '@expo-google-fonts/playfair-display';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as WebBrowser from 'expo-web-browser';
import { LogBox } from 'react-native';

// Expected in every local/dev run — this project's own .env intentionally
// points at Clerk's test instance (see server docs), so this warning fires
// on literally every cold start with nothing actionable to fix. Left
// un-suppressed it repeatedly reopens LogBox's dismissible notification
// banner, which sits at a fixed screen-bottom position and — confirmed live
// (2026-09-07) — can end up overlapping a real CTA there (onboarding's
// "Continue"), blocking taps on it for as long as the banner keeps
// reappearing. Silencing just this one known-safe message (not
// ignoreAllLogs — a real warning should still surface) removes that
// interference without hiding anything worth seeing.
LogBox.ignoreLogs(['Clerk has been loaded with development keys']);

import { ThemedAlertHost } from '@/components/primitives/themed-alert';
import { PremiumAlertHost } from '@/components/PremiumAlert';
import { bootstrapCoupleFeature, teardownCoupleFeature } from '@/couple/bootstrap';
// Side-effect import — runs i18next.init() (see that file's doc comment)
// before anything below renders. Must be imported somewhere that loads
// before the first screen; the root layout is the earliest app-owned module.
import '@/i18n';
import { useHasCompletedOnboarding } from '@/onboarding/store';

SplashScreen.preventAutoHideAsync();

// Resolves the pending browser tab from a Google OAuth redirect back into a
// result the calling `await` can see, on both cold start (app was closed
// during the redirect) and warm resume. A no-op on any other launch.
WebBrowser.maybeCompleteAuthSession();

// Client-side config vars are inlined into the JS bundle at build time (see
// .env.example) rather than read from process.env at runtime, so this must
// be read at module scope, not inside the component. Thrown here — instead
// of silently rendering a broken app — for the same "fail fast and loud"
// reason server/src/env.ts validates its own env vars before boot. The `!`
// is safe specifically because of that throw: TS can't see across the
// RootLayout closure below that the check already ran, so it still widens
// the type to `string | undefined` without it.
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
if (!clerkPublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Copy .env.example to .env and fill in your Clerk publishable key.',
  );
}

/**
 * Split out from RootLayout because useAuth()/useHasCompletedOnboarding()
 * need to run *inside* <ClerkProvider>, not in the component that renders
 * it — a component can't consume a context provider it's also returning.
 */
function RootNavigator() {
  const { isSignedIn, userId } = useAuth();
  const hasOnboarded = useHasCompletedOnboarding(userId);
  // `isSignedIn` is `undefined` for one tick while Clerk resolves a cached
  // session — treated as "don't force onboarding yet" so a returning user
  // never sees an onboarding flash before that resolves.
  const needsOnboarding = isSignedIn === true && !hasOnboarded;

  // Couple-proximity's own hydration/socket/location wiring — gated on a
  // real signed-in user id rather than plain isSignedIn so a sign-out then
  // a different account signing in re-bootstraps for the new user instead
  // of silently keeping the previous one's state.
  useEffect(() => {
    if (isSignedIn && userId) {
      void bootstrapCoupleFeature(userId);
    } else if (isSignedIn === false) {
      void teardownCoupleFeature();
    }
  }, [isSignedIn, userId]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!needsOnboarding}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding/index" />
      </Stack.Protected>
      <Stack.Screen name="loading" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="result/[id]" options={{ presentation: 'fullScreenModal' }} />
      {/* Was `fullScreenModal` — confirmed live (2026-09-07) that on this
       * Android setup, a screen's own StyleSheet.absoluteFill content (the
       * template photo, at this screen's z-index 0) never got a resolved
       * size under that presentation and just showed its plain background
       * color, even though normal-flow siblings (text, buttons) in the SAME
       * tree rendered fine. `auth/index` (plain `modal`) never showed this;
       * plain pushed screens (couple/setup, gallery, profile, all tested
       * live and correct) never showed it either — only this fullScreenModal
       * case did. Dropping to the default push presentation (this screen
       * doesn't actually need modal chrome — it already draws its own back
       * button) fixed it. */}
      <Stack.Screen name="template/[id]" />
      <Stack.Screen name="auth/index" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    PlayfairDisplay_500Medium_Italic,
    PlayfairDisplay_600SemiBold_Italic,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  // Amora is dark-only by design (5 dark theme variants, no light mode), so
  // the native chrome (status bar, header defaults) is always forced dark
  // regardless of the device's system appearance setting.
  return (
    // Wraps everything — every screen that reads auth state (the auth modal,
    // profile, and eventually anything gating a generation on sign-in) needs
    // to sit inside this provider, and there's only one root layout to mount
    // it at. tokenCache persists the session token in expo-secure-store
    // (encrypted) instead of Clerk's in-memory default, so a signed-in user
    // stays signed in across app restarts.
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider value={DarkTheme}>
          <RootNavigator />
          {/* Single global host for every themed alert — see src/alerts/store.ts.
           * Lives above the Stack so it overlays whichever screen is active. */}
          <ThemedAlertHost />
          {/* Same idea, separate (newer) API — see components/PremiumAlert.tsx.
           * Confirmed live (2026-09-08): this was never mounted anywhere, so
           * every premiumAlert() call (couple dashboard's "..." menu, Unlink)
           * silently no-op'd — the button's onPress fired fine, the call just
           * had no host to show anything on. */}
          <PremiumAlertHost />
        </ThemeProvider>
      </GestureHandlerRootView>
    </ClerkProvider>
  );
}
