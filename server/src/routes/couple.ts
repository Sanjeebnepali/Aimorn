import { Router } from 'express';
import { z } from 'zod';

import { generatePairingCode } from '../lib/codes.js';
import { db } from '../lib/db.js';
import { requireUser } from '../middleware/requireUser.js';
import { sendToUser } from '../realtime/coupleSocket.js';
import { publicUrlForBusted } from '../lib/storage.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const coupleRouter = Router();

// ─── Shared shape ───────────────────────────────────────────────────────

const PARTNER_SELECT = {
  id: true,
  displayName: true,
  avatarKey: true,
  coupleId: true,
  coupleRole: true,
} as const;

type PartnerRow = {
  id: string;
  displayName: string | null;
  avatarKey: string | null;
  coupleId: string | null;
  coupleRole: 'A' | 'B' | null;
};

/**
 * `User.partnerId` is single-sided (see the schema comment on it): only the
 * account that REDEEMED a pairing code has a real `partnerId` column value —
 * the sharer's own `partnerId` stays null, and Prisma resolves their side of
 * the link through the virtual `partnerOf` reverse relation instead. Every
 * handler below needs "my partner" regardless of which side I am, so this is
 * the one place that reads both and picks whichever is non-null.
 */
function resolvePartner(me: { partner: PartnerRow | null; partnerOf: PartnerRow | null }): PartnerRow | null {
  return me.partner ?? me.partnerOf ?? null;
}

async function loadWithPartner(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      partnerId: true,
      coupleId: true,
      coupleRole: true,
      partner: { select: PARTNER_SELECT },
      partnerOf: { select: PARTNER_SELECT },
    },
  });
}

// ─── Read ───────────────────────────────────────────────────────────────

/**
 * Full couple-proximity state for the caller. Deliberately withholds the
 * partner's location while the couple is paused — the same server-side
 * defence-in-depth the original Supabase RLS policy had (a killed app whose
 * background task is the only thing still running shouldn't be able to read
 * a position once sharing is off), just as a plain `if` instead of a policy.
 */
coupleRouter.get('/couple', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const me = await loadWithPartner(userId);
  const partner = resolvePartner(me);

  if (!partner) {
    res.json({
      hasPartner: false,
      partner: null,
      myRole: null,
      partnerRole: null,
      packId: null,
      customPackTogetherUrl: null,
      customPackAUrl: null,
      customPackBUrl: null,
      paused: false,
      thresholdM: 100,
      partnerLocation: null,
    });
    return;
  }

  const coupleId = me.coupleId ?? partner.coupleId ?? null;
  const couple = coupleId ? await db.couple.findUnique({ where: { id: coupleId } }) : null;

  const partnerLocation =
    couple && !couple.paused ? await db.coupleLocation.findUnique({ where: { userId: partner.id } }) : null;

  res.json({
    hasPartner: true,
    partner: { id: partner.id, displayName: partner.displayName, avatarKey: partner.avatarKey },
    myRole: me.coupleRole,
    partnerRole: partner.coupleRole,
    packId: couple?.packId ?? null,
    customPackTogetherUrl: couple?.customPackTogetherUrl ?? null,
    customPackAUrl: couple?.customPackAUrl ?? null,
    customPackBUrl: couple?.customPackBUrl ?? null,
    paused: couple?.paused ?? false,
    thresholdM: couple?.thresholdM ?? 100,
    partnerLocation: partnerLocation
      ? {
          lat: partnerLocation.lat,
          lng: partnerLocation.lng,
          accuracyM: partnerLocation.accuracyM,
          updatedAt: partnerLocation.updatedAt.toISOString(),
        }
      : null,
  });
}));

// ─── Role + pack + settings ───────────────────────────────────────────────

const roleSchema = z.object({ role: z.enum(['A', 'B']) });

/**
 * Pick (or switch) my wallpaper-pack slot. Creates the shared `Couple` row
 * on the first call from either side of the pair; the second side's call
 * joins that same row (found via either partner's `coupleId`) instead of
 * creating a second one. Picking the slot the partner already holds is
 * rejected — mirrors the source feature's ROLE_TAKEN rule, just as an
 * ordinary 409 instead of a Postgres exception.
 */
