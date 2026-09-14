# Amora AI Image Generation — Full Prompt Reference, Research Notes & Fix Plan

Purpose of this document: give any engineer or AI coding agent everything needed
to understand *exactly* what is currently sent to the image model, *why* it's
worded the way it is (including the real, dated bugs each piece of wording was
added to fix), and a concrete, prioritized plan to fix the three recurring
quality complaints: **oversized/mismatched head scale**, **unrecognizable
face**, and **color-tone mismatch between the new face and the body**.

Source of truth: `amora/server/src/lib/promptBuilder.ts`,
`promptTemplateEdit.ts`, `promptFreeform.ts`, `promptGroup.ts`,
`lib/ai/nanoBanana.ts`, `lib/ai/provider.ts`, `lib/imagePostProcess.ts`,
`lib/generationJob.ts`, `routes/generations.ts`, `lib/ai/photoQuality.ts`,
`env.ts`. Everything below is read directly from those files (no guessing) —
quoted code comments are the developers' own dated reasoning, kept verbatim so
the "why" is traceable.

---

## 1. Architecture in one paragraph

A request hits `POST /generations` (`routes/generations.ts`), which validates
it, checks credits, then calls `runFusionJob` (`lib/generationJob.ts`).
`runFusionJob` loads the uploaded reference photos, builds one or more
natural-language prompt strings via `promptBuilder.ts` (which dispatches to
`promptTemplateEdit.ts` / `promptFreeform.ts` / `promptGroup.ts` depending on
mode), and sends each prompt + the relevant images to
`NanoBananaProvider.generate()` (`lib/ai/nanoBanana.ts`), which calls Google's
Gemini image model (`gemini-3.1-flash-image`, marketed as "Nano Banana") via
`generateContent`. For the COUPLE+template case specifically, **two separate
Gemini calls** edit the same original template photo (once per person), and a
cosmetic post-process (`imagePostProcess.ts`) runs on the final "together"
image only.

There is **no output-side verification anywhere in this pipeline**. Every
prompt below is the *entire* quality-control mechanism currently in place —
plain English text sent once (or retried only on a hard API failure), trusted
completely.

---

## 2. The building-block constants (shared across every prompt)

These live in `promptBuilder.ts` and get appended to every prompt variant
below, in this fixed order: `[subjectLine, BODY_TYPE_HARD_CONSTRAINT,
FACIAL_ACCESSORY_LINE, (HEAD_SCALE_HARD_CONSTRAINT +
SEAMLESS_INTEGRATION_HARD_CONSTRAINT — template-edit paths only), styleLine,
additionalNoteLine, formatLine, modestyLine]`, joined with single spaces into
one long paragraph.

```
BODY_TYPE_HARD_CONSTRAINT =
"HARD CONSTRAINT — body type: match each person's real body weight, size,
build, and proportions EXACTLY as shown in their own reference photos. Do not
slim them down, do not add weight, do not idealize or "improve" their
physique, do not default to a generic or average build when the reference
photo only shows their face or upper body — infer the rest of their body
conservatively from what IS visible (shoulder width, neck, visible frame)
rather than inventing an unrelated body type. This is a hard constraint, not a
style preference."
```
*Why it exists*: a real user complaint — "my photo still looks unrecognizable
because of fatty and so on" — traced to generic image models normalizing an
unclear/partially-visible body toward a default build when the reference photo
is face-only or tightly cropped.

```
FACIAL_ACCESSORY_LINE =
"HARD CONSTRAINT — facial accessories and markings: if their reference photo
shows a bindi, facial piercing, earring, nose ring, mole, freckle, scar, or
other distinctive marking, that exact marking MUST appear in the output in the
same position. Do not omit it and do not "clean up" or beautify it away — a
missing marking that was present in the reference photo is a failure of this
task, the same as a wrong face shape would be. This is a hard constraint, not a
style preference."
```
*Why it exists*: re-tested live against a known broken case after a hair-
transfer fix — the result still dropped the reference photo's bindi because
the wording at the time named facial *structure* (eyes, nose, jawline, skin
tone) and hair, but never accessories/markings.

