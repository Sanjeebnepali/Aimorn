import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { styles } from '@/components/loadingScreen/styles';
import { useGalleryStore } from '@/data/gallery-store';
import { toast } from '@/lib/toast';
import { useNoticesStore } from '@/notices/store';
import { useAppTheme } from '@/theme/use-app-theme';
import { type GenerationResponse, useApi } from '@/utils/api';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 160;
const RING_RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// One lap of the ring while we're actually waiting on the network — real
// generation time varies (a few seconds to tens of seconds depending on
// provider load), so this loops instead of running once, unlike the old
// fixed-duration fake pipeline it replaced.
const LAP_DURATION = 2400;
// Give up and surface an error rather than polling forever if the server
// never flips the row out of PROCESSING (a crashed worker, a dropped
// connection) — matches generations.ts's own synchronous-request design,
// which should resolve in single-digit seconds to low tens of seconds.
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;

const STEPS = [
  'Analyzing photo features...',
  'Styling facial contours...',
  'Blending color harmonies...',
  'Rendering 8K detail...',
  'Finalizing fusion...',
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function LoadingScreen() {
  const theme = useAppTheme();
  const api = useApi();
  const { t } = useTranslation();
  const { mode, style, description, templateId, photoAKeys, photoBKeys, sourcePostId, freeform } = useLocalSearchParams<{
    // 'group' added 2026-09-12 — see group-form.tsx's own doc comment.
    mode?: 'solo' | 'couple' | 'group';
    style?: string;
    description?: string;
    templateId?: string;
    /** JSON-stringified string[] — route params are always strings, so
     * create-form.tsx/freeform-form.tsx JSON.stringify the key array before
     * navigating here and this screen parses it back (see the run() effect
     * below). Multi-angle uploads since 2026-09-12 — see UploadSlot's own
     * doc comment for why. */
    photoAKeys?: string;
    photoBKeys?: string;
    /** Set when this generation came from a post's "Recreate" button
     * (create-form.tsx's sourcePost prop) — threaded straight through to
     * POST /generations so the original poster's regenerationCount/points
     * actually move (server/src/routes/generations.ts). */
    sourcePostId?: string;
    /** Set (as the literal string 'true') by the "General" create mode
     * (freeform-form.tsx) — route params are always strings, so this is
     * parsed back to a real boolean below rather than passed straight
     * through. See server's promptBuilder.ts PromptInput.freeform. */
    freeform?: string;
  }>();
  const isSolo = mode === 'solo';
  const isGroup = mode === 'group';

  const progressVal = useSharedValue(0);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  // Guards against acting on a resolved promise after the screen navigated
  // away for some other reason (e.g. the user backed out mid-generation).
  const cancelled = useRef(false);

  const navigateToResult = useCallback((generation: GenerationResponse) => {
    if (cancelled.current) return;
    useGalleryStore.getState().addCreation({
      id: generation.id,
      mode: (mode as 'solo' | 'couple' | 'group') ?? 'couple',
      // Leave `prompt` unset when the user didn't type a description —
      // 'AI Generated Wallpaper' used to fill in here regardless of mode,
      // which is a truthy string that short-circuits `creationLabel()`'s own
      // mode-aware fallback ('Solo AI Wallpaper' / 'Couple AI Wallpaper').
      // Confirmed live 2026-09-10: a Solo and a Couple creation made back to
      // back both showed the identical generic "AI Generated Wallpaper" card
      // in the Gallery grid, with no way to tell them apart at a glance.
      prompt: description ? `${style ? style + ': ' : ''}${description}` : undefined,
      styleKey: style,
      togetherImage: generation.outputUrl ?? undefined,
      roleAImage: generation.outputUrlA ?? undefined,
      roleBImage: generation.outputUrlB ?? undefined,
      date: 'Just now',
    });

    // First-ever couple generation on this device only — the user's own
    // ask: "add notification about generation image couple... so it
    // doesn't make user in the shade." A modal on every single generation
    // would just be a nag; showing it once, with the full explanation
    // permanently available in Profile → About This App (src/app/about),
    // is what actually respects both halves of that ask. Fires after
    // addCreation above (already-successful result), not before, so a
    // generation that fails never triggers it.
    // Couple-specific (not "!isSolo") since 2026-09-12 — GROUP mode
    // shouldn't trigger a disclaimer written specifically about a linked
    // couple's shared proximity-wallpaper feature, which GROUP has nothing
    // to do with.
    if (mode === 'couple' && !useNoticesStore.getState().hasSeenCoupleDisclaimer) {
      useNoticesStore.getState().markCoupleDisclaimerSeen();
      showAlert(t('notices.coupleDisclaimerTitle'), t('notices.coupleDisclaimerBody'));
    }

    router.replace({ pathname: '/result/[id]', params: { id: generation.id, mode: mode ?? 'couple' } });
  }, [description, mode, style, t]);

  // The real generate-and-wait flow. Photos are already uploaded by the time
  // this screen is reached (create-form.tsx does that before navigating
  // here) — this screen's only job is to kick off the fusion job and poll
  // it to completion, which is why it needs no upload/progress state of its
  // own beyond the decorative ring below.
  useEffect(() => {
    cancelled.current = false;

    async function run() {
      // Parsed here rather than trusted as-is — a malformed/missing param
      // (a stale deep link, say) should read as "no photos" and fail the
      // same clear way an actually-missing photoAKey always has, not throw
      // an unrelated JSON.parse error the user can't make sense of.
      const parsedPhotoAKeys: string[] = (() => {
        try {
          const parsed = photoAKeys ? JSON.parse(photoAKeys) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      const parsedPhotoBKeys: string[] = (() => {
        try {
          const parsed = photoBKeys ? JSON.parse(photoBKeys) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

      if (!parsedPhotoAKeys.length || !style) {
        toast('Missing photo or style — please try again.');
        router.back();
        return;
      }

      let generation: GenerationResponse;
      try {
        generation = await api.createGeneration({
          templateId: templateId || undefined,
          styleKey: style,
          subjectMode: isSolo ? 'SOLO' : isGroup ? 'GROUP' : 'COUPLE',
          description: description || undefined,
          photoAKeys: parsedPhotoAKeys,
          photoBKeys: parsedPhotoBKeys.length ? parsedPhotoBKeys : undefined,
          sourcePostId: sourcePostId || undefined,
          freeform: freeform === 'true',
        });
      } catch (err) {
        if (cancelled.current) return;
        toast(err instanceof Error ? err.message : 'Could not start generation.');
        router.back();
        return;
      }

      // POST /generations already runs the fusion synchronously and only
      // responds once status is COMPLETE or the whole request 502s — so in
      // the common case this loop never actually iterates. It exists for
      // the same reason GET /generations/:id exists at all: a future queued
      // worker (see that route's own doc comment) can return PROCESSING
      // immediately without this screen's polling logic changing at all.
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (generation.status !== 'COMPLETE' && generation.status !== 'FAILED') {
        if (cancelled.current) return;
        if (Date.now() > deadline) {
          toast('This is taking longer than expected — check Gallery in a bit.');
          router.back();
          return;
        }
        await sleep(POLL_INTERVAL_MS);
        if (cancelled.current) return;
        generation = await api.getGeneration(generation.id);
      }

      if (generation.status === 'FAILED') {
        toast(generation.errorMessage || 'Generation failed — please try again.');
        router.back();
        return;
      }

      navigateToResult(generation);
    }

    run();

    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    progressVal.value = withRepeat(
      withTiming(1, { duration: LAP_DURATION, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      -1,
      false,
    );

    const interval = setInterval(() => {
      const val = progressVal.value;
      setDisplayPercent(Math.min(100, Math.round(val * 100)));
      setCurrentStepIndex(Math.min(STEPS.length - 1, Math.floor(val * STEPS.length)));
    }, 40);

    return () => clearInterval(interval);
  }, [progressVal]);

  const animatedCircleProps = useAnimatedProps(() => {
    const dashOffset = CIRCUMFERENCE * (1 - progressVal.value);
    return {
      strokeDashoffset: dashOffset,
    };
  });

  return (
    <GradientScreen dim>
      <SafeAreaView style={styles.fill}>
        <View style={styles.center}>
          <View style={styles.ringWrap}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={theme.accent1} />
                  <Stop offset="1" stopColor={theme.accent2} />
                </SvgLinearGradient>
              </Defs>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={8}
                fill="none"
              />
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="url(#ringGrad)"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                animatedProps={animatedCircleProps}
                fill="none"
                rotation={-90}
                originX={RING_SIZE / 2}
                originY={RING_SIZE / 2}
              />
            </Svg>
            <GlassCard radius={56} style={styles.ringCenter}>
              <Icon
                name={isSolo ? 'sparkle' : isGroup ? 'couple' : 'heart'}
                size={isSolo ? 32 : 34}
                color={theme.accent1}
                strokeWidth={1.8}
              />
            </GlassCard>
            <View style={styles.progressBadgeWrap}>
              <LinearGradient colors={[theme.accent1, theme.accent2]} style={styles.progressBadge}>
                <Text style={[styles.progressText, { color: theme.ink }]}>{displayPercent}%</Text>
              </LinearGradient>
            </View>
          </View>

          <View style={styles.textBlock}>
            <Text style={[styles.headline, { color: theme.ink }]}>
              {isSolo ? 'Reimagining your photo…' : isGroup ? 'Bringing everyone\ntogether…' : 'Blending two hearts\ninto one…'}
            </Text>
            <Text style={[styles.subtext, { color: theme.accent2 }]}>{STEPS[currentStepIndex]}</Text>
          </View>

          {isSolo ? (
            <View style={styles.transformRow}>
              <LinearGradient colors={[theme.accent1, theme.bg2]} style={styles.circleShape} />
              <Icon name="chevronRight" size={18} color={theme.accent2} strokeWidth={2} />
              <LinearGradient colors={[theme.accent2, theme.bg3]} style={styles.squareShape} />
            </View>
          ) : isGroup ? (
            // No connecting icon between shapes — a group fusion isn't one
            // pairing (couple's heart) or one transform (solo's arrow), it's
            // several distinct people converging, so three plain circles
            // reads more honestly than forcing a 2-shape metaphor to fit.
            <View style={styles.transformRow}>
              <LinearGradient colors={[theme.accent1, theme.bg2]} style={styles.circleShape} />
              <LinearGradient colors={[theme.accent2, theme.bg3]} style={styles.circleShape} />
              <LinearGradient colors={[theme.accent1, theme.bg3]} style={styles.circleShape} />
            </View>
          ) : (
            <View style={styles.transformRow}>
              <LinearGradient colors={[theme.accent1, theme.bg2]} style={styles.circleShape} />
              <Icon name="heart" size={20} color={theme.accent2} />
              <LinearGradient colors={[theme.accent2, theme.bg3]} style={styles.circleShape} />
            </View>
          )}

          <GlassCard radius={16} style={styles.tipCard}>
            <Icon name="tip" size={15} color={theme.accent2} strokeWidth={2} />
            <Text style={[styles.tipText, { color: theme.inkSoft }]}>
              {isSolo
                ? 'Tip: Neon and Cyberpunk styles pop best against bold backgrounds'
                : isGroup
                  ? 'Tip: clear, front-facing photos for everyone give the most recognizable group shot'
                  : 'Tip: even lighting on both photos gives the smoothest fusion'}
            </Text>
          </GlassCard>
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

