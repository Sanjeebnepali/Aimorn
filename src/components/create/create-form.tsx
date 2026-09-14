import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { SegmentToggle } from '@/components/primitives/segment-toggle';
import { STYLE_OPTIONS, StyleSwatch } from '@/components/primitives/style-swatch';
import { UploadSlot } from '@/components/primitives/upload-slot';
import type { Template } from '@/data/templates';
import { findPhotoQualityIssue } from '@/lib/photoQualityCheck';
import { toast } from '@/lib/toast';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi, type PostResponse } from '@/utils/api';
import { PaywallModal } from '@/components/paywall/paywall-modal';

type CreateFormProps = {
  /** When set, this is the "Generate (from Template)" variant: shows the
   * selected-template banner and switches the CTA copy to "Recreate". */
  template?: Template;
  /** When set, this is "Recreate a real community post" instead of a
   * bundled template — see src/app/(tabs)/generate/from-post/[id].tsx.
   * Mutually exclusive with `template` in practice (both come from
   * different entry points), but not enforced here since nothing breaks if
   * a future caller somehow had both — `template`'s banner just wins. */
  sourcePost?: PostResponse;
  /** Set by src/app/(tabs)/generate/create.tsx when the user arrived via
   * the Couple/Single card on the Generate landing screen (as opposed to
   * this screen's own toggle below, or a template/post that already
   * implies one) — added 2026-09-12 alongside that landing screen so
   * tapping "Couple" there doesn't land on a toggle silently defaulted to
   * 'couple' regardless of which card was actually tapped. Lowest
   * priority of the three subject sources on purpose: a template or
   * recreated post's own subject is a fact about that content, not a
   * preference the landing screen's card can override.
   */
  initialSubject?: 'couple' | 'solo';
};

