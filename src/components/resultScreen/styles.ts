import { StyleSheet } from 'react-native';

import { fonts } from '@/theme/tokens';

/**
 * Shared styles for the result screen (src/app/result/[id].tsx) and its
 * small presentational subcomponents (./parts.tsx) — split out 2026-09-11
 * purely to keep the route file itself under the workspace's 350-line
 * limit as real bug fixes kept adding lines to it. No behavior here, just
 * the StyleSheet both files already referenced as `styles.*`.
 */
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  glowSpot: { position: 'absolute' },
  horizonHaze: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 340,
    height: 180,
  },
  silhouetteRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 190,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  silhouetteTall: {
    width: 76,
    height: 230,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
  },
  silhouetteShort: {
    width: 66,
    height: 200,
    borderTopLeftRadius: 33,
    borderTopRightRadius: 33,
    marginLeft: 2,
  },
  silhouetteSolo: {
    width: 100,
    height: 246,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  groundFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topTitle: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.3 },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
    marginTop: 12,
  },
  tagText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  paneRow: { flexDirection: 'row', alignSelf: 'center', gap: 10, marginTop: 8, paddingHorizontal: 12 },
  paneThumbFrame: {
    width: 54,
    height: 72,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    backgroundColor: '#1a1a1a',
  },
  paneThumbImage: { width: '100%', height: '100%' },
  paneThumbCheck: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  paneTabText: { fontFamily: fonts.bodySemiBold, fontSize: 11, textAlign: 'center' },
  spacer: { flex: 1 },
  // marginBottom: real-device bottom-edge touch-interception fix — see
  // src/components/navigation/floating-tab-bar.tsx for the full story.
  actionPanel: { marginHorizontal: 16, marginBottom: 56, padding: 18, gap: 14 },
  primaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flex1: { flex: 1 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionItem: { alignItems: 'center', gap: 6 },
  actionItemDisabled: { opacity: 0.5 },
  actionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumBadge: {
    position: 'absolute',
    top: -5,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
