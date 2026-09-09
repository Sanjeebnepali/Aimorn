import { Stack } from 'expo-router';

/** Nested stack so Template / Generate-from-Template push within the Generate
 * tab while the outer floating tab bar (rendered by (tabs)/_layout) stays put. */
export default function GenerateStackLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
