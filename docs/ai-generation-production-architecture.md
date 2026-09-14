# Amora Couple/Solo Fusion — Production-Grade Architecture (Industry-Standard Approach)

## 0. Setting honest expectations, upfront

"100% correct, zero error, fully guaranteed" is not a real engineering target
for any system that includes a generative model, a real camera photo of a
real face, and a template scene — for the same reason no photo-editing
company can guarantee that. What follows is not that. What follows IS the
**actual architecture the rest of this industry uses** to make the three
specific failures you're hitting (oversized head, unrecognizable face, color
seam) *structurally very unlikely instead of hoping a paragraph of English
text is obeyed*. That distinction — "the geometry is computed, not
requested" — is the entire fix. It also happens to be cheaper to run at
volume and dramatically cheaper to test than what Amora does today, which
directly answers your budget concern.

---

## 1. The core architectural mistake in Amora today

Amora currently asks ONE general-purpose multimodal model (Gemini / "Nano
Banana") to do three unrelated jobs in a single call, purely through English
instructions:
1. Invent/preserve the scene, pose, and clothing.
2. Preserve a real person's exact facial identity.
3. Geometrically size and color-blend that face onto an existing body.

Jobs 2 and 3 are not language problems. They are **measurement and pixel-
blending problems** — a face has an actual bounding box, actual landmark
coordinates, and actual pixel color statistics. Asking a language-conditioned
image model to "make the head the right size" and "match the skin tone
exactly" is asking it to approximate arithmetic through prose. It sometimes
works. It isn't supposed to be reliable, and every failure you've shown me is
consistent with exactly that.

**The fix is to stop asking for job 2 and 3 in English at all**, and do them
with actual face-recognition and image-compositing math — the same
building blocks (confirmed current as of 2026) that the rest of this product
category is built on:

- **InsightFace / ArcFace** — face detection + landmark extraction + a
  numeric "identity embedding" (a vector that represents a face
  mathematically, not a description of it).
- **inswapper** — a small, free, open-weight face-swap model that takes that
  identity embedding and renders it into a target face region, aligned by
  the actual detected landmarks (source: [haofanwang/inswapper](https://github.com/haofanwang/inswapper), also offered as a hosted enterprise API by [InsightFace itself](https://www.insightface.ai/solutions/face-swapping)).
- **GFPGAN / CodeFormer** — a free, open-weight face-restoration model that
  sharpens/cleans a swapped face afterward (fixes the "low detail /
  unrecognizable" symptom directly, deterministically).
- **OpenCV `seamlessClone` (Poisson image editing)** — a 20-year-old,
  completely deterministic blending algorithm that mathematically matches
  gradients and color at a paste boundary. This is *the* standard way the
  industry removes exactly the "pasted head" / tone-mismatch seam you're
  seeing — not a prompt, actual pixel math ([reference](https://pixlane.media/seamless-clone-poisson-blend/), [reference](https://onlinelibrary.wiley.com/doi/10.1155/2019/8902701)).
- **InstantID / PuLID / IP-Adapter FaceID** — newer diffusion-based
  techniques that inject the identity embedding directly into the image
  generator's attention layers, so identity is preserved *during*
  generation rather than pasted on after. Current 2026 comparisons confirm
  these are the live state of the art for identity-preserving generation
  ([PuLID vs InstantID vs FaceID, 2026](https://aiofm.info/en/guides/pulid-vs-instantid-vs-faceid), [InstantID-faceswap](https://github.com/nosiu/InstantID-faceswap), [WaveSpeed 2026 roundup](https://wavespeed.ai/blog/posts/open-source-face-swap-software/), [Civitai 2026 guide](https://civitai.com/articles/31600/the-definitive-guide-to-face-swapping-in-2026)).

None of this is exotic — it's the standard toolkit. The difference from
what Amora does today is simple to state: **identity and geometry are
computed from the actual photo, not requested from a language model.**

---

## 2. Two tracks, in order of how fast/cheap they are to ship

### Track A — "Swap after generation" (recommended first step, days not weeks, minimal cost)

Keep Gemini exactly where it already works (scene, pose, outfit, template
recreation) — that part of Amora's pipeline is fine. Stop asking Gemini to
carry the actual identity match. Instead:

1. Gemini generates the "together"/solo image as it does now, EXCEPT the
   prompt no longer asks it to replicate a specific person's face — it's
   told to render a plausible person of matching gender/build/skin tone in
   the scene (a much easier, much more reliable task for a language-
   conditioned model, since it's no longer fighting the "keep the
   placeholder face" bias documented in your own code comments).
2. A new deterministic post-process step — a small, self-hosted Python/ONNX
   service running `inswapper` — detects the face region in Gemini's output,
   detects the face + landmarks in the user's real reference photo, and
   swaps the real identity in, aligned by the actual landmark geometry (not
   "please match the scale").
3. `GFPGAN` runs immediately after to sharpen/restore the swapped face
   region (fixes low-resolution/soft-detail complaints structurally).
4. `cv2.seamlessClone` blends the result into the surrounding image — this
   is the actual, mathematical fix for the color/tone-seam problem
   `imagePostProcess.ts`'s grain-and-sharpen pass was only ever
   approximating.

**Why this is budget-friendly, not budget-expensive**: `inswapper` and
`GFPGAN` are free, open-weight models you run once on your own (or a rented)
GPU — no per-image API fee, unlike every Gemini call you're paying for today.
A single small GPU instance (or even a CPU box via `onnxruntime`, slower but
workable at low volume) handles this step for a fixed monthly cost instead of
a per-generation bill. And because the math is deterministic, you don't need
"unlimited testing" to trust it — you validate it once with a handful of
fixed test photos and a simple assertion ("swapped face's bounding box is
within X% of the target face region's size"), not by generating hundreds of
images and eyeballing them.

**What this fixes, structurally, not probabilistically**:
- Big head → the swap is geometrically aligned to the *actual detected*
  target face region — there's no "scale" for the model to get wrong,
  because scale is computed, not requested.
- Unrecognizable face → the identity comes from a real embedding of the
  real photo, the same mathematical representation used for face
  recognition — not a paragraph asking a language model to "match facial
  structure."
- Color mismatch → `seamlessClone` is Poisson image editing — it
  mathematically solves for the color gradient at the boundary. It cannot
  produce a visible seam the way a generative "please make lighting match"
  instruction can silently fail to.

### Track B — "Identity-conditioned generation" (better quality, more engineering, still one-time infra cost not per-call)

Once Track A is stable, consider replacing Gemini entirely for the
identity-critical modes with a self-hosted diffusion pipeline using
**InstantID** or **PuLID** (both free, open-weight, actively compared and
maintained as of 2026 per the sources above) — these inject the face
identity embedding directly into the image generator, so the face is
correct from the first generation instead of composited on afterward. This
gets better results than even Track A on hard scenes (extreme angles,
heavy stylization) but needs a GPU worker running Stable Diffusion/Flux plus
the InstantID/PuLID weights — a real infra project, not a quick patch. Worth
planning toward, not worth blocking Track A on.

---

## 3. Why this directly solves your budget/testing concern

The reason Amora currently "needs unlimited testing" is that the
correctness of every generation depends on whether a probabilistic language
model happened to follow a paragraph of English instructions *that specific
time*. That is inherently untestable in the normal sense — you can only
generate more images and hope, which is expensive (real Gemini billing per
image) and never actually converges to certainty.

Track A replaces the untestable part with fixed math:
- Landmark alignment and scale computation is pure arithmetic — you write a
  unit test with one known input photo and one known target region, assert
  the output bounding box is the right size, and it either passes or it
  doesn't, forever, for free, with no API calls.
- `seamlessClone` is a deterministic OpenCV function — same input, same
  output, every time.
- The only thing that still varies run-to-run is Gemini's *scene*
  generation (background/pose/outfit), which was never the part causing
  your complaints — your complaints were always about the face, which this
  removes from Gemini's job entirely.

This is a smaller total testing burden than what you have today, not a
bigger one, because you're testing deterministic code instead of gambling on
a model's mood.

---

## 4. Where this fits into Amora's existing code

- `lib/ai/nanoBanana.ts` stays largely as-is for scene generation, with the
  prompt simplified to drop the "match this exact person's face" burden
  (still keeps body-type/clothing/pose preservation, which already works).
- New service: `lib/ai/faceSwap.ts` (or a small separate Python
  microservice called over HTTP/gRPC from `generationJob.ts`) wrapping
  `inswapper` + `GFPGAN` + `seamlessClone`, run as the step immediately
  after `provider.generate()` and before `uploadResult()`.
- `imagePostProcess.ts`'s current `reduceEditSeam` (sharpen+grain) either
  gets removed (Poisson blending in the new step makes it redundant) or
  kept as a final, very light polish pass after the real color-correct
  blend.
- The existing output-quality-gate idea from the prior report (a cheap
  vision-model check after generation) is still worth keeping as a final
  safety net for the scene-generation half, but is no longer the primary
  line of defense for identity — geometry/identity correctness now comes
  from math, and the vision check becomes a true last-resort catch, not the
  only check.

---

## Sources

- [haofanwang/inswapper (GitHub)](https://github.com/haofanwang/inswapper)
- [InsightFace enterprise face-swap API](https://www.insightface.ai/solutions/face-swapping)
- [InstantID-faceswap (GitHub)](https://github.com/nosiu/InstantID-faceswap)
- [PuLID vs InstantID vs IP-Adapter FaceID: 2026 Face-Consistency Showdown](https://aiofm.info/en/guides/pulid-vs-instantid-vs-faceid)
- [Open Source Face Swap Software: Top Models & Tools (2026) — WaveSpeed](https://wavespeed.ai/blog/posts/open-source-face-swap-software/)
- [The Definitive Guide to Face Swapping in 2026 — Civitai](https://civitai.com/articles/31600/the-definitive-guide-to-face-swapping-in-2026)
- [Seamless Cloning / Poisson Image Editing explainer](https://pixlane.media/seamless-clone-poisson-blend/)
- [Face Swapping: Realistic Image Synthesis Based on Facial Landmarks Alignment (Wiley, peer-reviewed)](https://onlinelibrary.wiley.com/doi/10.1155/2019/8902701)
