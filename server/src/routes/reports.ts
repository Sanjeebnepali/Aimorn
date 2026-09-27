import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { db } from '../lib/db.js';

export const reportsRouter = Router();

/**
 * The real endpoint behind Google Play's AI-Generated Content policy
 * requirement (in-app reporting, reachable without leaving the app) —
 * replaces `POST /couple/report`'s deliberate 404 (see couple.ts's old
 * closing comment) and gives `ai_preview`/`wallpaper_menu` a working
 * destination for the first time; neither ever had one.
 *
 * `surface`/`reason` mirror src/lib/reportContent.ts's ReportSurface/
 * ReportReason string unions exactly — that file is the single source of
 * truth for valid values on both ends, so a new reason/surface is a
 * client+here change, never a migration (see Report's own schema comment).
 */
const reportSchema = z.object({
  surface: z.enum(['ai_preview', 'wallpaper_menu', 'couple_partner']),
  reason: z.enum(['inappropriate', 'real_person', 'copyright', 'violence', 'harassment', 'other']),
  details: z.string().max(1000).optional(),
  targetUserId: z.string().min(1).optional(),
  contentId: z.string().min(1).optional(),
  prompt: z.string().max(2000).optional(),
  provider: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
});

reportsRouter.post('/reports', requireUser, asyncHandler(async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const reporterId = res.locals.userId as string;
  const { surface, reason, details, targetUserId, contentId, prompt, provider, model } = parsed.data;

  // A couple_partner report needs a real target; without one, the row is
  // unactionable and there's nothing to moderate against — reject rather
  // than silently accepting a half-formed report.
  if (surface === 'couple_partner' && !targetUserId) {
    res.status(400).json({ error: 'Missing who this report is about.' });
    return;
  }

  await db.report.create({
    data: { reporterId, surface, reason, details, targetUserId, contentId, prompt, provider, model },
  });

  // 202, not 200/204: this is accepted for review, not resolved on the
  // spot — there's no auto-moderation action yet (see the launch audit's
  // own note on that), just a durable, queryable record an operator can
  // act on. Matches what the client's success toast already says
  // ("submitted — thank you"), not "handled."
  res.status(202).json({ success: true });
}));
