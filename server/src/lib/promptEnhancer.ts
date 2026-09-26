import { GoogleGenAI } from '@google/genai';

import { env } from '../env.js';
import { checkContentPolicy } from './contentPolicy.js';
import { findIdentityWords } from './identityWords.js';
import { sanitizeUserPrompt } from './promptBuilder.js';

/**
 * Turns a user's short, simple idea ("couple on the beach", or the same thing in Korean or Nepali) into a
 * richer scene description, so people who don't know how to write a good prompt still get a polished result —
 * without ever losing what they actually asked for.
 *
 * Rules the model is given AND that are enforced afterwards in code (a request in a prompt is not a guarantee):
 *  - every explicit requirement is kept (checked by the model's own instruction, and the fallback below covers
 *    everything we can verify mechanically);
 *  - the text never describes anyone's face, hair, skin, age or body (findIdentityWords) — the image model gets
 *    the person's real photo, and person-descriptions in the scene text compete with it;
 *  - it passes the same content policy as the user's own text;
 *  - it is short enough for the prompt builders' own cap.
 * On ANY failure, timeout, or violation it returns the user's ORIGINAL text unchanged (`enhanced: false`), so this
 * feature can only ever add polish, never block or corrupt a generation.
 *
 * Only short prompts are enhanced: a long, detailed description is already what the user wants.
 * `includeOutfit` is false for the plain Generate mode, where the user's own clothes from their photo are kept
 * unless the user specified clothing; true where a whole look is being designed.
 */
const MAX_INPUT_CHARS = 200;
// Stays under promptBuilder.ts's MAX_PRIMARY_DESCRIPTION_LENGTH (500) so the scene text is never truncated mid-sentence.
const MAX_OUTPUT_CHARS = 480;
const TIMEOUT_MS = 15_000;

const cache = new Map<string, string>();
const CACHE_MAX = 300;

function buildInstruction(params: { subjectMode: 'SOLO' | 'COUPLE'; includeOutfit: boolean }): string {
  const who = params.subjectMode === 'COUPLE' ? 'a couple' : 'one person';
  const outfitRule = params.includeOutfit
    ? `Include the clothing: if the user specified clothing keep it exactly; otherwise choose tasteful, modest outfits that suit the scene.`
    : `Do NOT mention clothing at all unless the user specified clothing (the people keep the clothes they are wearing in their own photos); if the user did specify clothing, keep it exactly.`;
  return `You turn a user's short idea into a SCENE DESCRIPTION for an AI wallpaper generator that will photograph ${who} (real people, supplied as photos) in that scene. The idea may be vague, may contain typos, and may be written in ANY language.
Write in ENGLISH, plain text, ONE compact paragraph of 45-75 words covering: the specific location and environment, the lighting / time of day / color palette, and the mood and camera feel. ${outfitRule}
RULES:
1. Keep EVERY explicit requirement from the user exactly (place, time of day, weather, colors, props, activity, clothing, mood). Never contradict, drop, or replace any of them.
2. Fill in only what the user left open, with tasteful, realistic, photogenic details.
3. NEVER describe anyone's face, hair, skin, age, body, or ethnicity — only the place, light, mood${params.includeOutfit ? ' and clothing' : ''}.
4. No text, signs with words, logos, watermarks, clocks, screens, or people other than the subjects.
5. Keep it wholesome: modest, non-sexual, nothing violent or unlawful. If the idea asks for something inappropriate, describe the closest wholesome version of the setting instead.
6. Do not mention the rendering style (photo, anime, painting…) — that is applied separately.
Output ONLY the description paragraph, no title, no quotes, no markdown.`;
}

/** Cuts to `max` chars at the last sentence end (or word) so the text never stops mid-sentence. */
function trimToSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.slice(0, cut.lastIndexOf(' '))).trim();
}

export async function enhanceScene(params: {
  description: string;
  subjectMode: 'SOLO' | 'COUPLE';
  includeOutfit: boolean;
}): Promise<{ text: string; enhanced: boolean }> {
  const original = params.description.trim();
  const passthrough = { text: original, enhanced: false };
  if (!original || original.length > MAX_INPUT_CHARS || !env.GEMINI_API_KEY) return passthrough;
  // Never spend a call (or risk laundering) content the policy already refuses; the route rejects it first anyway.
  if (checkContentPolicy(original)) return passthrough;
  // An attempt to override the instructions ("ignore previous instructions…") is dropped whole by the existing guard;
  // don't let the enhancer turn it into a random scene — hand it back untouched so that guard still sees it.
  if (sanitizeUserPrompt(original, MAX_INPUT_CHARS) === null) return passthrough;

  const key = `${params.subjectMode}|${params.includeOutfit}|${original}`;
  const hit = cache.get(key);
  if (hit) return { text: hit, enhanced: true };

  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const call = client.models.generateContent({
      model: env.GEMINI_JUDGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: buildInstruction(params) }, { text: `User's idea: ${original}` }] }],
      // temperature 0: the same idea gives (near-)identical text, so regenerating one image of a job stays in the same
      // scene "family" as its siblings (generationsRegenerate.ts relies on that).
      config: { temperature: 0 },
    });
    const response = await Promise.race([
      call,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('enhancer timed out')), TIMEOUT_MS)),
    ]);

    const cleaned = trimToSentence(
      (response.text ?? '').split('**').join('').replace(/^["'\s]+|["'\s]+$/g, '').split(/\s+/).join(' '),
      MAX_OUTPUT_CHARS,
    );
    const leaks = findIdentityWords(cleaned);
    if (cleaned.length < 40 || leaks.length > 0 || checkContentPolicy(cleaned)) {
      console.warn(`Prompt enhancer output rejected (${cleaned.length < 40 ? 'too short' : leaks.length ? `identity words: ${leaks.join(', ')}` : 'content policy'}) — using the original text.`);
      return passthrough;
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, cleaned);
    return { text: cleaned, enhanced: true };
  } catch (err) {
    console.error('Prompt enhancer failed, using the original text:', err);
    return passthrough;
  }
}
