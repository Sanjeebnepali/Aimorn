import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { refreshCoupleState } from '../../couple/bootstrap';
import { useCoupleStore } from '../../couple/store';
import { toast } from '../../lib/toast';
import { useApi } from '../../utils/api';

/**
 * Couple Linking — the "waiting for partner" room.
 *
 * Person A lands here after sharing their code. Rewired onto the real
 * backend: `bootstrapCoupleFeature` only opens the couple WebSocket once
 * `hasPartner` is already true (see `couple/bootstrap.ts`'s `hydrate()`),
 * so — unlike the donor app, where a Supabase realtime channel was already
 * open while pending — there's nothing pushing to this screen yet. This
 * screen runs its own fast poll (`refreshCoupleState()` every 3s) instead,
 * same idea as the donor app's "safety-net poll", just promoted to the only
 * mechanism rather than a backstop.
 *
 * Re-themed 2026-09-08 onto `GradientScreen`/`GlassCard` — see
 * `couple/setup.tsx`'s doc comment for the full story on why this whole
 * flow used to look like a different app. Logic below is untouched. `copy`
 * has no equivalent in Amora's own `Icon` set so it stays on `Ionicons`,
 * same as `YourCodeCard.tsx`.
 */
export default function CoupleLinking() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const hasPartner = useCoupleStore((s) => s.hasPartner);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  useEffect(() => {
    api.getProfile().then((p) => setPairingCode(p.pairingCode)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance the moment a partner redeems our code.
  useEffect(() => {
    if (hasPartner) router.replace('/couple/dashboard' as Href);
  }, [hasPartner, router]);

  // Fast poll while waiting — see the file doc comment for why this can't
  // rely on the socket (it isn't open yet for an unpaired account).
  useEffect(() => {
    if (hasPartner) return;
    const id = setInterval(() => void refreshCoupleState(), 3000);
    return () => clearInterval(id);
  }, [hasPartner]);

  // Subtle pulse on the heart icon while we wait — reanimated worklet.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const code = pairingCode ?? '—';
  const onCopy = useCallback(async () => {
    if (!pairingCode) return;
    await Clipboard.setStringAsync(pairingCode);
    toast(t('couple.setup.codeCopied'));
  }, [pairingCode, t]);
  const onShare = useCallback(async () => {
    if (!pairingCode) return;
    await Share.share({ message: t('couple.setup.shareMessage', { code: pairingCode }) });
  }, [pairingCode, t]);
  // Nothing to undo server-side — the code hasn't been redeemed by anyone
  // yet, so there's no pairing to tear down. Just leave the waiting room.
  const onCancel = useCallback(() => {
    router.replace('/couple/setup' as Href);
  }, [router]);

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        <View style={styles.body}>
          <Animated.View style={[styles.heartRing, pulseStyle]}>
            <View style={[styles.heart, { backgroundColor: theme.accent1 }]}>
              <Icon name="heart" size={38} color="#131313" />
            </View>
          </Animated.View>

          <Text style={[styles.title, { color: theme.ink }]}>{t('couple.linking.waiting')}</Text>
          <Text style={[styles.body2, { color: theme.inkSoft }]}>{t('couple.linking.shareHint')}</Text>

          <GlassCard strong style={[styles.codeCard, { borderColor: theme.accent1 }]}>
            <Text style={[styles.codeText, { color: theme.accent1 }]}>{code}</Text>
            <View style={styles.btnRow}>
              <Pressable onPress={onCopy} style={[styles.smallBtn, { borderColor: theme.accent1 }]}>
                <Ionicons name="copy-outline" size={14} color={theme.accent1} />
                <Text style={[styles.smallBtnText, { color: theme.accent1 }]}>{t('couple.setup.copy')}</Text>
              </Pressable>
              <Pressable onPress={onShare} style={[styles.smallBtn, { borderColor: theme.accent1 }]}>
                <Icon name="share" size={14} color={theme.accent1} />
                <Text style={[styles.smallBtnText, { color: theme.accent1 }]}>{t('couple.setup.share')}</Text>
              </Pressable>
            </View>
          </GlassCard>

          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Icon name="close" size={14} color={theme.inkFaint} />
            <Text style={[styles.cancelText, { color: theme.inkFaint }]}>{t('couple.linking.cancel')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  // Wrapper the pulse animation scales, separate from the heart's own fixed
  // 96x96 layout box — scaling the box itself would also relayout siblings
  // every frame instead of a pure transform.
  heartRing: { marginBottom: 16 },
  heart: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.bodyExtraBold,
    fontSize: 22,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  body2: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  codeCard: {
    borderWidth: 1.5,
    padding: 20,
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  codeText: {
    fontFamily: fonts.bodyExtraBold,
    fontSize: 38,
    letterSpacing: 5,
    fontVariant: ['tabular-nums'],
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  smallBtnText: { fontFamily: fonts.bodyBold, fontSize: 13.5 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  cancelText: { fontFamily: fonts.bodyBold, fontSize: 13 },
});
