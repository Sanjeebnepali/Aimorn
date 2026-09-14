import { Router } from 'express';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { deleteObjects } from '../lib/storage.js';
import { asyncHandler } from '../lib/asyncHandler.js';

/**
 * Split out of routes/generations.ts 2026-09-12 — the multi-angle
 * reference-photo change (photoAExtraKeys/photoBExtraKeys, see
 * prisma/schema.prisma) pushed that file to 373 lines, over this
 * workspace's 350-line module cap. This DELETE handler's own doc comment
 * is long on its own merit (three separate real bugs it fixes), so it was
 * the natural piece to pull out rather than trim any of that history.
 * Mounted as its own router in index.ts, same as generationsRouter — two
 * routers on different methods/paths coexist with zero conflict.
 */
export const generationsDeleteRouter = Router();

/**
 * Owner-only, permanent delete. Added 2026-09-11 — root-caused a real bug
 * where deleting a wallpaper from result/[id].tsx only ever called
 * gallery-store.ts's local `deleteCreation` (there was no server route to
 * call), so the item vanished from the AsyncStorage-backed Gallery for
 * exactly as long as nothing re-synced it — the very next time
 * gallery/index.tsx's useFocusEffect ran `GET /generations` on app re-open,
 * `syncFromServer` rebuilt its whole list from the server (which never
 * heard about the "deletion") and brought the image right back. The fix has
 * to be a real server-side delete, not a smarter client cache.
 *
 * If this generation was shared (has a Post), that post is deleted first in
 * the same transaction — same "delete this creation removes it from
 * everywhere, including your public share" semantics as posts.ts's own
 * DELETE, applied the other direction. Cascading here (rather than blocking
 * with a 409 telling the user to unshare first) is the simpler, safer
 * default for a first version: an orphaned public post pointing at a
 * deleted image would be strictly worse than the post just going away too.
 * Any points/regenerationCount that post already earned its owner are
 * untouched — those already landed on the User row (points.ts's
 * awardPointsForRegeneration), this only removes the Post/Generation rows.
 *
 * R2 object cleanup is best-effort and runs AFTER the DB transaction
 * commits, wrapped in its own try/catch — a storage-layer hiccup shouldn't
 * leave the DB rows deleted but the request itself failed (or vice versa:
 * rows still present because storage cleanup threw first). Reclaiming the
 * actual bytes matters at this app's real free-tier storage budget, but
 * it's strictly secondary to the row deletion the user is actually waiting
 * on.
 *
 * Also clears this generation off a Couple row, if it was that couple's
 * active custom pack. Real bug, reported live: deleting a generation used
 * to leave `Couple.customPackTogetherUrl`/`customPackAUrl`/`customPackBUrl`
 * pointing at a now-nonexistent R2 object — schema.prisma's own Couple.packId
 * comment explains why that column can hold a Generation.id in the first
 * place (a custom AI-generated pack, as opposed to one of the 3 bundled
 * ones). Deleting the row it pointed at without also clearing this left the
 * couple's proximity wallpaper feature (couple/wallpaper.ts on the client)
 * silently re-applying a stale, already-downloaded local copy of the
 * deleted image forever — the client had no way to know the source was
 * gone, since it never re-checks a URL it already has bytes cached for.
 * Resetting these columns to null here makes `resolveActivePack` (client)
 * fall back to the first bundled pack the next time either partner's app
 * re-syncs `GET /couple` — see useCoupleDashboardActions.ts / result/[id]
 * .tsx's own refreshCoupleState() calls for the client half of this fix.
 */
generationsDeleteRouter.delete('/generations/:id', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const generation = await db.generation.findFirst({ where: { id: req.params.id, userId } });
  if (!generation) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  await db.$transaction([
    db.post.deleteMany({ where: { generationId: generation.id } }),
    db.generation.delete({ where: { id: generation.id } }),
    db.couple.updateMany({
      where: { packId: generation.id },
      data: { packId: null, customPackTogetherUrl: null, customPackAUrl: null, customPackBUrl: null },
    }),
  ]);

  const keys = [
    generation.photoAKey,
    generation.photoBKey,
    // The extra reference-angle keys (2026-09-12) are just as real an R2
    // object as the primary photoAKey/photoBKey — omitting them here would
    // leave every angle past the first orphaned in storage forever on
    // every delete.
    ...generation.photoAExtraKeys,
    ...generation.photoBExtraKeys,
    generation.outputKey,
    generation.outputKeyA,
    generation.outputKeyB,
  ].filter((key): key is string => !!key);

  try {
    await deleteObjects(keys);
  } catch (err) {
    // The rows are already gone (the DB transaction above committed) — a
    // storage-cleanup failure here just means some bytes linger in R2 until
    // manually cleared, not a broken or half-deleted generation from the
    // user's point of view. Logged, not surfaced as a failed request.
    console.error(`Failed to delete R2 objects for generation ${generation.id}:`, err);
  }

  res.status(204).end();
}));
