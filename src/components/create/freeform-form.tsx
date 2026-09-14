import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { IconButton } from '@/components/primitives/icon-button';
import { STYLE_OPTIONS, StyleSwatch } from '@/components/primitives/style-swatch';
import { UploadSlot } from '@/components/primitives/upload-slot';
import { PaywallModal } from '@/components/paywall/paywall-modal';
import { findPhotoQualityIssue } from '@/lib/photoQualityCheck';
import { toast } from '@/lib/toast';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';

/**
 * "General" mode — the Generate landing screen's third choice alongside
 * Couple/Single (src/app/(tabs)/generate/index.tsx). Deliberately the
 * leanest of the three creation screens: one photo, one free-text
 * description, no template/reference image and no couple/solo toggle (it's
 * always a single uploaded photo). Built for viral "reimagine me as ___"
 * trends (80s/90s yearbook photos, Y2K flash photography, etc. — see the
 * suggestion chips below) that would otherwise each need a hand-built
 * Template card; here the user's own words ARE the template.
 *
 * Sends `freeform: true` through to the server (loading.tsx → generations.ts
 * → promptBuilder.ts's buildFreeformScenePrompt) so the description gets
 * full authority over pose/outfit/hair/era, not just the background — the
 * opposite default from create-form.tsx's Couple/Single flow, which
 * deliberately keeps pose/clothing fixed unless told otherwise (see that
 * file's own fidelityLine comment). Template-free but still
 * IDENTITY-preserving output is the entire point of a "make me look like X"
 * request, so this mode has to invert that default rather than share it.
 */
export function FreeformForm() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const [style, setStyle] = useState('realistic');
  const [description, setDescription] = useState('');
  // Array, not a single URI, since 2026-09-12 — see UploadSlot's own doc
  // comment for the multi-angle identity-lock research this answers a real
  // complaint with ("output unrecognizable... completely different from
  // the original").
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const suggestions = t('createChoice.freeformSuggestions', { returnObjects: true }) as string[];

  async function handleGenerate() {
    if (uploading) return;
    if (!photos.length) {
      toast(t('generate.needYourPhoto'));
      return;
    }
    // Unlike create-form.tsx's description (optional — DEFAULT_THEME_PROMPT
    // covers it), General mode has no template/theme to fall back on at
    // all — an empty description here would generate something completely
    // arbitrary, defeating the entire point of this screen.
    if (!description.trim()) {
      toast(t('createChoice.needDescription'));
      return;
    }

    try {
      const profile = await api.getProfile();
      if (profile.credits < 1 && !profile.isSubscribed) {
        setPaywallVisible(true);
        return;
      }
    } catch {
      // Offline or profile fetch failed — let the backend be the source of
      // truth on the actual credit check, same as create-form.tsx.
    }

    setUploading(true);
    try {
      const photoAKeys = await Promise.all(photos.map((uri) => api.uploadPhoto(uri)));

      // Checked here — after upload, before spending a real credit on
      // POST /generations — see create-form.tsx's identical check (and
      // photoQualityCheck.ts's own doc comment) for the complaint this
      // answers: a blurry/faceless reference photo silently burning a
      // credit on output that was never going to look like the person.
      const qualityIssue = await findPhotoQualityIssue(
        api,
        photoAKeys.map((key) => ({ key, label: t('generate.you') })),
      );
      if (qualityIssue) {
        toast(qualityIssue);
        return;
      }

      router.push({
        pathname: '/loading',
        params: {
          mode: 'solo',
          style,
          description,
          templateId: '',
          photoAKeys: JSON.stringify(photoAKeys),
          photoBKeys: '',
          sourcePostId: '',
          freeform: 'true',
        },
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : t('generate.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <IconButton name="chevronLeft" onPress={() => router.back()} />
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: theme.ink }]}>{t('createChoice.generalTitle')}</Text>
                <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('createChoice.generalSubtitle')}</Text>
              </View>
            </View>

            <View style={styles.uploadRow}>
              <UploadSlot label={t('generate.you')} images={photos} onImagesChange={setPhotos} />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('generate.pickStyle')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleRail}>
                {STYLE_OPTIONS.map((opt) => (
                  <StyleSwatch key={opt.key} option={opt} active={style === opt.key} onPress={() => setStyle(opt.key)} />
                ))}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.ink }]}>{t('createChoice.describeAnything')}</Text>
              <GlassCard radius={20} style={styles.promptCard}>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('createChoice.freeformPlaceholder')}
                  placeholderTextColor={theme.inkFaint}
                  multiline
                  style={[styles.promptInput, { color: theme.ink }]}
                />
              </GlassCard>
              <Text style={[styles.trendLabel, { color: theme.inkFaint }]}>{t('createChoice.trendingNow')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {suggestions.map((s) => (
                  <Chip key={s} label={s} active={s === description} onPress={() => setDescription(s)} />
                ))}
              </ScrollView>
            </View>

            <View style={styles.ctaBlock}>
              <GradientButton
                label={uploading ? t('generate.uploading') : t('createChoice.generateGeneral')}
                icon={uploading ? undefined : 'sparkle'}
                onPress={handleGenerate}
                disabled={uploading}
              />
              <Text style={[styles.caption, { color: theme.inkFaint }]}>{t('generate.creditsCaption')}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        title={t('generate.outOfCreditsTitle', { defaultValue: 'Out of AI Credits' })}
        subtitle={t('generate.outOfCreditsSubtitle', { defaultValue: 'Get 20 Credits for $3.99 or watch a quick ad to keep creating!' })}
      />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 210, gap: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 13 },
  uploadRow: { flexDirection: 'row', gap: 14, marginVertical: 2 },
  section: { gap: 14 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  styleRail: { gap: 13, paddingVertical: 2, paddingHorizontal: 2 },
  label: { fontFamily: fonts.bodyBold, fontSize: 14 },
  promptCard: { padding: 16 },
  promptInput: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    minHeight: 64,
    // Same fix as create-form.tsx's promptInput (confirmed live 2026-09-11)
    // applied here from the start: an uncapped multiline TextInput grows
    // until the cursor ends up pinned behind the keyboard on long text.
    maxHeight: 160,
    padding: 0,
    textAlignVertical: 'top',
  },
  trendLabel: { fontFamily: fonts.bodyBold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  chipsRow: { gap: 9 },
  ctaBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  caption: { fontFamily: fonts.body, fontSize: 13 },
});
