import { Asset } from 'expo-asset';

import { setDeviceWallpaper } from '@/utils/native-media';
import { type CoupleImageSource, getCouplePack, pickImageForState } from './packs';
import { useCoupleStore } from './store';

/**
 * Resolve a pack image source to a URI `setDeviceWallpaper` can read.
 *
 *   string  → a remote URL / file:// / content:// URI — returned as-is.
 *   number  → a bundled `require()` module — materialised on disk via
 *             expo-asset and returned as a `file://` URI. `downloadAsync`
 *             copies the asset out of the APK on first use and is a no-op
 *             once cached, so this is cheap on repeat applies.
 */
export async function resolveCoupleImageUri(src: CoupleImageSource): Promise<string> {
  if (typeof src === 'string') return src;
  const asset = Asset.fromModule(src);
  // On Android, expo-asset can leave a bundled image's `localUri` as the
  // bare drawable RESOURCE NAME (e.g. "assets_couple_pack2together") for
  // RN <Image> backward-compat, and marks the asset `downloaded: true` so
  // `downloadAsync()` short-circuits and never materialises a real file.
  // The native wallpaper setter (BitmapFactory.decodeFile) can't read a
  // resource name — force a real copy when the current localUri isn't
  // actually usable as a file.
  const usable = (u: string | null | undefined): u is string =>
    !!u && (u.startsWith('file://') || u.startsWith('content://') || /^https?:/i.test(u));
  if (!usable(asset.localUri)) {
    asset.downloaded = false;
    asset.localUri = null;
    await asset.downloadAsync();
  }
  return asset.localUri ?? asset.uri;
}

/**
 * Couple proximity → wallpaper apply. Source of truth for "which wallpaper
 * should be on this device" for a couple-linked, role-chosen user:
 *
 *   proximity === 'near'  → the active pack's togetherImage (both phones).
 *   proximity === 'far'   → this device's role-specific solo image.
 *   proximity === 'unknown' OR no pack OR no role → no apply yet.
 *
 * Idempotency: a process-local `lastAppliedKey` short-circuits when the
 * apply target hasn't changed since the last successful write — the store's
 * `proximity` only flips on a real threshold crossing, but a noisy GPS
 * stream could still re-emit the same state on every tick. Without the
 * dedup this would keep re-writing the same image (harmless at the OS
 * level, but wastes battery and can trigger a wallpaper-changed toast on
 * some OEM ROMs).
 */
let lastAppliedKey: string | null = null;
let inFlight = false;

export async function applyProximityWallpaper(): Promise<{ ok: boolean; applied: 'together' | 'solo' | 'none' }> {
  if (inFlight) return { ok: false, applied: 'none' };
  const s = useCoupleStore.getState();
  if (!s.hasPartner) return { ok: false, applied: 'none' };
  if (s.proximity === 'unknown') return { ok: false, applied: 'none' };
  if (!s.myRole) return { ok: false, applied: 'none' };

  const pack = getCouplePack(s.packId);
  const target = pickImageForState(pack, s.myRole, s.proximity === 'near' ? 'near' : 'far');
  const key = `${pack.id}:${s.myRole}:${target.kind}`;
  if (lastAppliedKey === key) return { ok: true, applied: 'none' };

  inFlight = true;
  try {
    const uri = await resolveCoupleImageUri(target.image);
    await setDeviceWallpaper(uri, 'both');
    lastAppliedKey = key;
    return { ok: true, applied: target.kind === 'together' ? 'together' : 'solo' };
  } catch {
    return { ok: false, applied: 'none' };
  } finally {
    inFlight = false;
  }
}

/** Pre-cache every image referenced by the active pack so the apply
 *  succeeds even on a locked screen with Wi-Fi suspended. For bundled
 *  packs this materialises each asset out of the APK onto disk (no-op once
 *  cached); for a future hosted pack it would download into the same cache
 *  `setDeviceWallpaper` reads. Fire-and-forget — called on link / pack swap. */
export async function precacheActiveCouplePack(): Promise<void> {
  const s = useCoupleStore.getState();
  if (!s.hasPartner) return;
  const pack = getCouplePack(s.packId);
  const sources: CoupleImageSource[] = [pack.togetherImage, pack.roleAImage, pack.roleBImage];
  await Promise.all(
    sources.map(async (src) => {
      try {
        await resolveCoupleImageUri(src);
      } catch {
        /* swallow — apply path retries on miss */
      }
    }),
  );
}

/** Test/debug entry — force the next apply to run even if the state hasn't
 *  changed. Used by the dashboard's "Refresh wallpaper" button. */
export function resetWallpaperDedup(): void {
  lastAppliedKey = null;
}
