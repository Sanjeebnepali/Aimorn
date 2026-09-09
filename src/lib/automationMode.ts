/**
 * Automation-mode coordinator — TRIMMED STUB for a couple-ONLY app.
 *
 * ── ADAPTED FILE — not a verbatim copy. See why below. ──────────────────
 *
 * In the source app (Kawaii Baby Wallpapers), FOUR features autonomously
 * drive the device wallpaper and fight over it if left uncoordinated: Theme
 * shuffle, Mood-based rotation, Friend check-in, and Couple proximity. The
 * real `lib/automationMode.ts` there is a full coordinator: `getActiveDrivers()`
 * lets Couple yield when Theme/Mood/Friend is active, and
 * `enforceSingleDriver('couple')` stops the other three when the user
 * explicitly turns Couple on. That file imports `store/mood.ts` and
 * `store/shuffle.ts` — entire features this clone does not include.
 *
 * THIS APP only has Couple. There is nothing else to coordinate against, so
 * porting the real coordinator (and the two feature stores it needs) would
 * be pure dead weight. This stub keeps the EXACT SAME function names and
 * signatures that `lib/coupleWallpaper.ts`, `app/couple/dashboard.tsx`, and
 * `app/couple/setup.tsx` import — so none of those files needed to change —
 * but the bodies are trivial:
 *
 *   getActiveDrivers()       → always [] (nothing else is ever "driving",
 *                              so Couple's wallpaper-apply never yields)
 *   enforceSingleDriver(...) → always [] (nothing to stop)
 *
 * If you later ADD a second autonomous wallpaper feature to this app (e.g.
 * your own mood/shuffle system), that is the point where mutual exclusivity
 * starts to matter again — go copy the real coordinator from the source
 * repo's `lib/automationMode.ts` instead of extending this stub.
 */

export type DriverId = 'couple';

/** Always empty — Couple is the only driver that exists in this app. */
export function getActiveDrivers(): DriverId[] {
  return [];
}

/** Nothing to stop — kept only so call sites don't need an `if` around it. */
export async function enforceSingleDriver(_keep: DriverId): Promise<string[]> {
  return [];
}
