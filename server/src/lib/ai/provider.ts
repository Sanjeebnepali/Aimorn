/**
 * Every AI image-fusion backend implements this same shape. The
 * `generations` table stores `provider`/`model` per row specifically so we
 * can swap or A/B implementations here without touching the schema, the
 * route, or old rows — see prisma/schema.prisma.
 */
export type FusionInput = {
  /**
   * One or more raw-bytes photos of the "You" person — always at least one.
   * Changed from a single photo to an array 2026-09-12: Google's own Nano
   * Banana Pro prompting guidance documents multi-reference identity
   * locking (up to 14 reference images, 6 at high fidelity) as a real,
   * measurably-better-than-one-photo technique, which directly answers a
   * real complaint ("output unrecognizable / doesn't look like me") — a
   * single photo gives the model exactly one angle/lighting condition to
   * match against; several angles of the same person give it a much more
   * robust identity to hold onto across a totally different generated
   * scene. See promptBuilder.ts's PromptInput.photoACount for how the
   * prompt text tells the model these are the SAME person, not extra
   * people.
   */
  photoA: { bytes: Buffer; mimeType: string }[];
  /** Same idea as photoA, for the "Partner" person. Absent for solo mode. */
  photoB?: { bytes: Buffer; mimeType: string }[];
  /**
   * The exact template photo (src/data/templateImages.ts) to use as the
   * editing target when a template with a real photo was selected — added
   * 2026-09-11 so "recreate this template" can genuinely match its
   * background/pose/clothing instead of only a text description of it
   * (promptBuilder.ts's template-image branch). Sent as the FIRST inline
   * image, before photoA/photoB — every implementation's ordering must
   * agree with promptBuilder.ts's "first/second/third attached image"
   * wording. Absent when no template is selected, or the selected one has
   * no real photo (e.g. the illustrated-only "Cartoon Us").
   */
  templateImage?: { bytes: Buffer; mimeType: string };
  /**
   * A previously-generated result to copy ONE person's face from exactly,
   * rather than a real photo to match a likeness against — added
   * 2026-09-12 to fix a real, measured bug: COUPLE+template's old approach
   * chained two edits (pass 2 edited pass 1's own OUTPUT pixels), and the
   * person swapped in pass 2 came back with visibly lower fidelity than
   * either a solo portrait OR the pass-1 person — a well-documented risk of
   * re-editing an already-synthetic image instead of the pristine
   * original. The fix: BOTH people's faces now get applied to the CLEAN
   * original templateImage in a single final call — one person via normal
   * reference photos (photoA), the other via this field, pointing at
   * whatever the earlier, already-correct solo pass produced for them.
   * "Copy this exact face" is a categorically easier ask for the model
   * than "replicate this real person's likeness," so this person's face
   * comes out at the same fidelity as a fresh edit, not a degraded re-edit.
   * Sent as the LAST inline image — see promptTemplateEdit.ts's
   * buildTemplateCompositePrompt for the exact wording that depends on it
   * being last.
   */
  identityReferenceImage?: { bytes: Buffer; mimeType: string };
  /** Fully-built natural-language instruction — see src/lib/promptBuilder.ts. */
  prompt: string;
  /**
   * Optional reproducibility seed. Callers that generate more than one image
   * per user session (generations.ts's 3-image couple flow: together + solo
   * A + solo B) pass the SAME seed to every call so the results share
   * lighting/color grade instead of each being an unrelated roll of the
   * dice — verified supported by fal.ai's qwen-image-edit-plus schema
   * (the model qwenImageEdit.ts actually calls). A provider that has no
   * concept of a seed is free to ignore this.
   */
  seed?: number;
};

export type FusionOutput = {
  imageBytes: Buffer;
  mimeType: string;
  /** Identifies which provider/model actually produced this, for the Generation row. */
  provider: string;
  model: string;
};

export interface ImageFusionProvider {
  generate(input: FusionInput): Promise<FusionOutput>;
}
