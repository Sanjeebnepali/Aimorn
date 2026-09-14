/**
 * Types for the couple-proximity store (`store.ts`). Extracted so the store
 * file holds behaviour and this file holds shape — same split the rest of
 * this app's stores use (see src/onboarding/store.ts).
 *
 * No `code`/`isCreator`/`LinkStatus` here, unlike the feature this was
 * ported from: pairing itself is already handled by onboarding's
 * pairingCode/partnerId (see server/prisma/schema.prisma), so by the time
 * any of this state exists the two accounts are already linked — this store
 * only tracks the proximity-specific state layered on top of that link.
 */
import type { CoupleRole } from '@/utils/api';

export type PartnerProfile = {
  id: string;
  displayName: string | null;
  avatarKey: string | null;
};

export type ProximityState =
  | 'unknown' // no location data yet
  | 'near' // < threshold metres — couple wallpaper active
  | 'far'; // ≥ threshold metres — solo wallpaper active

export type State = {
  hydrated: boolean;
  hasPartner: boolean;
  partner: PartnerProfile | null;
  /** The slot this account holds — null until chosen via the preview screen. */
  myRole: CoupleRole | null;
  /** Mirrored from the server; null until the partner has chosen theirs. */
  partnerRole: CoupleRole | null;
  /** Latest GPS for each side. `null` until that side reports in. */
  myLat: number | null;
  myLng: number | null;
  myUpdatedAt: number | null;
  /** Reported GPS accuracy (metres) of our last fix — drives the dynamic
   *  buffer zone. Null until the first fix or when the OS omits it. */
  myAccuracy: number | null;
  partnerLat: number | null;
  partnerLng: number | null;
  partnerUpdatedAt: number | null;
  /** Partner's reported GPS accuracy (metres), mirrored from the socket. */
  partnerAccuracy: number | null;
  /** Computed by `recomputeDistance()` every time either side reports. */
  partnerDistanceM: number | null;
  proximity: ProximityState;
  /** Matches a CouplePack.id from packs.ts, or a Generation.id when the
   *  active pack is a real AI-generated couple session — see
   *  customPackTogetherUrl below. Either partner can write it. */
  packId: string | null;
  /** Non-null together (and only together) when packId refers to an
   *  AI-generated session rather than one of the 3 bundled packs — see
   *  packs.ts's resolveActivePack, the one place that reads these. */
  customPackTogetherUrl: string | null;
  customPackAUrl: string | null;
  customPackBUrl: string | null;
  /** When true, the location task stops pushing and proximity is forced
   *  'far' — see geo.ts's recomputeDistance. */
  paused: boolean;
  /** Default 100 — see packs.ts / geo.ts's getBufferZone for how this scales
   *  the near/far bands. */
  thresholdM: number;
  /** Last error from a couple action (linking, location, wallpaper).
   *  Cleared by `clearError`. */
  error: string | null;
};

export type Actions = {
  setHydrated: (v: boolean) => void;
  /** Bulk-set from a GET /couple response (hydration, or a socket "linked"/
   *  "role" event) — everything except location, which has its own setters
   *  because they run far more often and recompute distance each time. */
  setCoupleState: (s: {
    hasPartner: boolean;
    partner: PartnerProfile | null;
    myRole: CoupleRole | null;
    partnerRole: CoupleRole | null;
    packId: string | null;
    customPackTogetherUrl: string | null;
    customPackAUrl: string | null;
    customPackBUrl: string | null;
    paused: boolean;
    thresholdM: number;
  }) => void;
  setMyLocation: (lat: number, lng: number, accuracy?: number | null) => void;
  setPartnerLocation: (lat: number, lng: number, updatedAt: number, accuracy?: number | null) => void;
  setSettings: (s: {
    packId?: string | null;
    customPackTogetherUrl?: string | null;
    customPackAUrl?: string | null;
    customPackBUrl?: string | null;
    paused?: boolean;
    thresholdM?: number;
  }) => void;
  setError: (msg: string | null) => void;
  clearError: () => void;
  reset: () => void;
};
