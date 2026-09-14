/**
 * Thin, honest wrappers around the OS-level photo/media APIs the app uses:
 * pick a photo, save one to the gallery, share one, or set one as the
 * device wallpaper. Every function here either does the real thing or
 * throws/returns null — nothing here fakes success with a hardcoded alert.
 *
 * Screens own the user-facing copy for *unexpected* failures (via
 * try/catch around these calls), since the right wording differs by
 * context (picking an avatar vs. saving a wallpaper). The one exception is
 * a denied permission, which is common enough to every caller that it's
 * handled once, consistently, right here.
 */
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

import { showAlert } from '@/alerts/store';
import WallpaperManager from '../../modules/wallpaper-manager';
import type { WallpaperTarget } from '../../modules/wallpaper-manager';

/**
 * Shared "explain, then optionally send to Settings" flow for a denied
 * permission. Once a user has denied a permission once, the OS stops
 * showing its own prompt (`canAskAgain` becomes `false`) — re-requesting at
 * that point silently no-ops, so the only way forward is the app's own
 * Settings page.
 */
async function explainDeniedPermission(title: string, message: string, canAskAgain: boolean): Promise<void> {
  if (canAskAgain) {
    showAlert(title, message);
    return;
  }
  showAlert(title, `${message} You'll need to enable it from Settings.`, [
    { text: 'Not Now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => void Linking.openSettings() },
  ]);
}

/**
 * Opens the system photo library so the user can pick one image.
 * @param options.freeformCrop When true, the crop step lets the user drag
 * the crop rectangle to any shape instead of locking it to a fixed 3:4
 * ratio — added 2026-09-12, real complaint: the old hardcoded `aspect:
 * [3, 4]` cropped out the lower body/legs on anyone trying to upload a
 * full-body reference photo for the AI generation flow, with no way to
 * choose a taller crop instead. Verified against the installed
 * expo-image-picker's own type declarations (never guess an API, per this
 * repo's rule): `aspect` is Android-only, and omitting it is what enables
 * free-form dragging there — this app has no non-Android target yet, so
 * that's the only platform this actually needs to work on. iOS's crop
 * rectangle is ALWAYS a square regardless of this option (a hard platform
 * limitation of the library itself, not something any config here can
 * change) — worth knowing if iOS is ever targeted, not fixable here.
 * Defaults to false (the original fixed 3:4 crop) so every OTHER caller
 * (profile avatar, onboarding avatar) keeps its exact existing behavior —
 * this is scoped to the one flow that was actually reported broken
 * (UploadSlot's reference-photo picker), not a global crop-behavior change.
 * @returns the picked image's local uri, or `null` if the user cancelled or
 * permission was denied (the denial is already explained to the user here,
 * so callers don't need to show their own message for that case).
 */
export async function pickImageSafely(options?: { freeformCrop?: boolean }): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    await explainDeniedPermission(
      'Photo Access Needed',
      'Amora needs access to your photos to pick one for your wallpaper.',
      permission.canAskAgain,
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    ...(options?.freeformCrop ? {} : { aspect: [3, 4] }),
    quality: 0.9,
  });

  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

/**
 * Saves a local image file to the device's photo gallery.
 * @param localUri a "file://" uri — e.g. from `pickImageSafely` or a
 * `ViewShot` capture. Remote (http/https) uris aren't accepted; download
 * them to a local file first if the source is remote.
 * @returns `true` once the asset has actually been created in the gallery,
 * or `false` if the user denied the permission (already explained here).
 * @throws for any other failure (bad file, OS-level error) — let the caller
 * decide how to phrase that for its own context.
 */
export async function saveImageToGallery(localUri: string): Promise<boolean> {
  // writeOnly: this only ever creates a new asset, never reads the user's
  // existing library — asking for read access too would be an unjustified,
  // unnecessary permission request.
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    await explainDeniedPermission(
      'Photo Library Access Needed',
      'Amora needs permission to save this wallpaper to your gallery.',
      permission.canAskAgain,
    );
    return false;
  }

  await MediaLibrary.Asset.create(localUri);
  return true;
}

/**
 * Opens the system share sheet for a local image file.
 * @param localUri a "file://" uri to share.
 */
export async function shareImage(localUri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    showAlert('Sharing Unavailable', 'Sharing is not supported on this device.');
    return;
  }
  await Sharing.shareAsync(localUri);
}

/**
 * Sets a local image file as the device wallpaper via the local
 * `wallpaper-manager` native module (Android-only — Expo has no built-in
 * API for this OS-level capability; see modules/wallpaper-manager).
 * @param localUri a "file://" uri.
 * @param target which screen(s) to apply it to.
 */
export async function setDeviceWallpaper(localUri: string, target: WallpaperTarget): Promise<void> {
  await WallpaperManager.setWallpaperAsync(localUri, target);
}
