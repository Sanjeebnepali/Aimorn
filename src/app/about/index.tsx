import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon, type IconName } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Section = { icon: IconName; titleKey: string; bodyKey: string };

const SECTIONS: Section[] = [
  { icon: 'sparkle', titleKey: 'about.versionSectionTitle', bodyKey: 'about.versionSectionBody' },
  { icon: 'sparkleDouble', titleKey: 'about.aiSectionTitle', bodyKey: 'about.aiSectionBody' },
  { icon: 'wallpaper', titleKey: 'about.themeSectionTitle', bodyKey: 'about.themeSectionBody' },
  { icon: 'heart', titleKey: 'about.communitySectionTitle', bodyKey: 'about.communitySectionBody' },
  { icon: 'crown', titleKey: 'about.creditsSectionTitle', bodyKey: 'about.creditsSectionBody' },
];

/**
 * Reachable anytime from Profile's settings list — the persistent home for
 * everything the first-couple-generation disclaimer (src/app/loading.tsx)
 * only ever shows once. Built 2026-09-11 directly from the user's own ask:
 * "add on the profile side about this app all information... so it does
 * not make user in the shade and they can read information regarding this
 * later." Every section here is real, verifiable behavior of THIS build —
 * not marketing copy — matched to the actual mechanics in generations.ts
 * (credits/theme-vs-vibe), posts.ts (points/regeneration), and this
 * project's own "early version, actively improving" status.
 */
export default function AboutScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('about.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {SECTIONS.map((section) => (
            <GlassCard key={section.titleKey} radius={20} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, { backgroundColor: theme.glass }]}>
                  <Icon name={section.icon} size={17} color={theme.accent1} strokeWidth={1.8} />
                </View>
                <Text style={[styles.cardTitle, { color: theme.ink }]}>{t(section.titleKey)}</Text>
              </View>
              <Text style={[styles.cardBody, { color: theme.inkSoft }]}>{t(section.bodyKey)}</Text>
            </GlassCard>
          ))}

          {/* Apache-2.0 (MediaPipe/OpenCV) and every MIT-licensed package
           * bundled into this app require their notices be reproduced
           * somewhere reachable — this is that place, not buried in a repo
           * file only developers ever open. See licenses.tsx's own doc
           * comment for exactly which packages and why. */}
          <Pressable onPress={() => router.push('/about/licenses')}>
            <GlassCard radius={20} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, { backgroundColor: theme.glass }]}>
                  <Icon name="shield" size={17} color={theme.accent1} strokeWidth={1.8} />
                </View>
                <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('about.licensesSectionTitle')}</Text>
                <Icon name="chevronRight" size={16} color={theme.inkFaint} strokeWidth={2} />
              </View>
              <Text style={[styles.cardBody, { color: theme.inkSoft }]}>{t('about.licensesSectionBody')}</Text>
            </GlassCard>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  headerSpacer: { width: 40 },
  title: { fontFamily: fonts.display, fontSize: 19 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 50, gap: 14 },
  card: { padding: 18, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15.5, flex: 1 },
  cardBody: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20 },
});