export function CreateForm({ template, sourcePost, initialSubject }: CreateFormProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const [subject, setSubject] = useState<'couple' | 'solo'>(
    sourcePost ? (sourcePost.subjectMode === 'SOLO' ? 'solo' : 'couple') : (initialSubject ?? 'couple'),
  );
  // Recreating a real post starts from its own style, not the generic
  // default — a post shared in "Anime" style should offer to recreate in
  // Anime again, not silently reset to Realistic.
  const [style, setStyle] = useState(sourcePost?.styleKey ?? 'realistic');
  const [description, setDescription] = useState('');
  // Arrays, not single URIs, since 2026-09-12 — UploadSlot now lets each
  // person attach a couple extra reference angles for materially better AI
  // identity-lock (see that component's own doc comment for the research
  // this answers a real complaint with: "output unrecognizable, completely
  // different from the original").
  const [youImages, setYouImages] = useState<string[]>([]);
  const [partnerImages, setPartnerImages] = useState<string[]>([]);
  // Uploading happens here (not in /loading) so the nice progress screen
  // only ever deals with "generate + poll", not "and also upload photos
  // first" — two different kinds of waiting with two different failure
  // modes (a bad photo vs. a bad generation) shouldn't share one spinner.
  const [uploading, setUploading] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Demo-only suggestion phrases — real, translated strings (not a fixed
  // set matched elsewhere), so a plain returnObjects lookup is enough; no
  // labelKey indirection needed like the module-scope arrays elsewhere.
  const suggestions = t('generate.suggestions', { returnObjects: true }) as string[];

  const promptPlaceholder = template
    ? t('generate.promptPlaceholderTemplate', { template: template.label })
    : sourcePost
      ? t('generate.promptPlaceholderTemplate', { template: sourcePost.title || 'this post' })
      : t('generate.promptPlaceholder');

  function surpriseMe() {
    const pick = suggestions[Math.floor(Math.random() * suggestions.length)];
    setDescription(pick);
  }

  async function handleGenerate() {
    if (uploading) return;
    if (!youImages.length) {
      toast(t('generate.needYourPhoto'));
      return;
    }
    if (subject === 'couple' && !partnerImages.length) {
      toast(t('generate.needPartnerPhoto'));
      return;
    }

    // Check user credit balance before proceeding with generation
    try {
      const profile = await api.getProfile();
      const requiredCredits = subject === 'couple' ? 3 : 1;
      if (profile.credits < requiredCredits && !profile.isSubscribed) {
        setPaywallVisible(true);
        return;
      }
    } catch {
      // If offline or profile fetch fails, proceed and let backend validate
    }

    setUploading(true);
    try {
      // Every photo (all of "You"'s angles, all of "Partner"'s) uploads in
      // parallel — same reasoning as the server running its 3 fusion calls
      // concurrently (generations.ts): independent requests, no reason to
      // pay for them sequentially. Route params are always strings, so the
      // resulting key arrays travel to /loading JSON-stringified and get
      // parsed back there.
      const [photoAKeys, photoBKeys] = await Promise.all([
        Promise.all(youImages.map((uri) => api.uploadPhoto(uri))),
        subject === 'couple' ? Promise.all(partnerImages.map((uri) => api.uploadPhoto(uri))) : Promise.resolve([]),
      ]);

      // Checked here — after upload, before spending a real credit on
      // POST /generations — not just as a nice-to-have message: a blurry
      // or faceless reference photo is a real, reported cause of
      // unrecognizable output, so this actually blocks progress instead of
      // only warning. See api.ts's checkPhotoQuality doc comment for why
      // this never throws for a transient failure (fails open server-side).
      const qualityIssue = await findPhotoQualityIssue(api, [
        ...photoAKeys.map((key) => ({ key, label: t('generate.you') })),
        ...photoBKeys.map((key) => ({ key, label: t('generate.partner') })),
      ]);
      if (qualityIssue) {
        toast(qualityIssue);
        return;
      }

      router.push({
        pathname: '/loading',
        params: {
          mode: subject,
          style,
          description,
          // A recreated post inherits its own templateId (it may itself
          // have started from a bundled theme) — falls back to sourcePost's
          // in case the caller only set that, though template/sourcePost
          // are otherwise mutually exclusive in practice (see this
          // component's prop doc comment).
          templateId: template?.id ?? sourcePost?.templateId ?? '',
          photoAKeys: JSON.stringify(photoAKeys),
          photoBKeys: JSON.stringify(photoBKeys),
          sourcePostId: sourcePost?.id ?? '',
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
        {/* iOS has no equivalent of Android's windowSoftInputMode=
         * "adjustResize" (already set in AndroidManifest.xml) — without
         * this, the keyboard would simply overlay the screen there with no
         * resize at all. Behavior is undefined (a no-op) on Android on
         * purpose: adjustResize already shrinks the available height on
         * its own, and stacking KeyboardAvoidingView's own height-shrink on
         * top of that double-compensates into a janky over-shrunk layout —
         * confirmed by this file's own real bug (description box's cursor
         * getting pinned against the keyboard edge, see promptInput's
         * maxHeight below for the actual fix for that) had nothing to do
         * with this and everything to do with the input growing unbounded. */}
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {template || sourcePost ? (
            <View style={styles.headerRow}>
              <IconButton name="chevronLeft" onPress={() => router.back()} />
              <View>
                <Text style={[styles.title, { color: theme.ink }]}>{t('generate.titleRecreate')}</Text>
                <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('generate.subtitleRecreate')}</Text>
              </View>
            </View>
          ) : (
            <View>
              <Text style={[styles.title, { color: theme.ink }]}>{t('generate.title')}</Text>
              <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('generate.subtitle')}</Text>
            </View>
          )}

          {template ? (
            <GlassCard radius={18} style={styles.templateBanner}>
              {template.imageUrl ? (
                <Image source={{ uri: template.imageUrl }} style={styles.templateThumb} contentFit="cover" transition={200} />
              ) : (
                <LinearGradient colors={template.colors} style={styles.templateThumb} />
              )}
              <View style={styles.templateText}>
                <Text style={[styles.templateEyebrow, { color: theme.inkFaint }]}>{t('generate.recreatingTemplate')}</Text>
                <Text style={[styles.templateLabel, { color: theme.ink }]}>{template.label}</Text>
              </View>
              <IconButton name="close" size={30} iconSize={13} onPress={() => router.back()} />
            </GlassCard>
          ) : sourcePost ? (
            <GlassCard radius={18} style={styles.templateBanner}>
              {sourcePost.outputUrl ? (
                <Image source={{ uri: sourcePost.outputUrl }} style={styles.templateThumb} contentFit="cover" transition={200} />
              ) : (
                <LinearGradient colors={['#3a1c56', '#140c1e']} style={styles.templateThumb} />
              )}
              <View style={styles.templateText}>
                <Text style={[styles.templateEyebrow, { color: theme.inkFaint }]}>
                  {t('generate.recreatingPost', { name: sourcePost.author.displayName ?? 'Amora User' })}
                </Text>
                <Text style={[styles.templateLabel, { color: theme.ink }]} numberOfLines={1}>
                  {sourcePost.title || sourcePost.caption || t('generate.untitledPost')}
                </Text>
              </View>
              <IconButton name="close" size={30} iconSize={13} onPress={() => router.back()} />
            </GlassCard>
          ) : null}

          <View style={styles.row}>
            <Text style={[styles.label, { color: theme.ink }]}>{t('generate.whoIsInThis')}</Text>
            <SegmentToggle
              value={subject}
              onChange={(k) => setSubject(k as 'couple' | 'solo')}
              options={[
                { key: 'couple', label: t('generate.couple'), icon: 'couple' },
                { key: 'solo', label: t('generate.solo'), icon: 'person' },
              ]}
            />
          </View>

          <View style={styles.uploadRow}>
            <UploadSlot label={t('generate.you')} images={youImages} onImagesChange={setYouImages} />
            {subject === 'couple' ? (
              <UploadSlot label={t('generate.partner')} images={partnerImages} onImagesChange={setPartnerImages} reversed />
            ) : null}
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
            <Text style={[styles.label, { color: theme.ink }]}>
              {template || sourcePost ? t('generate.addExtraDetail') : t('generate.addDescription')}{' '}
              <Text style={{ color: theme.inkFaint, fontFamily: fonts.bodySemiBold }}>{t('generate.optional')}</Text>
            </Text>
            <GlassCard radius={20} style={styles.promptCard}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={promptPlaceholder}
                placeholderTextColor={theme.inkFaint}
                multiline
                style={[styles.promptInput, { color: theme.ink }]}
              />
              <View style={styles.surpriseRow}>
                <Chip label={t('generate.surpriseMe')} onPress={surpriseMe} />
              </View>
            </GlassCard>
            {template || sourcePost ? null : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {suggestions.map((s) => (
                  <Chip key={s} label={s} active={s === description} onPress={() => setDescription(s)} />
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.ctaBlock}>
            <GradientButton
              label={uploading ? t('generate.uploading') : template || sourcePost ? t('generate.recreateFusion') : t('generate.generateFusion')}
              icon={uploading ? undefined : 'sparkle'}
              onPress={handleGenerate}
              disabled={uploading}
            />
            <Text style={[styles.caption, { color: theme.inkFaint }]}>
              {subject === 'couple' ? t('generate.creditsCaptionCouple') : t('generate.creditsCaption')}
            </Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  title: { fontFamily: fonts.display, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 13 },
  templateBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginVertical: 4 },
  templateThumb: { width: 48, height: 48, borderRadius: 14 },
  templateText: { flex: 1, gap: 2 },
  templateEyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  templateLabel: { fontFamily: fonts.bodyBold, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 2 },
  label: { fontFamily: fonts.bodyBold, fontSize: 14 },
  uploadRow: { flexDirection: 'row', gap: 14, marginVertical: 2 },
  section: { gap: 14 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  styleRail: { gap: 13, paddingVertical: 2, paddingHorizontal: 2 },
  promptCard: { padding: 16, gap: 12 },
  promptInput: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    fontStyle: 'italic',
    minHeight: 44,
    // Confirmed live 2026-09-11: with no ceiling, typing or pasting a long
    // prompt just kept growing this box until the actively-typed cursor
    // line ended up pinned right against the keyboard's top edge with zero
    // room to spare — "the keyboard hide the text area." Capping the
    // height means the box stops growing at a sane size and becomes
    // internally scrollable past that instead (RN's default behavior for
    // a `multiline` TextInput once its content exceeds a fixed height) —
    // the cursor now always has room, no matter how long the prompt is.
    maxHeight: 140,
    padding: 0,
    textAlignVertical: 'top',
  },
  surpriseRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  chipsRow: { gap: 9 },
  ctaBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  caption: { fontFamily: fonts.body, fontSize: 13 },
});
