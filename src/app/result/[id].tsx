import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurTargetView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { type ViewShotRef } from 'react-native-view-shot';

import { showAlert } from '@/alerts/store';
import { ScreenBlurTargetContext } from '@/components/primitives/blur-target';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { STYLE_OPTIONS } from '@/components/primitives/style-swatch';
import { ActionButton, PaneThumb, WallpaperBackground } from '@/components/resultScreen/parts';
import { RegenerateProgressOverlay } from '@/components/regenerateScreen/ProgressOverlay';
import { styles } from '@/components/resultScreen/styles';
import { useQuickRegenerate } from '@/components/resultScreen/useQuickRegenerate';
import { refreshCoupleState } from '@/couple/bootstrap';
import { useCoupleStore } from '@/couple/store';
import { resolveCreationImage, useGalleryStore } from '@/data/gallery-store';
import { toast } from '@/lib/toast';
import { resultBackgrounds } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';
import { saveImageToGallery, setDeviceWallpaper, shareImage } from '@/utils/native-media';

/** Which of a couple session's 3 images is currently shown full-bleed. */
type ActivePane = 'together' | 'a' | 'b';

/** Which of the panel's async actions (if any) is currently in flight —
 * drives both the disabled/dimmed state and the button copy below. */
type BusyAction = 'save' | 'share' | 'wallpaper' | 'couplePack' | 'delete' | 'regenerate' | null;

