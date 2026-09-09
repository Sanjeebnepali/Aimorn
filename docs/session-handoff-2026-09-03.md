# Session Handoff — 2026-09-03 (Auth + Onboarding)

Status: **Clerk auth is fully working, confirmed live on your phone** (real
sign-up, sign-in, sign-out all watched working end-to-end). **Onboarding is
built and typechecked but not yet confirmed on-device** — needs you to log
back in or sign up fresh, since that step needs a password/inbox I don't
have access to. Read this before touching anything tomorrow so you don't
have to re-derive where things stand.

## 1. What's actually done and verified

- **Clerk authentication** (`@clerk/expo`) is wired into the whole app:
  `src/app/_layout.tsx` (ClerkProvider), `src/app/auth/index.tsx`
  (email/password sign-in/up + Google SSO), `src/app/(tabs)/profile/index.tsx`
  (real identity + real sign-out).
  - **Confirmed live**: signed up as you (`Sanjeeb Nepali` /
    `sanjunepali2007@gmail.com`), Profile showed the real identity, Sign Out
    actually worked and flipped the UI back to "Guest".
- **The native Android build is in a good state.** `npx expo prebuild` has
  been run, the Clerk plugin's native config is in `android/`, and a full
  clean build succeeded and is installed on your phone
  (`com.sanjeebnepali.amora`).
- **Onboarding flow** (new tonight, not yet confirmed on-device): a 3-step
  flow after signup — name+photo, a style/solo-couple survey, and a
  personal ID + partner pairing code — gates entry to the app via
  `Stack.Protected` in `_layout.tsx`. See §3 for exactly what's untested.

## 2. Config state — what's filled in, what isn't

| File | Status |
|---|---|
| `amora/.env` | ✅ Has your real `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_API_URL` (your PC's LAN IP, port 4000) |
| `amora/server/.env` | ❌ **Doesn't exist yet** — only `.env.example` does. Needed for the server to boot at all (DB, S3, Gemini, Clerk secret key) |
| Clerk dashboard | Your app exists (`sound-falcon-8534.clerk.accounts.dev`), email/password works. **Google sign-in not confirmed enabled** — check Configure → SSO Connections |
| Neon Postgres / Cloudflare R2 / Gemini key | ❌ None of these are set up yet — the server literally can't start without them (see `server/src/env.ts`, fails fast on boot if any are missing) |

**The one thing actually blocking further server-side testing**: paste your
Clerk **Secret Key** (from the same API Keys page as the publishable key)
into `amora/server/.env` as `CLERK_SECRET_KEY` — but note the server won't
boot even then until `DATABASE_URL`/S3/Gemini are also real, not
placeholders. That's a separate, bigger task (see `docs/ai-generation-plan.md`).

## 3. Onboarding — what to test first tomorrow

I built the full flow (`src/app/onboarding/`, `src/components/onboarding/`,
`server/src/routes/profile.ts`, Prisma schema extended) and it typechecks/
lints clean, but I could not personally verify the redirect fires, because
that needs either:
- Your password (to log back into the existing account, which has never
  been through onboarding and should redirect there on login), or
- A fresh sign-up with an inbox you check for the verification code.

**Do this first:** open the app, sign in (or sign up). You should land on
"Welcome to Amora" (name + photo) instead of the tabs. If you instead land
straight in the tabs, the gate isn't firing — tell me what you saw.

Expect the **third step (codes) to show an honest error**, not real codes —
the server isn't running (no `.env`, see §2), so `POST /profile/onboarding`
will fail to connect. That's the designed fallback, not a bug: there's a
"Continue Anyway" path so onboarding still completes and you reach the app.
Once the server has real env vars, that step will show a real generated ID
+ pairing code instead.

## 4. Gotchas hit this session (so you don't lose time re-discovering them)

- **Metro keeps getting killed** by something outside my control (possibly
  this machine's own process cleanup) — if the app is stuck on the blue
  splash screen, it's almost always because Metro died. Restart with:
  ```
  cd amora
  npx expo start --dev-client --android
  ```
  (`--dev-client` matters — plain `npx expo start` opens **Expo Go**, which
  crashes this app immediately since it depends on native modules Expo Go
  doesn't have, e.g. `expo-media-library`.)
- **If the phone can't reach Metro over WiFi** (stuck on splash, no error),
  it's a firewall/network issue, not a code problem. Fix: `adb reverse
  tcp:8081 tcp:8081` (routes Metro through the USB cable instead), then
  relaunch via `adb shell am start -a android.intent.action.VIEW -d
  "amora://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
- **A native rebuild is only needed when native config changes** (a new
  native module, a plugin, permissions) — not for ordinary JS/TS edits,
  which hot-reload instantly. Today's rebuilds were for adding
  `@clerk/expo`'s native plugin; the onboarding feature added zero native
  code, so it needed no rebuild at all.
- If a fresh rebuild produces a "Cannot find native module 'X'" crash for a
  module that's genuinely installed, it's likely a stale Gradle task cache,
  not a real missing dependency. Fix: delete just `android/app/build` (not
  the whole `android/` folder — that throws away other modules' compiled
  native code too) and rebuild with `cd android && ./gradlew.bat
  :app:assembleDebug`.

## 5. Everything created/changed this session

**Auth:**
`amora/src/app/_layout.tsx` · `amora/src/app/auth/index.tsx` ·
`amora/src/components/auth/verify-email-step.tsx` ·
`amora/src/hooks/use-warm-up-browser.ts` ·
`amora/src/app/(tabs)/profile/index.tsx` · `amora/.env(.example)`

**Onboarding:**
`amora/src/app/onboarding/index.tsx` ·
`amora/src/components/onboarding/{profile,style,code}-step.tsx` ·
`amora/src/onboarding/store.ts` · `amora/src/utils/api.ts` ·
`amora/server/prisma/schema.prisma` (User model extended) ·
`amora/server/src/routes/profile.ts` · `amora/server/src/lib/codes.ts` ·
`amora/server/src/index.ts` (route wired in)

## 6. Ordered next steps

1. Log in/sign up on the app, confirm the onboarding redirect (§3).
2. Get `amora/server/.env` real enough to boot (Clerk secret key at least;
   DB/S3/Gemini are the bigger remaining task — see `ai-generation-plan.md`).
3. Once the server's up, re-test onboarding's code step for real generated
   codes instead of the honest-failure fallback.
4. Enable Google in Clerk's dashboard if you want that sign-in path tested too.
