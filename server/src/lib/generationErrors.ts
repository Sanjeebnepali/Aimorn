/**
 * What a user is allowed to read when a generation fails — added 2026-09-26
 * after the Gemini API's prepaid balance ran out and the app showed users
 * Google's raw billing error ("Your prepayment credits are depleted. Please go
 * to AI Studio at ..."): internal, confusing, and none of their business.
 *
 * Both generation routes used to send `err.message` straight to the client.
 * Now every failure goes through `userSafeMessage`, which allows exactly two
 * kinds of text through:
 *   1. A `UserFacingError` — a message the pipeline itself wrote FOR users
 *      (e.g. "We couldn't match your photo closely enough…"). Marked by a
 *      class instead of guessed from the text, so a future provider error
 *      can never be mistaken for one.
 *   2. Our own fixed messages below, chosen by recognizing the failure kind.
 * The real error is still logged and stored on the Generation row for us.
 *
 * Every message says the user wasn't charged because that is true by
 * construction: both routes take credits only inside the success transaction,
 * after the pipeline returns.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

const UNAVAILABLE = 'AI generation is temporarily unavailable. You weren’t charged — please try again later.';
const BLOCKED = 'This photo or description couldn’t be used (it was blocked by the AI’s safety filters). You weren’t charged — try different photos or wording.';
const GENERIC = 'Something went wrong creating your image. You weren’t charged — please try again.';

export function userSafeMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;

  const status = (err as { status?: unknown } | null)?.status;
  const text = err instanceof Error ? err.message : String(err);

  // 402 = the provider account is out of prepaid credit (what actually
  // happened); 429 = rate/quota exhausted after the provider client's own
  // retries. Either way it's "our side is down", never the user's fault.
  if (status === 402 || status === 429 || /prepayment|credits are depleted|RESOURCE_EXHAUSTED|quota/i.test(text)) return UNAVAILABLE;
  // nanoBanana.ts throws exactly "Gemini blocked this generation (<reason>)".
  if (/blocked this generation/i.test(text)) return BLOCKED;
  return GENERIC;
}
