/**
 * Hard constraints for from-scratch and template editing paths.
 */
export const NATURAL_HEAD_PROPORTION_CONSTRAINT =
  'HARD CONSTRAINT — head-to-body proportion: render each person\'s head at a natural, anatomically normal size relative to their own body — a head that reads as visibly oversized or undersized for the body it belongs to is a failure of this task, the same as a wrong face shape would be. This is a hard constraint, not a style preference.';

export const UNIFORM_PHOTO_QUALITY_CONSTRAINT =
  'HARD CONSTRAINT — uniform photographic quality: render the entire image — every face, hair, body, and the background — at the same consistent sharpness, focus, lighting, and film grain throughout. No person\'s face or head should look softer, blurrier, or lower-detail than the rest of the image, or like it was rendered separately and placed into the scene. This is a hard constraint, not a style preference.';

export const EQUAL_CAMERA_DISTANCE_HARD_CONSTRAINT =
  'HARD CONSTRAINT — EQUAL CAMERA DISTANCE & RELATIVE HEAD SCALE MATCH: Both people in the couple are standing side-by-side at the EXACT SAME DISTANCE from the camera lens. Even if one attached reference photo is a close-up selfie (large face in frame) and the other reference photo is a full-body back-camera photo (smaller face in frame), DO NOT render one person as a titan, giant, or larger relative to the other. Normalize both people\'s head heights, face widths, and body proportions to be anatomically equal and proportional to each other (male head size should be at most 1.05x to 1.08x the female head size, NEVER a titan or giant face). Both people MUST share the exact same camera scale and perspective.';
