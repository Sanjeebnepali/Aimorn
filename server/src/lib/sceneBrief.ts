import { SCENE_BRIEFS } from '../data/sceneBriefs.js';
import { MANUAL_SCENE_BRIEFS } from '../data/sceneBriefsManual.js';

/**
 * The scene brief (text description of a template's look) for `templateId`, or undefined if it has none.
 * Generated briefs (from the template photos) and hand-written ones (templates with no photo) live in separate files so
 * re-running the generator can never overwrite a hand-written one; this is the one place that merges them, so the job
 * and the regenerate route can't disagree about which templates support the v2 mode.
 */
export function sceneBriefFor(templateId: string | undefined): string | undefined {
  if (!templateId) return undefined;
  return SCENE_BRIEFS[templateId] ?? MANUAL_SCENE_BRIEFS[templateId];
}