coupleRouter.patch('/couple/role', requireUser, asyncHandler(async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const me = await loadWithPartner(userId);
  const partner = resolvePartner(me);
  if (!partner) {
    res.status(400).json({ error: 'Pair with a partner first.' });
    return;
  }
  if (partner.coupleRole === parsed.data.role) {
    res.status(409).json({ error: 'Your partner already chose that side — pick the other one.' });
    return;
  }

  const coupleId = me.coupleId ?? partner.coupleId ?? (await db.couple.create({ data: {} })).id;

  const updated = await db.user.update({
    where: { id: userId },
    data: { coupleId, coupleRole: parsed.data.role },
  });

  sendToUser(partner.id, { type: 'role', myRole: partner.coupleRole, partnerRole: parsed.data.role });
  res.json({ myRole: updated.coupleRole, coupleId });
}));

const settingsSchema = z.object({
  packId: z.string().min(1).nullable().optional(),
  // Switches the active pack to a real AI-generated couple session instead
  // of one of the 3 bundled packs in src/couple/packs.ts. A plain string
  // (not just relying on `packId` alone) because picking one needs a
  // server-side lookup+copy step `packId` alone doesn't (see below) —
  // `null` explicitly clears back to a bundled pack.
  generationId: z.string().min(1).nullable().optional(),
  paused: z.boolean().optional(),
  thresholdM: z.number().int().min(10).max(2000).optional(),
});

/** Either partner may update the shared pack/pause/threshold — both are
 *  equal owners of the couple's settings, same as the source feature. */
coupleRouter.patch('/couple/settings', requireUser, asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const me = await loadWithPartner(userId);
  const partner = resolvePartner(me);
  const coupleId = me.coupleId ?? partner?.coupleId ?? null;
  if (!coupleId) {
    res.status(400).json({ error: 'Pick a side before changing settings.' });
    return;
  }

  const { generationId, ...rest } = parsed.data;
  let data: Parameters<typeof db.couple.update>[0]['data'] = rest;

  if (generationId !== undefined) {
    if (generationId === null) {
      // Explicit clear — fall back to a bundled pack (packId, if also sent
      // in this same request, is applied via `rest` above).
      data = { ...data, customPackTogetherUrl: null, customPackAUrl: null, customPackBUrl: null };
    } else {
      // Ownership + shape-scoped on purpose: only a COMPLETE couple session
      // the caller actually owns can become the shared pack — a partner
      // can't point the pack at someone else's creation, and a SOLO
      // generation has no roleA/roleB half to split when apart.
      const generation = await db.generation.findFirst({
        where: { id: generationId, userId, subjectMode: 'COUPLE', status: 'COMPLETE' },
      });
      if (!generation || !generation.outputKey || !generation.outputKeyA || !generation.outputKeyB) {
        res.status(404).json({ error: 'That creation isn’t a finished couple photo you own.' });
        return;
      }
      // publicUrlForBusted, not publicUrlFor: these three URLs are a
      // SNAPSHOT persisted into this Couple row (unlike generations.ts's
      // own GET routes, which recompute the URL fresh on every read) — see
      // storage.ts's publicUrlForBusted doc comment. Busting it here means
      // a pack picked, then later regenerated (generationsRegenerate.ts,
      // which also refreshes this same row when it touches the active
      // pack's generation — see that route), still has a URL string that's
      // guaranteed to differ from whatever the client/CDN cached before.
      data = {
        ...data,
        packId: generationId,
        customPackTogetherUrl: publicUrlForBusted(generation.outputKey, generation.updatedAt),
        customPackAUrl: publicUrlForBusted(generation.outputKeyA, generation.updatedAt),
        customPackBUrl: publicUrlForBusted(generation.outputKeyB, generation.updatedAt),
      };
    }
  }

  const updated = await db.couple.update({ where: { id: coupleId }, data });

  const payload = {
    packId: updated.packId,
    customPackTogetherUrl: updated.customPackTogetherUrl,
    customPackAUrl: updated.customPackAUrl,
    customPackBUrl: updated.customPackBUrl,
    paused: updated.paused,
    thresholdM: updated.thresholdM,
  };
  if (partner) {
    sendToUser(partner.id, { type: 'settings', ...payload });
  }
  res.json(payload);
}));

