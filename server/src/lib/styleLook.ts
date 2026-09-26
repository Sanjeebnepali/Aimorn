import type { TemplateMode } from './templateMode.js';

/**
 * Turns the "K-Pop" style in the Pick-a-Style row into the full K-pop look.
 *
 * Why: picking K-Pop should give the user the whole idol-photoshoot result (black-and-pink neon studio, styled outfit), and the
 * one method that reliably delivers that with the right person in it is the scene-brief mode we already built for the K-Pop
 * Idol template (data/sceneBriefsManual.ts) — the person's photo is the only image, the look comes from text. A style line
 * alone ("...K-pop style") would only tint the lighting and leave the person's own clothes, which isn't what they asked for.
 *
 * So with NO template chosen, style 'kpop' becomes: template 'kpopIdol' + scene-brief mode (forced: this template has no reference
 * photo, so the older photo-edit mode has nothing to edit) + a photoreal render style ('realistic', so the identity check and the
 * quality checks treat it as the photograph it is). With a template or a GROUP job the style is left alone and acts as the
 * rendering treatment in STYLE_PROMPTS.kpop.
 */
export function resolveLook(input: {
  templateId?: string;
  styleKey: string;
  templateMode?: TemplateMode;
  subjectMode: 'SOLO' | 'COUPLE' | 'GROUP';
}): { templateId?: string; styleKey: string; templateMode?: TemplateMode } {
  if (input.styleKey === 'kpop' && !input.templateId && input.subjectMode !== 'GROUP') {
    return { templateId: 'kpopIdol', styleKey: 'realistic', templateMode: 'inspired' };
  }
  return { templateId: input.templateId, styleKey: input.styleKey, templateMode: input.templateMode };
}
