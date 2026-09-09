import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { type AlertButton, useAlertStore } from '@/alerts/store';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * App-wide host for every alert/confirmation popup — rendered once in the
 * root layout so `showAlert(...)` works from any screen or utility module.
 * Replaces the plain OS dialog `Alert.alert` renders with a card that
 * actually looks like the rest of Amora (glass, gradient accent, the same
 * display/body fonts) instead of a jarring system popup.
 *
 * Button styling follows the convention already established elsewhere in
 * the app (see profile/index.tsx's settings rows): 'destructive' uses
 * theme.accent1 as its danger color; 'cancel' and unstyled buttons render
 * as a plain glass button; anything else is the app's usual gradient CTA —
 * the same GradientButton used for every primary action elsewhere.
 */
export function ThemedAlertHost() {
  const theme = useAppTheme();
  const visible = useAlertStore((s) => s.visible);
  const title = useAlertStore((s) => s.title);
  const message = useAlertStore((s) => s.message);
  const buttons = useAlertStore((s) => s.buttons);
  const hide = useAlertStore((s) => s.hide);

  function handlePress(button: AlertButton) {
    hide();
    button.onPress?.();
  }

  // Matches native Alert.alert's default Android behavior: the back button
  // dismisses without invoking any button's handler.
  function handleRequestClose() {
    hide();
  }

  const isRow = buttons.length <= 2 && buttons.length > 1;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleRequestClose}>
      <View style={styles.backdrop}>
        {/* A solid dark scrim, not a blur: this host has no screen ancestor
         * providing a blurTarget (see blur-target.tsx), and Android's real
         * blur silently renders nothing without one — which is exactly why
         * this looked "transparent" and unreadable before. A plain opaque
         * scrim is guaranteed to work on every device, blur support or not.
         * iOS still gets a real blur layered on top for extra polish, since
         * iOS blurs for real without needing a target at all. */}
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        {Platform.OS === 'ios' ? <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        <GlassCard strong radius={26} style={styles.card}>
          <LinearGradient
            colors={[theme.accent1, theme.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentBar}
          />
          <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: theme.inkSoft }]}>{message}</Text> : null}
          <View style={[styles.buttonGroup, isRow && styles.buttonRow]}>
            {buttons.map((button, i) => (
              <AlertActionButton key={`${button.text}-${i}`} button={button} onPress={() => handlePress(button)} flex={isRow} />
            ))}
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

function AlertActionButton({ button, onPress, flex }: { button: AlertButton; onPress: () => void; flex: boolean }) {
  const theme = useAppTheme();
  const isPrimary = button.style !== 'cancel' && button.style !== 'destructive';

  if (isPrimary) {
    return (
      <View style={flex ? styles.flexSlot : undefined}>
        <GradientButton label={button.text} onPress={onPress} />
      </View>
    );
  }

  const tint = button.style === 'destructive' ? theme.accent1 : theme.inkSoft;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.secondaryButton, flex && styles.flexSlot, { borderColor: button.style === 'destructive' ? theme.accent1 : theme.glassBorder }]}>
      <Text style={[styles.secondaryLabel, { color: tint }]}>{button.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  scrim: { backgroundColor: 'rgba(10, 5, 14, 0.86)' },
  card: { width: '100%', maxWidth: 360, padding: 24, gap: 14, overflow: 'hidden' },
  // Thin gradient rule along the top edge — the one consistent "premium"
  // signature across every alert, independent of whatever title/emoji the
  // caller chose, so nothing here has to guess a per-message icon.
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  title: { fontFamily: fonts.display, fontSize: 20, textAlign: 'center' },
  message: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  buttonGroup: { gap: 10, marginTop: 6 },
  buttonRow: { flexDirection: 'row' },
  flexSlot: { flex: 1 },
  secondaryButton: {
    borderWidth: 1.5,
    borderRadius: radii.xl,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontFamily: fonts.bodyExtraBold, fontSize: 15.5 },
});
