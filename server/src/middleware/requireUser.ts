import { getAuth } from '@clerk/express';
import type { Request, Response } from 'express';

import { db } from '../lib/db.js';
import { asyncHandler } from '../lib/asyncHandler.js';

/**
 * Requires a valid Clerk session (via the `clerkMiddleware()` mounted in
 * index.ts) and mirrors the user into our own `User` row on first sight.
 * Upserting here — instead of only via a Clerk webhook — means a brand new
 * signup can hit an authenticated route immediately, which matters while
 * self-hosting somewhere that may not have a stable public webhook URL yet.
 *
 * Wrapped in asyncHandler: this runs before EVERY authenticated route, so
 * its own `db.user.upsert` failing (a transient Neon hiccup, confirmed live
 * 2026-09-10 — see index.ts's error handler doc comment) needs to reach
 * Express's error handling exactly like a route body would, not crash the
 * whole process before the actual route even runs.
 */
export const requireUser = asyncHandler(async (req: Request, res: Response, next) => {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  await db.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  });

  res.locals.userId = userId;
  next();
});
