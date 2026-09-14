import { Router } from 'express';
import { z } from 'zod';
import type { SubjectMode } from '@prisma/client';

import { asyncHandler } from '../lib/asyncHandler.js';
import { checkContentPolicy, messageForViolation } from '../lib/contentPolicy.js';
import { db } from '../lib/db.js';
import { broadcastPostStats } from '../realtime/postsSocket.js';
import { publicUrlFor, publicUrlForBusted } from '../lib/storage.js';
import { requireUser } from '../middleware/requireUser.js';

export const postsRouter = Router();

// One shared shape for every route below that returns a post — the public
// feed, trending, a single post, and "my posts" all need the exact same
// fields (the caption plus everything from its generation a card/detail
// screen needs to render). Keeping this one function is what stops those
// four call sites from quietly drifting into four slightly different
// response shapes over time.
const POST_INCLUDE = {
  user: { select: { id: true, displayName: true, avatarKey: true } },
  // Deliberately NOT selecting outputKeyA/outputKeyB — see toPostJson's
  // comment below for why a couple post must never be able to expose them,
  // no matter what gets added to this function later. Not selecting the
  // columns at all is a stronger guarantee than selecting-then-omitting:
  // there's no value here for a future edit to accidentally start
  // returning.
  generation: {
    select: {
      subjectMode: true,
      styleKey: true,
      templateId: true,
      outputKey: true,
      // Needed only to cache-bust outputUrl below (publicUrlForBusted) —
      // without it, a post whose source generation later gets its
      // "together" slot regenerated (generationsRegenerate.ts overwrites
      // the SAME outputKey in place) kept showing the pre-regenerate image
      // to the whole public feed forever, since this key's URL never
      // otherwise changes.
      updatedAt: true,
    },
  },
} as const;

type PostWithRelations = {
  id: string;
  title: string | null;
  caption: string | null;
  regenerationCount: number;
  viewCount: number;
  createdAt: Date;
  user: { id: string; displayName: string | null; avatarKey: string | null };
  generation: {
    // Imported from the Prisma-generated enum (not hand-typed as
    // 'SOLO' | 'COUPLE') since 2026-09-12's GROUP addition — a hardcoded
    // union here silently went stale the moment that enum grew a third
    // value, caught only by a real typecheck failure, not by anything a
    // group-photo post would have visibly broken at runtime (it would have
    // just rendered as if subjectMode were an impossible value).
    subjectMode: SubjectMode;
    styleKey: string;
    templateId: string | null;
    outputKey: string | null;
    updatedAt: Date;
  };
};

function toPostJson(post: PostWithRelations) {
  return {
    id: post.id,
    title: post.title,
    caption: post.caption,
    regenerationCount: post.regenerationCount,
    viewCount: post.viewCount,
    createdAt: post.createdAt.toISOString(),
    subjectMode: post.generation.subjectMode,
    styleKey: post.generation.styleKey,
    templateId: post.generation.templateId,
    // Only ever the together shot — added 2026-09-11, then corrected the
    // same day per explicit user pushback: a couple post used to also
    // expose outputKeyA/outputKeyB (the solo "just you" / "just partner"
    // portraits from that session), which is a real privacy problem — one
    // partner's solo close-up going out to the public feed without the
    // other person even being in frame, with no separate consent for
    // THAT. Solo sharing is still fully possible; it just has to come from
    // an actual SOLO-mode generation (its own Post, its own outputKey),
    // never bundled in from a couple session's per-person halves. outputKey
    // should always be non-null (only COMPLETE generations can become
    // posts — see POST /posts below), but this stays defensive rather than
    // asserting it.
    outputUrl: post.generation.outputKey
      ? publicUrlForBusted(post.generation.outputKey, post.generation.updatedAt)
      : null,
    author: {
      id: post.user.id,
      displayName: post.user.displayName,
      avatarUrl: post.user.avatarKey ? publicUrlFor(post.user.avatarKey) : null,
    },
  };
}

const createSchema = z.object({
  generationId: z.string().min(1),
  title: z.string().max(80).optional(),
  caption: z.string().max(500).optional(),
});

/**
 * Share one of your own COMPLETE generations to the public feed. Only ever
 * reads/writes through the owning `generationId` — the client never sends
 * output keys or subjectMode itself, so there's nothing here for a client
 * to lie about beyond "which of my own generations."
 */
