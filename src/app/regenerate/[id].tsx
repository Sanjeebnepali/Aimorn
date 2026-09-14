import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurTargetView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { ScreenBlurTargetContext } from '@/components/primitives/blur-target';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { STYLE_OPTIONS } from '@/components/primitives/style-swatch';
import { PaneThumb } from '@/components/resultScreen/parts';
import { RegenerateProgressOverlay } from '@/components/regenerateScreen/ProgressOverlay';
import { styles } from '@/components/regenerateScreen/styles';
import { resolveCreationImage, useGalleryStore } from '@/data/gallery-store';
import { toast } from '@/lib/toast';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';

type ActivePane = 'together' | 'a' | 'b';

const EDIT_PRESETS = [
  { label: 'Red Evening Dress 👗', prompt: 'Change dress to an elegant red velvet evening dress' },
  { label: 'Fix Face Expression 😊', prompt: 'Fix facial expression to look natural with a warm gentle smile' },
  { label: 'Fancy Suit 👔', prompt: 'Change outfit to a sharp tailored luxury suit' },
  { label: 'Golden Jewelry & Aura ✨', prompt: 'Add glowing golden accessories and elegant lighting details' },
  { label: 'New Hairstyle 💇', prompt: 'Style hair neatly with natural highlights and texture' },
];

