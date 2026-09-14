import { db } from './db.js';
import { broadcastPostStats } from '../realtime/postsSocket.js';

/**
 * Credits a post's owner for being recreated, at 100 regenerations per
 * point (the user-specified rate — "100 regeneration then it will get 1
 * point"). `pointsAwarded` on the Post row makes this idempotent: only the
 * NEWLY crossed point(s) get added to the owner's balance, so a post that
 * jumps straight from 99 to 101 regenerations (concurrent requests) still
 * only ever pays out the 1 point it actually earned, never double-pays a
 * threshold it already paid. Runs inside the same transaction as the
 * regenerationCount increment so the count and the payout can never drift
 * apart from each other (a crash between the two steps would otherwise be
 * possible with two separate writes).
 *
 * Split out of routes/generations.ts 2026-09-11 to keep that route file
 * under the workspace's 350-line module limit — this has no dependency on
 * anything route-specific (just the post id), so it was a clean pull.
 */
export async function awardPointsForRegeneration(sourcePostId: string): Promise<void> {
  const regenerationCount = await db.$transaction(async (tx) => {
    const post = await tx.post.update({
      where: { id: sourcePostId },
      data: { regenerationCount: { increment: 1 } },
    });
    const earnedSoFar = Math.floor(post.regenerationCount / 100);
    const newlyEarned = earnedSoFar - post.pointsAwarded;
    if (newlyEarned > 0) {
      await tx.post.update({ where: { id: sourcePostId }, data: { pointsAwarded: earnedSoFar } });
      await tx.user.update({ where: { id: post.userId }, data: { points: { increment: newlyEarned } } });
    }
    return post.regenerationCount;
  });

  // Best-effort live push to anyone with this post's detail screen open
  // right now (realtime/postsSocket.ts) — a fresh read rather than trusting
  // the transaction's own return value, since viewCount could have changed
  // concurrently and this should push the true current state of both
  // numbers together, not a stale viewCount alongside a fresh
  // regenerationCount.
  const current = await db.post.findUnique({ where: { id: sourcePostId }, select: { viewCount: true } });
  if (current) broadcastPostStats(sourcePostId, { viewCount: current.viewCount, regenerationCount });
}
