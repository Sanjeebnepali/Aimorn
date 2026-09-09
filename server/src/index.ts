import { createServer } from 'node:http';
import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import express from 'express';

import { env } from './env.js';
import { attachCoupleSocketServer } from './realtime/coupleSocket.js';
import { coupleRouter } from './routes/couple.js';
import { generationsRouter } from './routes/generations.js';
import { healthRouter } from './routes/health.js';
import { profileRouter } from './routes/profile.js';
import { uploadsRouter } from './routes/uploads.js';

const app = express();

app.use(cors());
app.use(express.json());
// Reads the Clerk session from the Authorization header on every request
// and attaches it for getAuth(req) to read in requireUser — doesn't reject
// unauthenticated requests itself, so /health stays public.
app.use(clerkMiddleware());

app.use(healthRouter);
app.use(uploadsRouter);
app.use(generationsRouter);
app.use(profileRouter);
app.use(coupleRouter);

// A plain http.Server (not app.listen()'s implicit one) so the couple-
// proximity WebSocket endpoint can share the same port via the server's
// 'upgrade' event — no second port/process to deploy.
const server = createServer(app);
attachCoupleSocketServer(server);

server.listen(env.PORT, () => {
  console.log(`amora-server listening on :${env.PORT}`);
});
