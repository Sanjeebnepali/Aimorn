import { StyleSheet } from 'react-native';

import { fonts } from '@/theme/tokens';

/**
 * Styles for the Profile screen (src/app/(tabs)/profile/index.tsx) — split
 * out 2026-09-13 (same reasoning as src/components/resultScreen/styles.ts)
 * purely to keep that route file under the workspace's 350-line module
 * limit after this pass removed the redundant "Amora Premium" card but the
 * file was still over the cap on its own.
 *
 * Lives under src/components/, NOT src/app/(tabs)/profile/ — a first
 * attempt put it right next to index.tsx, but Expo Router treats every
 * file under src/app/ as a route file by convention (confirmed live: it
 * logged "Route './(tabs)/profile/styles.ts' is missing the required
 * default export"). resultScreen/styles.ts avoids this the same way, by
 * living outside the app/ directory entirely.
 */
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 165, gap: 26 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 26 },
  avatarBlock: { alignItems: 'center', gap: 12, marginVertical: 6 },
  avatar: { width: 92, height: 92, borderRadius: 46, borderWidth: 3.5 },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.display, fontSize: 20 },
  handle: { fontFamily: fonts.body, fontSize: 13.5 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: fonts.bodyExtraBold, fontSize: 17 },
  statLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  partnerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  partnerIconWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pointsCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  pointsIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  partnerText: { flex: 1, gap: 3 },
  partnerName: { fontFamily: fonts.bodyBold, fontSize: 14 },
  partnerHint: { fontFamily: fonts.body, fontSize: 13 },
  section: { gap: 6, marginTop: 4 },
  modeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  sectionSubtitle: { fontFamily: fonts.body, fontSize: 13.5 },
  themeRail: { gap: 16, paddingTop: 12, paddingHorizontal: 2 },
  settingsCard: { paddingHorizontal: 16, marginTop: 6 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  settingsIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { flex: 1, fontSize: 14 },
});