```
HEAD_SCALE_HARD_CONSTRAINT =
"HARD CONSTRAINT — head-to-body scale: the replacement head (face and hair
together) must occupy the exact same size and scale relative to the body as
the original template head did — measure against their own neck width and
shoulder line, not against how a typical portrait crop of the reference photo
would frame their head. A head that reads as visibly larger or smaller than
the body it sits on, even with the correct face, is a failure of this task,
the same as a wrong face shape would be. This is a hard constraint, not a
style preference."
```
*Why it exists* — **this is your "big head" bug, already diagnosed once**:
direct pixel measurement against a real template (`rooftop-night.jpg`) and a
real generated output confirmed the swapped-in head came back measurably
larger (relative to body landmarks) than the template's own original head.
Root cause by elimination: earlier prompt versions said to preserve "pose,
body position, and clothing" but never named head *size/scale* as something to
preserve — only identity (whose face), never the geometric fit of that face
into the existing body. **This fix is text-only.** Nothing downstream measures
the output to confirm the model actually complied.

```
SEAMLESS_INTEGRATION_HARD_CONSTRAINT =
"HARD CONSTRAINT — seamless integration: the new head must be rendered at the
exact same sharpness, focus, film grain, and lighting as the rest of the
photo — the area immediately around it (hair edges, ears, background) must NOT
be softer, blurrier, or lower-detail than the rest of the image. Their new
face and neck skin tone must continue smoothly and exactly into the neck and
body skin already visible in the photo — no visible seam, color shift, edge
halo, or mismatched tone where the new head meets the existing body. A head
that reads as pasted onto the body rather than naturally part of the same
photograph is a failure of this task, the same as a wrong face shape would be.
This is a hard constraint, not a style preference."
```
*Why it exists* — **this is your "color tone mismatch" bug, already diagnosed
once**: a real complaint named two concrete symptoms — background around each
swapped head reads softer/blurrier, and the new head's skin tone doesn't
continue smoothly into the neck/body. Tested against both the cheaper model
tier and the pricier "Pro" tier — **the same seam showed up either way**,
ruling out "model isn't capable enough" as the explanation. The actual
mitigation that shipped is NOT prompt text — it's `reduceEditSeam()` in
`imagePostProcess.ts` (section 4 below), and that function only fights the
*blur* half of the symptom, not the *color* half.

```
describeReferenceImages(startIndex, count) →
  count <= 1: "the {ORDINAL} reference photo"
  count  > 1: "the {ORDINAL} through {ORDINAL} reference photos (these are ALL
  the very same person, just different angles/expressions/lighting — never
  treat them as different individuals, and never blend them into an averaged
  or composite face; use them together to lock in that one person's true
  likeness)"
```
*Why it exists*: multi-angle identity lock — Google's own Nano Banana Pro
guidance documents multiple reference images (up to 14, 6 at high fidelity) as
measurably better for identity lock than one photo. Added directly in response
to "output unrecognizable / doesn't look like me." The explicit "these are the
SAME person" callout matters because an unlabeled group of similar faces reads
to the model as "several people to compose," the opposite of intent.

```
buildFormatLine(subjectMode) →
"Compose it as a vertical phone wallpaper, {who}, natural consistent lighting
across the whole image. Full-body composition — head to feet both visible in
frame — unless the scene description elsewhere in this prompt explicitly asks
for a close-up, headshot, or portrait crop instead."
```
*Why it exists*: an earlier version just said "fully visible," which a tight
face/bust crop technically satisfies — so the model had no real signal to
prefer full-body framing for what's supposed to be a whole-scene wallpaper.
**Side effect relevant to your "unrecognizable face" complaint**: forcing
full-body framing means the face occupies a small fraction of the frame —
especially compounded by the `imageSize: '1K'` setting in section 3 — leaving
very few pixels of actual facial detail for the model to get right, and for
viewers to judge.

```
sanitizeUserPrompt(text, maxLength) — denylist substring check against:
"ignore previous instructions", "ignore the above", "different face",
"change the person", "swap the face", "new pose", "different person",
"not the same person", "another person", ... (case-insensitive substring)
```
*Why it exists*: stops the free-text description field from being used to talk
the model out of face/pose/scene rules. **Known weakness**: plain substring
matching on exact phrases — any paraphrase of the same idea slips through
uncaught.

---

## 3. The AI call itself — `lib/ai/nanoBanana.ts`

