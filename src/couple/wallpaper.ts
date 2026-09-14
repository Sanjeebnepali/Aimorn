import { Asset } from 'expo-asset';

import { setDeviceWallpaper } from '@/utils/native-media';
import { type CoupleImageSource, pickImageForState, resolveActivePack } from './packs';
import { useCoupleStore } from './store';

/**
 * Resolve a pack image source to a real LOCAL file:// uri `setDeviceWallpaper`
 * can actually read.
 *
 * This used to treat an http(s) string as already "usable" and hand it
 * straight to setDeviceWallpaper. That was wrong, confirmed against the real
 * native module it feeds (modules/wallpaper-manager's
 * WallpaperManagerModule.kt): it calls `BitmapFactory.decodeFile()` on the
 * URI's bare PATH COMPONENT — for `https://host/results/x.png` that's just
 * `/results/x.png`, a path that doesn't exist on the device's filesystem at
 * all. It throws `WallpaperDecodeException` immediately rather than
 * silently misbehaving, but the couple-pack feature would still fail the
 * moment it tried to actually apply a real AI-generated pack's remote R2
 * URL (bundled packs never hit this path — they're all local `require()`
 * assets, which is exactly why nothing caught this until a real URL
 * existed to test against). Confirmed live 2026-09-10.
 *
 *   http(s) string           → downloaded via expo-asset's `Asset.fromURI`,
 *                              same caching mechanism the bundled-asset
 *                              branch below already relies on.
 *   file:// / content:// string → already local, returned as-is.
 *   number (bundled `require()`) → materialised on disk via expo-asset;
 *                              download is a no-op once cached.
 */
export async function resolveCoupleImageUri(src: CoupleImageSource): Promise<string> {
  if (typeof src === 'string') {
    if (/^https?:/i.test(src)) {
      const asset = Asset.fromURI(src);
      if (!asset.localUri) await asset.downloadAsync();
      if (!asset.localUri) throw new Error(`Could not download wallpaper image: ${src}`);
      return asset.localUri;
    }
    return src;
  }
  const asset = Asset.fromModule(src);
  // On Android, expo-asset can leave a bundled image's `localUri` as the
  // bare drawable RESOURCE NAME (e.g. "assets_couple_pack2together") for
  // RN <Image> backward-compat — or, talking to a dev-client's Metro
  // server, as an `http://<metro-ip>:8081/...` URL. Neither is a real local
  // path BitmapFactory can decode (see this function's doc comment above —
  // the old `usable()` check here wrongly accepted the http(s) case too).
  // Force a real copy whenever the current localUri isn't an actual
  // file/content path.
  const usable = (u: string | null | undefined): u is string =>
    !!u && (u.startsWith('file://') || u.startsWith('content://'));
  if (!usable(asset.localUri)) {
    asset.downloaded = false;
    asset.localUri = null;
    await asset.downloadAsync();
  }
  if (!usable(asset.localUri)) throw new Error(`Could not materialise bundled wallpaper asset: ${asset.uri}`);
  return asset.localUri;
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

  const pack = resolveActivePack(s);
  const target = pickImageForState(pack, s.myRole, s.proximity === 'near' ? 'near' : 'far');
  // Includes `target.image` itself, not just the pack id — a custom pack's
  // image URL can change (generationsRegenerate.ts overwrites one slot's
  // bytes at the SAME R2 key, so `pack.id` — really the generation id —
  // stays identical; only the cache-busted URL string differs, see
  // storage.ts's publicUrlForBusted) while `pack.id`/role/kind all stay
  // exactly as they were. Deduping on those three alone (as this used to)
  // meant a regenerated image, even once correctly pushed all the way into
  // this store's customPack*Url fields, was STILL silently treated as "no
  // change" here and never actually re-downloaded/re-applied.
  const key = `${pack.id}:${s.myRole}:${target.kind}:${target.image}`;
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
  const pack = resolveActivePack(s);
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
