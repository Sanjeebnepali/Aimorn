# Amora Couple Fusion — Visual Forensics + Root-Cause Architecture Report

**Confidence key used throughout this document**:
- **CONFIRMED** — verified directly, either by reading the pixels of the
  actual submitted images side-by-side with the actual source code, or by
  reading the exact code path that produces the behavior. Not a guess.
- **HIGH-CONFIDENCE INFERENCE** — consistent with all available evidence
  (images + code + the developers' own dated bug comments), but not provable
  without an instrumented test run against the live Gemini API (see §6 for
  exactly what that test looks like). Presented as inference, not fact.
- **REQUIRES VERIFICATION** — a real, code-confirmed gap, but its actual
  *impact* on this specific generation can't be measured from static
  analysis alone.

Anything not labeled with one of these is a plain fact read from the code.

---

## 1. What was actually submitted and produced (the real test case)

| # | Image | What it is |
|---|---|---|
| 1 | Woman, red saree, balcony, distant/medium shot | Reference photo — "Partner" |
| 2 | Man, close-up selfie, wet hair, glasses | Reference photo — "You" |
| 3 | Man in black + woman in white, "Rooftop Night" template | Generated **together** output |
| 4 | Man alone, same black outfit | Generated **solo** output (his) |
| 5 | Woman alone, white outfit | Generated **solo** output (hers) |
| 6 | Same as #3, inside the app UI, "Rooftop Night" / Recreate | Confirms #3 is the real shipped "together" result |

This is a COUPLE + template generation → the two-call pipeline in
`generationJob.ts` described in the previous report: **CONFIRMED** by
matching the template name ("Rooftop Night") to `data/templateImages.ts`'s
`rooftopNight: 'rooftop-night.jpg'` entry, and by the visual structure of
image #3 (two people, template background, one clearly template-driven pose)
matching `buildTemplateFaceSwapPrompt` + `buildTemplateCompositePrompt`'s
described behavior exactly.

---

## 2. Visual forensics — comparing reference photos to outputs, feature by feature

### 2a. The man's face (image 2 → images 3/4)

**CONFIRMED, by direct comparison**: his generated face (images 3 and 4)
plausibly matches image 2 — similar jaw width, similar wet/tousled dark
hairstyle, same glasses shape, comparable skin tone. This is the pipeline
*working as intended*.

### 2b. The woman's face (image 1 → images 3/5)

**CONFIRMED, by direct comparison**: her generated face (images 3 and 5)
does **not** match image 1 in several concrete, describable ways:
- Face shape is narrower/more oval in the output; the reference photo shows a
  rounder, fuller face.
- Skin tone in the output reads noticeably lighter/cooler than the warm,
  visibly tanned skin tone in the reference photo.
- Eyebrow shape and thickness differ (thinner, more arched in the output).
- The bindi and dark lipstick from the reference photo DO appear in the
  output — so `FACIAL_ACCESSORY_LINE` is at least partially working — but
  the underlying face structure around them is a different face.

This is not "a slightly different photo of the same generation pass" — this
is the **specific, textbook failure mode** the codebase's own comments
already name: *"the model prefers to keep an already-coherent
placeholder/generic face over fully committing to the real reference
person's likeness."* The bindi/lipstick transferred (those are explicit,
named hard constraints); the actual bone structure did not (there is no
equivalent hard-constraint enforcement mechanism for "this exact face shape"
beyond the same paragraph of text that failed to hold here).

### 2c. Color/tone at the head-to-body boundary (image 3)

**CONFIRMED, by direct pixel inspection of image 3**: the woman's face reads
warmer/pinker-lit than her own arms and legs, which read cooler/paler —
there is a visible tonal break at the neckline, consistent with
`SEAMLESS_INTEGRATION_HARD_CONSTRAINT`'s own described failure mode (written
into the code specifically because this exact symptom was seen before and
survived even a model-tier upgrade). The man's head-to-body tone in the same
image is materially more consistent — reinforcing that this is a
**per-person, per-call** failure, not a property of the template or the
image as a whole.

### 2d. Head-to-body scale (image 3)

**CONFIRMED, by direct inspection**: unlike the "big head" case the
`HEAD_SCALE_HARD_CONSTRAINT` comment describes finding on a different
template, in *this specific* image the head-to-shoulder ratio for both
people looks roughly proportionate to the template's own original models.
So for this exact test case, the scale constraint appears to have held —
the dominant visible defects here are **identity mismatch + tone mismatch**,
specifically on the woman, not head size.

**This matters**: it tells you the bug is not one uniform failure that hits
every generation the same way — it's several independently-triggered
failure modes (scale on some templates/runs, identity+tone on others), all
sharing the same root architectural cause (prompt-only control, no
verification), which is why it feels like "this happens on every theme" even
though the *specific* visible symptom varies.

