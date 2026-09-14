import sharp from 'sharp';

/**
 * Reduces the visible "pasted head" seam a template face-swap can leave —
 * a well-documented AI image-editing artifact, added 2026-09-12 after real,
 * verified testing ruled out the alternatives: neither a stronger prompt
 * (promptBuilder.ts's SEAMLESS_INTEGRATION_HARD_CONSTRAINT) nor switching
 * to Nano Banana Pro (gemini-3-pro-image, ~3-4x the price) removed it in
 * two separate live generations against the same test photos — the exact
 * same soft "halo" ring around the swapped head showed up either way. That
 * ruled out both "the model just isn't capable enough" and "the wording
 * doesn't say it clearly enough," which is why this is real image
 * post-processing, not another prompt attempt.
 *
 * Two real techniques, both applied to the WHOLE image rather than a
 * detected head region — there's no reliable region-detection step in this
 * pipeline yet, and a global pass can't introduce a NEW seam the way a
 * badly-aligned local mask could:
 *
 * 1. Unsharp-mask sharpening recovers perceived detail in the softer,
 *    AI-blended region without needing to know exactly where it is — the
 *    m2 > m1 asymmetry (sharp's own "jagged areas sharpen more than flat
 *    areas" design) pushes already-detailed regions (background, clothing)
 *    a little further while the naturally flatter edit-boundary region
 *    gets comparatively more relative correction. It can't add back detail
 *    genuinely destroyed by blur, but it raises the whole image's edge
 *    contrast enough to narrow the gap between "sharp photo" and "soft
 *    edit," which is what actually reads as a seam.
 * 2. A subtle, uniform film-grain overlay (low-sigma Gaussian noise,
 *    'overlay' blend so midtones stay ~unchanged). Real photo-compositing
 *    technique: a blended AI edit typically has LESS natural sensor noise
 *    than a real photo, and that texture mismatch is part of what reads as
 *    "pasted on." Matching grain across the whole frame gives every region
 *    the same texture floor without touching color or identity.
 *
 * Fails open on purpose — a cosmetic pass throwing (a corrupt buffer, an
 * unsupported format) must never turn a real, paid generation into a
 * failed one; the caller gets the original bytes back untouched instead.
 */
export async function reduceEditSeam(imageBytes: Buffer): Promise<Buffer> {
  try {
    const base = sharp(imageBytes);
    const { width, height } = await base.metadata();
    if (!width || !height) return imageBytes;

    const grain = await sharp({
      // background is required by sharp's own Create type even though the
      // noise generator overwrites every pixel — verified against the
      // installed @types (sharp/lib/index.d.ts's Create interface), not
      // guessed.
      create: { width, height, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 3 } },
    })
      .png()
      .toBuffer();

    return await base
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.5, x1: 2, y2: 10, y3: 20 })
      .composite([{ input: grain, blend: 'overlay' }])
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (err) {
    console.warn('reduceEditSeam: post-processing failed, using original bytes', err);
    return imageBytes;
  }
}
