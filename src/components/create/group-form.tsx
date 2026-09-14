import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { STYLE_OPTIONS, StyleSwatch } from '@/components/primitives/style-swatch';
import { UploadSlot } from '@/components/primitives/upload-slot';
import { PaywallModal } from '@/components/paywall/paywall-modal';
import { findPhotoQualityIssue } from '@/lib/photoQualityCheck';
import { toast } from '@/lib/toast';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 4;

/**
 * "Group" mode — added 2026-09-12 for a real request: "three faces in one
 * photo... exactly." Not a General-mode variant: General's multi-angle
 * uploader deliberately treats every extra photo as MORE ANGLES OF THE
 * SAME person (see UploadSlot's own doc comment) — that's exactly why
 * attaching 3 different people's photos there collapsed into one
 * character, which is what this whole mode exists to fix properly instead
 * of working around.
 *
 * Each of 2-4 people gets their own single-photo slot (no multi-angle
 * within Group — see server's provider.ts FusionInput.photoA doc comment
 * for why that scope was deliberately cut: N people × several angles each
 * risks more images than the model can keep straight for a feature whose
 * whole point is already "several distinct faces at once"). Flattened in
 * slot order into one photoAKeys array server's promptGroup.ts reads as
 * "N distinct people," the opposite meaning that same array has for
 * SOLO/COUPLE's identity-lock angles.
 */
export function GroupForm() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const [style, setStyle] = useState('realistic');
  const [description, setDescription] = useState('');
  // One entry per person slot, each itself an array so UploadSlot's
  // existing images/onImagesChange contract can be reused as-is —
  // maxImages={1} below keeps each person to exactly one photo.
  const [people, setPeople] = useState<string[][]>([[], []]);
  const [uploading, setUploading] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const suggestions = t('createChoice.groupSuggestions', { returnObjects: true }) as string[];

  function addPerson() {
    if (people.length >= MAX_PEOPLE) return;
    setPeople([...people, []]);
  }

  function removePerson(index: number) {
    if (people.length <= MIN_PEOPLE) return;
    setPeople(people.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    if (uploading) return;
    const emptySlot = people.findIndex((p) => p.length === 0);
    if (emptySlot !== -1) {
      toast(`Add a photo for Person ${emptySlot + 1} first`);
      return;
    }
    if (!description.trim()) {
      toast(t('createChoice.needDescription'));
      return;
    }

    try {
      const profile = await api.getProfile();
      if (profile.credits < 2 && !profile.isSubscribed) {
        setPaywallVisible(true);
        return;
      }
    } catch {
      // Offline or profile fetch failed — let the backend be the source of
      // truth on the actual credit check, same as the other create forms.
    }

    setUploading(true);
    try {
      // One photo per person, uploaded in parallel, flattened in slot order
      // — that order IS the identity mapping promptGroup.ts's "Person 1/2/
      // 3/4" wording depends on, so it has to match nanoBanana.ts's
      // attached-image order exactly (same reasoning as every other
      // multi-image flow in this app).
      const photoAKeys = await Promise.all(people.map((photos) => api.uploadPhoto(photos[0])));

      const qualityIssue = await findPhotoQualityIssue(
        api,
        photoAKeys.map((key, i) => ({ key, label: `Person ${i + 1}` })),
      );
      if (qualityIssue) {
        toast(qualityIssue);
        return;
      }

      router.push({
        pathname: '/loading',
        params: {
          mode: 'group',
          style,
          description,
          templateId: '',
          photoAKeys: JSON.stringify(photoAKeys),
          photoBKeys: '',
          sourcePostId: '',
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
                <Text style={[styles.title, { color: theme.ink }]}>{t('createChoice.groupTitle')}</Text>
                <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('createChoice.groupSubtitle')}</Text>
              </View>
            </View>

            <View style={styles.peopleGrid}>
              {people.map((photos, i) => (
                <View key={i} style={styles.personSlot}>
                  <UploadSlot
                    label={i === 0 ? t('generate.you') : `Person ${i + 1}`}
                    images={photos}
                    onImagesChange={(uris) => setPeople(people.map((p, j) => (j === i ? uris : p)))}
                    maxImages={1}
                    reversed={i % 2 === 1}
                  />
                  {people.length > MIN_PEOPLE ? (
                    <Pressable onPress={() => removePerson(i)} style={styles.removePersonBtn} hitSlop={8}>
                      <Text style={[styles.removePersonText, { color: theme.inkFaint }]}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {people.length < MAX_PEOPLE ? (
                <Pressable onPress={addPerson} style={[styles.addPersonSlot, { borderColor: theme.glassBorder }]}>
                  <Icon name="plus" size={22} color={theme.inkFaint} strokeWidth={2.2} />
                  <Text style={[styles.addPersonText, { color: theme.inkFaint }]}>Add Person</Text>
                </Pressable>
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
              <Text style={[styles.label, { color: theme.ink }]}>{t('createChoice.describeAnything')}</Text>
              <GlassCard radius={20} style={styles.promptCard}>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('createChoice.groupPlaceholder')}
                  placeholderTextColor={theme.inkFaint}
                  multiline
                  style={[styles.promptInput, { color: theme.ink }]}
                />
              </GlassCard>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {suggestions.map((s) => (
                  <Chip key={s} label={s} active={s === description} onPress={() => setDescription(s)} />
                ))}
              </ScrollView>
            </View>

            <View style={styles.ctaBlock}>
              <GradientButton
                label={uploading ? t('generate.uploading') : t('createChoice.generateGroup')}
                icon={uploading ? undefined : 'sparkle'}
                onPress={handleGenerate}
                disabled={uploading}
              />
              <Text style={[styles.caption, { color: theme.inkFaint }]}>{t('createChoice.groupCreditsCaption')}</Text>
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
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  personSlot: { width: '46%', gap: 6 },
  removePersonBtn: { alignSelf: 'center' },
  removePersonText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  addPersonSlot: {
    width: '46%',
    height: 224,
    borderRadius: 24,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addPersonText: { fontFamily: fonts.bodyBold, fontSize: 13 },
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
    maxHeight: 160,
    padding: 0,
    textAlignVertical: 'top',
  },
  chipsRow: { gap: 9 },
  ctaBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  caption: { fontFamily: fonts.body, fontSize: 13 },
});
