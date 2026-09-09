import { getAuth } from '@clerk/express';
import type { NextFunction, Request, Response } from 'express';

import { db } from '../lib/db.js';

/**
 * Requires a valid Clerk session (via the `clerkMiddleware()` mounted in
 * index.ts) and mirrors the user into our own `User` row on first sight.
 * Upserting here — instead of only via a Clerk webhook — means a brand new
 * signup can hit an authenticated route immediately, which matters while
 * self-hosting somewhere that may not have a stable public webhook URL yet.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
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
}