export default function ResultScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const hasPartner = useCoupleStore((s) => s.hasPartner);
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const isSolo = mode === 'solo';
  const bg = isSolo ? resultBackgrounds.solo : resultBackgrounds.couple;
  const localTarget = useRef<View | null>(null);
  const wallpaperShotRef = useRef<ViewShotRef>(null);

  const creations = useGalleryStore((state) => state.creations);
  const deleteCreation = useGalleryStore((state) => state.deleteCreation);
  const updateCreationImage = useGalleryStore((state) => state.updateCreationImage);
  const item = creations.find((c) => c.id === id);
  // A couple session produces 3 images (together + solo "You" + solo
  // "Partner", see server/src/routes/generations.ts) — this switcher is
  // the only place in the app that shows all 3, since the together shot is
  // what's used everywhere else (Gallery card, dashboard). Only meaningful
  // when there's actually a second/third image to switch to.
  const hasSoloPanes = !isSolo && (item?.roleAImage != null || item?.roleBImage != null);
  const [activePane, setActivePane] = useState<ActivePane>('together');
  const activeSource =
    activePane === 'a' ? item?.roleAImage : activePane === 'b' ? item?.roleBImage : item?.togetherImage;
  const aiImageUri = activeSource ? resolveCreationImage(activeSource) : null;

  const [showControls, setShowControls] = useState(true);
  const styleOption = STYLE_OPTIONS.find((o) => o.key === item?.styleKey);

  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  async function captureWallpaper(): Promise<string> {
    // Guards Download/Share/Set Wallpaper against a real bug confirmed live
    // 2026-09-10: when `item` isn't in the local gallery store yet (e.g. this
    // screen reached before the creation synced, or the store was cleared),
    // `aiImageUri` is null and the ViewShot below renders the decorative
    // "no image" placeholder scene (gradient + glow + silhouette) instead of
    // the photo. Without this check, ViewShot happily captures that
    // placeholder and every action below reports success — the user's real
    // device wallpaper/saved file/share sheet silently gets a plain gradient
    // instead of their actual couple photo. Same check `handleUseAsCouplePack`
    // already had via its own `!item` guard, now applied to this shared path.
    if (!aiImageUri) throw new Error('This photo hasn’t finished loading yet — try again in a moment.');
    const uri = await wallpaperShotRef.current?.capture();
    if (!uri) throw new Error('Could not capture the wallpaper image.');
    return uri;
  }

  async function handleDownload() {
    if (busyAction) return; // one in-flight action at a time — no overlapping captures
    setBusyAction('save');
    try {
      const uri = await captureWallpaper();
      const saved = await saveImageToGallery(uri);
      if (saved) showAlert('Saved ✨', 'Wallpaper has been saved to your gallery.');
    } catch (err) {
      showAlert('Save Failed', err instanceof Error ? err.message : 'Something went wrong while saving.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleShare() {
    if (busyAction) return;
    setBusyAction('share');
    try {
      const uri = await captureWallpaper();
      await shareImage(uri);
    } catch (err) {
      showAlert('Share Failed', err instanceof Error ? err.message : 'Something went wrong while sharing.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSetWallpaper() {
    if (busyAction) return;
    setBusyAction('wallpaper');
    try {
      const uri = await captureWallpaper();
      await setDeviceWallpaper(uri, 'both');
      showAlert('Wallpaper Set 📱', 'Your home and lock screen have been updated.');
    } catch (err) {
      showAlert('Couldn’t Set Wallpaper', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyAction(null);
    }
  }

  // Calls the real server delete FIRST, then updates the local Gallery
  // cache only on success — added 2026-09-11, fixing a real bug: this used
  // to only ever call gallery-store.ts's local `deleteCreation`, which
  // removed the item from AsyncStorage but never told the server anything.
  // The very next time Gallery re-focused (or the app relaunched), its
  // useFocusEffect re-fetched `GET /generations` and rebuilt the whole list
  // from the server — which still had the "deleted" row — bringing the
  // image right back. Same fix, same pattern as manage-posts/index.tsx's
  // confirmDelete (server call awaited before touching local state, error
  // surfaced instead of silently succeeding either way).
  function handleDelete() {
    if (busyAction || !item) return;
    showAlert('Delete this creation?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyAction('delete');
          try {
            await api.deleteGeneration(item.id);
            deleteCreation(item.id);
            // Best-effort — if this generation was the couple's active
            // custom pack, the server just cleared that reference (see
            // generations.ts's DELETE /generations/:id doc comment); this
            // re-syncs the local couple store so the proximity wallpaper
            // feature stops offering/re-applying a now-deleted image on
            // THIS device immediately, rather than waiting for whatever
            // poll/focus event would have picked it up next. A user with no
            // partner linked just gets back the same "no couple" state it
            // already had, so this is always safe to call.
            void refreshCoupleState();
            router.replace('/(tabs)/gallery');
          } catch (err) {
            showAlert('Couldn’t Delete', err instanceof Error ? err.message : 'Something went wrong.');
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  }

  // Makes this generation the couple's shared proximity wallpaper (Couple
  // tab — matching photo when close, each person's own solo half when
  // apart). Not gated on hasSoloPanes/local image checks — those can be
  // stale placeholders on an old, pre-pipeline creation (see gallery-
  // store.ts's addCreation fallback). The server is the real source of
  // truth here: it re-validates ownership + COMPLETE + COUPLE-mode against
  // the actual Generation row and 404s with a clear message if this one
  // doesn't qualify, rather than this screen guessing.
  async function handleUseAsCouplePack() {
    if (busyAction || !item) return;
    setBusyAction('couplePack');
    try {
      await api.setCoupleSettings({ generationId: item.id });
      await refreshCoupleState();
      showAlert('Couple Pack Set 💞', 'This is now your shared wallpaper for the Couple tab.');
    } catch (err) {
      showAlert('Couldn’t Set Couple Pack', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyAction(null);
    }
  }

  const handleRegenerate = useQuickRegenerate({ item, activePane, busyAction, setBusyAction, updateCreationImage });
  const activePaneLabel = activePane === 'a' ? 'You' : activePane === 'b' ? 'Partner' : 'Together';

  // Same "don't let the user wander off a paid, in-flight request that
  // can't be cancelled from here" fix as regenerate/[id].tsx's own copy —
  // this screen's "Quick Redo" action button hits the exact same server
  // route and had the exact same silent-feeling wait, just without ever
  // navigating to that other screen at all.
  const isRegenerating = busyAction === 'regenerate';
  useEffect(() => {
    if (!isRegenerating) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      toast('Please wait — your wallpaper is still regenerating.');
      return true;
    });
    return () => sub.remove();
  }, [isRegenerating]);

  return (
    <ScreenBlurTargetContext.Provider value={localTarget}>
      <BlurTargetView style={styles.fill} ref={localTarget}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowControls((v) => !v)}>
          <WallpaperBackground shotRef={wallpaperShotRef} bg={bg} isSolo={isSolo} isGroup={mode === 'group'} aiImageUri={aiImageUri} />
        </Pressable>

        <SafeAreaView style={[styles.fill, { opacity: showControls ? 1 : 0 }]} pointerEvents={showControls ? 'auto' : 'none'} edges={['top', 'bottom']}>
          <View style={styles.topBar}>
            <IconButton
              name="chevronLeft"
              onPress={() => {
                if (isRegenerating) {
                  toast('Please wait — your wallpaper is still regenerating.');
                  return;
                }
                router.back();
              }}
              strong
            />
            <Text style={[styles.topTitle, { color: theme.ink }]}>Your Wallpaper</Text>
            <IconButton name="download" onPress={handleDownload} disabled={!!busyAction} strong />
          </View>

          {isSolo ? (
            // Was a hardcoded "Neon Style" regardless of which style the
            // user actually picked — confirmed live: selecting Realistic
            // still showed "Neon Style". Now resolves the real selection via
            // styleKey; falls back to the old copy only for pre-existing
            // creations saved before styleKey was tracked.
            <GlassCard radius={999} strong style={styles.tagPill}>
              <Icon name={styleOption?.icon ?? 'styleNeon'} size={13} color={theme.accent2} strokeWidth={1.8} />
              <Text style={[styles.tagText, { color: theme.resultInkSoft }]}>
                {styleOption ? t(styleOption.labelKey) : 'Neon Style'}
              </Text>
            </GlassCard>
          ) : mode === 'group' ? (
            // GROUP (2026-09-12) gets its own label rather than falling into
            // "Couple Mode" — a 3-4 person group photo mislabeled as a
            // couple result would be a real, visible mistake, not a cosmetic
            // one.
            <GlassCard radius={999} strong style={styles.tagPill}>
              <Icon name="couple" size={13} color={theme.accent2} strokeWidth={1.8} />
              <Text style={[styles.tagText, { color: theme.resultInkSoft }]}>Group Mode</Text>
            </GlassCard>
          ) : (
            // Was "Proximity Sync · Active" — that phrase now collides head-on
            // with the real Couple tab's live-location feature (src/couple/)
            // even though this is just a static two-person fusion result with
            // no proximity tracking involved. Renamed so the two don't read as
            // the same feature.
            <GlassCard radius={999} strong style={styles.tagPill}>
              <Icon name="couple" size={13} color={theme.accent2} strokeWidth={1.8} />
              <Text style={[styles.tagText, { color: theme.resultInkSoft }]}>Couple Mode</Text>
            </GlassCard>
          )}

          {hasSoloPanes ? (
            // Real thumbnails, not text-only tabs — closer to how the
            // bundled demo packs show "Together" + "Boy"/"Girl" as an
            // actual set of 3 photos (couple/preview.tsx) rather than
            // three plain-text buttons that swap one full-bleed image.
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
                disabled={item?.roleAImage == null}
              />
              <PaneThumb
                label="Partner"
                imageUri={item?.roleBImage ? resolveCreationImage(item.roleBImage) : undefined}
                active={activePane === 'b'}
                onPress={() => setActivePane('b')}
                disabled={item?.roleBImage == null}
              />
            </View>
          ) : null}

          <View style={styles.spacer} />

          <GlassCard radius={26} strong style={styles.actionPanel}>
            <View style={styles.primaryActionRow}>
              <View style={styles.flex1}>
                <GradientButton
                  label={busyAction === 'wallpaper' ? 'Setting…' : 'Set Wallpaper'}
                  icon="wallpaper"
                  onPress={handleSetWallpaper}
                  disabled={!!busyAction}
                />
              </View>
              <View style={styles.flex1}>
                <GradientButton
                  label="Regenerate ✨"
                  icon="sparkle"
                  onPress={() => {
                    if (item) {
                      router.push({
                        pathname: '/regenerate/[id]',
                        params: { id: item.id, part: activePane },
                      });
                    }
                  }}
                  disabled={!!busyAction}
                />
              </View>
            </View>

            {/* Couple-pack/pairing is a COUPLE-specific feature (a linked
             * two-person account's shared proximity wallpaper) — GROUP mode
             * (2026-09-12) has no such concept for 3-4 people, so this whole
             * block is now gated on the actual mode rather than "!isSolo",
             * which used to also catch GROUP and offer a "Couple Pack"
             * action a group photo has no business showing. */}
            {mode === 'couple' && (hasPartner ? (
              <GradientButton
                label={busyAction === 'couplePack' ? 'Setting…' : 'Use as Our Couple Pack'}
                icon="couple"
                onPress={handleUseAsCouplePack}
                disabled={!!busyAction}
              />
            ) : (
              // No partner linked yet — the couple-pack action above has
              // nothing to attach to, but the entry point to fix that
              // (pairing) was simply missing from this screen entirely.
              // Confirmed live 2026-09-10: a real couple generation with no
              // paired partner had no path from here to pairing at all.
              <GradientButton
                label="Link with Partner to Pair This"
                icon="couple"
                onPress={() => router.push('/couple/setup')}
              />
            ))}
            <View style={styles.actionRow}>
              <ActionButton icon="share" label={busyAction === 'share' ? 'Sharing…' : 'Share'} onPress={handleShare} disabled={!!busyAction} />
              <ActionButton icon="download" label={busyAction === 'save' ? 'Saving…' : 'Save'} onPress={handleDownload} disabled={!!busyAction} />
              <ActionButton
                icon="shuffle"
                label={busyAction === 'regenerate' ? 'Redoing…' : 'Quick Redo'}
                onPress={handleRegenerate}
                disabled={!!busyAction}
              />
              <ActionButton
                icon="noWatermark"
                label="8K HD"
                premium
                onPress={() => showAlert('Amora Pro 💎', '8K HD export is coming soon.')}
              />
              <ActionButton icon="trash" label="Delete" onPress={handleDelete} disabled={!!busyAction} />
            </View>
          </GlassCard>
        </SafeAreaView>
        {/* Same "Quick Redo" progress feedback as regenerate/[id].tsx's own
         * copy — see ProgressOverlay's doc comment for why this exists. */}
        {isRegenerating && <RegenerateProgressOverlay paneLabel={activePaneLabel} />}
      </BlurTargetView>
    </ScreenBlurTargetContext.Provider>
  );
}
