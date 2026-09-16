import { createServer } from 'node:http';
import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';

import { env } from './env.js';
import { attachCoupleSocketServer } from './realtime/coupleSocket.js';
import { attachPostsSocketServer } from './realtime/postsSocket.js';
import { accountDeleteRouter } from './routes/accountDelete.js';
import { adminRouter } from './routes/admin.js';
import { coupleRouter } from './routes/couple.js';
import { creditsRouter } from './routes/creditsRoutes.js';
import { generationsRouter } from './routes/generations.js';
import { generationsDeleteRouter } from './routes/generationsDelete.js';
import { generationsRegenerateRouter } from './routes/generationsRegenerate.js';
import { healthRouter } from './routes/health.js';
import { iapSyncRouter } from './routes/iapSync.js';
import { notificationsRouter } from './routes/notifications.js';
import { postsRouter } from './routes/posts.js';
import { profileRouter } from './routes/profile.js';
import { revenueCatWebhookRouter } from './routes/revenueCatWebhook.js';
import { uploadsRouter } from './routes/uploads.js';

// Last-resort net for anything happening entirely outside a single request's
// lifecycle (e.g. coupleSocket.ts's WebSocket handling, or a stray rejection
// asyncHandler.ts's per-route wrapping doesn't cover) — confirmed live
// 2026-09-10 that Node's default behavior for an unhandled rejection is to
// crash the whole process, which is exactly what took this server down over
// a single transient Neon connection hiccup. This logs instead of exiting;
// it can't recover the one request that triggered it, but it keeps every
// OTHER concurrent user's request alive instead of killing the server for
// everyone. Real error-tracking (Sentry or similar) belongs here eventually
// — this is the floor, not the whole story.
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION (server stayed up):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION (server stayed up):', err);
});

const app = express();

app.use(cors());
app.use(express.json());
// Minimal request log — there was no visibility at all into what the app
// was actually sending/getting back, which cost real debugging time (a
// stuck "loading" screen looked identical whether the request never
// arrived, 401'd, or came back with a legitimately-null field). Logs after
// the response is sent so the duration is real, not just "middleware ran".
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});
// Reads the Clerk session from the Authorization header on every request
// and attaches it for getAuth(req) to read in requireUser — doesn't reject
// unauthenticated requests itself, so /health stays public.
app.use(clerkMiddleware());

app.use(healthRouter);
app.use(uploadsRouter);
app.use(generationsRouter);
app.use(generationsDeleteRouter);
app.use(generationsRegenerateRouter);
app.use(postsRouter);
app.use(profileRouter);
app.use(creditsRouter);
app.use(coupleRouter);
app.use(revenueCatWebhookRouter);
app.use(iapSyncRouter);
app.use(accountDeleteRouter);
app.use(adminRouter);
app.use(notificationsRouter);

// Catches whatever asyncHandler.ts's per-route wrapping forwards via
// next(err) — the actual fix for the crash above, at the level it should
// happen: this ONE request gets a clean 500 instead of an unhandled
// rejection taking the whole process (and every other user's request)
// down with it. Must be registered after every route (Express only
// recognizes an error handler by its 4-argument signature, and only
// routes registered before it are covered).
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  console.error(`${req.method} ${req.path} -> unhandled error:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our end — please try again.' });
};
app.use(errorHandler);

// A plain http.Server (not app.listen()'s implicit one) so the couple-
// proximity WebSocket endpoint can share the same port via the server's
// 'upgrade' event — no second port/process to deploy.
const server = createServer(app);
attachCoupleSocketServer(server);
attachPostsSocketServer(server);

server.listen(env.PORT, () => {
  console.log(`amora-server listening on :${env.PORT}`);
});
