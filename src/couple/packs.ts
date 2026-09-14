/**
 * Couple Packs — the unit of "couple wallpaper" in the proximity feature.
 *
 * A pack is a triptych of three coordinated images:
 *
 *   togetherImage — what BOTH phones show when partners are < threshold m
 *                   apart. The "complete scene" (both people together).
 *   roleAImage    — what shows on the role-'A' phone when apart.
 *   roleBImage    — what shows on the role-'B' phone when apart.
 *
 * The two solo images are designed to compose into the together image —
 * each carries "half of the moment" when you're apart, and the picture
 * completes when you're together.
 *
 * Bundled only, for now: 3 packs shipped as `require()`d assets under
 * assets/couple/ (offline, instant, no hosting dependency). The source
 * feature this was ported from also had 9 more packs hosted on Supabase
 * Storage — not brought over; add them later by uploading to Cloudflare R2
 * and swapping a `require()` here for a URL string (CoupleImageSource
 * already accepts either, so no other code changes).
 */

export type CoupleRole = 'A' | 'B';

/** A bundled `require()` module (number) OR a remote URL string. */
export type CoupleImageSource = number | string;

export type CouplePack = {
  /** Stable id — stored in Couple.packId. */
  id: string;
  name: string;
  blurb: string;
  /** Pack accent colour for borders/highlights on the picker. */
  accent: string;
  togetherImage: CoupleImageSource;
  roleAImage: CoupleImageSource;
  roleBImage: CoupleImageSource;
  roleALabel: string;
  roleBLabel: string;
  roleAEmoji?: string;
  roleBEmoji?: string;
};

const PEACH = '#ffc7a8';
const ROSE = '#f7889b';
const PINK = '#fab3ca';

export const couplePacks: CouplePack[] = [
  {
    id: 'lakeside-picnic',
    name: 'Lakeside Picnic',
    blurb: 'Golden-hour picnic by the lake.',
    accent: PEACH,
    togetherImage: require('../assets/couple/pack1-together.webp'),
    roleAImage: require('../assets/couple/pack1-boy.webp'),
    roleBImage: require('../assets/couple/pack1-girl.webp'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'golden-beach',
    name: 'Golden Beach',
    blurb: 'Barefoot on the shore at sunset.',
    accent: ROSE,
    togetherImage: require('../assets/couple/pack2-together.webp'),
    roleAImage: require('../assets/couple/pack2-boy.webp'),
    roleBImage: require('../assets/couple/pack2-girl.webp'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'valentine-hearts',
    name: 'Valentine Hearts',
    blurb: 'Roses & heart balloons, all romance.',
    accent: PINK,
    togetherImage: require('../assets/couple/pack3-together.webp'),
    roleAImage: require('../assets/couple/pack3-boy.webp'),
    roleBImage: require('../assets/couple/pack3-girl.webp'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
];

/** Pick a pack by id; falls back to the first pack if id is unknown. */
export function getCouplePack(id: string | null): CouplePack {
  if (!id) return couplePacks[0];
  return couplePacks.find((p) => p.id === id) ?? couplePacks[0];
}

/**
 * The real "which pack is active" resolver — prefer this over calling
 * `getCouplePack(packId)` directly anywhere the couple store's custom-pack
 * fields are in scope (wallpaper.ts, the dashboard). A custom pack is a
 * real AI-generated couple session (server/src/routes/couple.ts's
 * PATCH /couple/settings with a `generationId`) rather than one of the 3
 * bundled ones — its images are remote R2 URLs, already resolved and
 * copied onto the shared Couple row server-side specifically so BOTH
 * partners can read them here without either one needing to own or fetch
 * the underlying Generation.
 */
export function resolveActivePack(state: {
  packId: string | null;
  customPackTogetherUrl: string | null;
  customPackAUrl: string | null;
  customPackBUrl: string | null;
}): CouplePack {
  if (state.customPackTogetherUrl && state.customPackAUrl && state.customPackBUrl) {
    return {
      id: state.packId ?? 'custom',
      name: 'Your Fusion',
      blurb: 'Your own AI-generated couple photo.',
      accent: '#fab3ca',
      togetherImage: state.customPackTogetherUrl,
      roleAImage: state.customPackAUrl,
      roleBImage: state.customPackBUrl,
      roleALabel: 'You',
      roleBLabel: 'Partner',
    };
  }
  return getCouplePack(state.packId);
}

/** Pick which image to show given a pack, the user's role, and whether
 *  partners are currently near. The single source of truth for "which file
 *  goes on screen right now." */
export function pickImageForState(
  pack: CouplePack,
  myRole: CoupleRole,
  proximity: 'near' | 'far',
): { image: CoupleImageSource; kind: 'together' | 'solo' } {
  if (proximity === 'near') {
    return { image: pack.togetherImage, kind: 'together' };
  }
  return { image: myRole === 'A' ? pack.roleAImage : pack.roleBImage, kind: 'solo' };
}

/** The solo half for a given role. */
export function soloImageForRole(pack: CouplePack, role: CoupleRole): CoupleImageSource {
  return role === 'A' ? pack.roleAImage : pack.roleBImage;
}

/** Role labels resolved against a pack — the human label for the slot. */
export function labelForRole(pack: CouplePack, role: CoupleRole): string {
  return role === 'A' ? pack.roleALabel : pack.roleBLabel;
}
export function emojiForRole(pack: CouplePack, role: CoupleRole): string | undefined {
  return role === 'A' ? pack.roleAEmoji : pack.roleBEmoji;
}
