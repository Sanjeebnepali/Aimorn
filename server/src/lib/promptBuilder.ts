import { themePromptFor } from '../data/themes.js';
import { stylePromptFor } from '../data/styles.js';

export type PromptInput = {
  subjectMode: 'SOLO' | 'COUPLE';
  templateId?: string;
  styleKey: string;
  description?: string;
};

/**
 * Builds the natural-language instruction sent to the AI provider. Kept as
 * one small, swappable function — the prompt wording is the single biggest
 * lever on output quality, so this is exactly what should change during the
 * Phase 0/1 testing in docs/ai-generation-plan.md without touching route or
 * provider code.
 */
export function buildFusionPrompt(input: PromptInput): string {
  const subjectLine =
    input.subjectMode === 'COUPLE'
      ? 'Combine the two people from the reference photos into a single new photo of them together, as a couple. Preserve each person\'s real face and identity exactly as shown in their reference photo — do not blend or average their features into a new face.'
      : 'Reimagine the person from the reference photo in a new scene. Preserve their real face and identity exactly as shown in the reference photo.';

  const sceneLine = `Scene: ${themePromptFor(input.templateId)}.`;
  const styleLine = `Style: ${stylePromptFor(input.styleKey)}.`;
  const extraLine = input.description?.trim() ? `Additional direction: ${input.description.trim()}.` : '';
  const formatLine =
    'Compose it as a vertical phone wallpaper, both people fully visible, natural consistent lighting across the whole image.';
  // Found via a real test run (see docs/ai-generation-plan.md §3a): without
  // this, an ambiguous reference photo (e.g. cropped at the shoulders) can
  // get extended into an unintentionally shirtless/undressed result instead
  // of preserving what the person was actually wearing.
  const modestyLine =
    'Keep each person dressed appropriately and consistent with their reference photo — do not remove or alter their clothing.';

  return [subjectLine, sceneLine, styleLine, extraLine, formatLine, modestyLine].filter(Boolean).join(' ');
}
