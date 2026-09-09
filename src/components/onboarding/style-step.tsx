import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { SegmentToggle } from '@/components/primitives/segment-toggle';
import { STYLE_OPTIONS, StyleSwatch } from '@/components/primitives/style-swatch';
import type { UsageMode } from '@/utils/api';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type StyleStepProps = {
  stylePreference: string | null;
  onChangeStyle: (key: string) => void;
  usageMode: UsageMode;
  onChangeUsageMode: (mode: UsageMode) => void;
  onContinue: () => void;
};

/**
 * Step 2: the actual "survey" — a taste question and a solo/couple
 * question. Both double as real product data (not just an engagement
 * ritual): stylePreference becomes the Generate screen's default style
 * suggestion, usageMode which onboarding branches shown in code-step.tsx.
 */
export function StyleStep({ stylePreference, onChangeStyle, usageMode, onChangeUsageMode, onContinue }: StyleStepProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <Icon name="sparkle" size={30} color={theme.accent1} />
            <Text style={[styles.headline, { color: theme.ink }]}>{t('onboarding.style.headline')}</Text>
            <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('onboarding.style.subtitle')}</Text>
          </View>

          <View style={styles.swatchGrid}>
            {STYLE_OPTIONS.map((option) => (
              <StyleSwatch
                key={option.key}
                option={option}
                active={option.key === stylePreference}
                onPress={() => onChangeStyle(option.key)}
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('onboarding.style.whoFor')}</Text>
            <SegmentToggle
              fullWidth
              value={usageMode}
              onChange={(k) => onChangeUsageMode(k as UsageMode)}
              options={[
                { key: 'SOLO', label: t('onboarding.style.justMe'), icon: 'person' },
                { key: 'COUPLE', label: t('onboarding.style.meAndPartner'), icon: 'couple' },
              ]}
            />
          </View>

          <View style={styles.footer}>
            <GradientButton label={t('onboarding.style.continue')} onPress={onContinue} disabled={!stylePreference} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // paddingBottom: same real-device bottom-edge touch-interception fix as
  // profile-step.tsx — see that file's comment, or floating-tab-bar.tsx for
  // the full story.
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 60, gap: 28 },
  brandBlock: { alignItems: 'center', gap: 10 },
  headline: { fontFamily: fonts.display, fontSize: 23 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  section: { gap: 12 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15, textAlign: 'center' },
  footer: { flex: 1, justifyContent: 'flex-end', paddingTop: 12 },
});
