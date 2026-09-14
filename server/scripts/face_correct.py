#!/usr/bin/env python3
"""
Deterministic post-generation correction for the COUPLE+template pipeline —
MediaPipe Face Landmarker + OpenCV Gaussian Alpha Blending & LAB Skin Harmonization.
Adjusts head scale to fit template body proportions naturally and unifies full-body skin tone.
"""
import sys
import os
import json
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'face_landmarker.task')

_detector = None


def get_detector():
    global _detector
    if _detector is None:
        base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
        options = vision.FaceLandmarkerOptions(base_options=base_options, num_faces=4, min_face_detection_confidence=0.12)
        _detector = vision.FaceLandmarker.create_from_options(options)
    return _detector


def is_valid_skin_patch(bgr_patch):
    """Returns True if the BGR patch represents valid human skin (HSV Hue, Saturation, Value range)."""
    if bgr_patch is None or bgr_patch.size == 0:
        return False
    hsv = cv2.cvtColor(bgr_patch, cv2.COLOR_BGR2HSV)
    h_mean = hsv[:, :, 0].mean()
    s_mean = hsv[:, :, 1].mean()
    v_mean = hsv[:, :, 2].mean()
    
    # Skin Hue range: 0..25 or 160..180, Saturation > 15, Value > 20
    is_skin_hue = (h_mean <= 28.0) or (h_mean >= 155.0)
    is_valid_saturation = (s_mean >= 15.0) and (s_mean <= 220.0)
    is_valid_brightness = (v_mean >= 20.0) and (v_mean <= 250.0)
    return is_skin_hue and is_valid_saturation and is_valid_brightness


def sample_skin_patch(bgr_image, box):
    """Samples central face skin patch, checking skin validity."""
    if bgr_image is None or not box:
        return None
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return None
    sx0, sy0 = max(0, x0 + int(w * 0.25)), max(0, y0 + int(h * 0.25))
    sx1, sy1 = min(bgr_image.shape[1], x0 + int(w * 0.75)), min(bgr_image.shape[0], y0 + int(h * 0.75))
    patch = bgr_image[sy0:sy1, sx0:sx1]
    if patch.size > 0 and is_valid_skin_patch(patch):
        return patch
    return patch if patch.size > 0 else None


