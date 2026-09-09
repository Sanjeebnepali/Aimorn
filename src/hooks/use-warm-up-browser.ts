import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';

/**
 * Pre-warms the device browser process the moment a screen that offers OAuth
 * mounts, instead of only at tap-time. Android's first Custom Tab launch
 * after a cold start has a visible delay before the Google sign-in page
 * appears — warming it early hides that behind the screen's own entrance
 * animation. iOS has no such warm-up step, so both calls are just a no-op
 * there. See https://docs.expo.dev/guides/authentication/#improving-user-experience.
 */
export function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}
