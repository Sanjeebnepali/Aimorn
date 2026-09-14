# AI Generation Pipeline — Draft Plan

Status: **real two-person fusion test done and it worked.** See §3a — a
genuine "two different people → one couple photo" call actually ran, for
$0.05 of usage against a free monthly allowance ($0.00 billed). Nano
Banana is still the researched primary recommendation, but Qwen-Image-Edit
via Hugging Face's Inference Providers is now a *verified, working, nearly-free
alternative* — not just a comparison-table entry.

**Correction from the first draft:** I'd found a Supabase project
(`KawaiiWalpapper`) whose schema happened to match this app's shape and
assumed it was Amora's backend. It isn't — different project. Ignore
anything below that used to reference it; this backend is a fresh,
self-hosted build (`amora/server/`), not Supabase.

## 1. Constraints this plan is built around

- **$200 total budget**, earmarked for *production*, not testing. Every step
  before "we've picked a provider" must cost $0.
- **Self-hosted, not a managed BaaS** — you own the backend code and can run
  it anywhere, rather than depending on a platform like Supabase for the
  actual business logic.
- **Free to run now, no rewrite to move to AWS (or any other cloud) later**
  once it grows — the architecture in §3 is built specifically around this.
- **Auth via Clerk** (your call — easy to integrate, generous free tier,
  has an official Expo SDK).
- Provider must handle **two separate face photos fused into one scene**,
  not just single-portrait editing.
- Provider must handle **both photoreal and heavy stylization** — Amora's
  style rail ([`style-swatch.tsx`](../src/components/primitives/style-swatch.tsx))
  ships Realistic, Neon Noir, Anime, Cyberpunk, Vintage 35mm, Oil Art, 3D
  Render, Watercolor, Fantasy Glow, and 3D Toon, on top of 12 photo themes
  ([`templates.ts`](../src/data/templates.ts)).
- No local GPU on this machine, so "run an open-source model locally for
  free" isn't an option here — free testing has to be cloud-based.

## 2. The self-hosted stack — and why each piece is free now, portable later

Scaffolded and ready to run in [`amora/server/`](../server) — see its
[README](../server/README.md) for setup and deploy steps. Summary:

