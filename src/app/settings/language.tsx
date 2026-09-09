import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { detectDeviceLanguage } from '@/i18n';
import { getLanguageInfo, LANGUAGES } from '@/i18n/languages';
import { useLanguageStore } from '@/i18n/store';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * Profile → Settings → Language. Picks between "follow the device's own
 * language" (the default for every install — see i18n/index.ts) and any of
 * the languages this app ships a translation file for (i18n/languages.ts).
 * Selecting one persists to AsyncStorage (i18n/store.ts) and repaints the
 * whole app immediately — no restart needed, since every screen reads its
 * strings through `useTranslation()` rather than a value captured once.
 */
export default function LanguageSettingsScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const deviceLanguageInfo = getLanguageInfo(detectDeviceLanguage());

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('profile.languagePicker.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('profile.languagePicker.subtitle')}</Text>

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <LanguageRow
            label={t('profile.languagePicker.systemDefault')}
            sublabel={t('profile.languagePicker.systemDefaultSub', { language: deviceLanguageInfo.nativeName })}
            selected={language === null}
            onPress={() => setLanguage(null)}
          />
          {LANGUAGES.map((lang) => (
            <LanguageRow
              key={lang.code}
              label={lang.nativeName}
              selected={language === lang.code}
              onPress={() => setLanguage(lang.code)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

function LanguageRow({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={onPress}>
      <GlassCard
        radius={radii.lg}
        style={[styles.row, selected && { borderColor: theme.accent1 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: theme.ink }]}>{label}</Text>
          {sublabel ? <Text style={[styles.rowSublabel, { color: theme.inkFaint }]}>{sublabel}</Text> : null}
        </View>
        {selected ? <Icon name="check" size={18} color={theme.accent1} strokeWidth={2.6} /> : null}
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  title: { fontFamily: fonts.bodyExtraBold, fontSize: 18, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 24, marginTop: 8 },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSublabel: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
});