postsRouter.post('/posts', requireUser, asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // A caption/title is public the instant this succeeds — everyone's Home
  // feed, not just an AI prompt only we ever see — so it gets the same
  // content-policy gate as a generation's description (lib/contentPolicy.ts).
  // Checked against whichever field was actually filled in; either matching
  // is a real violation regardless of which box it came from.
  const policyViolation =
    checkContentPolicy(parsed.data.title) ?? checkContentPolicy(parsed.data.caption);
  if (policyViolation) {
    res.status(400).json({ error: messageForViolation(policyViolation) });
    return;
  }

  const userId = res.locals.userId as string;
  const generation = await db.generation.findFirst({
    where: { id: parsed.data.generationId, userId, status: 'COMPLETE' },
  });
  if (!generation) {
    res.status(404).json({ error: 'That isn’t a finished creation you own.' });
    return;
  }

  const existing = await db.post.findUnique({ where: { generationId: generation.id } });
  if (existing) {
    res.status(409).json({ error: 'You’ve already shared this creation.' });
    return;
  }

  const post = await db.post.create({
    data: { userId, generationId: generation.id, title: parsed.data.title, caption: parsed.data.caption },
    include: POST_INCLUDE,
  });

  res.status(201).json(toPostJson(post));
}));

const feedQuerySchema = z.object({
  // Keyset pagination on createdAt, not offset — stable under new posts
  // arriving between page loads (an offset-based page 2 would silently
  // reshow/skip rows once a new post lands at the top). The client's next
  // request just echoes back the ISO string this response's `nextCursor`
  // gave it.
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * The public feed — Home's "Recent Post" section (src/app/(tabs)/index.tsx),
 * every user's shared creations, most recent first. `requireUser` because
 * every screen in this app already sits behind sign-in, not because a post
 * is private — see GET /posts/:id below for the same reasoning.
 */
postsRouter.get('/posts', requireUser, asyncHandler(async (req, res) => {
  const parsed = feedQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const posts = await db.post.findMany({
    where: parsed.data.cursor ? { createdAt: { lt: new Date(parsed.data.cursor) } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: parsed.data.limit,
    include: POST_INCLUDE,
  });

  const nextCursor = posts.length === parsed.data.limit ? posts[posts.length - 1].createdAt.toISOString() : null;
  res.json({ posts: posts.map(toPostJson), nextCursor });
}));

/** The caller's own shared posts — powers "My Posts" (src/app/manage-posts).
 * No pagination: a single user's own share history is small at this app's
 * scale, unlike the whole-community feed above. */
postsRouter.get('/posts/mine', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const posts = await db.post.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: POST_INCLUDE,
  });
  res.json(posts.map(toPostJson));
}));

/**
 * Top 5 by regeneration count — "if it rank 1 and so on top 5 choose and
 * then auto update in trending list" (the user's own spec). Purely derived
 * from `regenerationCount`, recomputed fresh on every read rather than
 * cached/materialized — cheap at this data volume (an indexed sort over the
 * Post table, see schema.prisma's @@index([regenerationCount])), so "auto
 * update" falls out for free: the instant a post's count changes, the next
 * read of this endpoint reflects it, no separate job needed.
 */
postsRouter.get('/posts/trending', requireUser, asyncHandler(async (_req, res) => {
  const posts = await db.post.findMany({
    orderBy: [{ regenerationCount: 'desc' }, { createdAt: 'desc' }],
    take: 5,
    include: POST_INCLUDE,
  });
  res.json(posts.map(toPostJson));
}));

/** One post's full detail — the post-detail screen (src/app/post/[id].tsx),
 * which is also where "Recreate" lives (feeding sourcePostId back into
 * POST /generations — see generations.ts). */
postsRouter.get('/posts/:id', requireUser, asyncHandler(async (req, res) => {
  const post = await db.post.findUnique({ where: { id: req.params.id }, include: POST_INCLUDE });
  if (!post) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(toPostJson(post));
}));

/**
 * Records one view of a post — src/app/post/[id].tsx calls this once per
 * open, separately from the GET above (a plain read shouldn't have a
 * side effect baked into it). Not ownership-gated: viewing isn't a
 * privileged action, and the whole point is for OTHER people's views to
 * count. No self-view exclusion either, unlike regeneration points — a
 * view earns nothing, so there's no farming incentive to guard against.
 * Pushes the new count live to anyone with this post's detail screen open
 * (realtime/postsSocket.ts) on top of the REST response.
 */
postsRouter.post('/posts/:id/view', requireUser, asyncHandler(async (req, res) => {
  const post = await db.post.updateMany({ where: { id: req.params.id }, data: { viewCount: { increment: 1 } } });
  if (post.count === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updated = await db.post.findUniqueOrThrow({ where: { id: req.params.id } });
  broadcastPostStats(updated.id, { viewCount: updated.viewCount, regenerationCount: updated.regenerationCount });
  res.json({ viewCount: updated.viewCount });
}));

/** Owner-only. Deleting a post never touches its underlying Generation —
 * the photo stays in the user's own Gallery/history, only the public share
 * goes away (same "unpublish, don't destroy" semantics as gallery-store.ts's
 * deleteCreation). */
postsRouter.delete('/posts/:id', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const post = await db.post.findUnique({ where: { id: req.params.id } });
  if (!post || post.userId !== userId) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await db.post.delete({ where: { id: post.id } });
  res.status(204).end();
}));
