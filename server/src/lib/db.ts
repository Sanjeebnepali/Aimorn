import { PrismaClient } from '@prisma/client';

// A single shared client — re-creating one per request (or per hot-reload in
// dev) exhausts Postgres connections fast, especially on a free-tier DB with
// a small connection cap like Neon's.
export const db = new PrismaClient();
