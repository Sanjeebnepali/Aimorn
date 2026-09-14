/**
 * Content-policy enforcement for the free-text `description`/caption fields
 * (CreateForm's prompt box, "Additional direction" note, and a shared
 * post's title/caption). Deliberately its OWN module, separate from
 * promptBuilder.ts's `sanitizeUserPrompt`: that function guards against
 * prompt-INJECTION (someone trying to talk the model out of the face/pose/
 * scene rules — "ignore previous instructions" style phrases) and silently
 * drops the offending text since the fallback (the template's own scene) is
 * always a safe, reasonable substitute.
 *
 * This module guards against PROHIBITED CONTENT instead — the user asking
 * for something Amora shouldn't generate at all, categories taken from
 * Google's own Generative AI Prohibited Use Policy
 * (policies.google.com/terms/generative-ai/use-policy), which is what our
 * actual image provider (Gemini) enforces on its own end regardless. There
 * is no safe silent fallback for "generate this instead of what they
 * typed" — the right response is to refuse the whole request with a clear
 * reason, before spending a credit or an AI call on it, rather than
 * silently substituting something else and letting the user wonder why
 * their description was ignored. See routes/generations.ts and
 * routes/posts.ts for where that refusal happens.
 *
 * Structured as a list of category definitions (phrases + a per-category
 * message) rather than one flat list, so adding the next category (hate
 * speech, real-person impersonation — still open per an earlier
 * conversation) is a new CATEGORY_DEFINITIONS entry, not a rewrite of the
 * matching logic.
 */

export type ContentPolicyCategory = 'violence' | 'selfHarm' | 'sexual' | 'hate';

export type ContentPolicyResult = {
  category: ContentPolicyCategory;
  /** The exact denylist phrase that matched — kept for logging/debugging,
   * never shown to the end user (it's our internal wording, not theirs). */
  matchedPhrase: string;
};

type CategoryDefinition = {
  category: ContentPolicyCategory;
  phrases: readonly string[];
  /** Shown to the user verbatim when this category is what matched. */
  message: string;
};

/**
 * Phrases that read as a request for real, graphic violence — not just any
 * word that COULD appear in a violent context. Deliberately favors more
 * specific multi-word phrases over single loaded words: a bare "shoot" or
 * "shot" would false-positive on completely ordinary wallpaper requests
 * ("photoshoot," "a shooting star," "shot at golden hour"), which this app's
 * description field genuinely sees. Case-insensitive substring match, same
 * mechanism as promptBuilder.ts's OVERRIDE_ATTEMPT_PHRASES.
 */
const VIOLENCE_PHRASES = [
  // Graphic/gore imagery
  'blood',
  'bloody',
  'gore',
  'gory',
  'bleeding',
  'dead body',
  'dead bodies',
  'corpse',
  'decapitat',
  'dismember',
  'mutilat',
  // Direct violent acts against a person
  'murder',
  'kill him',
  'kill her',
  'kill them',
  'killing spree',
  'stab him',
  'stab her',
  'stabbing',
  'stabbed',
  'gunshot',
  'shooting spree',
  'mass shooting',
  'shoot him',
  'shoot her',
  'shoot them',
  'torture',
  'torturing',
  'strangl',
  'choking her',
  'choking him',
  'beat him up',
  'beat her up',
  'beating up',
  'massacre',
  'assault her',
  'assault him',
  // War/battle gore specifically (a "war zone" or "soldier" setting alone
  // isn't blocked — only the graphic-casualty framing is)
  'war zone with bodies',
  'battlefield corpses',
] as const;

/**
 * Split out of the violence list 2026-09-11 — Google's own policy lists
 * self-harm as its own category, distinct from interpersonal violence, and
 * the right response reads differently too (a plain refusal, not framed as
 * "graphic content"). Kept intentionally short/specific for the same
 * false-positive reason as everywhere else in this file.
 */
const SELF_HARM_PHRASES = [
  'self harm',
  'self-harm',
  'suicide',
  'cutting herself',
  'cutting himself',
  'ending my life',
  'ending his life',
  'ending her life',
] as const;

