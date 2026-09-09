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

  // Optional, not required: Nano Banana is still a real future option (see
  // docs/ai-generation-plan.md §3) but it's untested and blocked on Google
  // Cloud billing setup. HF_TOKEN below is the proven, near-free default —
  // see docs/ai-generation-plan.md §3a and §7.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-image'),

  // Hugging Face Inference Providers — a free, fine-grained token scoped to
  // "Make calls to Inference Providers" only (huggingface.co/settings/tokens).
  // Optional at boot for the same reason as the S3_* block above — see
  // generations.ts's isStorageConfigured() check, which covers this too
  // (a generation needs both storage AND a provider token either way).
  HF_TOKEN: z.string().min(1).optional(),
  HF_QWEN_MODEL: z.string().default('Qwen/Qwen-Image-Edit-2511'),
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
