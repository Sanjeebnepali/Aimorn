import { StyleSheet } from 'react-native';

import { fonts } from '@/theme/tokens';

/**
 * Split out of src/app/loading.tsx 2026-09-12 — GROUP mode's own copy/icon
 * branches (see that file's isGroup usage) pushed it to 362 lines, over
 * the workspace's 350-line cap. Pure style data, no logic — same "extract
 * styles" pattern already used for the result screen
 * (src/components/resultScreen/styles.ts).
 */
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 32 },
  ringWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  progressBadgeWrap: { position: 'absolute', bottom: -6, right: -2 },
  progressBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  progressText: { fontFamily: fonts.bodyExtraBold, fontSize: 13 },
  textBlock: { alignItems: 'center', gap: 8 },
  headline: { fontFamily: fonts.display, fontSize: 24, textAlign: 'center' },
  subtext: { fontFamily: fonts.bodySemiBold, fontSize: 14, height: 22 },
  transformRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  circleShape: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  squareShape: { width: 50, height: 50, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 290 },
  tipText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 17 },
});
