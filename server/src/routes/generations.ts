import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { env } from '../env.js';
import { getObjectBytes, isStorageConfigured, publicUrlFor, putObjectBytes } from '../lib/storage.js';
import { buildFusionPrompt } from '../lib/promptBuilder.js';
import { QwenImageEditProvider } from '../lib/ai/qwenImageEdit.js';
import type { ImageFusionProvider } from '../lib/ai/provider.js';

export const generationsRouter = Router();

// One instance, reused across requests — the SDK client itself holds no
// per-request state. Qwen over Nano Banana: it's the provider actually
// verified working end-to-end (docs/ai-generation-plan.md §3a), and it
// doesn't need Google Cloud billing set up first. Swapping providers later
// (back to NanoBananaProvider, or a new one) means changing this one line.
const provider: ImageFusionProvider = new QwenImageEditProvider();

const createSchema = z
  .object({
    templateId: z.string().optional(),
    styleKey: z.string().min(1),
    subjectMode: z.enum(['SOLO', 'COUPLE']),
    description: z.string().max(500).optional(),
    photoAKey: z.string().min(1),
    photoBKey: z.string().optional(),
  })
  .refine((v) => v.subjectMode === 'SOLO' || !!v.photoBKey, {
    message: 'photoBKey is required when subjectMode is COUPLE',
    path: ['photoBKey'],
  });

function mimeTypeFromKey(key: string): string {
  return key.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/**
 * Runs the whole fusion job synchronously within the request. That's the
 * right tradeoff for now — Nano Banana Flash typically returns in single-
 * digit seconds, and a queue (BullMQ/Redis, or SQS+Lambda on AWS later) is
 * real infra we don't need until real concurrent load shows up. Swap this
 * for a queued worker without changing the route's request/response shape:
 * POST still returns a generation id immediately-ish, GET still polls it.
 */
generationsRouter.post('/generations', requireUser, async (req, res) => {
  if (!isStorageConfigured() || !env.HF_TOKEN) {
    res.status(503).json({ error: 'The AI fusion pipeline isn’t configured on this server yet.' });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = res.locals.userId as string;
  const input = parsed.data;
  const creditCost = 1;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.credits < creditCost) {
    res.status(402).json({ error: 'Not enough credits' });
    return;
  }

  const generation = await db.generation.create({
    data: {
      userId,
      templateId: input.templateId,
      styleKey: input.styleKey,
      subjectMode: input.subjectMode,
      description: input.description,
      photoAKey: input.photoAKey,
      photoBKey: input.photoBKey,
      provider: 'pending',
      model: 'pending',
      status: 'PROCESSING',
      creditCost,
    },
  });

  try {
    const [photoABytes, photoBBytes] = await Promise.all([
      getObjectBytes(input.photoAKey),
      input.photoBKey ? getObjectBytes(input.photoBKey) : Promise.resolve(undefined),
    ]);

    const prompt = buildFusionPrompt({
      subjectMode: input.subjectMode,
      templateId: input.templateId,
      styleKey: input.styleKey,
      description: input.description,
    });

    const result = await provider.generate({
      photoA: { bytes: photoABytes, mimeType: mimeTypeFromKey(input.photoAKey) },
      photoB: photoBBytes && input.photoBKey
        ? { bytes: photoBBytes, mimeType: mimeTypeFromKey(input.photoBKey) }
        : undefined,
      prompt,
    });

    const extension = result.mimeType === 'image/png' ? 'png' : 'jpg';
    const outputKey = `results/${userId}/${generation.id}.${extension}`;
    await putObjectBytes({ key: outputKey, body: result.imageBytes, contentType: result.mimeType });

    const updated = await db.$transaction([
      db.generation.update({
        where: { id: generation.id },
        data: { status: 'COMPLETE', outputKey, provider: result.provider, model: result.model },
      }),
      db.user.update({ where: { id: userId }, data: { credits: { decrement: creditCost } } }),
    ]);

    res.status(201).json({ ...updated[0], outputUrl: publicUrlFor(outputKey) });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Generation failed';
    await db.generation.update({ where: { id: generation.id }, data: { status: 'FAILED', errorMessage } });
    res.status(502).json({ error: errorMessage, generationId: generation.id });
  }
});

generationsRouter.get('/generations/:id', requireUser, async (req, res) => {
  const userId = res.locals.userId as string;
  const generation = await db.generation.findFirst({ where: { id: req.params.id, userId } });

  if (!generation) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json({ ...generation, outputUrl: generation.outputKey ? publicUrlFor(generation.outputKey) : null });
});
