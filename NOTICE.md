# Third-Party Notices

Amora is proprietary, closed-source software (see the note in `README.md` /
`package.json` — there is deliberately no repo-root `LICENSE` file granting
rights to Amora's own source; a prior placeholder MIT `LICENSE` left over
from the original `create-expo-app` scaffold was removed 2026-09-13 as
misleading — it described Expo's own template code, not this app).

It does, however, bundle and depend on open-source software, each under its
own license. This file lists every one of them — every license below was
read from that package's own installed metadata (`package.json`, `pip show`,
or a bundled `LICENSE` file), not assumed. Full license texts are available
from each project's own repository; this file names the license and package,
per standard NOTICE practice, rather than reproducing every full license
text inline.

The subset that's actually bundled into the **app binary** distributed to
users (client `dependencies`, not `devDependencies`) is also shown in-app at
Profile → About This App → Open Source Licenses (`src/app/about/licenses.tsx`)
— that's the legally load-bearing copy for end users; this file is the
complete repo-level record, including server-only and Python dependencies
that never leave Amora's own backend.

## Client app (`amora/package.json` dependencies — bundled into the app)

**MIT License:** @clerk/expo, @expo/ui, @expo/vector-icons,
@react-native-async-storage/async-storage, expo, expo-asset,
expo-auth-session, expo-blur, expo-clipboard, expo-constants, expo-crypto,
expo-device, expo-font, expo-glass-effect, expo-image, expo-image-picker,
expo-intent-launcher, expo-linear-gradient, expo-linking, expo-localization,
expo-location, expo-media-library, expo-router, expo-secure-store,
expo-sharing, expo-splash-screen, expo-status-bar, expo-symbols,
expo-task-manager, expo-web-browser, i18next, react, react-dom,
react-i18next, react-native, react-native-gesture-handler,
react-native-reanimated, react-native-safe-area-context, react-native-screens,
react-native-svg, react-native-view-shot, react-native-web,
react-native-worklets, zustand

**MIT AND SIL Open Font License 1.1:** @expo-google-fonts/manrope,
@expo-google-fonts/playfair-display (bundles the Manrope and Playfair
Display fonts — OFL permits bundling and use freely; the one restriction is
never selling the font files on their own, which doesn't apply here since
they're embedded assets, not a product).

## Server (`amora/server/package.json` dependencies — run only on Amora's own backend, never distributed to a device)

**Apache License 2.0:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner,
@google/genai, @neon/config, @neon/env, @prisma/client, sharp

**MIT License:** @clerk/backend, @clerk/express, @huggingface/inference, cors,
express, ws, zod

**BSD-2-Clause:** dotenv

## Server — Python (`server/scripts/face_correct.py`'s runtime — also backend-only)

**Apache License 2.0:** mediapipe (including the bundled
`face_landmarker.task` model — Google's own MediaPipe model card confirms
Apache-2.0 covers the published task models, not just the library code),
opencv-python

**BSD-3-Clause:** numpy

## Services used via API (not bundled code — governed by their own separate terms of service, not an open-source license)

- **Google Gemini API** (`@google/genai`, `server/src/lib/ai/nanoBanana.ts`)
  — image generation and vision checks, under Google's Gemini API Terms of
  Service (paid tier).
- **fal.ai via Hugging Face Inference Providers**
  (`server/src/lib/ai/qwenImageEdit.ts`) — an alternative, currently-inactive
  provider; not called by the live app (`generations.ts` uses
  `NanoBananaProvider`).

## Explicitly ruled out

`docs/ai-generation-plan.md` and `faceGeometry.ts`'s own doc comment record
that a face-swap-model approach (inswapper / InstantID / PuLID) was
considered and rejected specifically on licensing grounds: every one of them
depends on InsightFace's ArcFace model weights, which are licensed
non-commercial-research-use-only — incompatible with a paid commercial app.
MediaPipe + OpenCV (both genuinely Apache-2.0, verified above) were adopted
instead for exactly that reason.