// ─── Location ───────────────────────────────────────────────────────────

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().nullable().optional(),
});

/**
 * Upsert my latest GPS fix, then push it straight to my partner's open
 * socket (see realtime/coupleSocket.ts) — the replacement for what a
 * Supabase Realtime subscription on `couple_locations` used to deliver.
 * The push is best-effort only: the client's own low-frequency poll
 * (src/couple/bootstrap.ts) is the reliable fallback if the socket is down.
 */
coupleRouter.post('/couple/location', requireUser, asyncHandler(async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const me = await loadWithPartner(userId);
  const partner = resolvePartner(me);
  if (!partner) {
    res.status(400).json({ error: 'Pair with a partner first.' });
    return;
  }

  const location = await db.coupleLocation.upsert({
    where: { userId },
    create: { userId, lat: parsed.data.lat, lng: parsed.data.lng, accuracyM: parsed.data.accuracyM ?? null },
    update: { lat: parsed.data.lat, lng: parsed.data.lng, accuracyM: parsed.data.accuracyM ?? null },
  });

  sendToUser(partner.id, {
    type: 'partner-location',
    lat: location.lat,
    lng: location.lng,
    accuracyM: location.accuracyM,
    updatedAt: location.updatedAt.toISOString(),
  });

  res.status(204).end();
}));

// ─── Unlink ───────────────────────────────────────────────────────────────

/**
 * Tear down the couple: clear the pairing (both sides), delete the shared
 * settings row and both location rows, and mint each side a fresh pairing
 * code so they aren't stranded with no way to re-pair afterward (the old
 * code was already consumed the moment it was redeemed — see profile.ts).
 */
coupleRouter.post('/couple/unlink', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const me = await loadWithPartner(userId);
  const partner = resolvePartner(me);
  if (!partner) {
    res.status(400).json({ error: 'Not paired with anyone.' });
    return;
  }

  const coupleId = me.coupleId ?? partner.coupleId ?? null;
  // Only the ACCEPTER (whoever originally called POST /profile/pair) has a
  // real `partnerId` column value — see resolvePartner's comment. Figure out
  // which of the two this is so we clear that specific row's column, not a
  // virtual relation the sharer's row doesn't actually have.
  const accepterId = me.partnerId ? userId : partner.id;
  const sharerId = accepterId === userId ? partner.id : userId;

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: accepterId }, data: { partnerId: null, coupleId: null, coupleRole: null } });
    await tx.user.update({ where: { id: sharerId }, data: { coupleId: null, coupleRole: null } });
    if (coupleId) {
      await tx.coupleLocation.deleteMany({ where: { userId: { in: [userId, partner.id] } } });
      await tx.couple.delete({ where: { id: coupleId } });
    }
    // Retried collisions are astronomically unlikely at this code length —
    // same reasoning as codes.ts — but the unique constraint is the real
    // guarantee, same retry-on-P2002 pattern as profile.ts's onboarding.
    for (const id of [accepterId, sharerId]) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await tx.user.update({ where: { id }, data: { pairingCode: generatePairingCode() } });
          break;
        } catch (err) {
          const isConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
          if (!isConflict || attempt === 4) throw err;
        }
      }
    }
  });

  sendToUser(partner.id, { type: 'unlinked' });
  res.status(204).end();
}));

// ─── Report partner ─────────────────────────────────────────────────────
// Intentionally NOT implemented yet — the client's Report Partner button
// (per the scoped decision to port that UI as an inert stub) calls
// POST /couple/report and gets Express's default 404. That's deliberate,
// not a missed route: wire this up when there's an actual moderation queue
// behind it, rather than pretending one exists today.
