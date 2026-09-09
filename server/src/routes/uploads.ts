import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { createUploadUrl, isStorageConfigured } from '../lib/storage.js';

export const uploadsRouter = Router();

const presignSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png']),
});

/**
 * Returns a short-lived URL the client PUTs the raw photo bytes to directly
 * — the app never sends photo bytes through this API. Call this once per
 * photo (so once for solo, twice for couple), then pass the returned `key`s
 * to POST /generations.
 */
uploadsRouter.post('/uploads/presign', requireUser, async (req, res) => {
  if (!isStorageConfigured()) {
    res.status(503).json({ error: 'Photo storage isn’t configured on this server yet.' });
    return;
  }

  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const { key, uploadUrl } = await createUploadUrl({ userId, contentType: parsed.data.contentType });
  res.json({ key, uploadUrl });
});
