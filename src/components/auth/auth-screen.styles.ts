import { StyleSheet } from 'react-native';

import { fonts } from '@/theme/tokens';

/** Extracted from auth/index.tsx to keep that route file under the
 * workspace's 350-line cap once the forgot-password step was added. */
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 24 },
  brandBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  headline: { fontFamily: fonts.display, fontSize: 23 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', lineHeight: 18 },
  fields: { gap: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 15 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 13, padding: 0 },
  disabled: { opacity: 0.5 },
  forgot: { alignSelf: 'flex-end', fontFamily: fonts.bodyBold, fontSize: 13 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: fonts.body, fontSize: 12.5 },
  socialBlock: { gap: 10 },
  socialButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  socialLabel: { fontFamily: fonts.bodyBold, fontSize: 13 },
  spacer: { flex: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText: { fontFamily: fonts.body, fontSize: 14 },
  footerLink: { fontFamily: fonts.bodyBold, fontSize: 14 },
});
