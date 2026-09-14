import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { ModeCard } from '@/components/primitives/mode-card';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/** One line of the "Good to Know" card below — same {icon, text} shape for
 * all three tips so the list below can just .map() them instead of
 * hand-repeating the row markup three times. */
type Tip = { key: string; text: string };

/**
 * The Generate tab's landing screen — a fork into the app's three creation
 * paths, not a form itself. Used to render CreateForm directly with its
 * Couple/Solo toggle defaulted to 'couple' every time, which meant a
 * template-free ("General") generation was only ever reachable as an
 * undocumented side effect of never picking a template, not a real,
 * discoverable choice. Split out 2026-09-12 so General — one photo, any
 * free-text prompt, no template/reference required — is as visible as
 * Couple/Single, for viral "reimagine me as ___" trends (80s/90s decade
 * photos, Y2K flash, etc.) that would otherwise need a hand-built Template
 * card per trend.
 *
 * Couple/Single route into the exact same CreateForm as before
 * (src/app/(tabs)/generate/create.tsx), just with their subject pre-picked
 * from which card was tapped instead of always defaulting to 'couple'.
 */
export default function GenerateLandingScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();

  // Real, tested guidance — not filler copy. Added 2026-09-13 straight off
  // this session's own live findings: (1) a real generation confirmed the
  // no-template/"General" path produces higher-fidelity results than a
  // template recreation, since the model isn't also fighting to match a
  // fixed reference photo's exact pose/background; (2) the output-quality
  // gate (outputQuality.ts) catches real, confirmed model mistakes (a
  // fabricated marking, a dropped style) often enough that users should
  // know upfront a re-roll is sometimes needed, not assume the app is
  // broken; (3) multi-angle upload (upload-slot.tsx) is a real, live-tested
  // fix for "doesn't look like me," but it's opt-in and easy to miss since
  // it only appears after the first photo is already added.
  const tips: Tip[] = [
    { key: 'prompt', text: t('createChoice.tipPrompt') },
    { key: 'mistakes', text: t('createChoice.tipMistakes') },
    { key: 'angles', text: t('createChoice.tipAngles') },
  ];

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        {/* Was a plain View — fine for the original 3 cards on a tall
         * screen, but adding Group (2026-09-12) as a 4th made the content
         * taller than some screens' available height with NO way to reach
         * whatever sat under the floating tab bar, since a non-scrolling
         * View just clips instead of scrolling. Confirmed live: the Group
         * card's bottom half was genuinely untappable, covered by the tab
         * bar, with no scroll gesture able to reveal it. */}
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.ink }]}>{t('createChoice.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('createChoice.subtitle')}</Text>

          <View style={styles.row}>
            <ModeCard
              icon="couple"
              label={t('createChoice.couple')}
              description={t('createChoice.coupleDesc')}
              colors={['#a4517b', '#4a1a55']}
              onPress={() => router.push({ pathname: '/generate/create', params: { subject: 'couple' } })}
            />
            <ModeCard
              icon="personFilled"
              label={t('createChoice.single')}
              description={t('createChoice.singleDesc')}
              colors={['#204177', '#26133f']}
              onPress={() => router.push({ pathname: '/generate/create', params: { subject: 'solo' } })}
            />
          </View>

          <ModeCard
            icon="sparkleDouble"
            label={t('createChoice.general')}
            description={t('createChoice.generalDesc')}
            colors={['#ca44c3', '#2b3b81']}
            onPress={() => router.push('/generate/freeform')}
          />

          {/* Group card — commented out 2026-09-12 per the user's own call:
           * not needed for this release, revisit in an updated version.
           * The whole feature is otherwise fully built and working (group
           * chooser card, group-form.tsx, the /generate/group route,
           * server's GROUP subjectMode + promptGroup.ts, the Prisma
           * migration) — this is the ONLY line standing between it and
           * being live again, so re-enabling later is just uncommenting
           * this block, not rebuilding anything.
          <ModeCard
            icon="couple"
            label={t('createChoice.group')}
            description={t('createChoice.groupDesc')}
            colors={['#e3b831', '#db551d']}
            onPress={() => router.push('/generate/group')}
          />
          */}

          <GlassCard radius={20} style={styles.tipsCard}>
            <Text style={[styles.tipsTitle, { color: theme.ink }]}>{t('createChoice.tipsTitle')}</Text>
            {tips.map((tip) => (
              <View key={tip.key} style={styles.tipRow}>
                <Icon name="tip" size={14} color={theme.accent2} strokeWidth={2} />
                <Text style={[styles.tipRowText, { color: theme.inkSoft }]}>{tip.text}</Text>
              </View>
            ))}
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 210, gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 13.5, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 14 },
  tipsCard: { padding: 16, gap: 11, marginTop: 4 },
  tipsTitle: { fontFamily: fonts.bodyBold, fontSize: 14.5, marginBottom: 2 },
  tipRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  tipRowText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17.5 },
});
