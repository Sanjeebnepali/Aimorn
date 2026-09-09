import { StyleSheet } from 'react-native';
import { fonts, radii } from '@/theme/tokens';

/**
 * Layout-only styles for the Couple Preview ("pick your side") screen — no
 * color values live here except where a color is structural (a photo
 * card's `'#fff'`/scrim text, which stays legible over any photo regardless
 * of theme). Everything theme-dependent comes from `useAppTheme()` or a
 * pack's own `accent` at the JSX call site instead — see
 * `coupleSetup/styles.ts`'s doc comment for why that split exists.
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
  title: {
    fontFamily: fonts.bodyExtraBold,
    fontSize: 18,
    letterSpacing: -0.3,
    flex: 1,
    textAlign: 'center',
  },
  // paddingBottom: real-device bottom-edge touch-interception fix — see
  // src/components/navigation/floating-tab-bar.tsx for the full story.
  body: { paddingHorizontal: 20, paddingBottom: 100, gap: 20 },
  // Same full-bleed-photo card shape as template-card.tsx (plain bordered
  // View, not GlassCard — the photo itself is the surface here, not a
  // translucent panel over other content).
  hero: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  heroPillText: { fontFamily: fonts.bodyExtraBold, fontSize: 11, color: '#131313', letterSpacing: 0.3 },
  heroFooter: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  heroTitle: { fontFamily: fonts.display, color: '#fff', fontSize: 19, letterSpacing: -0.2 },
  heroSub: { fontFamily: fonts.body, color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 17, marginTop: 3 },
  sectionHead: { gap: 4 },
  sectionTitle: { fontFamily: fonts.bodyExtraBold, fontSize: 16, letterSpacing: -0.2 },
  sectionSub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  soloRow: { flexDirection: 'row', gap: 12 },
  soloCard: { borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1 },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloFooter: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  soloLabel: { fontFamily: fonts.bodyExtraBold, color: '#fff', fontSize: 15 },
  soloHint: { fontFamily: fonts.bodySemiBold, color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 1 },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontFamily: fonts.body, fontSize: 13 },
  footnote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12 },
});
