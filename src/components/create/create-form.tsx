import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type CreateFormProps = {
  /** When set, this is the "Generate (from Template)" variant: shows the
   * selected-template banner and switches the CTA copy to "Recreate". */
  template?: Template;
};

export function CreateForm({ template }: CreateFormProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [subject, setSubject] = useState<'couple' | 'solo'>('couple');
  const [style, setStyle] = useState('realistic');
  const [description, setDescription] = useState('');
  const [youImage, setYouImage] = useState<string | null>(null);
  const [partnerImage, setPartnerImage] = useState<string | null>(null);

  // Demo-only suggestion phrases — real, translated strings (not a fixed
  // set matched elsewhere), so a plain returnObjects lookup is enough; no
  // labelKey indirection needed like the module-scope arrays elsewhere.
  const suggestions = t('generate.suggestions', { returnObjects: true }) as string[];

  const promptPlaceholder = template
    ? t('generate.promptPlaceholderTemplate', { template: template.label })
    : t('generate.promptPlaceholder');

  function surpriseMe() {
    const pick = suggestions[Math.floor(Math.random() * suggestions.length)];
    setDescription(pick);
  }

  function handleGenerate() {
    router.push({
      pathname: '/loading',
      params: {
        mode: subject,
        style,
        description,
        youImage: youImage ?? '',
        partnerImage: partnerImage ?? '',
      },
    });
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {template ? (
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
            <UploadSlot label={t('generate.you')} imageUri={youImage} onImageChange={setYouImage} />
            {subject === 'couple' ? (
              <UploadSlot label={t('generate.partner')} imageUri={partnerImage} onImageChange={setPartnerImage} reversed />
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
              {template ? t('generate.addExtraDetail') : t('generate.addDescription')}{' '}
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
            {template ? null : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {suggestions.map((s) => (
                  <Chip key={s} label={s} active={s === description} onPress={() => setDescription(s)} />
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.ctaBlock}>
            <GradientButton
              label={template ? t('generate.recreateFusion') : t('generate.generateFusion')}
              icon="sparkle"
              onPress={handleGenerate}
            />
            <Text style={[styles.caption, { color: theme.inkFaint }]}>{t('generate.creditsCaption')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
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
    padding: 0,
    textAlignVertical: 'top',
  },
  surpriseRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  chipsRow: { gap: 9 },
  ctaBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  caption: { fontFamily: fonts.body, fontSize: 13 },
});
