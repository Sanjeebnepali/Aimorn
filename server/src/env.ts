import 'dotenv/config';
import { z } from 'zod';

// Fail fast and loud on boot if config is missing, instead of half-starting
// and throwing confusing errors the first time a route needs a value that
// was never set — especially important once this runs on a host where the
// only feedback is a crash log, not a terminal in front of you.
const envSchema = z.object({
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),

  // Optional at boot, unlike everything else on this schema: auth, profile
  // pairing, and the couple-proximity feature don't touch object storage at
  // all, so a server with no R2 account yet shouldn't be unable to serve ANY
  // route over it. uploads.ts/generations.ts check `isStorageConfigured()`
  // (storage.ts) and return a clear 503 instead of throwing when it's
  // missing — see that file for why "fail fast" still applies per-request.
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),

  // Verified working end-to-end 2026-09-10 (real billed account, real
  // couple-fusion result) — now the active provider (generations.ts).
  // gemini-3.1-flash-image (not the "-lite" variant) over the original
  // gemini-2.5-flash-image: Google now calls 2.5 legacy outright, and 3.1
  // adds both resolution control (imageConfig.imageSize — see
  // nanoBanana.ts) and native multi-reference "character consistency",
  // which is exactly the identity-fidelity problem flagged in live testing
  // that same day. Costs more per image than 2.5 did ($0.067/1K vs
  // $0.039) — a real, deliberate tradeoff given the budget concern raised
  // in that same conversation, not an oversight.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-image'),
  // A SEPARATE, much cheaper model for lib/ai/photoQuality.ts's pre-
  // generation blur/face-quality gate (added 2026-09-12, real complaint:
  // blurry/bad photos silently burning a credit on a generation that was
  // never going to look like the person). gemini-3.1-flash-image above is
  // priced per-IMAGE-generated ($0.067-0.151), completely wrong for a
  // "look at this and answer 3 yes/no questions, output text" task — a
  // per-token vision-lite model is what a classification-only call like
  // this should cost. Originally set to gemini-2.5-flash-lite per outside
  // research, but a REAL call against this account 404'd with "no longer
  // available to new users... use models/gemini-3.5-flash-lite instead" —
  // that's Google's own API telling this account which model it actually
  // has access to, which trumps any blog post. photoQuality.ts fails open
  // on exactly this kind of error, so the gate silently no-op'd rather than
  // breaking generation — confirmed live 2026-09-12 before this fix.
  GEMINI_VISION_MODEL: z.string().default('gemini-3.5-flash-lite'),

  // Hugging Face Inference Providers — a free, fine-grained token scoped to
  // "Make calls to Inference Providers" only (huggingface.co/settings/tokens).
  // Optional at boot for the same reason as the S3_* block above — see
  // generations.ts's isStorageConfigured() check, which covers this too
  // (a generation needs both storage AND a provider token either way).
  HF_TOKEN: z.string().min(1).optional(),
  HF_QWEN_MODEL: z.string().default('Qwen/Qwen-Image-Edit-2511'),

  // Points faceGeometry.ts's subprocess call at the SPECIFIC Python install
  // with mediapipe/opencv-python actually installed (2026-09-12) — this
  // machine has several `python`/`python3` entries on PATH (Windows Store
  // alias, a bare "Python" launcher, this one), and the bare command
  // `python` resolved inconsistently across shells during setup. Defaults
  // to the plain command as a reasonable fallback for a future host where
  // there's only one, correctly-provisioned Python on PATH.
  FACE_CORRECT_PYTHON: z.string().default('python'),

  // --- RevenueCat (real App Store / Play Store billing) --------------------
  // Both optional at boot, same "fail per-request, not at startup" reasoning
  // as S3_*/HF_TOKEN above — see lib/revenueCat.ts's isRevenueCatConfigured().
  // Secret key (starts "sk_"), from the RevenueCat dashboard's API Keys page
  // — used server-side ONLY, to call RevenueCat's own REST API and read a
  // user's authoritative entitlement/purchase state (routes/iapSync.ts).
  // Never the same as the client's public SDK key (that one's fine to ship
  // in the app bundle; this one is not).
  REVENUECAT_SECRET_API_KEY: z.string().min(1).optional(),
  // The exact string configured as this webhook's "Authorization header
  // value" in the RevenueCat dashboard (Project Settings → Webhooks) — every
  // incoming POST /webhooks/revenuecat must present this back verbatim in
  // its own Authorization header, or it's rejected. This is what stops
  // anyone who finds the webhook URL from POSTing fake "purchase" events and
  // granting themselves free credits.
  REVENUECAT_WEBHOOK_AUTHORIZATION: z.string().min(1).optional(),

  // --- Push notifications (Firebase Cloud Messaging) ------------------------
  // Optional at boot, same "fail per-request, not at startup" reasoning as
  // S3_*/HF_TOKEN above — see lib/push.ts's isPushConfigured(). The FULL
  // service account JSON (Firebase Console → Project Settings → Service
  // Accounts → Generate new private key), as one single-line string, not a
  // file path — a file wouldn't survive a Render-style deploy that only
  // carries env vars, not arbitrary uploaded files. Deliberately raw FCM via
  // firebase-admin, not Expo's own hosted push service: this project has no
  // EAS project linked (see app.json/AGENTS.md — builds are local, not
  // EAS-managed), and Expo's push relay still needs these exact same
  // Firebase credentials uploaded to it, so going straight to FCM skips a
  // redundant hop with no loss of capability.
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  // The app owner's own Clerk user id — the one account allowed to call
  // POST /admin/broadcast (routes/admin.ts). Deliberately reuses the
  // existing Clerk session check (requireUser) plus this one id comparison
  // rather than a separate admin-auth system/role table: this is a
  // solo-developer app with exactly one trusted operator, so a second auth
  // mechanism would be pure overhead. Optional at boot — a server with this
  // unset simply has no working admin route yet (403s), same "fail per
  // request" shape as every other optional credential in this file.
  ADMIN_USER_ID: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid/missing environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error('Server cannot start with invalid environment configuration.');
}

export const env = parsed.data;
