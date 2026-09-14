import type { useApi } from '@/utils/api';

/**
 * Runs the server's per-photo quality gate (api.ts's checkPhotoQuality,
 * backed by server's lib/ai/photoQuality.ts) across every uploaded key for
 * one generation, in parallel, and returns a user-facing message for the
 * FIRST photo that failed — or null once every photo passes. Shared by
 * create-form.tsx and freeform-form.tsx (both call this right after upload,
 * before spending a real credit on POST /generations) so "which photo,
 * what's wrong" reads the same way in both, added 2026-09-12 for a real
 * complaint: blurry/faceless reference photos silently burning a credit on
 * a generation that was never going to look like the person.
 */
export async function findPhotoQualityIssue(
  api: ReturnType<typeof useApi>,
  photos: { key: string; label: string }[],
): Promise<string | null> {
  const results = await Promise.all(photos.map(async ({ key, label }) => ({ label, ...(await api.checkPhotoQuality(key)) })));
  const failed = results.find((r) => !r.usable);
  return failed ? `${failed.label}'s photo: ${failed.reason}` : null;
}
