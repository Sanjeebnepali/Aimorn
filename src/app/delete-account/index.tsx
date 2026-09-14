import { useClerk } from '@clerk/expo';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';
import { styles } from '@/components/deleteAccount/styles';

const ITEM_KEYS = ['itemPhotos', 'itemPosts', 'itemCouple', 'itemCredits'] as const;

/**
 * Real Play Store / App Store compliance requirement, not a nice-to-have —
 * both platforms require an in-app path to delete your account once an app
 * lets you create one (Play Console's Data Safety policy, Apple's Guideline
 * 5.1.1(v)). Reachable from Profile's settings list.
 *
 * Two real safeguards before anything irreversible happens: the "type
 * DELETE" input (disables the button until it matches exactly) AND a native
 * confirm alert on top of that — this is the single most destructive,
 * unrecoverable action anywhere in the app, so it gets more friction than a
 * normal destructive action (sign out, unlink), not less.
 */
export default function DeleteAccountScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const { signOut } = useClerk();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Belt-and-suspenders on top of KeyboardAvoidingView's real fix above
  // (see that comment for the actual root cause) — once the keyboard has
  // fully shown, make sure the input+button are scrolled fully into the
  // now-shrunk viewport rather than relying on whatever scroll position
  // they happened to already be at. `keyboardDidShow`, not the input's own
  // onFocus: onFocus fires the instant focus changes, before
  // KeyboardAvoidingView has actually finished animating its own resize,
  // so a scroll computed at that moment targets the still-full-height
  // layout and gets stale the moment the resize actually lands.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  const canDelete = confirmText.trim() === 'DELETE' && !deleting;
  // Billed through the store the app was installed from — same distinction
  // paywall-modal.tsx's own subscription-management copy already makes.
  const storeName = Platform.OS === 'ios' ? 'Apple ID' : 'Google Play';

  function confirmAndDelete() {
    showAlert(t('deleteAccount.title'), t('deleteAccount.intro'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('deleteAccount.confirmButton'), style: 'destructive', onPress: () => void runDeletion() },
    ]);
  }

  async function runDeletion() {
    setDeleting(true);
    try {
      // The server independently checks res.locals.userId (from the Clerk
      // bearer token) as the real ownership check — this screen's own
      // "type DELETE" gate is a UX safeguard, not the security boundary.
      await api.deleteAccount();
      // Deliberately no success alert here: the account (and every row
      // that could render one) is already gone server-side, and signOut()
      // below clears the local session immediately, so there's nothing
      // left to show a confirmation ON TOP of — the app just returns to
      // its signed-out state, which is itself the confirmation.
      await signOut();
      router.replace('/(tabs)');
    } catch (err) {
      setDeleting(false);
      showAlert(t('deleteAccount.errorTitle'), err instanceof Error ? err.message : t('deleteAccount.errorTitle'));
    }
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('deleteAccount.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Real bug, reported live 2026-09-14, and root-caused live on-device
         * (not guessed): every OTHER form screen in this app (create-post,
         * create-form, freeform-form, etc.) gives KeyboardAvoidingView a
         * real `behavior` only on iOS and leaves Android as `undefined`,
         * reasoning that windowSoftInputMode="adjustResize"
         * (AndroidManifest.xml) already shrinks the window on its own.
         * That reasoning doesn't hold here: this project also has
         * `edgeToEdgeEnabled=true` (android/gradle.properties) — an
         * edge-to-edge Activity draws behind the keyboard/system bars
         * itself, so the classic adjustResize content-resize never
         * actually fires; the keyboard just overlays on top with nothing
         * for the JS layer to react to. Confirmed live: `Keyboard`'s
         * `keyboardDidShow` event WAS firing and `scrollToEnd()` WAS being
         * called (logged), but produced zero visible change, because
         * there was no resize to scroll into — the input+button were
         * simply covered by an overlay, not pushed off a resized screen.
         * `behavior="height"` (not `undefined`) makes KeyboardAvoidingView
         * itself shrink its child on Android in response to the keyboard,
         * independent of adjustResize — the actual fix, verified live
         * below. Left explicitly per-platform (not just always "height")
         * since iOS's own best-documented behavior is still `padding`. */}
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GlassCard radius={20} style={[styles.warningCard, { borderColor: theme.accent1 }]}>
            <Icon name="trash" size={22} color={theme.accent1} strokeWidth={1.8} />
            <Text style={[styles.warningText, { color: theme.ink }]}>{t('deleteAccount.intro')}</Text>
          </GlassCard>

          <GlassCard radius={20} style={styles.card}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('deleteAccount.whatGetsDeletedTitle')}</Text>
            {ITEM_KEYS.map((key) => (
              <View key={key} style={styles.itemRow}>
                <View style={[styles.itemDot, { backgroundColor: theme.accent1 }]} />
                <Text style={[styles.itemText, { color: theme.inkSoft }]}>{t(`deleteAccount.${key}`)}</Text>
              </View>
            ))}
          </GlassCard>

          <GlassCard radius={20} style={styles.card}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('deleteAccount.subscriptionNoteTitle')}</Text>
            <Text style={[styles.cardBody, { color: theme.inkSoft }]}>
              {t('deleteAccount.subscriptionNoteBody', { store: storeName })}
            </Text>
          </GlassCard>

          <View style={styles.confirmBlock}>
            <Text style={[styles.confirmLabel, { color: theme.inkFaint }]}>{t('deleteAccount.confirmLabel')}</Text>
            <GlassCard radius={16} style={styles.inputCard}>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={t('deleteAccount.confirmPlaceholder')}
                placeholderTextColor={theme.inkFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
                style={[styles.input, { color: theme.ink }]}
              />
            </GlassCard>

            <Pressable
              disabled={!canDelete}
              onPress={confirmAndDelete}
              style={[
                styles.deleteButton,
                { backgroundColor: theme.accent1, borderColor: theme.accent1 },
                !canDelete && styles.deleteButtonDisabled,
              ]}>
              <Text style={styles.deleteButtonLabel}>
                {deleting ? t('deleteAccount.deletingButton') : t('deleteAccount.confirmButton')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientScreen>
  );
}