def detect_faces(bgr_image):
    """Returns face bounding boxes in ORIGINAL image coordinates, left-to-right,
    using robust sub-window sliding detection to detect faces reliably across all image sizes."""
    if bgr_image is None:
        return []
    h, w = bgr_image.shape[:2]
    crop_h = int(h * 0.55)
    top_region = bgr_image[0:crop_h, 0:w]
    if top_region.size == 0:
        return []

    windows = [
        (0, 0, w, crop_h),
        (0, 0, int(w * 0.65), crop_h),
        (int(w * 0.35), 0, w, crop_h),
    ]

    boxes = []
    detector = get_detector()

    for wx0, wy0, wx1, wy1 in windows:
        sub = top_region[wy0:wy1, wx0:wx1]
        if sub.size == 0:
            continue
        rgb = cv2.cvtColor(sub, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = detector.detect(mp_img)
        sw, sh = sub.shape[1], sub.shape[0]
        for lm in res.face_landmarks:
            xs = [p.x for p in lm]
            ys = [p.y for p in lm]
            x0 = wx0 + min(xs) * sw
            x1 = wx0 + max(xs) * sw
            y0 = wy0 + min(ys) * sh
            y1 = wy0 + max(ys) * sh

            # Deduplicate overlapping face bounding boxes
            is_dup = False
            for bx0, by0, bx1, by1 in boxes:
                cx1, cy1 = (x0 + x1) / 2.0, (y0 + y1) / 2.0
                cx2, cy2 = (bx0 + bx1) / 2.0, (by0 + by1) / 2.0
                if abs(cx1 - cx2) < (x1 - x0) * 0.4 and abs(cy1 - cy2) < (y1 - y0) * 0.4:
                    is_dup = True
                    break
            if not is_dup:
                boxes.append((x0, y0, x1, y1))

    boxes.sort(key=lambda b: b[0])  # Left to right
    return boxes


def correct_scale(bgr_image, gen_box, scale_factor):
    """Rescales an oversized head region around gen_box by scale_factor and alpha blends
    it smoothly back, restoring natural head-to-body proportions with an elliptical mask."""
    h, w = bgr_image.shape[:2]
    gx0, gy0, gx1, gy1 = [int(v) for v in gen_box]
    face_w, face_h = gx1 - gx0, gy1 - gx0
    if face_w <= 0 or face_h <= 0 or scale_factor <= 1.20:
        return bgr_image

    correction = float(np.clip(1.0 / scale_factor, 0.85, 0.98))
    cx, cy = (gx0 + gx1) / 2.0, (gy0 + gy1) / 2.0
    pad_x, pad_y = face_w * 0.5, face_h * 0.7
    x0, y0 = max(0, int(cx - face_w / 2.0 - pad_x)), max(0, int(cy - face_h / 2.0 - pad_y))
    x1, y1 = min(w, int(cx + face_w / 2.0 + pad_x)), min(h, int(cy + face_h / 2.0 + pad_y))
    crop = bgr_image[y0:y1, x0:x1]
    if crop.size == 0:
        return bgr_image

    new_w, new_h = max(1, int(crop.shape[1] * correction)), max(1, int(crop.shape[0] * correction))
    resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    canvas = bgr_image.copy()
    px0, py0 = int(cx - new_w / 2.0), int(cy - new_h / 2.0)
    src_x0, src_y0 = max(0, -px0), max(0, -py0)
    dst_x0, dst_y0 = max(0, px0), max(0, py0)
    dst_x1, dst_y1 = min(w, px0 + new_w), min(h, py0 + new_h)
    if dst_x1 <= dst_x0 or dst_y1 <= dst_y0:
        return bgr_image
    src_x1, src_y1 = src_x0 + (dst_x1 - dst_x0), src_y0 + (dst_y1 - dst_y0)
    canvas[dst_y0:dst_y1, dst_x0:dst_x1] = resized[src_y0:src_y1, src_x0:src_x1]

    # Elliptical anatomical mask prevents rectangular box shadow artifacts
    mask = np.zeros((h, w), dtype=np.uint8)
    center = (int((dst_x0 + dst_x1) / 2.0), int((dst_y0 + dst_y1) / 2.0))
    axes = (int((dst_x1 - dst_x0) * 0.45), int((dst_y1 - dst_y0) * 0.45))
    if axes[0] > 0 and axes[1] > 0:
        cv2.ellipse(mask, center, axes, 0, 0, 360, 255, -1)
    mask = cv2.GaussianBlur(mask, (51, 51), 0)
    mask[0:2, :] = 0; mask[-2:, :] = 0; mask[:, 0:2] = 0; mask[:, -2:] = 0

    alpha = (mask.astype(np.float32) / 255.0)[:, :, np.newaxis]
    blended = (canvas.astype(np.float32) * alpha + bgr_image.astype(np.float32) * (1.0 - alpha))
    return np.clip(blended, 0, 255).astype(np.uint8)


def match_faces_to_references(gen_image, gen_boxes, ref_images_boxes):
    """Pairs each generated face with closest reference photo skin tone."""
    gen_skins = [sample_skin_patch(gen_image, b) for b in gen_boxes]
    matches = [None] * len(gen_boxes)
    for i, gen_skin in enumerate(gen_skins):
        if gen_skin is None:
            continue
        gen_lab_mean = cv2.cvtColor(gen_skin, cv2.COLOR_BGR2LAB).astype(np.float32).mean(axis=(0, 1))
        best_dist, best_ref = None, None
        for ref_image, ref_box in ref_images_boxes:
            ref_skin = sample_skin_patch(ref_image, ref_box)
            if ref_skin is None:
                continue
            ref_lab_mean = cv2.cvtColor(ref_skin, cv2.COLOR_BGR2LAB).astype(np.float32).mean(axis=(0, 1))
            dist = float(np.linalg.norm(gen_lab_mean - ref_lab_mean))
            if best_dist is None or dist < best_dist:
                best_dist, best_ref = dist, (ref_image, ref_box)
        matches[i] = best_ref
    return matches


def harmonize_body_skin(bgr_image, face_box, ref_skin_patch):
    """Harmonizes body skin region for a single face box and reference skin patch,
    preserving image exposure/lightness (L=0) and avoiding box cutout shadows."""
    if bgr_image is None or not face_box or ref_skin_patch is None or ref_skin_patch.size == 0:
        return bgr_image
    ref_lab = cv2.cvtColor(ref_skin_patch, cv2.COLOR_BGR2LAB).astype(np.float32)
    ref_mean = ref_lab.mean(axis=(0, 1))
    ref_std = ref_lab.std(axis=(0, 1)) + 1e-6

    corrected = bgr_image.copy()
    img_lab = cv2.cvtColor(corrected, cv2.COLOR_BGR2LAB).astype(np.float32)
    a_dist = img_lab[:, :, 1] - ref_mean[1]
    b_dist = img_lab[:, :, 2] - ref_mean[2]
    ab_dist = np.sqrt(a_dist**2 + b_dist**2)

    skin_mask = (ab_dist < 32.0) & (img_lab[:, :, 0] > 30.0) & (img_lab[:, :, 0] < 245.0)
    fx0, fy0, fx1, fy1 = [int(v) for v in face_box]

    # Smooth elliptical face exclusion mask — padded well past the raw
    # landmark box, especially upward, before computing it. Real, confirmed
    # bug 2026-09-13: `face_box` comes from MediaPipe's face-mesh landmarks,
    # which stop around the upper forehead — well short of the actual
    # hairline, especially on a tilted head (exactly this couple's leaning
    # pose in a live Rooftop Night generation). The OLD ellipse (0.6x the
    # bare box, no padding) left a real sliver of forehead skin sitting
    # OUTSIDE the exclusion zone, so this function's own chroma-shift below
    # — computed from GLOBAL skin-mask statistics across the whole frame,
    # not this one small region's own local color — treated it as "body
    # skin" and shifted it, producing a visible, wrongly-tinted blotch right
    # at her hairline in the composite "together" shot. Directly confirmed
    # by comparing that shot against her own solo portrait (same function,
    # same reference photo, but only ONE face's exclusion zone in play,
    # not two people's masks sharing one frame) — the solo portrait's
    # forehead was completely clean, isolating this exact function as the
    # cause. The face/forehead/hairline was already correctly identity-
    # matched by the generation itself — it never needed "body skin"
    # harmonization at all; only genuinely separate regions (neck, arms,
    # chest, legs) do.
    face_w, face_h = fx1 - fx0, fy1 - fy0
    ex_x0, ex_y0 = fx0 - int(face_w * 0.1), fy0 - int(face_h * 0.6)
    ex_x1, ex_y1 = fx1 + int(face_w * 0.1), fy1 + int(face_h * 0.1)
    face_center = (int((ex_x0 + ex_x1) / 2.0), int((ex_y0 + ex_y1) / 2.0))
    face_axes = (int((ex_x1 - ex_x0) / 2.0), int((ex_y1 - ex_y0) / 2.0))
    if face_axes[0] > 0 and face_axes[1] > 0:
        face_ellipse = np.zeros(skin_mask.shape, dtype=np.uint8)
        cv2.ellipse(face_ellipse, face_center, face_axes, 0, 0, 360, 1, -1)
        skin_mask[face_ellipse > 0] = False

    if skin_mask.sum() < 100:
        return bgr_image

    current_skin_pixels = img_lab[skin_mask]
    curr_mean = current_skin_pixels.mean(axis=0)
    curr_std = current_skin_pixels.std(axis=0) + 1e-6

    shift_lab = img_lab.copy()
    # Preserves Lightness (ch_i=0, damp=0.0) to keep original bright exposure;
    # Harmonizes chromaticity (A, B) mildly (damp=0.35) for natural skin tone.
    for ch_i, damp in [(0, 0.0), (1, 0.35), (2, 0.35)]:
        shifted_ch = (img_lab[:, :, ch_i] - curr_mean[ch_i]) * (ref_std[ch_i] / curr_std[ch_i]) + ref_mean[ch_i]
        shift_lab[:, :, ch_i] = np.where(skin_mask, img_lab[:, :, ch_i] * (1 - damp) + shifted_ch * damp, img_lab[:, :, ch_i])

    shifted_bgr = cv2.cvtColor(np.clip(shift_lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    mask_u8 = cv2.GaussianBlur((skin_mask.astype(np.uint8) * 255), (41, 41), 0)
    alpha = (mask_u8.astype(np.float32) / 255.0)[:, :, np.newaxis]
    blended = shifted_bgr.astype(np.float32) * alpha + corrected.astype(np.float32) * (1.0 - alpha)
    return np.clip(blended, 0, 255).astype(np.uint8)


def harmonize_full_body_skin(bgr_image, gen_boxes, ref_images_boxes):
    """Harmonizes exposed body skin (arms, neck, legs) across the full frame to match
    reference face skin tones using precise LAB chromaticity distance masking."""
    if not gen_boxes or not ref_images_boxes:
        return bgr_image

    matches = match_faces_to_references(bgr_image, gen_boxes, ref_images_boxes)
    corrected = bgr_image.copy()

    for i, gbox in enumerate(gen_boxes):
        match = matches[i]
        if match is None:
            continue
        ref_img, ref_box = match
        ref_skin = sample_skin_patch(ref_img, ref_box)
        if ref_skin is None or ref_skin.size == 0:
            continue
        corrected = harmonize_body_skin(corrected, gbox, ref_skin)

    return corrected


def main():
    if len(sys.argv) < 4:
        print('usage: face_correct.py <template_image> <generated_image> <output_path> [<ref_photo> ...]', file=sys.stderr)
        sys.exit(1)

    template_path, generated_path, output_path = sys.argv[1], sys.argv[2], sys.argv[3]
    ref_paths = sys.argv[4:]
    generated = cv2.imread(generated_path)
    if generated is None:
        print(f'could not read generated image: {generated_path}', file=sys.stderr)
        sys.exit(1)

    # Must match every key TypeScript's FaceCorrectionReport (faceGeometry.ts)
    # reads unconditionally — generationJob.ts's `togetherResultPromise` reads
    # `report.scaleWarnings.length` right after logging `scaleCorrected`, with
    # no optional-chaining, so a report missing either key throws "Cannot read
    # properties of undefined (reading 'length')" and fails the WHOLE
    # COUPLE+template generation. Confirmed live 2026-09-13: this exact crash,
    # from this exact missing key, on a real on-device Rooftop Night test.
    # This script no longer has a "detected but not auto-corrected" scale case
    # (both scale passes below always self-correct), so scaleWarnings stays
    # permanently empty; hairCorrected has no logic here either (this script
    # replaced the old hair-color-matching pass with skin-tone harmonization
    # only) and stays 0 — both are real, honest defaults, not placeholders.
    report = {'facesDetected': 0, 'colorCorrected': 0, 'hairCorrected': 0, 'scaleCorrected': [], 'scaleWarnings': []}

    try:
        gen_boxes = detect_faces(generated)
        report['facesDetected'] = len(gen_boxes)

        template = cv2.imread(template_path) if template_path != '-' else None
        template_boxes = detect_faces(template) if template is not None else []

        ref_images_boxes = []
        for p in ref_paths:
            img = cv2.imread(p)
            if img is None:
                continue
            boxes = detect_faces(img)
            if boxes:
                ref_images_boxes.append((img, boxes[0]))

        corrected = generated
        wt, ht = (template.shape[1], template.shape[0]) if template is not None else (1, 1)
        wg, hg = generated.shape[1], generated.shape[0]

        # 1) Direct normalized face width scale calibration:
        for i, gbox in enumerate(gen_boxes):
            if i < len(template_boxes):
                tmpl_w = (template_boxes[i][2] - template_boxes[i][0]) / float(wt)
                gen_w = (gbox[2] - gbox[0]) / float(wg)
                if tmpl_w > 0 and gen_w > 0:
                    width_ratio = gen_w / float(tmpl_w)
                    if width_ratio > 1.20:
                        corrected = correct_scale(corrected, gbox, width_ratio)
                        report['scaleCorrected'].append({'faceIndex': i, 'ratioBefore': round(width_ratio, 2)})

        # 2) Relative face-width scale normalization (fixes selfie vs back-camera Titan head mismatch):
        if len(gen_boxes) >= 2:
            w0 = gen_boxes[0][2] - gen_boxes[0][0]
            w1 = gen_boxes[1][2] - gen_boxes[1][0]
            if w0 > 0 and w1 > 0:
                rel_ratio_0 = w0 / float(w1)
                rel_ratio_1 = w1 / float(w0)
                if rel_ratio_0 > 1.20:
                    scale_ratio = rel_ratio_0 / 1.08
                    corrected = correct_scale(corrected, gen_boxes[0], scale_ratio)
                    report['scaleCorrected'].append({'faceIndex': 0, 'titanScaleRatio': round(rel_ratio_0, 2)})
                elif rel_ratio_1 > 1.20:
                    scale_ratio = rel_ratio_1 / 1.08
                    corrected = correct_scale(corrected, gen_boxes[1], scale_ratio)
                    report['scaleCorrected'].append({'faceIndex': 1, 'titanScaleRatio': round(rel_ratio_1, 2)})

        # 3) Full-body chromatic skin tone harmonization pass:
        if ref_images_boxes:
            corrected = harmonize_full_body_skin(corrected, gen_boxes, ref_images_boxes)
            report['colorCorrected'] = len(ref_images_boxes)

        cv2.imwrite(output_path, corrected)
    except Exception as e:
        print(f'face_correct failed, passing through original: {e}', file=sys.stderr)
        cv2.imwrite(output_path, generated)
        report['error'] = str(e)

    print(json.dumps(report))


if __name__ == '__main__':
    main()