```ts
model: env.GEMINI_MODEL,              // "gemini-3.1-flash-image" — the cheaper
                                       // "Flash" tier, not the pricier "Pro" tier
contents: [{ role: 'user', parts: [
  { text: <the assembled prompt from section 2/5/6> },
  templateImage?,                     // inline image, FIRST, if a template photo is attached
  ...photoA (all angles, as separate image parts),
  ...photoB (all angles, if COUPLE),
  identityReferenceImage?,            // inline image, LAST, couple-template composite step only
]}],
config: {
  seed: <shared per session, perturbed +1/+2 on retry>,
  imageConfig: { aspectRatio: '9:16', imageSize: '1K' },  // <-- see note below
},
```

**`imageSize: '1K'` is a deliberate, dated, explicitly-temporary cost
decision**, quoted directly from the code comment:

> "dropped from '2K' to '1K' 2026-09-12 for this session's testing pass...
> real per-image pricing on gemini-3.1-flash-image is $0.067 (1K) / $0.101
> (2K) / $0.151 (4K)... 1K is the cheapest tier on purpose while iterating,
> NOT a bump toward 4K. Raise back to '2K' (or '4K') here once testing is
> done and this is actually shipping to real users."

This is currently live and currently hurting facial fidelity — lower
resolution gives the model (and the final image) less room to render fine
facial detail, which directly compounds the "unrecognizable face" complaint.

**Retry logic**: up to 3 attempts, but *only* retries on (a) no image data
returned with no safety block named, or (b) a transient 429/5xx from Google's
own servers. A real safety block is NOT retried (correct — retrying won't
change a policy verdict). **Critically: a returned image that simply looks
wrong — wrong face, oversized head, mismatched tone — is never distinguished
from a correct one.** The function has no concept of "this succeeded
technically but failed the actual task."

---

## 4. The only real output-side fix that exists — `lib/imagePostProcess.ts`

```ts
export async function reduceEditSeam(imageBytes: Buffer): Promise<Buffer> {
  // 1. sharp(imageBytes).sharpen({ sigma: 1.2, m1: 0.5, m2: 3.5, x1: 2, y2: 12, y3: 22 })
  //    — unsharp-mask sharpening, asymmetric so already-detailed regions
  //      (background, clothing) sharpen more than the naturally flatter
  //      edit-boundary region, narrowing the "sharp photo vs soft edit" gap
  // 2. .composite([{ input: <uniform low-sigma gaussian noise PNG>, blend: 'overlay' }])
  //    — adds a uniform film-grain texture across the WHOLE frame, because a
  //      blended AI edit typically has less natural sensor noise than a real
  //      photo, and that texture mismatch also reads as "pasted on"
  // Fails open: any error returns the original, untouched bytes.
}
```

Only ever called on the COUPLE+template "together" image — never on solo
portraits (they recompose their own frame and didn't show the same seam in
testing).

**What this does NOT do, and why it matters for your complaint**: this is a
*global, uniform* pass over the entire image. It has no concept of "the head
region" vs "the body region," and it does nothing to actual pixel *color* —
no white-balance correction, no skin-tone sampling, no local color transfer.
It can make a blurry seam read as slightly less blurry; it cannot make a
yellow-toned pasted face match a cooler-toned body, or vice versa. **The color-
tone-mismatch complaint is, today, not addressed by any code — only by the
`SEAMLESS_INTEGRATION_HARD_CONSTRAINT` prompt text, which the developers'
own comment already admits didn't remove the seam even when they tried the
pricier Pro-tier model.**

---

## 5. The actual, full assembled prompts — COUPLE + template (your case)

