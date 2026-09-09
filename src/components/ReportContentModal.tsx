import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BottomSheetModal } from './PremiumSheet';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { type ReportContext, type ReportReason } from '../lib/reportContent';
import { toast } from '../lib/toast';
import { useApi } from '../utils/api';
import { AnimatedButton } from './AnimatedButton';
import { PremiumSheet } from './PremiumSheet';

/**
 * In-app content reporting — the actual fix for B5
 * (PLAY_STORE_COMPLIANCE.md): the AI generator previously had no report
 * path at all, and the one Report control in the app (WallpaperMenu) was a
 * fake toast with no backend.
 *
 * USAGE — any surface that shows AI/catalog content, or (L12) a person:
 *
 *   import { reportContent } from '../../components/ReportContentModal';
 *   reportContent({ surface: 'ai_preview', prompt, provider, model });
 *   reportContent({ surface: 'couple_partner', targetUserId: link.partner?.id });
 *
 * Fire-and-forget from the caller's side — the modal owns reason
 * selection, submission, and the success/failure toast internally. Only
 * `couple_partner` has a real (if still unimplemented — see `useApi().
 * reportPartner`'s doc comment) endpoint behind it today; the other two
 * surfaces have no caller anywhere in the app yet, so they honestly fail
 * rather than pretending to submit.
 *
 * `ReportContentHost` must be mounted once at the app root (see
 * `PremiumAlertHost` for the same pattern).
 */

const CONTENT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'inappropriate', label: 'Inappropriate / sexual content' },
  { key: 'real_person', label: 'Depicts a real person' },
  { key: 'copyright', label: 'Copyright infringement' },
  { key: 'violence', label: 'Violence or gore' },
  { key: 'other', label: 'Other' },
];

const PERSON_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'harassment', label: 'Harassment or unsafe behavior' },
  { key: 'inappropriate', label: 'Inappropriate content or messages' },
  { key: 'other', label: 'Other' },
];

let externalShow: ((ctx: ReportContext) => void) | null = null;

export function reportContent(ctx: ReportContext): void {
  if (!externalShow) {
    if (__DEV__) console.warn('[ReportContent] host not mounted — report dropped');
    return;
  }
  externalShow(ctx);
}

export function ReportContentHost() {
  const sheetRef = useRef<BottomSheetModal>(null);
  const theme = useTheme();
  const api = useApi();
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    externalShow = (c) => {
      setCtx(c);
      setReason(null);
      setDetails('');
      sheetRef.current?.present();
    };
    return () => {
      externalShow = null;
    };
  }, []);

  const onCancel = useCallback(() => sheetRef.current?.dismiss(), []);

  const onSubmit = useCallback(async () => {
    if (!ctx || !reason || submitting) return;
    setSubmitting(true);
    // Only couple_partner has a real endpoint behind it — see the file doc
    // comment above. The other two surfaces have no caller anywhere in the
    // app today; rather than silently "succeeding" against nothing (the old
    // fake-Supabase behavior), they honestly report as not-yet-available.
    let ok = false;
    let message = 'Reporting isn’t available for this yet';
    if (ctx.surface === 'couple_partner') {
      try {
        await api.reportPartner(reason + (details.trim() ? `: ${details.trim()}` : ''));
        ok = true;
      } catch (err) {
        message = err instanceof Error ? err.message : 'Could not submit report — try again';
      }
    }
    setSubmitting(false);
    sheetRef.current?.dismiss();
    toast(ok ? '✓ Report submitted — thank you' : message);
  }, [ctx, reason, details, submitting, api]);

  const isPersonReport = ctx?.surface === 'couple_partner';
  const reasons = isPersonReport ? PERSON_REASONS : CONTENT_REASONS;

  return (
    <PremiumSheet
      ref={sheetRef}
      snapPoints={['68%']}
      title={isPersonReport ? 'Report Partner' : 'Report Content'}
      subtitle={isPersonReport ? "What's the issue?" : "What's wrong with this image?"}
      accentColor={Colors.error}
    >
      <View style={styles.list}>
        {reasons.map((r) => {
          const selected = reason === r.key;
          return (
            <AnimatedButton
              key={r.key}
              onPress={() => setReason(r.key)}
              style={[
                styles.reasonRow,
                selected && { borderColor: Colors.error, backgroundColor: Colors.error + '1A' },
              ]}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? Colors.error : Colors.textDim}
              />
              <Text style={[styles.reasonText, { color: theme.text }]}>{r.label}</Text>
            </AnimatedButton>
          );
        })}
      </View>

      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Add details (optional)"
        placeholderTextColor={Colors.textDim}
        style={[styles.input, { color: theme.text, borderColor: Colors.surfaceHi }]}
        multiline
        numberOfLines={3}
      />

      <View style={styles.buttons}>
        <AnimatedButton onPress={onCancel} style={[styles.btn, styles.btnCancel]}>
          <Text style={[styles.btnTextCancel, { color: theme.text }]}>Cancel</Text>
        </AnimatedButton>
        <AnimatedButton
          onPress={onSubmit}
          disabled={!reason || submitting}
          style={[
            styles.btn,
            { backgroundColor: Colors.error, opacity: !reason || submitting ? 0.5 : 1 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnTextPrimary}>Submit Report</Text>
          )}
        </AnimatedButton>
      </View>
    </PremiumSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.xs },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: Colors.surfaceHi,
  },
  reasonText: { fontSize: 14, fontWeight: '600', flex: 1 },
  input: {
    marginTop: Spacing.md,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 13,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  buttons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: { backgroundColor: Colors.surfaceHi },
  btnTextPrimary: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  btnTextCancel: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
});
