import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';
import { styles } from './styles';

type FreeOptionsSectionProps = {
  adsUntilNextCredit: number | null;
  trialEligible: boolean;
  trialAdsWatched: number;
  trialAdsRequired: number;
  busy: boolean;
  /** Whether a real rewarded ad has actually finished preloading — see
   * useRewardedAdReward's own doc comment. Both buttons show their own
   * "Loading Ad…" label until this is true, but stay TAPPABLE the whole
   * time (see onWatchAd/onWatchTrialAd below) rather than disabled outright
   * — a real device can have its very first ad request go unanswered
   * forever (confirmed live 2026-09-16), and a button that's merely
   * disabled with no explanation reads as the whole reward feature being
   * broken, with no way to find out why or retry. */
  adReady: boolean;
  /** True once a load has gone unanswered long enough to stop looking like
   * "any second now" — swaps the label to something that tells the user
   * this genuinely isn't available yet, rather than an indefinite spinner
   * label. See useRewardedAdReward's own doc comment. */
  adLoadTimedOut: boolean;
  loadingAction: string | null;
  onWatchAd: () => void;
  onWatchTrialAd: () => void;
};

/**
 * Split out of paywall-modal.tsx 2026-09-14 alongside the payment-success
 * redesign (PurchaseSuccessModal.tsx) — that file was already brushing the
 * workspace's 350-line cap, and these two free-option cards (watch-an-ad,
 * the one-time 3-day trial) are the single largest self-contained JSX
 * block in it, with no local state of their own — everything they need
 * comes in as props from the parent, which still owns all the actual
 * ad/trial-claim logic and API calls. Pure presentational carve-out, same
 * "extract render, not behavior" shape as resultScreen/parts.tsx.
 */
export function FreeOptionsSection({
  adsUntilNextCredit,
  trialEligible,
  trialAdsWatched,
  trialAdsRequired,
  busy,
  adReady,
  adLoadTimedOut,
  loadingAction,
  onWatchAd,
  onWatchTrialAd,
}: FreeOptionsSectionProps) {
  const theme = useAppTheme();

  return (
    <>
      {/* Watch Rewarded Ad (Free) — 2 watches per credit now (see server's
          creditsConfig.ts AD_WATCHES_PER_CREDIT): still just two short
          optional videos, never a forced interstitial, but not a 1:1
          giveaway priced well below what a credit actually costs to
          generate. */}
      <View style={[styles.card, styles.freeAdCard, { borderColor: 'rgba(235, 94, 85, 0.3)' }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: 'rgba(235, 94, 85, 0.15)' }]}>
            <Text style={[styles.badgeText, { color: theme.accent1 }]}>FREE OPTION</Text>
          </View>
          <Text style={[styles.cardPrice, { color: theme.accent1 }]}>$0</Text>
        </View>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Watch 2 Video Ads (+1 Free Credit)</Text>
        <Text style={[styles.cardDesc, { color: theme.inkFaint }]}>
          {adsUntilNextCredit != null && adsUntilNextCredit > 0
            ? `Watch ${adsUntilNextCredit} more short ad${adsUntilNextCredit === 1 ? '' : 's'} to earn your next AI Wallpaper generation credit.`
            : 'Watch two 15-second sponsor videos to get 1 AI Wallpaper generation credit.'}
        </Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.accent1, opacity: adReady ? 1 : 0.6 }]}
          onPress={onWatchAd}
          disabled={busy}
        >
          {loadingAction === 'ad' ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.actionBtnText}>
              {adReady ? '🎬 Watch 15s Ad' : adLoadTimedOut ? 'Ad Unavailable — Tap to Retry' : 'Loading Ad…'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 3-Day Free Trial, unlocked by watching several ads up front — the
          ads' real revenue is what funds the trial's credits, so this only
          shows while trialEligible (never used before) is true; a used-up
          trial has nothing left to offer. */}
      {trialEligible && (
        <View style={[styles.card, styles.freeAdCard, { borderColor: 'rgba(235, 94, 85, 0.3)' }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.badge, { backgroundColor: 'rgba(235, 94, 85, 0.15)' }]}>
              <Text style={[styles.badgeText, { color: theme.accent1 }]}>ONE-TIME OFFER</Text>
            </View>
            <Text style={[styles.cardPrice, { color: theme.accent1 }]}>$0</Text>
          </View>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>3-Day Free Trial</Text>
          <Text style={[styles.cardDesc, { color: theme.inkFaint }]}>
            Watch {trialAdsRequired} short ads to unlock 3 days of Amora Pro — 12 bonus credits, no ads, fast queue. One-time only.
          </Text>
          <View style={styles.trialProgressTrack}>
            <View
              style={[
                styles.trialProgressFill,
                { width: `${Math.min(100, (trialAdsWatched / trialAdsRequired) * 100)}%`, backgroundColor: theme.accent1 },
              ]}
            />
          </View>
          <Text style={[styles.trialProgressLabel, { color: theme.inkFaint }]}>
            {trialAdsWatched}/{trialAdsRequired} ads watched
          </Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.accent1, marginTop: 10, opacity: adReady ? 1 : 0.6 }]}
            onPress={onWatchTrialAd}
            disabled={busy}
          >
            {loadingAction === 'trial' ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>
                {adReady
                  ? `🎬 Watch Ad (${trialAdsWatched}/${trialAdsRequired})`
                  : adLoadTimedOut
                    ? 'Ad Unavailable — Tap to Retry'
                    : 'Loading Ad…'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}
