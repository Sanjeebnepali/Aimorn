# amora-server

Self-hosted backend for Amora: uploads → AI photo fusion → result. You own
this code and can run it anywhere that runs a Docker container or plain
Node — it isn't built against any one platform's proprietary APIs.

Full architecture rationale and the AI-provider comparison this was built
around live in [`../docs/ai-generation-plan.md`](../docs/ai-generation-plan.md).
**Read that first** — it also covers the zero-cost quality test to run
before `GEMINI_API_KEY` is ever used for a real call.

## Stack, and why each piece is free right now

| Piece | Free choice | Why it's portable later |
|---|---|---|
| Compute | [Render](https://render.com) free Web Service | Same `Dockerfile` deploys to AWS ECS/Fargate/App Runner/EC2 unchanged |
| Database | [Neon](https://neon.tech) free Postgres (permanent, not a trial) | Standard `postgresql://` URL — works identically against AWS RDS |
| Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) (10GB free forever) | Speaks the real AWS S3 API — `src/lib/storage.ts` uses the AWS SDK directly, no rewrite to move to real S3 |
| Auth | [Clerk](https://clerk.com) (free to 50k monthly retained users) | Hosted auth, verified by JWT — not tied to where this server runs |
| AI | Google Gemini "Nano Banana" (`@google/genai`) | Swappable per-request via the `ImageFusionProvider` interface in `src/lib/ai/provider.ts` |

Nothing here requires a credit card to start. See `.env.example` for where
to get each credential.

## Local setup

```bash
npm install
cp .env.example .env    # fill in real values
npx prisma migrate dev  # creates tables on your Neon (or local) Postgres
npm run dev              # http://localhost:4000
```

## Deploying to Render (free) today

1. Push this repo to GitHub.
2. Render → New → Web Service → point at the repo, root directory `server/`.
3. Build command: `npm ci && npx prisma generate && npm run build`. Start
   command: `npm start`. (Or: "Deploy an existing Dockerfile" using the
   `Dockerfile` here directly — identical either way.)
4. Add every variable from `.env.example` in Render's dashboard.
5. Run `npx prisma migrate deploy` once (Render's shell, or from your
   machine pointed at the same `DATABASE_URL`) to create tables.

Free-tier caveat: the instance sleeps after inactivity and takes a few
seconds to wake on the next request — fine for testing/early users, not for
production traffic. That's a Render limit, not an architecture limit — see
below.

## Moving to AWS (or anywhere else) later — no rewrite

Every piece above was picked specifically so growth means **redeploying the
same code with new environment variables**, not rewriting it:

- **Compute:** build the existing `Dockerfile` and run it on ECS/Fargate,
  App Runner, or an EC2 instance.
- **Database:** point `DATABASE_URL` at an RDS Postgres instance instead of
  Neon. Same Prisma schema, same migrations.
- **Storage:** point `S3_ENDPOINT`/credentials at real AWS S3 instead of
  R2 (or drop `S3_ENDPOINT` — AWS S3 doesn't need a custom one) and switch
  `forcePathStyle` off in `src/lib/storage.ts` if you want virtual-hosted
  URLs. The AWS SDK calls themselves don't change.
- **Auth:** nothing changes — Clerk isn't hosted by us either way.
- **AI provider:** nothing changes, or add a second `ImageFusionProvider`
  implementation and switch which one `generations.ts` constructs.

## What's intentionally not built yet

- A job queue — generation currently runs synchronously inside the POST
  request. Fine at low volume; swap for BullMQ+Redis or SQS+Lambda once
  concurrent load actually needs it, without changing the route's
  request/response shape (see the comment in `src/routes/generations.ts`).
- A real credits/purchases ledger — `User.credits` is a starter integer,
  not billing.
- Clerk webhooks (e.g. for deletions) — the user row is upserted lazily on
  first authenticated request instead, so this works without a public
  webhook URL during early self-hosted testing.
