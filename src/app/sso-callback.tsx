import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { GradientScreen } from '@/components/primitives/gradient-screen';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * Real route for Clerk's Google/Apple OAuth redirect (`amora://sso-callback`
 * — see auth/index.tsx's handleSocialAuth, which builds that exact
 * redirectUrl). This file didn't exist before — auth/index.tsx's own old
 * comment claimed "`sso-callback` doesn't need to be a real route, Clerk's
 * own SDK consumes the redirect before expo-router ever sees it navigate."
 * Confirmed live 2026-09-16 that's wrong on this Android setup: the OS hands
 * the redirect to the app as a real deep link, `expo-web-browser`'s pending
 * auth-session listener and Expo Router's own linking handler both react to
 * it independently, and with no matching route Expo Router showed its
 * built-in "Unmatched Route" error screen — for a real signed-in user
 * (`created_session_id` present in the URL), not a failure case. It
 * self-corrected a second later once `handleSocialAuth`'s own in-memory
 * `startSSOFlow()` promise resolved and navigated away, but a user seeing a
 * flashed "Page could not be found" error during an otherwise-successful
 * sign-in reads as the app being broken.
 *
 * This screen exists purely to give Expo Router a real match for that
 * moment — a plain loading spinner instead of the error page — while the
 * SAME `startSSOFlow()` call already in flight back in auth/index.tsx does
 * the actual session pickup and navigates on to Home/onboarding. Calling
 * `maybeCompleteAuthSession()` again here (RootLayout already calls it once
 * at module scope on boot, too early to catch THIS specific redirect) is
 * what Clerk's own Expo docs show for this exact file — closes the
 * in-app-browser tab if anything's still listening for it.
 */
export default function SSOCallback() {
  const theme = useAppTheme();

  useEffect(() => {
    void WebBrowser.maybeCompleteAuthSession();
  }, []);

  return (
    <GradientScreen dim style={styles.center}>
      <ActivityIndicator color={theme.accent1} size="large" />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