This is two Gemini calls. Both edit the *same* pristine template photo
(`templateImageFor(templateId)` in `data/templateImages.ts`, e.g.
`rooftop-night.jpg`) — never each other's output — specifically because an
earlier chained version (step 2 editing step 1's own rendered pixels) was
measured to degrade whoever landed in step 2.

### Call 1 — `buildTemplateFaceSwapPrompt` (your face applied to the template)

Assembled from (`promptTemplateEdit.ts`):

```
This is an image-EDITING task, not a new image-generation task. The FIRST
attached image shows two people together — preserve it exactly: background,
lighting, camera angle, composition, both people's pose, body position, and
clothing. Exactly ONE of the two people should have their entire head — face
AND hair — replaced: look at {the SECOND [through Nth] reference photo(s) —
"same person" callout if >1} and pick whichever of the two people in the
first image they most plausibly correspond to (matching apparent gender, age,
and build) — replace ONLY that person's face and hair with it. Leave the
other person completely untouched — their face, hair, pose, and clothing must
stay exactly as shown in the template, pixel for pixel. The person you are NOT
touching keeps their template appearance exactly. The person you ARE touching
is a PLACEHOLDER model whose face, hairstyle, and identity must be COMPLETELY
discarded, not partially kept or blended with the real reference person.
Match their exact facial structure, eye shape, nose shape, jawline, skin tone,
hair color/length/style, AND any bindi, facial piercing, earring, nose ring,
mole, freckle, or scar visible in their reference photos — do not idealize,
slim, beautify, or alter proportions, and do not blend it with the face or
hair already there. Preserve their actual facial features precisely, not a
generic or "improved" version, and use their reference photos' real skin tone
and texture, not the original photo's tone or the placeholder's hairstyle.
The new head must fit the neck and shoulders already in this photo at their
existing scale — do not render it at the size a fresh portrait of the
reference photo would normally use.

{BODY_TYPE_HARD_CONSTRAINT} {FACIAL_ACCESSORY_LINE} {HEAD_SCALE_HARD_CONSTRAINT}
{SEAMLESS_INTEGRATION_HARD_CONSTRAINT}

Style: {stylePromptFor(styleKey)}.
{additionalNoteLine — user's optional style note, sanitized, ≤150 chars}
{buildFormatLine('COUPLE')}
Never remove, alter, or extend past a person's actual clothing as shown in
the attached photo.
```

Images attached, in order: `[templateImage, ...photoA (all your angles)]`.
Output of this call is kept as `stepOne` — used ONLY as the
`identityReferenceImage` for call 2, never shown to the user directly.

### Call 2 — `buildTemplateCompositePrompt` (partner's face + copying yours back in)

```
This is an image-EDITING task, not a new image-generation task. The FIRST
attached image shows two people together, both still generic placeholder
models — preserve it exactly: background, lighting, camera angle,
composition, both people's pose, body position, and clothing. One of the two
people should have their entire head — face AND hair — replaced using {the
SECOND [through Nth] reference photo(s) for partner}: look at those reference
photos and pick whichever of the two people they most plausibly correspond to
(matching apparent gender, age, and build) — replace ONLY that person's face
and hair with it. Match their exact facial structure, eye shape, nose shape,
jawline, skin tone, hair color/length/style, AND any bindi, facial piercing,
earring, nose ring, mole, freckle, or scar visible in their reference photos —
do not idealize, slim, beautify, or alter proportions. The LAST attached image
shows a person's face and hair already finalized and correct for this exact
photo, from an earlier edit — identify which of the two template people that
already-finalized face most plausibly belongs to (matching apparent gender,
age, and build; it will be whichever one you are NOT replacing with the
reference photos above), and give that person EXACTLY that face and
hairstyle. Copy it precisely — do not regenerate, reinterpret, restyle,
beautify, or vary it in any way, and do not soften or simplify its detail
just because it came from an image rather than a real photo. Their hair must
be a pure, exact copy of that image's hair color and style — do not blend,
tint, streak, or mix in any of the PLACEHOLDER's original hair color or
highlights; a stray strand of the wrong color is a failure of this task, the
same as a wrong face shape would be. Treat it as a fixed, already-correct
asset to place, not something to reimagine. Both people currently shown are
PLACEHOLDER models — each one's face, hairstyle, and identity must be
COMPLETELY discarded, not partially kept or blended with the real person
replacing them. Preserve both people's actual facial features precisely, not
a generic or "improved" version, and use their real skin tone and texture,
not the template photo's original tone or either placeholder's hairstyle.
Each new head must fit the neck and shoulders already in this photo at their
existing scale — do not render either one at the size a fresh portrait would
normally use.

{BODY_TYPE_HARD_CONSTRAINT} {FACIAL_ACCESSORY_LINE} {HEAD_SCALE_HARD_CONSTRAINT}
{SEAMLESS_INTEGRATION_HARD_CONSTRAINT}

Style: {stylePromptFor(styleKey)}.
{additionalNoteLine}
{buildFormatLine('COUPLE')}
Never remove, alter, or extend past a person's actual clothing as shown in
the attached photo.
```

Images attached, in order: `[templateImage, ...photoB (partner's angles),
identityReferenceImage (= stepOne's raw output bytes)]`.

The output of call 2 is then passed through `reduceEditSeam()` (section 4)
and that's the final "together" image shown to the user.

**Diagnosis specific to this two-call design**: "copy this exact face from an
attached image" (what call 2 is asked to do with your already-generated face)
is still a *generative* re-interpretation task for a diffusion-style model,
not a pixel-perfect paste — so call 2 is a second independent roll of the
dice on color grade, lighting, and sharpness, even though the instructions
explicitly say "do not reimagine." This is the most likely single cause of
within-image tone mismatch specifically in couple+template generations: two
separate model calls, asked to agree on lighting/tone, with nothing but text
asking them to.

### Also run in the same session: two solo portraits (`buildTemplateEditPrompt`)

Same template-edit idea, but the instruction is to *isolate one person and
discard the other entirely* (recompose/recrop) rather than leave two people
in frame. Full text in `promptTemplateEdit.ts` lines 57–139; structurally
identical hard-constraint stack appended. These two calls run in parallel
with the together-image calls (all via one `Promise.all` in
`generationJob.ts`), sharing the same `seed`.

---

## 6. The other prompt variants, for completeness

- **SOLO/COUPLE with no template photo** (`promptFreeform.ts`,
  `buildFreeformScenePrompt`) — a from-scratch scene composition fusing one
  or two real faces into an invented photo. Structurally the *hardest* task
  (no existing body/scale to anchor against at all) and gets **no
  HEAD_SCALE or SEAMLESS_INTEGRATION constraint at all** — those two
  constants are only ever added in `promptTemplateEdit.ts`'s two functions.
  If you are seeing the same head-scale/tone problems on non-template
  couple generations, that is a straightforward gap: those two constants
  are never appended to this prompt. **Same applies to GROUP mode**
  (`promptGroup.ts`) — also missing `HEAD_SCALE_HARD_CONSTRAINT` and
  `SEAMLESS_INTEGRATION_HARD_CONSTRAINT` entirely.
- **"General" freeform mode** (`freeform: true`, one photo + free text,
  e.g. "reimagine me as 90s yearbook photo") — same file, inverts the
  default so pose/outfit/era are the user's to redirect; identity and body
  type stay hard-locked.

---

## 7. Consolidated list of every current gap (for an implementing agent)

1. **No output-side verification.** `nanoBanana.ts`'s retry only fires on
   API-level failure, never on a technically-successful-but-wrong result.
   `photoQuality.ts` proves the team already knows this pattern (a cheap
   vision-model call asking yes/no questions) — it's just never been applied
   to the *output* image, only the *input* photo.
2. **`imageSize: '1K'`** in `nanoBanana.ts` is a live cost-cutting setting
   explicitly flagged in its own comment as temporary-for-testing. Directly
   reduces facial detail.
3. **`HEAD_SCALE_HARD_CONSTRAINT` / `SEAMLESS_INTEGRATION_HARD_CONSTRAINT`
   are prompt text only** — no geometric or colorimetric check confirms
   compliance. Already proven (by the developers' own real tests) to not
   fully work even on the pricier model tier.
4. **Missing entirely from the non-template prompt paths.** Both hard
   constraints live only in `promptTemplateEdit.ts`; `promptFreeform.ts`
   and `promptGroup.ts` never import or append them.
5. **`reduceEditSeam()` fixes blur, not color.** No local color-
   matching/transfer step exists anywhere in the codebase.
6. **Two-call compositing for COUPLE+template** means two independent model
   calls have to agree on tone/lighting with no shared mechanism besides a
   shared `seed` and prompt text saying "copy precisely."
7. **Model-level bias, only partially mitigated.** Documented, researched
   bias where the model prefers to keep an already-coherent placeholder
   face; mitigated only by `templateModelReplacementLine` wording, which by
   definition can't guarantee compliance.
8. **Prompt-injection and content-policy filters are plain substring
   denylists** (`sanitizeUserPrompt` in `promptBuilder.ts`,
   `checkContentPolicy` in `contentPolicy.ts`) — easy to bypass via
   paraphrase; not a cause of the visual-quality complaints, but a real gap
   if asked about "other problems."
9. **Hand/finger artifact fix is template-specific wording**
   (`handArtifactLine` in `buildTemplateEditPrompt`), added after one
   specific observed case (a golden-hour template) — not a general
   anatomical-correctness check, so the same failure mode can recur on any
   template not yet manually caught this way.

---

## 8. Prioritized fix plan (concrete enough to implement directly)

**P0 — Add an output-side quality/identity gate**, mirroring
`lib/ai/photoQuality.ts`'s own pattern (cheap vision-model call,
fail-open, JSON-only response):
- New function, e.g. `lib/ai/outputQuality.ts`: `assessGenerationOutput(resultBytes, referencePhotoBytes[]) → { facesMatch: boolean, headScaleOk: boolean, reason: string }`.
- Call it in `generationJob.ts` right after each `provider.generate()` call
  (or at minimum after the COUPLE "together" composite and each solo
  portrait) and before `uploadResult()`.
- On failure: retry that specific call once with a perturbed seed (same
  pattern `nanoBanana.ts` already uses for transient errors) before giving
  up and surfacing a clear error instead of silently shipping a bad result.
- Use `env.GEMINI_VISION_MODEL` (already configured, cheap, per-token
  pricing) — no new provider/API needed.

**P0 — Revert `imageSize` to `'2K'`** in `nanoBanana.ts`'s
`generateContent` call once cost testing is done — this is explicitly
flagged by the original author as a temporary setting, not a permanent
decision.

**P1 — Add real local color correction** in `lib/imagePostProcess.ts`:
- After `sharp` has the composited image, detect (or accept as a parameter,
  since the pipeline already knows which region was edited) a sample patch
  of skin near the jaw/neck boundary on both the "new head" side and the
  "existing body" side.
- Apply a LAB-space or Reinhard-style color transfer so the new head
  region's mean/stddev of L*a*b* channels is shifted toward the body
  region's, instead of (or in addition to) the current sharpen+grain pass.
- This is a deterministic, non-AI fix — much more reliable than asking the
  model nicely, and directly targets the complaint the current
  `SEAMLESS_INTEGRATION_HARD_CONSTRAINT` text has already been shown not to
  fully solve.

**P1 — Port `HEAD_SCALE_HARD_CONSTRAINT` and
`SEAMLESS_INTEGRATION_HARD_CONSTRAINT` into `promptFreeform.ts` and
`promptGroup.ts`** — currently only in `promptTemplateEdit.ts`; the
no-template COUPLE/GROUP paths get neither, despite being just as (if not
more) prone to the same failures.

**P2 — Consider a lightweight geometric sanity check** using a small
face-detection library (not another paid AI call) to measure head-bbox vs.
shoulder-width ratio pre- and post-generation, as a second, cheaper signal
feeding the same retry-on-failure path as the P0 vision-model gate.

**P2 — Tighten the "two-call composite" design** for COUPLE+template: since
the root issue is two independent generative calls being asked to agree on
tone, consider whether a single combined call (both faces swapped at once,
accepting the earlier-documented risk of one face landing weaker) is
actually worse than two calls that can now also drift in color from each
other — this tradeoff was decided one way in 2026-09-12 for *fidelity*
reasons, but the color-matching fix in P1 changes the calculus and is worth
re-measuring against real generations once implemented.

---

## 9. Pointers for an implementing agent

| Concern | File |
|---|---|
| Prompt text (all modes) | `server/src/lib/promptBuilder.ts`, `promptTemplateEdit.ts`, `promptFreeform.ts`, `promptGroup.ts` |
| AI provider call, retries, resolution/model config | `server/src/lib/ai/nanoBanana.ts`, `provider.ts` |
| Orchestration (what gets called when) | `server/src/lib/generationJob.ts` |
| Input-side quality gate (the existing pattern to copy) | `server/src/lib/ai/photoQuality.ts` |
| Cosmetic post-process (blur/grain only) | `server/src/lib/imagePostProcess.ts` |
| Route, credits, response shape | `server/src/routes/generations.ts` |
| Env/model config | `server/src/env.ts` |
