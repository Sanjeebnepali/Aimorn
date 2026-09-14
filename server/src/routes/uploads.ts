import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { createUploadUrl, getObjectBytes, isStorageConfigured } from '../lib/storage.js';
import { assessPhotoQuality } from '../lib/ai/photoQuality.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const uploadsRouter = Router();

const presignSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png']),
});

const qualityCheckSchema = z.object({
  key: z.string().min(1),
});

/**
 * Returns a short-lived URL the client PUTs the raw photo bytes to directly
 * — the app never sends photo bytes through this API. Call this once per
 * photo (so once for solo, twice for couple), then pass the returned `key`s
 * to POST /generations.
 */
uploadsRouter.post('/uploads/presign', requireUser, asyncHandler(async (req, res) => {
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
}));

/**
 * Checked by the client right after uploading a photo, BEFORE calling
 * POST /generations — added 2026-09-12 alongside lib/ai/photoQuality.ts's
 * whole doc comment for the complaint this answers (blurry/bad photos
 * silently burning a real credit on a generation that was never going to
 * look like the person). Deliberately its own tiny endpoint rather than
 * folded into /uploads/presign: the photo has to actually exist in storage
 * first (this fetches its bytes to analyze), so it can only ever run
 * AFTER the presigned PUT completes, not alongside it.
 */
uploadsRouter.post('/uploads/quality-check', requireUser, asyncHandler(async (req, res) => {
  if (!isStorageConfigured()) {
    res.status(503).json({ error: 'Photo storage isn’t configured on this server yet.' });
    return;
  }

  const parsed = qualityCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const bytes = await getObjectBytes(parsed.data.key);
  const mimeType = parsed.data.key.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const result = await assessPhotoQuality(bytes, mimeType);
  res.json(result);
}));
