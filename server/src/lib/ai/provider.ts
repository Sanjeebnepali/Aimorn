/**
 * Every AI image-fusion backend implements this same shape. The
 * `generations` table stores `provider`/`model` per row specifically so we
 * can swap or A/B implementations here without touching the schema, the
 * route, or old rows — see prisma/schema.prisma.
 */
export type FusionInput = {
  /** Raw bytes + mime type of the "You" photo. */
  photoA: { bytes: Buffer; mimeType: string };
  /** Raw bytes + mime type of the "Partner" photo. Absent for solo mode. */
  photoB?: { bytes: Buffer; mimeType: string };
  /** Fully-built natural-language instruction — see src/lib/promptBuilder.ts. */
  prompt: string;
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
