import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { env } from '../env.js';
import { sendBroadcastNotification } from '../lib/push.js';

/**
 * The app-owner-only surface — right now just one route: broadcasting a
 * push to every opted-in user at once ("new feature", "event", "we're
 * live" — the kind of announcement every app sends, distinct from
 * lib/push.ts's sendPushToUser, which is a personal push tied to one
 * specific user's own action, like partner pairing). Gated by comparing
 * the signed-in Clerk user id against ADMIN_USER_ID (env.ts) rather than a
 * separate admin-role/auth system — see that env var's own doc comment for
 * why that's the right amount of auth for a solo-developer app.
 */
export const adminRouter = Router();

function requireAdmin(userId: string): boolean {
  return !!env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID;
}

const broadcastSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});

adminRouter.post('/admin/broadcast', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  if (!requireAdmin(userId)) {
    res.status(403).json({ error: 'Not authorized.' });
    return;
  }

  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  await sendBroadcastNotification(parsed.data);
  res.json({ success: true });
}));
