import { Router } from 'express';

export const healthRouter = Router();

// Unauthenticated on purpose — this is what a free host's uptime check and
// a future load balancer health check both need to hit without a session.
//
// `commit` is Render's own RENDER_GIT_COMMIT (set automatically at runtime for
// every service type, per Render's default-environment-variables docs) — the
// exact SHA this instance is running. Added 2026-09-26 because there was no
// way to tell from outside whether a `git push` had actually redeployed: this
// endpoint only ever returned {ok:true}, identical before and after a deploy.
// Read straight from process.env rather than env.ts's zod schema on purpose —
// it's a platform-provided extra, not app config, and must never make boot
// fail when absent (local dev, other hosts): null there. The SHA is not
// sensitive; the repo is public.
healthRouter.get('/health', (_req, res) => {
  res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT ?? null });
});
