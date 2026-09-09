import { StyleSheet } from 'react-native';
import { fonts, radii } from '@/theme/tokens';

/**
 * Layout-only styles for the Couple Setup screen — no color values live
 * here. Every color comes from `useAppTheme()` at the JSX call site instead
 * (same split the rest of the app uses, e.g. `profile/index.tsx`), so
 * switching the user's theme (Settings → one of the 9 palettes) repaints
 * this screen too, instead of being stuck on the flat dark colors that used
 * to be hardcoded in this file.
 */
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  title: { fontFamily: fonts.bodyExtraBold, fontSize: 18, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  // paddingBottom: real-device bottom-edge touch-interception fix — see
  // src/components/navigation/floating-tab-bar.tsx for the full story. This
  // screen's own "Link with partner" button sits close enough to this edge
  // to be at risk even with static text still below it.
  body: { paddingHorizontal: 20, gap: 16, paddingBottom: 100 },
  card: { borderRadius: radii.xl, padding: 16, gap: 14 },
  cardHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fonts.bodyExtraBold, fontSize: 15, letterSpacing: -0.2 },
  cardBody: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  sectionLabel: { fontFamily: fonts.bodyExtraBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionSubLabel: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: -6 },
  codeWrap: { gap: 12, alignItems: 'center' },
  codeText: { fontFamily: fonts.bodyExtraBold, fontSize: 34, letterSpacing: 4, fontVariant: ['tabular-nums'] },
  codeBtnRow: { flexDirection: 'row', gap: 10 },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  smallBtnText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1 },
  orText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  input: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: 16 },
  inputText: { fontFamily: fonts.bodyExtraBold, fontSize: 18, letterSpacing: 3, paddingVertical: 14, textAlign: 'center' },
  acceptRoleRow: { flexDirection: 'row', gap: 8 },
  privacyText: { fontFamily: fonts.body, fontSize: 11, lineHeight: 18, textAlign: 'center', paddingHorizontal: 12 },
});
