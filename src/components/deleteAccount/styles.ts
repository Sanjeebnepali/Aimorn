import { StyleSheet } from 'react-native';

import { fonts, radii } from '@/theme/tokens';

// Lives here (not app/delete-account/styles.ts) for the same reason
// components/profile/styles.ts does: Expo Router's typedRoutes treats
// EVERY file directly under src/app/ as a route, including plain .ts
// files — confirmed live 2026-09-14, a styles.ts sibling inside
// app/delete-account/ minted a bogus `/delete-account/styles` route AND
// stopped `/delete-account/index` from collapsing to the expected bare
// `/delete-account` path, breaking `router.push('/delete-account')`'s
// own type. Anything under src/components/ is invisible to that scanner.
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  headerSpacer: { width: 40 },
  title: { fontFamily: fonts.display, fontSize: 19 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 50, gap: 14 },

  warningCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1 },
  warningText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 19 },

  card: { padding: 18, gap: 10 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15.5 },
  cardBody: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20 },

  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  itemText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },

  confirmBlock: { gap: 10, marginTop: 6 },
  confirmLabel: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  inputCard: { paddingHorizontal: 16, paddingVertical: 4 },
  input: { fontFamily: fonts.bodySemiBold, fontSize: 15, paddingVertical: 10, letterSpacing: 1 },

  deleteButton: { borderRadius: radii.pill, borderWidth: 1, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  deleteButtonDisabled: { opacity: 0.35 },
  deleteButtonLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#fff' },
});
