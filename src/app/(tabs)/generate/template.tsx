import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/primitives/chip';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { IconButton } from '@/components/primitives/icon-button';
import { TemplateCard } from '@/components/primitives/template-card';
import { BROWSE_IDS, getTemplates, type TemplateCategory } from '@/data/templates';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const TEMPLATES = getTemplates(BROWSE_IDS);
const CATEGORIES = ['All', 'Sunset', 'Neon', 'Cartoon', 'Festival'];

export default function TemplateScreen() {
  const theme = useAppTheme();
  const [category, setCategory] = useState(CATEGORIES[0]);
  // Chip labels here already match `TemplateCategory` values 1:1 (just
  // capitalized) except 'All', so a plain lowercase compare is enough — no
  // need for the label/value tuple Home's row uses, since Home has to
  // support labels ('Rain') that don't share a spelling with their value.
  // Previously `category` was tracked but never read again anywhere below —
  // every chip tap just repainted its own active state with zero effect on
  // which of the BROWSE_IDS templates actually showed.
  const visibleTemplates =
    category === 'All' ? TEMPLATES : TEMPLATES.filter((t) => t.category === (category.toLowerCase() as TemplateCategory));

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <IconButton name="chevronLeft" onPress={() => router.back()} />
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.ink }]}>Choose a Template</Text>
              <Text style={[styles.subtitle, { color: theme.inkFaint }]}>
                Recreate a community scene with your photos
              </Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={c === category} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>

          {visibleTemplates.length ? (
            <View style={styles.grid}>
              {visibleTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  width={168}
                  height={196}
                  label={t.label}
                  colors={t.colors}
                  imageUrl={t.imageUrl}
                  creditHandle={t.handle}
                  onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}
                  onRecreate={() => router.push({ pathname: '/generate/from-template/[id]', params: { id: t.id } })}
                />
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: theme.inkFaint }]}>
              No templates in this category yet — try another one.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 150, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 21 },
  subtitle: { fontFamily: fonts.body, fontSize: 14 },
  chipsRow: { gap: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  emptyText: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingVertical: 40 },
});
