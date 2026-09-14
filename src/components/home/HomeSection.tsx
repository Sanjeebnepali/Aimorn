import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Icon } from '@/components/primitives/icon';
import { TemplateCard } from '@/components/primitives/template-card';
import { getTemplates } from '@/data/templates';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * Generic "titled rail" section shell used by every template-catalog rail
 * on Home (Trending Fusions, Popular This Week, the "more rails" block, and
 * Trending Creations) — pulled out of (tabs)/index.tsx purely to keep that
 * file under the workspace's 350-line limit (see AGENTS.md); no behavior
 * change from when this lived inline there. `theme` is still passed in
 * (rather than calling useAppTheme() here) so the title color always
 * matches whatever theme instance the caller is already holding, instead of
 * this component re-resolving its own possibly-stale one.
 */
export function Section({
  title,
  onSeeAll,
  theme,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  theme: ReturnType<typeof useAppTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.ink }]}>{title}</Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Icon name="chevronRight" size={18} color={theme.inkSoft} strokeWidth={2} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

/** Horizontal scroll of template cards — the bundled-catalog rail content
 * that goes inside a `<Section>` (see above). Kept separate from Section
 * itself since not every Section's children are a template rail (Trending
 * Creations wraps real posts instead, with its own inline ScrollView). */
export function TemplateRail({ templates }: { templates: ReturnType<typeof getTemplates> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {templates.map((t) => (
        <TemplateCard
          key={t.id}
          label={t.label}
          colors={t.colors}
          imageUrl={t.imageUrl}
          badge={t.badge}
          onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 18 },
  rail: { gap: 14, paddingBottom: 4 },
});
