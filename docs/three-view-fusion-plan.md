# Three-View Fusion Pipeline — Plan (rev. 2)

Visual version (diagrams + same content): https://claude.ai/code/artifact/75f66798-82a6-470d-8993-9ffb9153ea37

Extends the pipeline in [`ai-generation-plan.md`](./ai-generation-plan.md). A
couple-mode generation still produces **three images** — a girl-alone view, a
boy-alone view, and a together view. **Revision 2 correction:** these aren't
three things shown on one shared screen. They're **three possible
wallpapers**, and which one is actually live on a given phone depends on
*whose* phone it is and *how far apart the couple currently is* — this is
what "Proximity Sync" (already a label in the Profile/Gallery UI, with no
logic behind it yet) is supposed to mean.

## Still true from rev. 1

`buildFusionPrompt()` (`server/src/lib/promptBuilder.ts`) already makes the
same recipe for the same template + style every time — verified in a real
fusion test (`ai-generation-plan.md` §3a). One generation job still produces
three images via three prompt/provider calls sharing that recipe.

## 1 — Generate, upscale, store

Two additions on top of rev. 1's fan-out, because this is specifically a
*wallpaper* app:

- **Resolution-aware prompt** — `promptBuilder.ts` needs an explicit target
  resolution/aspect-ratio clause built from the requesting device's real
  screen size (`Dimensions.get('screen')` client-side, sent with the
  request), not a vague "vertical phone wallpaper." Also: full-bleed
  composition, nothing critical near the very top/bottom edge where a notch
  or lock-screen clock sits.
- **Upscale pass** — a new `server/src/lib/ai/upscaler.ts`, same swappable
  interface shape as `nanoBanana.ts`. **Real-ESRGAN** is the standard
  free/open-source choice for sharpening + upscaling a generated photo,
  reachable the same way Qwen already is (Hugging Face Inference
  Providers). Deserves its own real §3a-style test before being trusted,
  same as the fusion model got — not claiming it's verified yet.

Each of `outputKeyGirl` / `outputKeyBoy` / `outputKeyTogether` always points
at the *finished*, already-upscaled image.

## 2 — Which wallpaper is on-screen, right now

```
His phone (default: outputKeyBoy) ──ping──┐
                                            ├──► distance check (server)
Her phone (default: outputKeyGirl) ─ping──┘         │
                                                      │  ≤100m
                                                      ▼
                              both phones: setDeviceWallpaper(outputKeyTogether)
                                                      │
                                            walk apart, >100m
                                                      ▼
                              each phone reverts to its own solo view
```

- `setDeviceWallpaper()` (`src/utils/native-media.ts`) already exists and
  already works — it's what "Set as Wallpaper" calls today on
  `result/[id].tsx`. The proximity feature is wiring an automatic trigger
  onto it, not building new native capability.
- Neither phone needs the other's exact coordinates — only "are we within
  100m," computed server-side from two last-known points (plain Haversine).
- A ping interval on the order of minutes (tunable), not continuous GPS
  streaming, is the real lever against battery drain.

## Concrete changes, in build order

1. **Prompt** — resolution/aspect-ratio clause in `promptBuilder.ts`.
2. **Upscale** — new `upscaler.ts` provider (Real-ESRGAN via HF Inference
   Providers, pending its own verification test).
3. **Schema** — `Generation.outputKey` splits into `outputKeyGirl` /
   `outputKeyBoy` / `outputKeyTogether` (unchanged from rev. 1).
4. **Location** — client: `expo-location` + `expo-task-manager` (neither
   installed yet) for periodic background position pings. Server: a table
   for each paired user's last lat/lng + timestamp, plus a distance-check
   endpoint the app polls.
5. **Trigger** — whatever polls proximity calls `setDeviceWallpaper()` when
   the 100m line is crossed in either direction.
6. **Consent** — background partner-to-partner location sharing needs a
   real opt-in and an off switch. Flagging alongside the existing
   photo-consent note in `ai-generation-plan.md` §6, not resolving it here.

Sharing rule, unchanged from rev. 1: `create-post`'s creation picker only
ever offers `outputKeyTogether` — the two solo views never become sharable
`Creation` options at all.

## Status

| | |
|---|---|
| ✅ Done | Prompt recipe + 3-image fan-out |
| ✅ Done | `setDeviceWallpaper()` — real, working, already in use |
| ⬜ To build | Resolution-aware prompt + upscale step |
| ⬜ To build | Proximity infrastructure (pings, distance check, sync trigger) |
| 🚧 Blocked | Server actually running — untestable until `server/.env` has real credentials |
