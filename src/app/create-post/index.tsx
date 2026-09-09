import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showAlert } from '@/alerts/store';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { creationLabel, resolveCreationImage, useGalleryStore } from '@/data/gallery-store';
import { extractHashtags, extractMentions, usePostsStore } from '@/posts/store';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Step = 'pick' | 'compose';

/**
 * The "+" entry point off src/app/manage-posts (and, since 2026-09-08, a
 * matching header shortcut on Home/Profile). Two real steps on purpose —
 * picking a creation used to drop you straight next to the Post button on
 * the same screen, which read as "select and it just uploads." Step 1 only
 * picks; step 2 is where title/caption/hashtags/@mentions actually get
 * written, mirroring Instagram/TikTok's own pick-then-compose flow.
 *
 * Picks from `useGalleryStore` — your own real generated wallpapers, the
 * same store the Gallery tab reads — not a static template catalog. Used to
 * pick from a hardcoded `MY_CREATIONS` list of the app's public browsable
 * templates instead (src/data/creations.ts, now deleted); per explicit
 * correction (2026-09-08), sharing was showing the same stock photos every
 * other user sees on Home/Template-browse, not anything actually yours.
 */
export default function CreatePostScreen() {
  const theme = useAppTheme();
  const addPost = usePostsStore((s) => s.addPost);
  const creations = useGalleryStore((s) => s.creations);
  const loadFromStorage = useGalleryStore((s) => s.loadFromStorage);
  const [step, setStep] = useState<Step>('pick');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');

  // This screen can be opened directly (the new header shortcuts) without
  // ever having visited the Gallery tab first, which is the only other
  // screen that currently hydrates this store from AsyncStorage — without
  // this, a device with real saved creations would still show an empty
  // picker until Gallery happened to be opened once first.
  useEffect(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  const selectedCreation = selectedId ? creations.find((c) => c.id === selectedId) : undefined;
  const hashtags = extractHashtags(caption);
  const mentions = extractMentions(caption);

  function handlePickCreation(id: string) {
    setSelectedId(id);
    setStep('compose');
  }

  function handlePost() {
    if (!selectedId) return;
    addPost({ creationId: selectedId, title: title.trim(), caption: caption.trim() });
    // Honest about what actually just happened — same voice as the rest of
    // the app's not-connected-yet features (see profile/index.tsx's
    // handleSettingsAction default case). This saves to *your* device; it
    // doesn't reach other users or earn credits until the community
    // backend in docs/ai-generation-plan.md exists.
    showAlert(
      'Posted ✨',
      'Saved to My Posts. Publishing to the wider community (and earning credits from it) isn’t connected yet — this build is a preview.',
    );
    router.replace('/manage-posts');
  }

  if (step === 'compose' && selectedCreation) {
    return (
      <GradientScreen>
        <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <IconButton name="chevronLeft" onPress={() => setStep('pick')} />
            <Text style={[styles.title, { color: theme.ink }]}>New Post</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.previewRow}>
              {resolveCreationImage(selectedCreation.togetherImage) ? (
                <Image
                  source={{ uri: resolveCreationImage(selectedCreation.togetherImage) }}
                  style={styles.previewImage}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.previewImage, { backgroundColor: theme.glass }]} />
              )}
              <Text style={[styles.previewLabel, { color: theme.inkFaint }]}>{creationLabel(selectedCreation)}</Text>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.inkFaint }]}>Title</Text>
            <GlassCard radius={16} style={styles.fieldCard}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Give it a title"
                placeholderTextColor={theme.inkFaint}
                style={[styles.titleInput, { color: theme.ink }]}
              />
            </GlassCard>

            <Text style={[styles.sectionLabel, { color: theme.inkFaint }]}>Description</Text>
            <GlassCard radius={16} style={[styles.fieldCard, styles.captionCard]}>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Write a description... add #hashtags and @mentions"
                placeholderTextColor={theme.inkFaint}
                multiline
                style={[styles.captionInput, { color: theme.ink }]}
              />
            </GlassCard>

            {hashtags.length + mentions.length > 0 ? (
              <View style={styles.tagRow}>
                {mentions.map((tag) => (
                  <View key={tag} style={[styles.tagPill, { borderColor: theme.glassBorder }]}>
                    <Text style={[styles.tagText, { color: theme.accent1 }]}>{tag}</Text>
                  </View>
                ))}
                {hashtags.map((tag) => (
                  <View key={tag} style={[styles.tagPill, { borderColor: theme.glassBorder }]}>
                    <Text style={[styles.tagText, { color: theme.accent2 }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <GradientButton label="Post" onPress={handlePost} disabled={!title.trim()} />
          </View>
        </SafeAreaView>
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>Choose a Creation</Text>
          <View style={styles.headerSpacer} />
        </View>

        {creations.length === 0 ? (
          // A real, likely-common state now that this reads your actual
          // Gallery instead of an always-populated stock list — nothing to
          // share until you've generated at least one wallpaper. Mirrors
          // manage-posts' own empty state (same icon/copy pattern) rather
          // than silently showing a blank grid.
          <View style={styles.emptyWrap}>
            <GlassCard radius={20} style={styles.emptyCard}>
              <Icon name="sparkleDouble" size={32} color={theme.inkFaint} />
              <Text style={[styles.emptyTitle, { color: theme.ink }]}>No creations yet</Text>
              <Text style={[styles.emptySubtitle, { color: theme.inkFaint }]}>
                Generate a wallpaper first, then come back here to share it.
              </Text>
              <GradientButton label="Go to Generate" onPress={() => router.push('/(tabs)/generate')} />
            </GlassCard>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pickGrid} showsVerticalScrollIndicator={false}>
            {creations.map((item) => {
              const uri = resolveCreationImage(item.togetherImage);
              return (
                <Pressable key={item.id} onPress={() => handlePickCreation(item.id)} style={styles.pickTile}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.pickImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.pickImage, { backgroundColor: theme.glass }]} />
                  )}
                  <View style={styles.pickChevron}>
                    <Icon name="chevronRight" size={14} color={theme.ink} strokeWidth={2.2} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  headerSpacer: { width: 40 },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 19, textAlign: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, gap: 12 },
  previewRow: { alignItems: 'center', gap: 10, marginBottom: 8 },
  previewImage: { width: 120, height: 120, borderRadius: radii.lg },
  previewLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 14, marginTop: 8 },
  fieldCard: { padding: 14 },
  titleInput: { fontFamily: fonts.body, fontSize: 14 },
  captionCard: { minHeight: 100 },
  captionInput: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1 },
  tagText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
  // paddingBottom: real-device bottom-edge touch-interception fix — see
  // src/components/navigation/floating-tab-bar.tsx for the full story
  // (confirmed live, 2026-09-07: a CTA this close to the physical bottom
  // edge can sit inside a system gesture-navigation overlay's touch zone).
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 50 },
  pickGrid: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  pickTile: { width: 100, height: 100, borderRadius: radii.lg, overflow: 'hidden' },
  pickImage: { width: '100%', height: '100%' },
  pickChevron: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Matches manage-posts' own empty state — same icon/copy pattern, kept in
  // sync deliberately since both screens can now genuinely be empty.
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
});
