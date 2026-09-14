import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * Real attribution for every open-source package actually SHIPPED in this
 * app binary — added 2026-09-13 alongside a full dependency-license audit
 * (every license below was read from that package's own installed
 * package.json/LICENSE file, not assumed). Scoped to `dependencies` only,
 * not `devDependencies` — build-time-only tools (eslint, jest, TypeScript
 * itself, etc.) never ship in the compiled app and don't carry the same
 * distribution-triggered attribution obligation the packages actually
 * bundled into the binary do.
 *
 * Deliberately does NOT re-list every server-side Node/Python package
 * (Express, Prisma, MediaPipe, OpenCV, etc.) — those run only on Amora's own
 * backend and are never distributed to a user's device, so the same
 * attribution trigger doesn't apply the way it does for what's actually
 * bundled into the app. They're still real, and still worth being upfront
 * about, which is what the "AI & Backend Technology" section below is for —
 * a courtesy disclosure, not a legal requirement, same spirit as the rest of
 * this screen.
 *
 * The full per-package list (repo-level, including server + Python) lives in
 * NOTICE.md at the repo root — this screen is the user-facing subset of it.
 */
const MIT_PACKAGES = [
  '@clerk/expo', '@expo/ui', '@expo/vector-icons', '@react-native-async-storage/async-storage',
  'expo', 'expo-asset', 'expo-auth-session', 'expo-blur', 'expo-clipboard', 'expo-constants',
  'expo-crypto', 'expo-device', 'expo-font', 'expo-glass-effect', 'expo-image', 'expo-image-picker',
  'expo-intent-launcher', 'expo-linear-gradient', 'expo-linking', 'expo-localization', 'expo-location',
  'expo-media-library', 'expo-router', 'expo-secure-store', 'expo-sharing', 'expo-splash-screen',
  'expo-status-bar', 'expo-symbols', 'expo-task-manager', 'expo-web-browser', 'i18next', 'react',
  'react-dom', 'react-i18next', 'react-native', 'react-native-gesture-handler', 'react-native-reanimated',
  'react-native-safe-area-context', 'react-native-screens', 'react-native-svg', 'react-native-view-shot',
  'react-native-web', 'react-native-worklets', 'zustand',
].sort();

const MIT_LICENSE_TEXT =
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.';

export default function LicensesScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('about.licensesTitle')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: theme.inkSoft }]}>{t('about.licensesIntro')}</Text>

          <GlassCard radius={20} style={styles.card}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('about.licensesMitTitle')}</Text>
            <Text style={[styles.packageList, { color: theme.inkSoft }]}>{MIT_PACKAGES.join('  ·  ')}</Text>
            <Text style={[styles.licenseText, { color: theme.inkFaint }]}>{MIT_LICENSE_TEXT}</Text>
          </GlassCard>

          <GlassCard radius={20} style={styles.card}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('about.licensesFontsTitle')}</Text>
            <Text style={[styles.packageList, { color: theme.inkSoft }]}>Manrope, Playfair Display</Text>
            <Text style={[styles.licenseText, { color: theme.inkFaint }]}>{t('about.licensesFontsBody')}</Text>
          </GlassCard>

          <GlassCard radius={20} style={styles.card}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('about.licensesAiTitle')}</Text>
            <Text style={[styles.licenseText, { color: theme.inkFaint }]}>{t('about.licensesAiBody')}</Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  headerSpacer: { width: 40 },
  title: { fontFamily: fonts.display, fontSize: 18 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 50, gap: 14 },
  intro: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  card: { padding: 18, gap: 10 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  packageList: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19 },
  licenseText: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 17 },
});
