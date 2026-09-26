import { env } from '../env.js';

/**
 * Which template pipeline handles a request — the switch that lets the v2
 * "inspired-by" mode ship SIDE-WISE, without changing anything for live users
 * until we choose to.
 *
 *   'exact'    — today's pipeline: the template PHOTO is attached and the model
 *                edits it, swapping the person in. Measured: only ~5/8 first
 *                attempts return the right person on a hard reference photo.
 *   'inspired' — v2: the model sees only the user's own photo plus a TEXT scene
 *                brief of the template's look (data/sceneBriefs.ts). Measured:
 *                20/20 right person across 3 photos and 2 templates, with the
 *                template's look preserved (promptSceneBrief.ts has the numbers).
 *
 * Resolution order (first match wins):
 *   1. an explicit `requested` mode (the request body's optional `templateMode`,
 *      so a future client toggle needs no server change);
 *   2. env TEMPLATE_MODE === 'inspired' (flip the whole deployment);
 *   3. the app owner's own account (ADMIN_USER_ID) — so v2 can be tried on the
 *      owner's phone against the real backend while every other user stays on
 *      'exact';
 *   4. 'exact'.
 */
export type TemplateMode = 'exact' | 'inspired';

export function templateModeFor(userId: string, requested?: TemplateMode): TemplateMode {
  if (requested) return requested;
  if (env.TEMPLATE_MODE === 'inspired') return 'inspired';
  if (env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID) return 'inspired';
  return 'exact';
}