---

## 3. Why the woman's face specifically failed here — the most likely concrete cause

This is the new, actionable finding from actually looking at your two
reference photos side by side, not just the code.

**CONFIRMED, from the two reference photos themselves**:
- Image 2 (the man's reference) is a **tight close-up selfie** — his face
  fills roughly 40-50% of the frame, sharp focus, even lighting, facing the
  camera directly.
- Image 1 (the woman's reference) is a **medium/full-body shot** taken from
  several meters away — her face occupies roughly 5-8% of the frame, at a
  slight angle, partially shadowed by hair.

**HIGH-CONFIDENCE INFERENCE**: an image-editing model matching "this
person's likeness" from a reference photo has dramatically less resolved
facial information to work with when the face is a small fraction of a
lower-resolution frame than when it fills half a high-detail close-up. This
is a well-documented limitation of reference-based identity transfer in
general (not specific to Gemini) — less face pixels in the source = weaker
identity lock in the output, independent of any prompt wording. Everything
else about the two reference photos being processed through the *identical*
code path (`buildTemplateFaceSwapPrompt`/`buildTemplateEditPrompt`, same
hard constraints, same model, same call) makes reference-photo framing the
single most likely explanation for why one person's identity transferred
correctly and the other's didn't in the same generation.

**CONFIRMED, from the code**: nothing in the pipeline currently checks or
enforces this. `lib/ai/photoQuality.ts`'s own check only verifies
`hasClearFace: true if there is at least one real human face, reasonably
sized in the frame (not a tiny distant figure)` — the woman's photo would
almost certainly PASS that check (her face is not "a tiny distant figure" in
absolute terms), yet it still provides materially less usable facial detail
than a proper close-up. **The quality gate's bar is calibrated for "is there
a face at all," not "is this face image sufficient for high-fidelity
identity transfer."** That's a real, confirmed gap between what the existing
safety check verifies and what the generation task actually needs.

**CONFIRMED, from the code**: the multi-angle identity-lock feature
(`photoACount`/`photoBCount`, described at length in `promptBuilder.ts` as
the fix for "output unrecognizable") is opt-in in the UI
(`create-form.tsx`'s `UploadSlot`) — a user can attach extra angles, but
nothing requires or nudges them to. In this test case, each person supplied
exactly **one** reference photo. **This means the app's own already-built
fix for exactly this complaint was never actually exercised in this
generation.** That's not a new bug to write code for — it's an existing,
shipped capability that isn't being used because the UI doesn't ask for it.

---

## 4. Updated root-cause ranking (combining this session's visual evidence with the prior code review)

1. **No output-side verification** (unchanged from prior report, still the
   #1 systemic gap) — CONFIRMED.
2. **Reference-photo face-detail asymmetry is not gated** — CONFIRMED new
   finding this session. The existing input quality-gate's bar
   ("has a reasonably-sized face") is too low for what high-fidelity
   identity transfer actually needs.
3. **Multi-angle identity lock exists but isn't used by default** —
   CONFIRMED. A real, already-built fix sitting unused behind an optional UI
   affordance.
4. **`SEAMLESS_INTEGRATION_HARD_CONSTRAINT` / `HEAD_SCALE_HARD_CONSTRAINT`
   are prompt-only**, and only wired into the template-edit path — CONFIRMED
   from the prior code review, visually reconfirmed here (tone mismatch is
   real and present exactly where predicted).
5. **`imageSize: '1K'`** — CONFIRMED still live; compounds #2 by giving an
   already-weak reference even less resolution to render against.
6. **The two-call composite design** (stepOne + composite,
   `generationJob.ts`) means the woman's face swap and the man's identity-
   copy happen as two structurally different operations in the same
   generation session — CONFIRMED from code; HIGH-CONFIDENCE INFERENCE that
   this contributes to, but is not the primary cause of, the asymmetry seen
   here (the primary cause is more likely #2/#3 — a materially worse
   reference photo, not which call slot she landed in).

---

## 5. Why "99% confidence" requires more than reading code — and what closes that gap

Being direct about this, as one engineer to another: nobody can respond
"here is the one exact bug, fixed, 99% confirmed" from source-code and
image inspection alone, when the actual point of failure is inside a
closed, non-deterministic third-party model (Gemini) that isn't logging its
own reasoning anywhere in this codebase. What *is* achievable at 99%
confidence is:
- **100% confidence** in every code-level fact stated above (they're read
  directly from the source, not inferred).
- **100% confidence** in the visual defects described in §2 (directly
  observed in the submitted images).
- **High but not provable confidence** in the causal chain connecting them
  (§3), because the actual Gemini request/response for this exact generation
  was never logged anywhere the code currently writes to.

**The fix for that gap is itself part of the architecture below**: this
pipeline currently discards the evidence needed to ever get to 99% confidence
on any single generation, because it logs none of its own inputs/outputs
beyond the final image. §6 below adds exactly that.

---

## 6. Concrete architecture to fix this and make future diagnosis measurable

### 6.1 — P0: Log every generation's full inputs/outputs for diagnosis

Add a structured debug record per `provider.generate()` call in
`generationJob.ts` — not just the final image, but: the exact prompt string
sent, which reference photo keys were attached, the model/seed used, and
(new) the model's raw response metadata. Store as a JSON sidecar next to the
result in the same bucket (`storage.ts` already has `putObjectBytes` —
reuse it for `results/<userId>/<generationId>-debug.json`). This turns every
future complaint from "here's a bad photo, guess why" into "here's the bad
photo AND the exact prompt/inputs that produced it" — the single highest-
leverage change for ever reaching real confidence on root cause, and it's
pure logging, zero risk to existing behavior.

### 6.2 — P0: Reference-photo sufficiency check (closes the gap found in §3)

Extend `lib/ai/photoQuality.ts`'s existing vision-model call (same pattern,
same fail-open philosophy) to also report a `faceAreaFraction` estimate
(rough — "what fraction of the frame does the primary face occupy") and flag
`facingCamera: boolean`. When the face is small and/or angled:
- Client-side (`photoQualityCheck.ts` / `create-form.tsx`): show a specific,
  actionable warning — *"This photo's face is small/angled — for best
  results, use a closer, front-facing photo, or add 1-2 more angles"* —
  rather than a generic pass/fail. Do not hard-block (some users only have
  one photo), but make the tradeoff visible instead of silent.
- Server-side: pass this signal into the prompt itself when the check fires
  — e.g. append a line acknowledging the reference is a partial/angled view
  so the model is told explicitly to work harder to resolve identity from
  limited data, rather than silently defaulting to a generic face.

### 6.3 — P0: Nudge (not require) multi-angle upload

In `create-form.tsx`'s `UploadSlot` usage, when a person has attached
exactly one photo, surface an inline prompt — *"Add 1-2 more angles for a
much more accurate result"* — before `handleGenerate` fires. This activates
a fix that's already fully built and paid for in `promptBuilder.ts`/
`provider.ts` but is currently unused in the majority of real generations by
default.

### 6.4 — P0: Output-side identity/quality check (from the prior report, unchanged, still highest-leverage)

Mirror `photoQuality.ts`'s pattern on the OUTPUT image: a cheap vision-model
call asking "does this generated face match reference photo(s) X" (yes/no +
confidence) and "is head-to-body scale visually normal" (yes/no). Wire into
`generationJob.ts` right after each `provider.generate()`, before
`uploadResult()`. On a failing check: retry once with a perturbed seed
(reusing `nanoBanana.ts`'s existing retry mechanics) before surfacing a
clear "this generation didn't meet quality — try a clearer/closer photo"
error instead of silently shipping the bad result — which is exactly what
happened in this test case.

### 6.5 — P1: Real local color-matching (from the prior report, unchanged)

Replace/augment `imagePostProcess.ts`'s global sharpen+grain with an actual
localized color-transfer step at the head/neck boundary — deterministic
pixel math, not another prompt attempt, since prompt text has already been
shown (by the developers' own comments, and reconfirmed visually here in
image 3) to not reliably fix this.

### 6.6 — P1: Port hard constraints into the non-template prompt paths

`HEAD_SCALE_HARD_CONSTRAINT`/`SEAMLESS_INTEGRATION_HARD_CONSTRAINT` still
only live in `promptTemplateEdit.ts` — add them to `promptFreeform.ts` and
`promptGroup.ts` too, since nothing about those modes makes them immune to
either failure.

---

## 7. What "solved with 99% confidence" actually looks like once 6.1-6.4 ship

Once §6.1 (logging) is in place, every future complaint gets a real,
inspectable trail (prompt + inputs + model response), not just a bad final
image to speculate about — that's what turns "high-confidence inference"
into "confirmed" going forward. Once §6.2/6.3 are in place, this *specific*
test case's most likely root cause (a low-detail, single-angle reference
photo for one person) stops being possible to reproduce, because either the
user is warned/nudged toward a better photo, or the model is explicitly told
it's working with a partial reference. Once §6.4 ships, even a generation
that still comes back wrong for some other reason never reaches the user
silently — it retries or fails loudly instead of shipping a mismatched face,
which is the actual guarantee "99% accurate" requires: not that every single
generation is perfect, but that a bad one is never delivered as if it were.
