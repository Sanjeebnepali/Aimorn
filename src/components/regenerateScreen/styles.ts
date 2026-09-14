import { StyleSheet } from 'react-native';

import { fonts } from '@/theme/tokens';

/**
 * Split out of src/app/regenerate/[id].tsx 2026-09-14 — adding the progress
 * overlay (ProgressOverlay.tsx) and its back-navigation guards pushed that
 * file to 405 lines, over the workspace's 350-line cap. Pure style data, no
 * logic — same "extract styles" pattern already used for the loading and
 * result screens (src/components/loadingScreen/styles.ts,
 * src/components/resultScreen/styles.ts).
 */
export const styles = StyleSheet.create({
  // `resultBackgrounds.solo` is a whole theme object (gradient/glow/etc,
  // see theme/tokens.ts and WallpaperBackground in resultScreen/parts.tsx),
  // not a color — assigning it here as `backgroundColor` was a real type
  // error that, unhandled, poisoned StyleSheet.create's inference for every
  // OTHER key in this object too (confirmed via tsc: ~37 unrelated-looking
  // "style prop" errors on View/Text/Image/etc. below all disappeared once
  // this one property was fixed). Same plain fallback hex template/[id].tsx
  // uses for its own full-screen root.
  fill: { flex: 1, backgroundColor: '#0a0408' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: fonts.bodyExtraBold, fontSize: 17, letterSpacing: 0.2 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },
  previewSection: { alignItems: 'center', gap: 12 },
  previewCard: {
    width: 220,
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  placeholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  themeLockBadge: {
    position: 'absolute',
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  themeLockText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  paneRow: { flexDirection: 'row', gap: 10, alignSelf: 'center' },
  ruleNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  ruleNoteText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
  inputCard: { padding: 16, gap: 12 },
  inputLabel: { fontFamily: fonts.bodyBold, fontSize: 15 },
  textInput: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  presetTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, marginTop: 4 },
  presetContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  presetChipText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  photoOverrideCard: { padding: 16, gap: 12 },
  photoOverrideHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoOverrideInfo: { flex: 1, paddingRight: 10 },
  photoOverrideTitle: { fontFamily: fonts.bodyBold, fontSize: 14 },
  photoOverrideSub: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  photoPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  photoPickBtnText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  overridePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  overrideThumb: { width: 44, height: 44, borderRadius: 10 },
  overrideStatusText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  submitContainer: { marginTop: 8 },
});
