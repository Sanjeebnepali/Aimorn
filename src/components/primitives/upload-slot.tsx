import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { pickImageSafely } from '@/utils/native-media';

type UploadSlotProps = {
  label: string;
  reversed?: boolean; // flips the plus-button gradient direction (You vs Partner)
  onPress?: () => void;
  imageUri?: string | null;
  onImageChange?: (uri: string | null) => void;
};

export function UploadSlot({ label, reversed, onPress, imageUri: externalUri, onImageChange }: UploadSlotProps) {
  const theme = useAppTheme();
  const [internalUri, setInternalUri] = useState<string | null>(null);
  const currentUri = externalUri !== undefined ? externalUri : internalUri;

  const gradient = reversed ? [theme.accent2, theme.accent1] : [theme.accent1, theme.accent2];

  async function handlePickImage() {
    if (onPress) {
      onPress();
    }

    const pickedUri = await pickImageSafely();
    if (pickedUri) {
      if (onImageChange) {
        onImageChange(pickedUri);
      } else {
        setInternalUri(pickedUri);
      }
    }
  }

  function handleRemoveImage() {
    if (onImageChange) {
      onImageChange(null);
    } else {
      setInternalUri(null);
    }
  }

  return (
    <Pressable onPress={handlePickImage} style={styles.flex}>
      <GlassCard
        radius={radii.xxl}
        style={[
          styles.slot,
          {
            borderColor: currentUri ? theme.accent1 : theme.glassBorder,
            borderStyle: currentUri ? 'solid' : 'dashed',
            borderWidth: currentUri ? 2 : 1.5,
          },
        ]}>
        {currentUri ? (
          <View style={StyleSheet.absoluteFill}>
            <Image source={{ uri: currentUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
            
            <View style={styles.previewFooter}>
              <View style={styles.labelChip}>
                <Text style={[styles.previewLabel, { color: '#FFFFFF' }]}>{label}</Text>
              </View>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  handleRemoveImage();
                }}
                style={styles.removeCircle}>
                <Icon name="close" size={12} color="#FFFFFF" strokeWidth={2.6} />
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <LinearGradient colors={gradient as [string, string]} style={styles.plusCircle}>
              <Icon name="plus" size={21} color={theme.ink} strokeWidth={2.4} />
            </LinearGradient>
            <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
            <Text style={[styles.hint, { color: theme.inkFaint }]}>Tap to upload</Text>
          </>
        )}
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  slot: {
    height: 224,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    position: 'relative',
  },
  plusCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.bodyBold, fontSize: 14.5 },
  hint: { fontFamily: fonts.body, fontSize: 13 },
  previewFooter: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelChip: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  previewLabel: { fontFamily: fonts.bodyBold, fontSize: 13.5 },
  removeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 60, 60, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
