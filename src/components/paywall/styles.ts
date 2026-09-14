import { StyleSheet } from 'react-native';

import { fonts } from '../../theme/tokens';

/**
 * Styles for the paywall modal (./paywall-modal.tsx) — split out 2026-09-11,
 * same reason as src/components/resultScreen/styles.ts: keep the component
 * file itself under the workspace's 350-line limit as real fixes (the
 * ad-cap, the 3-day trial card) kept adding lines to it. No behavior here,
 * just the StyleSheet paywall-modal.tsx references as `styles.*`.
 */
export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: fonts.bodyBold,
  },
  closeButton: {
    padding: 4,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingVertical: 16,
    gap: 14,
  },
  mainTitle: {
    fontSize: 22,
    fontFamily: fonts.display,
    letterSpacing: -0.3,
  },
  mainSubtitle: {
    fontSize: 13,
    fontFamily: fonts.body,
    marginTop: -8,
    marginBottom: 4,
    lineHeight: 18,
  },
  coupleShareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  coupleShareText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 17,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 16,
    position: 'relative',
  },
  freeAdCard: {
    backgroundColor: 'rgba(235, 94, 85, 0.05)',
  },
  highlightCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
  },
  popularTag: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  popularTagText: {
    fontSize: 9,
    fontFamily: fonts.bodyBold,
    color: '#000',
    letterSpacing: 0.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: fonts.bodyBold,
    letterSpacing: 0.5,
  },
  cardPrice: {
    fontSize: 20,
    fontFamily: fonts.bodyBold,
  },
  unitText: {
    fontSize: 12,
    fontFamily: fonts.body,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: fonts.bodyBold,
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 16,
  },
  actionBtn: {
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: fonts.bodyBold,
  },
  trialProgressTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  trialProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  trialProgressLabel: {
    marginTop: 6,
    fontSize: 11,
    fontFamily: fonts.body,
  },
  footerText: {
    fontSize: 11,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
  },
  restoreLink: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  restoreLinkText: {
    fontSize: 13,
    fontFamily: fonts.bodySemiBold,
    textDecorationLine: 'underline',
  },
});
