import { Router } from 'express';

export const healthRouter = Router();

// Unauthenticated on purpose — this is what a free host's uptime check and
// a future load balancer health check both need to hit without a session.
healthRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});
