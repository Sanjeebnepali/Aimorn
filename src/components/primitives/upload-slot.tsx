import { Image as RNImage, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { toast } from '@/lib/toast';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { pickImageSafely } from '@/utils/native-media';

// Below this on the shorter side, upscaling artifacts alone tend to hurt
// identity fidelity more than anything a prompt fix can compensate for —
// checked instantly, client-side, the moment a photo is picked (no network
// round-trip needed, unlike the server's blur/face-quality gate in
// photoQualityCheck.ts, which needs the actual pixels analyzed). Real
// complaint this answers, alongside that gate: bad reference photos
// silently producing unrecognizable output.
const MIN_DIMENSION = 400;

/** RN core Image's `getSize` (expo-image's Image component doesn't expose
 * an equivalent static) wrapped as a Promise<boolean> — resolves true when
 * the photo is large enough to use, and also true (fails OPEN, same
 * philosophy as the server-side gate) if its size can't be determined at
 * all, rather than blocking a real user over a measurement hiccup. */
function isHighEnoughResolution(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve(Math.min(width, height) >= MIN_DIMENSION),
      () => resolve(true),
    );
  });
}

type UploadSlotProps = {
  label: string;
  reversed?: boolean; // flips the plus-button gradient direction (You vs Partner)
  onPress?: () => void;
  /**
   * All of this person's uploaded photos — index 0 is the main preview,
   * anything past it is an extra reference angle. Changed 2026-09-12 from
   * a single `imageUri` to an array: a real reported complaint
   * ("unrecognizable output... completely different from original") plus
   * outside research (Google's own Nano Banana Pro guidance documents
   * multi-reference identity locking — up to 14 images, 6 at high fidelity
   * — as measurably better than one photo) both point at the same fix:
   * let people attach a couple more angles of themselves, not just one.
   * See server's promptBuilder.ts PromptInput.photoACount for how the
   * prompt text tells the model these are the SAME person.
   */
  images: string[];
  onImagesChange: (uris: string[]) => void;
  /** Extra angles beyond the first are capped here — matches the server's
   * own createSchema cap (generations.ts) so a client-side add never
   * produces a request the server would reject anyway. 3 total (1 main +
   * 2 extra) is past where most people have more distinct angles handy on
   * their phone, well short of the model's real ceiling. */
  maxImages?: number;
};

export function UploadSlot({ label, reversed, onPress, images, onImagesChange, maxImages = 3 }: UploadSlotProps) {
  const theme = useAppTheme();
  const mainUri = images[0] ?? null;
  const extraUris = images.slice(1);

  const gradient = reversed ? [theme.accent2, theme.accent1] : [theme.accent1, theme.accent2];

  async function addImage() {
    if (onPress) {
      onPress();
    }

    // freeformCrop: this is a reference photo for AI generation, not a
    // fixed-shape avatar — the user needs to be able to crop in a full-body
    // shot (tall) or a close portrait (square-ish) as THEY choose, not the
    // app's old hardcoded 3:4. See pickImageSafely's own doc comment for
    // the real complaint this answers and the platform verification behind
    // it.
    const pickedUri = await pickImageSafely({ freeformCrop: true });
    if (!pickedUri) return;

    if (!(await isHighEnoughResolution(pickedUri))) {
      toast('This photo is too low-resolution — pick a clearer one for a better match.');
      return;
    }

    onImagesChange([...images, pickedUri]);
  }

  function removeImage(index: number) {
    onImagesChange(images.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.flex}>
      <Pressable onPress={mainUri ? undefined : addImage} style={styles.flex}>
        <GlassCard
          radius={radii.xxl}
          style={[
            styles.slot,
            {
              borderColor: mainUri ? theme.accent1 : theme.glassBorder,
              borderStyle: mainUri ? 'solid' : 'dashed',
              borderWidth: mainUri ? 2 : 1.5,
            },
          ]}>
          {mainUri ? (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: mainUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />

              <View style={styles.previewFooter}>
                <View style={styles.labelChip}>
                  <Text style={[styles.previewLabel, { color: '#FFFFFF' }]}>{label}</Text>
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    removeImage(0);
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

      {/* Extra reference angles — only offered once a main photo exists,
       * since "another angle of the same person" presupposes a first one.
       * Hidden entirely (not disabled-but-visible) before that, since an
       * empty angle row next to an empty main slot would just read as a
       * second, confusing upload target. */}
      {mainUri ? (
        <>
          <Text style={[styles.angleHint, { color: theme.inkFaint }]}>+ angles = better match</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.angleRow}>
            {extraUris.map((uri, i) => (
              <View key={uri} style={styles.angleThumbWrap}>
                <Image source={{ uri }} style={styles.angleThumb} contentFit="cover" />
                <Pressable onPress={() => removeImage(i + 1)} style={styles.angleRemove}>
                  <Icon name="close" size={9} color="#FFFFFF" strokeWidth={3} />
                </Pressable>
              </View>
            ))}
            {images.length < maxImages ? (
              <Pressable onPress={addImage} style={[styles.angleThumb, styles.angleAdd, { borderColor: theme.glassBorder }]}>
                <Icon name="plus" size={16} color={theme.inkFaint} strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </ScrollView>
        </>
      ) : null}
    </View>
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
  angleHint: { fontFamily: fonts.body, fontSize: 10.5, marginTop: 6 },
  angleRow: { gap: 8, paddingTop: 6 },
  angleThumbWrap: { position: 'relative' },
  angleThumb: { width: 40, height: 40, borderRadius: 9 },
  angleAdd: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  angleRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 60, 60, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
