import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type TemplateCardProps = {
  width?: number;
  height?: number;
  colors: readonly [string, string];
  /** Real photo (see src/data/templates.ts). Falls back to the gradient alone when absent. */
  imageUrl?: string;
  label: string;
  sublabel?: string;
  creditHandle?: string;
  badge?: 'crown' | 'heartFilled' | 'heartOutline';
  onBadgePress?: () => void;
  /** Shows the circular "+" recreate button bottom-right (the Template-browse screen's affordance). */
  onRecreate?: () => void;
  onPress?: () => void;
};

/** The photo card reused across Home's rails, Gallery's grid, and the Template browser —
 * a real photo when one is set, gradient-only fallback otherwise (e.g. the illustrated
 * "Cartoon Us" template, which a real photo wouldn't suit). */
export function TemplateCard({
  width = 128,
  height = 172,
  colors,
  imageUrl,
  label,
  sublabel,
  creditHandle,
  badge,
  onBadgePress,
  onRecreate,
  onPress,
}: TemplateCardProps) {
  const theme = useAppTheme();

  return (
    <Pressable onPress={onPress} style={{ width, height }}>
      <View style={[styles.card, { width, height, borderColor: theme.glassBorder }]}>
        <LinearGradient colors={colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : null}
        <LinearGradient
          colors={['rgba(26,10,20,0.75)', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0.45 }}
          style={StyleSheet.absoluteFill}
        />

        {creditHandle ? (
          <GlassCard radius={radii.pill} disableBlur style={styles.creditPill}>
            <Text style={[styles.creditText, { color: theme.inkSoft }]}>{creditHandle}</Text>
          </GlassCard>
        ) : null}

        {badge ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onBadgePress?.();
            }}
            hitSlop={12}
            style={styles.badgeWrap}
          >
            <GlassCard radius={13} disableBlur style={styles.badge}>
              <Icon
                name={badge === 'crown' ? 'crown' : badge === 'heartFilled' ? 'heart' : 'heartOutline'}
                size={11}
                color={badge === 'heartOutline' ? theme.inkSoft : theme.accent1}
                strokeWidth={2}
              />
            </GlassCard>
          </Pressable>
        ) : null}

        <View style={styles.labelBlock}>
          <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
          {sublabel ? <Text style={[styles.sublabel, { color: theme.inkFaint }]}>{sublabel}</Text> : null}
        </View>

        {onRecreate ? (
          <Pressable
            onPress={(e) => {
              // Same reasoning as the badge button above: without this, tapping
              // the small recreate button also fires the card's own onPress
              // (now the template detail screen), navigating to both at once.
              e.stopPropagation();
              onRecreate();
            }}
            style={styles.recreateWrap}
            hitSlop={8}>
            <LinearGradient colors={[theme.accent1, theme.accent2]} style={styles.recreateButton}>
              <Icon name="plus" size={14} color={theme.ink} strokeWidth={2.4} />
            </LinearGradient>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1, position: 'relative' },
  creditPill: { position: 'absolute', top: 9, left: 9, paddingHorizontal: 9, paddingVertical: 4 },
  creditText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  badgeWrap: { position: 'absolute', top: 8, right: 8, zIndex: 10 },
  badge: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  labelBlock: { position: 'absolute', left: 12, bottom: 11 },
  label: { fontFamily: fonts.bodyBold, fontSize: 13 },
  sublabel: { fontFamily: fonts.bodyMedium, fontSize: 11.5, marginTop: 1 },
  recreateWrap: { position: 'absolute', right: 10, bottom: 10 },
  recreateButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
