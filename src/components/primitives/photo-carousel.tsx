import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export type CarouselItemData = {
  id?: string;
  label?: string;
  imageUrl?: string;
  badge?: string;
};

type PhotoCarouselProps = {
  /** Array of items with photo URLs, titles, and IDs */
  items?: CarouselItemData[];
  /** Legacy array of image strings for backward compatibility */
  images?: string[];
  /** Overall container height */
  height?: number;
  /** Card width for unfocused cards */
  itemWidth?: number;
  /** Card height for unfocused cards */
  itemHeight?: number;
  /** Auto-scroll advance interval in ms */
  autoPlayInterval?: number;
  /** Optional callback when a photo/template is selected */
  onSelectImage?: (index: number, idOrUri: string) => void;
};

/**
 * Premium Circular 3D Coverflow Carousel matching the reference design.
 * Features:
 * - Continuous circular ring rotation (cards exit left and re-enter right seamlessly)
 * - Clean poster cover view (no center icon overlay, clean image display)
 * - Custom title pill at the bottom of each card
 * - Surrounding side covers stepped down with 3D depth tilt & dark scrim
 * - Bottom Pagination Bar with animated active pill & slide dots
 */
export function PhotoCarousel({
  items,
  images,
  height = 285,
  itemWidth = 165,
  itemHeight = 215,
  autoPlayInterval = 2800,
  onSelectImage,
}: PhotoCarouselProps) {
  const theme = useAppTheme();

  // Normalize data array from either items or legacy images
  const carouselItems: CarouselItemData[] = (items && items.length > 0)
    ? items
    : (images || []).map((url, i) => ({
        id: `img-${i}`,
        label: `Template ${i + 1}`,
        imageUrl: url,
      }));

  const total = carouselItems.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const isInteracting = useRef(false);

  // Shared values for smooth gesture & transition tracking
  const activeIndexAnim = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  const touchStartX = useRef(0);

  // Sync state to shared value smoothly
  useEffect(() => {
    activeIndexAnim.value = withSpring(activeIndex, {
      damping: 22,
      stiffness: 130,
    });
  }, [activeIndex, activeIndexAnim]);

  // Auto-scroll timer — continuously advances circularly
  useEffect(() => {
    if (total <= 1) return;
    const interval = setInterval(() => {
      if (!isInteracting.current) {
        setActiveIndex((prev) => prev + 1);
      }
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [total, autoPlayInterval]);

  // Touch gesture handlers
  const handleTouchStart = (e: GestureResponderEvent) => {
    isInteracting.current = true;
    touchStartX.current = e.nativeEvent.pageX;
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    const deltaX = e.nativeEvent.pageX - touchStartX.current;
    dragOffset.value = deltaX / (itemWidth * 0.8);
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    const deltaX = e.nativeEvent.pageX - touchStartX.current;
    const swipeThreshold = 35;

    if (deltaX < -swipeThreshold) {
      setActiveIndex((prev) => prev + 1);
    } else if (deltaX > swipeThreshold) {
      setActiveIndex((prev) => prev - 1);
    }

    dragOffset.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
    setTimeout(() => {
      isInteracting.current = false;
    }, 400);
  };

  if (total === 0) return null;

  const activeDotIndex = ((activeIndex % total) + total) % total;

  return (
    <View style={[styles.viewport, { height }]}>
      <View
        style={styles.carouselContainer}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        {carouselItems.map((item, index) => (
          <CoverflowCard
            key={item.id || `card-${index}`}
            item={item}
            index={index}
            total={total}
            activeIndexAnim={activeIndexAnim}
            dragOffset={dragOffset}
            itemWidth={itemWidth}
            itemHeight={itemHeight}
            onSelect={() => {
              // Find closest continuous index matching this card
              const currentMod = activeIndex % total;
              const targetIndex = activeIndex + (index - currentMod);
              setActiveIndex(targetIndex);
              onSelectImage?.(index, item.id || item.imageUrl || '');
            }}
          />
        ))}
      </View>

      {/* Bottom Pagination Bar */}
      <View style={styles.paginationRow}>
        {carouselItems.map((_, i) => {
          const isActive = i === activeDotIndex;
          return (
            <Pressable
              key={`dot-${i}`}
              onPress={() => {
                const currentMod = ((activeIndex % total) + total) % total;
                setActiveIndex(activeIndex + (i - currentMod));
              }}
              hitSlop={8}
              style={[
                styles.dot,
                isActive ? [styles.dotActive, { backgroundColor: theme.accent1 }] : styles.dotInactive,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

type CoverflowCardProps = {
  item: CarouselItemData;
  index: number;
  total: number;
  activeIndexAnim: SharedValue<number>;
  dragOffset: SharedValue<number>;
  itemWidth: number;
  itemHeight: number;
  onSelect: () => void;
};

function CoverflowCard({
  item,
  index,
  total,
  activeIndexAnim,
  dragOffset,
  itemWidth,
  itemHeight,
  onSelect,
}: CoverflowCardProps) {
  const theme = useAppTheme();

  const cardStyle = useAnimatedStyle(() => {
    // Continuous circular index calculation
    const rawDiff = index - (activeIndexAnim.value - dragOffset.value);
    let diff = ((rawDiff + total / 2) % total + total) % total - total / 2;

    const absDiff = Math.abs(diff);

    // Center item: Scale 1.15x, front zIndex, flat
    // Neighbor items: Scale 0.85x, 22deg tilt
    // Outer items: Scale 0.65x, 36deg tilt
    const scale = Math.max(0.62, 1.15 - absDiff * 0.3);
    const translateX = diff * (itemWidth * 0.7);
    const rotateY = Math.sign(diff) * Math.min(absDiff * 22, 36);
    const opacity = Math.max(0.18, 1.0 - absDiff * 0.42);
    const zIndex = Math.round(100 - absDiff * 30);
    const isCenter = absDiff < 0.4;

    return {
      transform: [
        { perspective: 1000 },
        { translateX },
        { rotateY: `${rotateY}deg` },
        { scale },
      ],
      opacity,
      zIndex,
      shadowColor: isCenter ? theme.accent1 : '#000000',
      shadowOpacity: isCenter ? 0.85 : 0.25,
      shadowRadius: isCenter ? 18 : 6,
      shadowOffset: { width: 0, height: isCenter ? 8 : 4 },
      elevation: isCenter ? 16 : 4,
    };
  });

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        { width: itemWidth, height: itemHeight },
        cardStyle,
      ]}
    >
      <Pressable style={styles.cardPressable} onPress={onSelect}>
        <Image
          source={{ uri: item.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="disk"
        />

        {/* Top glossy glass gradient overlay */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255, 255, 255, 0.26)', 'rgba(255, 255, 255, 0.03)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Dark bottom gradient scrim for title readability */}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(10, 4, 12, 0.72)', 'rgba(8, 2, 10, 0.95)']}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Bottom Title Pill */}
        {item.label ? (
          <View style={styles.titlePillContainer}>
            <View style={styles.titlePill}>
              <Text style={styles.titlePillText} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Outer glass border */}
        <View style={styles.cardBorder} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  carouselContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    position: 'absolute',
    borderRadius: 18,
  },
  cardPressable: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#120b18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    pointerEvents: 'none',
  },
  titlePillContainer: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  titlePill: {
    backgroundColor: 'rgba(18, 10, 24, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '94%',
  },
  titlePillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: '#ffffff',
    textAlign: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
  },
  dot: {
    height: 6,
  },
  dotActive: {
    width: 24,
    borderRadius: 3,
  },
  dotInactive: {
    width: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});





