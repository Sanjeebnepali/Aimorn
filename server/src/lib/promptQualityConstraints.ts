/**
 * Hard constraints for from-scratch and template editing paths.
 */
export const NATURAL_HEAD_PROPORTION_CONSTRAINT =
  'HARD CONSTRAINT — head-to-body proportion: render each person\'s head at a natural, anatomically normal size relative to their own body — a head that reads as visibly oversized or undersized for the body it belongs to is a failure of this task, the same as a wrong face shape would be. This is a hard constraint, not a style preference.';

export const UNIFORM_PHOTO_QUALITY_CONSTRAINT =
  'HARD CONSTRAINT — uniform photographic quality: render the entire image — every face, hair, body, and the background — at the same consistent sharpness, focus, lighting, and film grain throughout. No person\'s face or head should look softer, blurrier, or lower-detail than the rest of the image, or like it was rendered separately and placed into the scene. This is a hard constraint, not a style preference.';

/**
 * Added 2026-09-26 after a real, reproduced bug: a COUPLE session's two
 * "solo" portraits (generationJob.ts builds them with subjectMode 'SOLO')
 * came back as two-person images — solo B was the real woman PLUS an
 * invented man with a guitar, solo A an invented girl leaning on the real
 * boy — even though both uploaded reference photos each showed exactly one
 * person. Root cause: the couple session's description ("Couple sitting on
 * beach…") is passed verbatim into BOTH solo prompts as their `Scene:` line,
 * and nothing in a SOLO prompt ever said "exactly one person," so the model
 * obeyed the scene's word "couple" and invented a second person to fill it.
 * The regenerate route (generationsRegenerate.ts) builds its solo prompts
 * the same way, so it had the identical bug. Stated as its own isolated
 * HARD CONSTRAINT (same pattern as the constraints above, which real
 * testing already proved holds up better than the same rule buried in a
 * longer sentence) and explicitly overrides couple/partner wording in the
 * scene text, since that wording is exactly what caused the failure.
 */
export const SINGLE_PERSON_ONLY_HARD_CONSTRAINT =
  'HARD CONSTRAINT — SINGLE PERSON ONLY: this image must show EXACTLY ONE person — the one person from the reference photos — and no one else anywhere in the frame. No partner, no second person, no friend, no bystander, no silhouette, no reflection or mirror image of another person, no faces or figures in the background. If the scene description mentions a couple, "together", a partner, or any other people, IGNORE that part completely: keep only its setting, mood, time of day, and props, and show this one person there ALONE. Adding any other human being is a failure of this task. This is a hard constraint, not a style preference.';

/** Appended to a solo prompt on the one automatic retry after a result was
 * found to contain more than one person (generationParts.ts). A retry with
 * only a perturbed seed can reproduce the same misread of the scene text, so
 * the retry also names the specific failure that just happened. */
export const SINGLE_PERSON_RETRY_NOTE =
  'CORRECTION: a previous attempt at this exact request wrongly showed more than one person. This image must contain exactly ONE person — the one from the reference photos — alone in the scene, with nobody else anywhere in the frame.';

/** Same idea as SINGLE_PERSON_RETRY_NOTE, for the freeform COUPLE "together"
 * shot, where the failure would be the wrong headcount (one person, or an
 * invented third) rather than an extra person. */
export const COUPLE_PEOPLE_RETRY_NOTE =
  'CORRECTION: a previous attempt at this exact request showed the wrong number of people. This image must contain exactly TWO people — Person 1 and Person 2 from the reference photos, together — and nobody else anywhere in the frame.';

/** Appended on a retry after identityJudge.ts found the result showed the
 * template's placeholder model (or someone else) instead of the reference
 * person — a retry with only a new seed can reproduce the same miss, so the
 * retry names the exact failure. */
export const IDENTITY_RETRY_NOTE =
  "CORRECTION: a previous attempt at this exact request FAILED because the person shown was NOT the person in the reference photos — it kept a stock/placeholder model's face and hair instead. The result must show the reference photos' person: their exact face AND hair (color, length, style), completely replacing whoever was there before. Do not keep any part of the placeholder's face or hairstyle.";

export const EQUAL_CAMERA_DISTANCE_HARD_CONSTRAINT =
  'HARD CONSTRAINT — EQUAL CAMERA DISTANCE & RELATIVE HEAD SCALE MATCH: Both people in the couple are standing side-by-side at the EXACT SAME DISTANCE from the camera lens. Even if one attached reference photo is a close-up selfie (large face in frame) and the other reference photo is a full-body back-camera photo (smaller face in frame), DO NOT render one person as a titan, giant, or larger relative to the other. Normalize both people\'s head heights, face widths, and body proportions to be anatomically equal and proportional to each other (male head size should be at most 1.05x to 1.08x the female head size, NEVER a titan or giant face). Both people MUST share the exact same camera scale and perspective.';