export default function RegenerateScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const localTarget = useRef<View | null>(null);

  const { id, part } = useLocalSearchParams<{ id: string; part?: ActivePane }>();
  const [activePane, setActivePane] = useState<ActivePane>(part ?? 'together');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overridePhotoUri, setOverridePhotoUri] = useState<string | null>(null);
  const [overridePhotoKey, setOverridePhotoKey] = useState<string | null>(null);

  const creations = useGalleryStore((state) => state.creations);
  const updateCreationImage = useGalleryStore((state) => state.updateCreationImage);
  const item = creations.find((c) => c.id === id);

  // UserCreationItem's real field is `mode` ('couple' | 'solo' | 'group'),
  // not `subjectMode` (that's GenerationResponse's own field, a different
  // type) — this always read `undefined` and silently hid the Together/
  // You/Partner pane switcher for every couple regeneration.
  const hasSoloPanes = item?.mode === 'couple' && (item?.roleAImage != null || item?.roleBImage != null);
  const activeSource =
    activePane === 'a' ? item?.roleAImage : activePane === 'b' ? item?.roleBImage : item?.togetherImage;
  const imageUri = activeSource ? resolveCreationImage(activeSource) : null;
  const styleOption = STYLE_OPTIONS.find((o) => o.key === item?.styleKey);
  const styleLabel = styleOption ? t(styleOption.labelKey) : item?.styleKey ?? 'Original Style';
  // Human label for whichever pane is about to be redone — fed to the
  // progress overlay below so its caption names the actual thing being
  // worked on instead of a generic "your photo."
  const activePaneLabel = activePane === 'a' ? 'You' : activePane === 'b' ? 'Partner' : 'Together';

  // BUG FIX (reported 2026-09-14): regenerating gave no ongoing feedback
  // beyond the submit button's own label swapping to "Regenerating…" — the
  // rest of the screen stayed fully interactive and visually static, which
  // read as "did my tap even register?" and led to users backing out
  // mid-request (the credit still spends server-side; leaving early just
  // means never seeing what it bought). Hardware back is blocked the same
  // way the header's own back button is guarded below, for the same
  // reason — a request already in flight can't be cancelled from here, so
  // "back" during it can only ever discard a result the user paid for.
  useEffect(() => {
    if (!isSubmitting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      toast('Please wait — your wallpaper is still regenerating.');
      return true;
    });
    return () => sub.remove();
  }, [isSubmitting]);

  async function handlePickReplacementPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert('Permission Required', 'Amora needs photo gallery access to select a replacement photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const selectedUri = result.assets[0].uri;
        setOverridePhotoUri(selectedUri);
        // uploadPhoto resolves the storage key itself (a plain string), not
        // an object wrapping one — reading `.key` off it (as this used to)
        // is `undefined` on a string, so the key was never captured and the
        // "Replace" override silently never reached the regenerate request.
        const uploadedKey = await api.uploadPhoto(selectedUri);
        setOverridePhotoKey(uploadedKey);
        showAlert('Photo Updated ✨', 'New reference photo selected for this section.');
      }
    } catch (err) {
      showAlert('Photo Selection Failed', err instanceof Error ? err.message : 'Could not upload selected photo.');
    }
  }

  async function handleRegenerateSubmit() {
    if (!item) return;
    setIsSubmitting(true);
    try {
      const overrides =
        activePane === 'a'
          ? { overridePhotoAKey: overridePhotoKey ?? undefined }
          : activePane === 'b'
          ? { overridePhotoBKey: overridePhotoKey ?? undefined }
          : overridePhotoKey
          ? { overridePhotoAKey: overridePhotoKey }
          : undefined;

      const updated = await api.regenerateGenerationPart(item.id, activePane, customPrompt, overrides);
      const field = activePane === 'together' ? 'togetherImage' : activePane === 'a' ? 'roleAImage' : 'roleBImage';
      const url =
        activePane === 'together' ? updated.outputUrl : activePane === 'a' ? updated.outputUrlA : updated.outputUrlB;

      if (url) {
        updateCreationImage(item.id, field, url);
      }

      showAlert('Wallpaper Regenerated! ✨', 'Your customized wallpaper has been successfully updated.', [
        {
          text: 'View Result',
          onPress: () => {
            router.back();
          },
        },
      ]);
    } catch (err) {
      showAlert('Regeneration Failed', err instanceof Error ? err.message : 'Something went wrong while regenerating.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function appendPreset(presetPrompt: string) {
    if (!customPrompt.trim()) {
      setCustomPrompt(presetPrompt);
    } else {
      setCustomPrompt((prev) => `${prev}. ${presetPrompt}`);
    }
  }

  return (
    <ScreenBlurTargetContext.Provider value={localTarget}>
      <BlurTargetView style={styles.fill} ref={localTarget}>
        <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fill}>
            <View style={styles.header}>
              <IconButton
                name="chevronLeft"
                // Same "don't discard an in-flight paid request" reasoning
                // as the hardwareBackPress guard above — this is the other
                // way off this screen, so it needs the same guard.
                onPress={() => {
                  if (isSubmitting) {
                    toast('Please wait — your wallpaper is still regenerating.');
                    return;
                  }
                  router.back();
                }}
                strong
              />
              <Text style={[styles.headerTitle, { color: theme.ink }]}>Regenerate & Refine</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              {/* Image Preview & Pane Selector */}
              <View style={styles.previewSection}>
                <GlassCard radius={20} strong style={styles.previewCard}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.placeholder, { backgroundColor: theme.glassStrong }]}>
                      <Icon name="sparkle" size={32} color={theme.accent1} />
                    </View>
                  )}
                  <GlassCard radius={999} strong style={styles.themeLockBadge}>
                    <Icon name="lock" size={13} color={theme.accent2} strokeWidth={2} />
                    <Text style={[styles.themeLockText, { color: theme.ink }]}>
                      Theme Locked: {styleLabel}
                    </Text>
                  </GlassCard>
                </GlassCard>

                {hasSoloPanes ? (
                  <View style={styles.paneRow}>
                    <PaneThumb
                      label="Together"
                      imageUri={item?.togetherImage ? resolveCreationImage(item.togetherImage) : undefined}
                      active={activePane === 'together'}
                      onPress={() => setActivePane('together')}
                    />
                    <PaneThumb
                      label="You"
                      imageUri={item?.roleAImage ? resolveCreationImage(item.roleAImage) : undefined}
                      active={activePane === 'a'}
                      onPress={() => setActivePane('a')}
                    />
                    <PaneThumb
                      label="Partner"
                      imageUri={item?.roleBImage ? resolveCreationImage(item.roleBImage) : undefined}
                      active={activePane === 'b'}
                      onPress={() => setActivePane('b')}
                    />
                  </View>
                ) : null}
              </View>

              {/* Locked Theme Rule Note */}
              <GlassCard radius={16} strong style={styles.ruleNoteCard}>
                <Icon name="sparkleDouble" size={16} color={theme.accent1} />
                <Text style={[styles.ruleNoteText, { color: theme.inkSoft }]}>
                  The overall <Text style={{ fontFamily: fonts.bodyBold, color: theme.accent1 }}>{styleLabel}</Text> theme is fixed. You can customize clothing/dress, facial expression, accessories, and details below.
                </Text>
              </GlassCard>

              {/* Custom Prompt Input */}
              <GlassCard radius={20} strong style={styles.inputCard}>
                <Text style={[styles.inputLabel, { color: theme.ink }]}>Custom Edit Instructions</Text>
                <TextInput
                  style={[styles.textInput, { color: theme.ink, borderColor: theme.glassBorder }]}
                  placeholder="e.g. Change dress to red silk gown, adjust smile, add subtle glowing aura..."
                  placeholderTextColor={theme.inkSoft}
                  multiline
                  numberOfLines={4}
                  value={customPrompt}
                  onChangeText={setCustomPrompt}
                />

                {/* Preset Chips */}
                <Text style={[styles.presetTitle, { color: theme.inkSoft }]}>Quick Customization Ideas:</Text>
                <View style={styles.presetContainer}>
                  {EDIT_PRESETS.map((preset, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => appendPreset(preset.prompt)}
                      style={[styles.presetChip, { backgroundColor: theme.glassStrong, borderColor: theme.glassBorder }]}
                    >
                      <Text style={[styles.presetChipText, { color: theme.ink }]}>{preset.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </GlassCard>

              {/* Section Reference Photo Update */}
              <GlassCard radius={20} strong style={styles.photoOverrideCard}>
                <View style={styles.photoOverrideHeader}>
                  <View style={styles.photoOverrideInfo}>
                    <Text style={[styles.photoOverrideTitle, { color: theme.ink }]}>Face Photo Correction</Text>
                    <Text style={[styles.photoOverrideSub, { color: theme.inkSoft }]}>
                      Had trouble with the face? Select a new photo for this section.
                    </Text>
                  </View>
                  <Pressable
                    onPress={handlePickReplacementPhoto}
                    style={[styles.photoPickBtn, { backgroundColor: theme.accent1 }]}
                  >
                    <Icon name="camera" size={16} color={theme.ink} />
                    <Text style={[styles.photoPickBtnText, { color: theme.ink }]}>Replace</Text>
                  </Pressable>
                </View>
                {overridePhotoUri && (
                  <View style={styles.overridePreviewRow}>
                    <Image source={{ uri: overridePhotoUri }} style={styles.overrideThumb} />
                    <Text style={[styles.overrideStatusText, { color: theme.accent2 }]}>✓ New reference photo attached</Text>
                  </View>
                )}
              </GlassCard>

              {/* Submit CTA */}
              <View style={styles.submitContainer}>
                <GradientButton
                  label={isSubmitting ? 'Regenerating Wallpaper…' : 'Regenerate Wallpaper ✨'}
                  icon="sparkle"
                  onPress={handleRegenerateSubmit}
                  disabled={isSubmitting}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        {/* Covers the full screen (including the safe-area edges the
         * SafeAreaView above insets around), not just the scroll content —
         * see ProgressOverlay's own doc comment for why this exists. */}
        {isSubmitting && <RegenerateProgressOverlay paneLabel={activePaneLabel} />}
      </BlurTargetView>
    </ScreenBlurTargetContext.Provider>
  );
}
