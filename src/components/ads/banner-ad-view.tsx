import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from '../primitives/icon';
import { fonts } from '../../theme/tokens';
import { useAppTheme } from '../../theme/use-app-theme';

type BannerAdProps = {
  style?: object;
  testMode?: boolean;
  onPressCta?: () => void;
};

/**
 * Aesthetic, non-intrusive Ad Banner component.
 * Integrates natively into Amora's visual design system.
 */
export function BannerAdView({ style, onPressCta }: BannerAdProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: theme.glassBorder }, style]}>
      <View style={styles.badge}>
        <Text style={[styles.badgeText, { color: theme.inkFaint }]}>ADVERTISEMENT</Text>
      </View>
      
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: 'rgba(235, 94, 85, 0.15)' }]}>
          <Icon name="sparkle" size={16} color={theme.accent1} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
            Amora Pro • 20 AI Wallpapers for $3.99
          </Text>
          <Text style={[styles.subtitle, { color: theme.inkFaint }]} numberOfLines={1}>
            No ads, fast AI queue & 4K wallpaper exports.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: theme.accent1 }]}
          activeOpacity={0.8}
          onPress={onPressCta}
        >
          <Text style={styles.ctaText}>Get Credits</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    overflow: 'hidden',
  },
  badge: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  badgeText: {
    fontSize: 9,
    fontFamily: fonts.bodyBold,
    letterSpacing: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: fonts.bodyBold,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: fonts.body,
    marginTop: 1,
  },
  ctaButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  ctaText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: fonts.bodyBold,
  },
});
