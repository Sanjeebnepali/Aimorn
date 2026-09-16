/** Clerk's `ClerkError` puts a developer-facing string in `message` and a
 * user-safe one in `longMessage` — falls back to `message` for the rare
 * error that doesn't set it, rather than showing nothing. Shared here (was
 * previously duplicated in auth/index.tsx) since forgot-password-flow.tsx
 * needs the exact same formatting for its own Clerk calls. */
export function clerkErrorMessage(error: { longMessage?: string; message: string }): string {
  return error.longMessage ?? error.message;
}