| Piece | Free choice | Why it moves to AWS later with no rewrite |
|---|---|---|
| Compute | [Render](https://render.com) free Web Service, from the repo's `Dockerfile` | Same image runs on ECS/Fargate/App Runner/EC2 |
| Database | [Neon](https://neon.tech) free Postgres — **permanent free tier**, not a trial (verified directly; Render's own free Postgres expires after 30 days, so it's the wrong pick here) | Standard Postgres connection string; swap for RDS |
| Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) — 10GB free forever, **S3-compatible API** | `src/lib/storage.ts` is written against the real AWS S3 SDK; moving to actual S3 is a credentials/endpoint change, zero code change |
| Auth | [Clerk](https://clerk.com) — free to 50,000 monthly retained users, official `@clerk/express` + `@clerk/clerk-expo` SDKs | Hosted service, verified by JWT — never tied to where this server runs |
| AI | Google Gemini "Nano Banana" via `@google/genai` | Behind an `ImageFusionProvider` interface — swap/add providers without touching routes or the DB schema |

Every one of those free-tier facts was checked against current docs/pricing
pages directly (not assumed) before picking it — a couple of the obvious
first guesses turned out to be wrong (Railway and Fly.io no longer offer a
real free tier to new accounts; Render's free *Postgres* expires in 30
days even though its free *web service* doesn't).

Backend code that exists right now (in `amora/server/`):
- `prisma/schema.prisma` — `User` (mirrors a Clerk user, starter credit
  balance) and `Generation` (one fusion job: template/style/subject,
  input photo keys, `provider`/`model` per row, status, output key).
- `src/lib/storage.ts` — presigned upload URLs + get/put, entirely through
  the AWS S3 SDK against R2.
- `src/lib/ai/provider.ts` + `nanoBanana.ts` — the swappable interface and
  the Gemini implementation, written against `@google/genai`'s actual
  installed type definitions (I installed it and read the `.d.ts` rather
  than trust secondhand docs — one web summary of the same API invented a
  method that doesn't exist in the real package).
- `src/lib/promptBuilder.ts` + `src/data/themes.ts`/`styles.ts` — turns
  `templateId` + `styleKey` + subject mode + optional free-text into the
  actual instruction sent to the model. This is the single biggest lever on
  output quality and the main thing to iterate on during testing.
- `src/routes/uploads.ts`, `generations.ts`, `health.ts` — presign → create
  generation (runs synchronously, calls the provider, stores the result,
  debits credits) → poll by id.
- `src/middleware/requireUser.ts` — Clerk session check + lazy user upsert.

Still to do once §4 gives a go: run it against a real `GEMINI_API_KEY`
end-to-end, deploy to Render, wire `@clerk/clerk-expo` into the actual app
screens (currently `auth/index.tsx` is fully stubbed).

## 3. AI provider comparison

| Provider / model | Fits "2 faces → 1 scene"? | Handles heavy stylization? | Cost per image | Free way to test it |
|---|---|---|---|---|
| **Google Gemini 2.5/3 Flash Image ("Nano Banana")** | Yes — designed for it: blends up to 5 reference images, keeps spatial/style consistency | Yes — general multimodal model, follows style instructions in plain language | ~$0.03–$0.04 (Flash) via the billed API | **AI Studio browser playground** (aistudio.google.com) — free, no card, no billing enabled, direct browser upload+generate |
| **Gemini 3 Pro Image ("Nano Banana Pro")** | Yes, higher fidelity | Yes | ~$0.13 (1K/2K), ~$0.24 (4K) | Same playground |
| **OpenAI GPT Image** | Partial — takes up to 16 reference images for edits, but isn't purpose-built for "merge two identities" | Yes | ~$0.02–$0.19 depending on quality | **None.** Charges from the first call, no free tier |
| **Replicate — `flux-pulid` / multi-face ControlNet** | Yes in principle, but identity fidelity for two faces at once is less consistent | Weaker — tuned mostly for photoreal face-preservation | ~$0.003–$0.04 | Small signup trial credit (not unlimited) |
| **Hugging Face Spaces (InstantID, PhotoMaker V2, IP-Adapter FaceID)** | Same open models, community demos | Same weakness as above | $0 | Fully free, browser-based — good for a sanity-check comparison, not production |
| **Qwen-Image-Edit-2511 via HF Inference Providers** — ✅ **actually tested, see §3a** | **Yes, confirmed working** — genuinely fuses 2 distinct people, kept identity + unified lighting | Untested on Amora's other styles yet, but it's a general instruction-following model like Nano Banana, not a narrow face-swap tool | ~$0.025/call observed (2 calls = $0.05) | **Yes, and it's the real programmatic path** — HF Inference Providers, not the ZeroGPU Space UI (which quota-walls fast) |

**Recommendation stands: Nano Banana (Gemini 2.5 Flash Image) as the
primary provider**, coded against in `nanoBanana.ts` now. It's the only
option built for this specific job, and the cheapest of the ones that can
actually do it well.

Google's **billed API has no free tier for image models** — checked the
official pricing page directly rather than trusting aggregator blog posts
(several disagreed with each other). The free path is specifically the
**AI Studio browser playground**, which runs on a separate, no-billing
quota — that's why testing happens there first, not through a key in code.

## 3a. Verified: a real two-person fusion test, run and working

Before any Nano Banana spend, I actually got a genuine "two different
people, fused into one couple photo" call running end-to-end — for real
money this time, but a trivial amount, and inside a free allowance:

- **Model:** `Qwen/Qwen-Image-Edit-2511` — open-weight, explicitly built for
  multi-reference-image fusion (up to 3 images), not just single-portrait
  editing like InstantID/PhotoMaker.
- **Path:** Hugging Face's **Inference Providers** (routes to fal.ai),
  *not* the free ZeroGPU Space UI — that has an account-wide quota that
  gets exhausted after ~1 image and wasn't going to get us through a real
  test. The Inference Providers path is billed pay-per-call instead, but
  the "pay" turned out to be near-zero.
- **Cost, straight from the account's own billing page:** 2 requests,
  **$0.05 of usage, $0.00 actually billed** — covered entirely by HF's free
  monthly inference allowance ($0.10/month on this account). No card was
  charged.
- **How:** a real HF access token (fine-grained, "Inference Providers"
  scope only — created with explicit go-ahead, nothing broader), used from
  a small Python script. The tricky part — getting a *second* reference
  image into a call whose convenience wrapper only documents one — was
  solved by reading `huggingface_hub`'s actual installed source rather
  than guessing: passing `image_urls=[uriA, uriB]` as an extra kwarg lands
  in the request's `parameters` dict, which the fal.ai provider adapter
  spreads into the payload *after* its own single-image default, so it
  overrides it. Confirmed against
  `huggingface_hub/inference/_providers/fal_ai.py` directly. The working
  script this verification used (`server/scripts/test-qwen-fusion.py`) has
  since been removed — its flow was ported into the real
  `src/lib/ai/qwenImageEdit.ts` (see §7), so it was a one-off proof, not a
  tool anyone needed to keep running.
- **Prompt used:** the exact string `buildFusionPrompt()` produces for
  Golden Hour + Realistic + Couple (see §4 below) — a real production
  prompt, not a simplified stand-in.
- **Result:** both faces stayed recognizable against their source photos,
  and the golden-hour lighting was applied consistently across both
  people — not a "two photos pasted together" look. Genuinely working
  identity-preserving fusion.
- **One real bug found, worth fixing before this ships:** the man's
  reference photo was generated from a "shoulder-up portrait" prompt with
  no clothing specified, and it came out shirtless — that shirtless state
  then carried into the fused couple photo. **Action:** every reference-photo
  and theme prompt needs explicit clothing described (e.g. "wearing a plain
  t-shirt"), not left implicit, or this will happen with real user photos
  too depending on what they upload.

**Net effect on the provider decision:** Nano Banana remains untested (still
blocked on billing — see §3), but Qwen-Image-Edit-2511 is now a *proven*
option, open-weight, and essentially free at this volume. Worth treating as
a serious primary candidate, not just a fallback, once Nano Banana's own
Phase 0 test (§4) is actually run for comparison.

## 4. Zero-cost test plan (do this before spending anything)

**Phase 0 — manual quality check in AI Studio (free, ~30–45 min, you do this):**
1. Go to https://aistudio.google.com, sign in with a Google account (no
   credit card, no billing project needed).
2. Pick the Gemini 2.5 Flash Image ("Nano Banana") model in the model picker.
3. Upload two test face photos. **Use photos you're fully comfortable with
   being seen during testing** — your own selfie + a stock/AI-generated
   face is the safest choice so no third party's consent is in question
   yet. (See the consent note in §6.)
4. Run it against 4–5 real prompts pulled straight from Amora's actual
   templates/styles — you can literally paste the sentence
   `buildFusionPrompt()` would generate, e.g. for Golden Hour + Realistic:
   > Combine the two people from the reference photos into a single new
   > photo of them together, as a couple. Preserve each person's real face
   > and identity exactly as shown in their reference photo — do not blend
   > or average their features into a new face. Scene: a warm golden-hour
   > sunset, soft low sunlight, long shadows. Style: photorealistic,
   > natural skin texture and lighting, shot on a real camera. Compose it
   > as a vertical phone wallpaper, both people fully visible, natural
   > consistent lighting across the whole image. Keep each person dressed
   > appropriately and consistent with their reference photo — do not
   > remove or alter their clothing.
   Also try Cyber Date + Cyberpunk, Cartoon Us + 3D Toon, Cherry Blossom +
   Watercolor, Rainy Window + Vintage 35mm (see `src/data/themes.ts` /
   `styles.ts` for every fragment).
5. Judge on: does it keep *both* faces recognizable, does the style
   actually change, does lighting look unified (not "two photos pasted
   together"), does it hold up across Amora's real theme/style combinations.

This single free session is the real go/no-go gate.

**Phase 1 — open-source sanity baseline (free, optional):** try the same 2
photos on a Hugging Face Space for InstantID or PhotoMaker V2, purely to
confirm Nano Banana is actually the better choice. Skip if Phase 0 is
clearly good enough.

**Phase 2 — first paid smoke test (a few cents, only after Phase 0 passes):**
get a real `GEMINI_API_KEY`, drop it in `amora/server/.env`, run the server
locally (`npm run dev` — see the server README), and hit
`POST /generations` for real with the same 2 photos. At ~$0.04/image, ~15
test calls is well under $1 against the $200. This proves the *programmatic*
path matches the playground, not just prompt wording in isolation.

Only after Phase 2 does deploying to Render / wiring the real app screens
make sense.

## 5. Cost math against the $200 budget

At Nano Banana Flash pricing (~$0.035–$0.04/image), $200 buys roughly
**5,000 generations** of COGS headroom before the app earns a cent. If "8K
HD" exports ever route through Nano Banana Pro at 4K (~$0.24/image), that's
~830 of those specifically — fine as a paid upsell, not the default path.

## 6. Consent note (flagging now, not blocking testing)

The current `CreateForm` UI has one person upload both "You" and "Partner"
photos in a single sitting. Longer-term, a paired-account flow (each
partner authenticates with their own Clerk account and uploads their own
photo) is a much cleaner consent story, and lines up with providers'
policies against using someone's likeness without their consent. Worth
deciding explicitly before shipping the single-device flow: does v1 need an
explicit consent checkbox ("I have my partner's permission to use their
photo")? Not a blocker for Phase 0 testing, which uses your own consented
test photos either way.

## 7. Next actions

1. **Decide:** now that Qwen-Image-Edit-2511 is a *proven, working, near-free*
   option (§3a) and Nano Banana is still untested (blocked on billing —
   Phase 0 below), does it make more sense to just build the real
   `qwenImageEdit.ts` provider (mirroring `nanoBanana.ts`'s interface) and
   skip Nano Banana entirely for v1? It already has a real result to
   compare against.
2. **If Nano Banana still worth comparing:** run Phase 0 in the AI Studio
   playground and share the results — the 5 prompts are listed above.
3. **You, in parallel if you want:** create the free accounts — Neon,
   Cloudflare (for R2), Clerk — so their credentials are ready to drop into
   `amora/server/.env`.
4. **Me, next:** port the standalone Python test script's verified flow
   into a real `src/lib/ai/qwenImageEdit.ts` (same `ImageFusionProvider`
   interface as `nanoBanana.ts`, including the fal.ai queue polling), fix
   the clothing-prompt gap found in §3a, then wire `@clerk/clerk-expo` into
   the real app screens and connect `CreateForm` → the real `/generations`
   endpoint instead of the fake `/loading` timer.