/**
 * New 2026-09-11 — the most directly relevant category for this specific
 * app: a couple/dating wallpaper generator that already asks users to
 * upload real photos of themselves and a partner is exactly the kind of
 * product where a request for nude/explicit content is a realistic risk,
 * not a hypothetical one. Deliberately does NOT block ordinary romance —
 * "kiss," "cuddle," "romantic," "embrace," "hug," "in bed together" (fully
 * clothed, e.g. a cozy morning scene) are all completely normal wallpaper
 * requests for this app and must keep working. Also deliberately leaves out
 * bare "sexy" — extremely common as a harmless compliment/adjective
 * ("make her look sexy in a red dress") with no nudity implied, so blocking
 * it would misfire constantly; only the much more specific phrases below
 * (actual nudity, explicit acts, adult-content labels) are blocked.
 */
const SEXUAL_PHRASES = [
  'nude',
  'naked',
  'topless',
  'no clothes on',
  'without any clothes',
  'fully undressed',
  'undress her',
  'undress him',
  'undressing',
  'take off her clothes',
  'take off his clothes',
  'remove her clothes',
  'remove his clothes',
  'nsfw',
  'porn',
  'pornographic',
  'sexually explicit',
  'explicit sexual',
  'having sex',
  'sex scene',
  'sexual intercourse',
  'making love scene',
  'erotic',
  'exposed breasts',
  'exposed genitals',
] as const;

/**
 * New 2026-09-11 — hate speech / hateful depiction. Deliberately does NOT
 * enumerate ethnic/racial/religious slurs: a hand-rolled list either misses
 * real slurs (there are thousands, across every language this app's 30
 * locales cover) or requires typing them into this codebase, which isn't a
 * tradeoff worth making for a photo-wallpaper app's free-text field. Real
 * slur coverage is a specialized, continuously-updated trust & safety
 * dataset, not something to approximate here — noting that honestly rather
 * than overclaiming this list catches everything.
 *
 * What this DOES catch, with real confidence and low false-positive risk:
 * explicit references to hateful ideologies/extremist symbols, and clearly
 * hate-motivated phrasing ("demean/mock/stereotype because of their race/
 * religion/ethnicity"). Ordinary mentions of someone's actual religion,
 * ethnicity, or cultural dress ("she's wearing a hijab," "a traditional
 * Nepali wedding," "add a cross necklace") are never touched — those
 * describe a real person's identity, not an attack on one, and this app's
 * whole point is generating photos of real people as they actually are.
 */
const HATE_PHRASES = [
  'nazi',
  'swastika',
  'white supremac',
  'ku klux klan',
  'kkk hood',
  'hitler',
  'ethnic slur',
  'racial slur',
  'hate speech',
  'racist stereotype',
  'racist caricature',
  'mock his religion',
  'mock her religion',
  'mock their religion',
  'demean based on his race',
  'demean based on her race',
  'demean based on their race',
  'make fun of his race',
  'make fun of her race',
  'make fun of their race',
] as const;

const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    category: 'violence',
    phrases: VIOLENCE_PHRASES,
    message: 'Amora can’t generate violent or graphic content. Please remove that from your description and try again.',
  },
  {
    category: 'selfHarm',
    phrases: SELF_HARM_PHRASES,
    message: 'Amora can’t generate content related to self-harm. Please remove that from your description and try again.',
  },
  {
    category: 'sexual',
    phrases: SEXUAL_PHRASES,
    message: 'Amora can’t generate nude or sexually explicit content. Please remove that from your description and try again.',
  },
  {
    category: 'hate',
    phrases: HATE_PHRASES,
    message: 'Amora can’t generate hateful or discriminatory content. Please remove that from your description and try again.',
  },
];

/**
 * Checks free-text user input (a generation's description, or a post's
 * title/caption) against every category above, in the order they're
 * defined. Returns null when clean. Called once per request, before the
 * credit check — see routes/generations.ts and routes/posts.ts.
 */
export function checkContentPolicy(text: string | undefined): ContentPolicyResult | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const def of CATEGORY_DEFINITIONS) {
    for (const phrase of def.phrases) {
      if (lower.includes(phrase)) {
        return { category: def.category, matchedPhrase: phrase };
      }
    }
  }

  return null;
}

/** User-facing rejection message — deliberately says WHAT category was hit
 * and WHY, rather than a generic "invalid request," per an explicit ask to
 * not leave the user guessing/misled about why something was refused. */
export function messageForViolation(result: ContentPolicyResult): string {
  return (
    CATEGORY_DEFINITIONS.find((def) => def.category === result.category)?.message ??
    'That description isn’t something Amora can generate. Please try different wording.'
  );
}
