import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { Icon } from '@/components/primitives/icon';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type PurchaseSuccessModalProps = {
  visible: boolean;
  /** e.g. "✨ Credits Unlocked!" / "👑 Amora Pro Activated!" — the same
   * per-product copy paywall-modal.tsx already had, just no longer rendered
   * through the OS's own Alert.alert. */
  title: string;
  body: string;
  /** Short "receipt" pill — e.g. "+20 Credits" or "Amora Pro · Weekly" — the
   * one thing a purchase confirmation most needs to make obvious at a
   * glance: exactly what did I just get, distinct from `body`'s longer
   * sentence below it. */
  badgeLabel: string;
  onClose: () => void;
};

/**
 * Redesign of the post-payment confirmation (reported 2026-09-14: "fix the
 * popup notification design after payment") — every purchase in
 * paywall-modal.tsx used to confirm through a plain `Alert.alert`, which
 * means a real charge going through ended in the OS's own grey system
 * dialog: no gradient, no brand mark, nothing that says "Amora" at all,
 * right at the one moment (money actually changed hands) a purchase flow
 * most needs to feel deliberate and trustworthy rather than generic.
 *
 * Not routed through the app's existing `showAlert`/ThemedAlertHost either
 * (see alerts/store.ts) — that host is a general-purpose confirm/error
 * dialog used everywhere else in the app, and reusing its plain title+body
 * layout here would still bury the one thing this specific moment needs to
 * foreground: WHAT you got (the `badgeLabel` pill), not just that
 * "something succeeded." A dedicated component is the same "the right tool
 * for a materially different job" reasoning ProgressOverlay's own doc
 * comment gives for not folding into loading.tsx's ring.
 */
export function PurchaseSuccessModal({ visible, title, body, badgeLabel, onClose }: PurchaseSuccessModalProps) {
  const theme = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Same "opaque scrim always works, blur is iOS-only bonus polish"
         * reasoning as ThemedAlertHost's own backdrop — see that
         * component's doc comment for the real Android crash history
         * behind not attempting a real blur here. */}
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        {Platform.OS === 'ios' ? <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} /> : null}

        <GlassCard strong radius={28} style={styles.card}>
          <LinearGradient
            colors={[theme.accent1, theme.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentBar}
          />

          <LinearGradient
            colors={[theme.accent1, theme.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.checkBadge}
          >
            <Icon name="check" size={30} color={theme.ink} strokeWidth={3} />
          </LinearGradient>

          <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>

          <View style={[styles.pill, { borderColor: theme.accent1, backgroundColor: `${theme.accent1}1F` }]}>
            <Icon name="sparkle" size={14} color={theme.accent1} />
            <Text style={[styles.pillText, { color: theme.accent1 }]}>{badgeLabel}</Text>
          </View>

          <Text style={[styles.body, { color: theme.inkSoft }]}>{body}</Text>

          <GradientButton label="Awesome, let's go! ✨" onPress={onClose} />
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  scrim: { backgroundColor: 'rgba(10, 5, 14, 0.88)' },
  card: { width: '100%', maxWidth: 360, padding: 26, gap: 14, alignItems: 'center', overflow: 'hidden' },
  // Same thin top-edge gradient rule as ThemedAlertHost's cards — the one
  // consistent "premium" signature across every popup in the app.
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  checkBadge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 21, textAlign: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: { fontFamily: fonts.bodyExtraBold, fontSize: 13.5 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
