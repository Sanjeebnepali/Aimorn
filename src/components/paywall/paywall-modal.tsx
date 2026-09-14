import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { showAlert } from '@/alerts/store';
import { useRewardedAdReward } from '@/ads/useRewardedAdReward';
import { Icon } from '../primitives/icon';
import { fonts } from '../../theme/tokens';
import { useAppTheme } from '../../theme/use-app-theme';
import { useApi, ProfileResponse } from '../../utils/api';
import { PRODUCT_IDS } from '../../iap/products';
import { usePaywallPurchases } from '../../iap/usePaywallPurchases';
import { FreeOptionsSection } from './FreeOptionsSection';
import { PurchaseSuccessModal } from './PurchaseSuccessModal';
import { styles } from './styles';

type PaywallModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (updatedProfile: ProfileResponse) => void;
  title?: string;
  subtitle?: string;
};

export function PaywallModal({
  visible,
  onClose,
  onSuccess,
  title = 'Get AI Credits & Amora Pro',
  subtitle = 'Choose a micro-pack or unlock full Pro access with zero ads.',
}: PaywallModalProps) {
  const theme = useAppTheme();
  const api = useApi();
  // Real RevenueCat purchases — see that hook's own doc comment. `priceLabel`
  // falls back to this file's own static USD estimate until real offerings
  // load (or forever, on a dev build with no RevenueCat key set), so the
  // paywall never shows blank prices.
  const { priceLabel, purchase, purchasingId, restore, restoring } = usePaywallPurchases(visible, onSuccess);
  // Real AdMob rewarded ad — see that hook's own doc comment. Both reward
  // cards below (watch-for-a-credit, watch-toward-the-trial) show the SAME
  // ad; there's nothing placement-specific about which "1 rewarded ad
  // unit" plays, only what the server credits afterward differs.
  const { showAd, isReady: adReady } = useRewardedAdReward();

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const busy = loadingAction !== null || purchasingId !== null || restoring;

  // Trial progress — fetched fresh each time the modal opens, since it can
  // change between visits (another ad watched last time, or the trial got
  // used up entirely) and isn't otherwise passed in by the 3 call sites.
  const [trialAdsWatched, setTrialAdsWatched] = useState(0);
  const [trialAdsRequired, setTrialAdsRequired] = useState(5);
  const [trialEligible, setTrialEligible] = useState(true);

  useEffect(() => {
    if (!visible) return;
    api.getProfile().then((profile) => {
      setTrialAdsWatched(profile.trialAdsWatched ?? 0);
      setTrialAdsRequired(profile.trialAdsRequired ?? 5);
      setTrialEligible(profile.trialEligible ?? true);
    }).catch(() => {
      // Best-effort — worst case the trial card shows a stale 0/5 until the
      // next open, no worse than the rest of the modal on a failed fetch.
    });
    // `api` deliberately excluded: useApi() (api.ts) returns a brand-new
    // object every render (no memoization — see its own doc comment on why
    // it's a hook at all), so including it here would refetch on every
    // render this modal is visible, not just the open transition this
    // effect actually means to react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleWatchTrialAd = async () => {
    setLoadingAction('trial');
    try {
      // Real rewarded ad, not a simulated instant grant — only calls the
      // server's counter at all once AdMob's own onEarnedReward actually
      // fired (see useRewardedAdReward's doc comment). A user who backs
      // out of the ad early gets `false` here and nothing is counted —
      // same "don't pay out for what didn't happen" reasoning
      // creditsRoutes.ts's own doc comment already flagged this whole
      // flow as missing until an ad SDK existed to check against.
      const earned = await showAd();
      if (!earned) return;

      const res = await api.watchTrialAd();
      setTrialAdsWatched(res.adsWatched);
      if (res.activated) {
        const expiry = res.trialExpiresAt ? new Date(res.trialExpiresAt).toLocaleDateString() : '';
        showAlert('🎉 3-Day Trial Activated!', `+${res.addedCredits} Credits added, no ads, for 3 days${expiry ? ` (until ${expiry})` : ''}.`);
        setTrialEligible(false);
        if (onSuccess) onSuccess(res.profile);
        onClose();
      } else {
        showAlert('🎬 Ad Watched', `${res.adsWatched}/${res.adsRequired} — watch ${res.adsRequired - res.adsWatched} more to unlock your free trial.`);
      }
    } catch (e: any) {
      showAlert('Ad Error', e.message || 'Could not count that ad. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  };

  // Tracks "N more ads to your next credit" between watches — the reward
  // only actually fires every AD_WATCHES_PER_CREDIT-th watch now (see
  // server's creditsConfig.ts), so a plain "+1 Credit" alert every time
  // would be lying on the watches that earn nothing.
  const [adsUntilNextCredit, setAdsUntilNextCredit] = useState<number | null>(null);

  const handleWatchAd = async () => {
    setLoadingAction('ad');
    try {
      // Real rewarded ad — see handleWatchTrialAd's own comment just above
      // for why this gates the server call on an actual earned reward.
      const earned = await showAd();
      if (!earned) return;

      const res = await api.claimAdReward();
      setAdsUntilNextCredit(res.adsUntilNextCredit);
      if (res.addedCredits > 0) {
        showAlert('🎬 Credit Earned!', `Thank you for watching! +${res.addedCredits} Free AI Credit added to your balance.`);
        if (onSuccess) onSuccess(res.profile);
        onClose();
      } else {
        showAlert('🎬 Ad Watched', `Watch ${res.adsUntilNextCredit} more to earn your next free credit.`);
      }
    } catch (e: any) {
      showAlert('Ad Error', e.message || 'Could not claim ad reward. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  };

  // Real charge just went through — the one popup in this whole file that
  // most needed to stop looking like a plain OS dialog (see
  // PurchaseSuccessModal's own doc comment for the full "why" behind
  // building a dedicated component instead of reusing showAlert here).
  // `null` means hidden; set on a successful purchase, cleared (and the
  // whole paywall closed with it) when the user acknowledges it.
  const [purchaseSuccess, setPurchaseSuccess] = useState<{ title: string; body: string; badge: string } | null>(null);

  /** Real RevenueCat purchase for one of the 5 store products — replaces
   * the old mock handleBuyPack/handleSubscribe, which just told OUR server
   * to grant credits directly with no actual App Store/Play Store charge.
   * `successBody`/`badgeLabel` are static per-product copy (this file
   * already knows how many credits each grants), since the sync response
   * itself doesn't report a "just added N" delta — see
   * usePaywallPurchases's own doc comment for why purchase() can't easily
   * compute that either. */
  async function handlePurchase(productId: string, successTitle: string, successBody: string, badgeLabel: string) {
    const bought = await purchase(productId);
    if (bought) {
      setPurchaseSuccess({ title: successTitle, body: successBody, badge: badgeLabel });
    }
  }

  // Acknowledging the success popup closes the whole paywall behind it too
  // — matches what the old Alert.alert(...); onClose() pair already did,
  // just deferred until the user has actually seen and dismissed the
  // confirmation instead of firing the instant the native alert was shown.
  function closePurchaseSuccess() {
    setPurchaseSuccess(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: '#141416' }]}>
          {/* Header Bar */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Icon name="sparkle" size={20} color={theme.accent1} />
              <Text style={[styles.headerTitle, { color: theme.ink }]}>Amora Pass & Credits</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={20} color={theme.inkFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Headline */}
            <Text style={[styles.mainTitle, { color: theme.ink }]}>{title}</Text>
            <Text style={[styles.mainSubtitle, { color: theme.inkFaint }]}>{subtitle}</Text>

            {/* Couple Pro Sharing Banner */}
            <View style={[styles.coupleShareCard, { backgroundColor: 'rgba(235, 94, 85, 0.12)', borderColor: 'rgba(235, 94, 85, 0.3)' }]}>
              <Icon name="couple" size={18} color={theme.accent1} />
              <Text style={[styles.coupleShareText, { color: theme.ink }]}>
                💖 <Text style={{ fontFamily: fonts.bodyBold }}>Couple Share Bonus:</Text> 1 Subscription unlocks BOTH phones! When you buy Pro, your partner gets full Pro access 100% FREE!
              </Text>
            </View>

            <FreeOptionsSection
              adsUntilNextCredit={adsUntilNextCredit}
              trialEligible={trialEligible}
              trialAdsWatched={trialAdsWatched}
              trialAdsRequired={trialAdsRequired}
              busy={busy}
              adReady={adReady}
              loadingAction={loadingAction}
              onWatchAd={handleWatchAd}
              onWatchTrialAd={handleWatchTrialAd}
            />

            {/* Option 2: Starter Pack — real store purchase via RevenueCat.
                priceLabel shows the store's own localized price once
                offerings load; the $3.99 here is only the fallback shown
                before that (or on a dev build with no RevenueCat key). */}
            <View style={[styles.card, styles.highlightCard, { borderColor: '#FFD700' }]}>
              <View style={styles.popularTag}>
                <Text style={styles.popularTagText}>MOST POPULAR • $0.20 / WALLPAPER</Text>
              </View>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
                  <Text style={[styles.badgeText, { color: '#FFD700' }]}>20 CREDITS</Text>
                </View>
                <Text style={[styles.cardPrice, { color: theme.ink }]}>{priceLabel(PRODUCT_IDS.STARTER, '$3.99')}</Text>
              </View>
              <Text style={[styles.cardTitle, { color: theme.ink }]}>Starter Pack</Text>
              <Text style={[styles.cardDesc, { color: theme.inkFaint }]}>
                20 Credits. Perfect for 1 to 2 weeks of daily couple or solo wallpapers!
              </Text>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#FFD700' }]}
                onPress={() => handlePurchase(PRODUCT_IDS.STARTER, '✨ Credits Unlocked!', '20 AI Credits have been added to your account!', '+20 Credits')}
                disabled={busy}
              >
                {purchasingId === PRODUCT_IDS.STARTER ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={[styles.actionBtnText, { color: '#000' }]}>⚡ Buy 20 Credits for {priceLabel(PRODUCT_IDS.STARTER, '$3.99')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Option 2.5: Value Bundle — bulk discount vs. Starter's
                per-credit rate, same shape as the Mega Pack below. */}
            <View style={[styles.card, { borderColor: 'rgba(255, 255, 255, 0.1)' }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
                  <Text style={[styles.badgeText, { color: theme.ink }]}>60 CREDITS</Text>
                </View>
                <Text style={[styles.cardPrice, { color: theme.ink }]}>{priceLabel(PRODUCT_IDS.VALUE, '$9.99')}</Text>
              </View>
              <Text style={[styles.cardTitle, { color: theme.ink }]}>Value Bundle</Text>
              <Text style={[styles.cardDesc, { color: theme.inkFaint }]}>
                60 Credits — better per-wallpaper price than the Starter Pack.
              </Text>
              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={() => handlePurchase(PRODUCT_IDS.VALUE, '✨ Credits Unlocked!', '60 AI Credits have been added to your account!', '+60 Credits')}
                disabled={busy}
              >
                {purchasingId === PRODUCT_IDS.VALUE ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>⚡ Buy 60 Credits for {priceLabel(PRODUCT_IDS.VALUE, '$9.99')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Option 3: Weekly Pass — real subscription via RevenueCat. */}
            <View style={[styles.card, { borderColor: 'rgba(255, 255, 255, 0.1)' }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
                  <Text style={[styles.badgeText, { color: theme.ink }]}>40 CREDITS / WK</Text>
                </View>
                <Text style={[styles.cardPrice, { color: theme.ink }]}>{priceLabel(PRODUCT_IDS.PRO_WEEKLY, '$4.99')} <Text style={styles.unitText}>/wk</Text></Text>
              </View>
              <Text style={[styles.cardTitle, { color: theme.ink }]}>Amora Weekly Pass</Text>
              <Text style={[styles.cardDesc, { color: theme.inkFaint }]}>
                No Ads • 40 AI Credits / week • Fast AI Queue • 4K Wallpaper Downloads
              </Text>
              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={() => handlePurchase(PRODUCT_IDS.PRO_WEEKLY, '👑 Amora Pro Activated!', 'Welcome to Amora Pro! Your weekly credits are ready.', 'Amora Pro · Weekly')}
                disabled={busy}
              >
                {purchasingId === PRODUCT_IDS.PRO_WEEKLY ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>👑 Activate Weekly Pass ({priceLabel(PRODUCT_IDS.PRO_WEEKLY, '$4.99')})</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Option 4: Monthly Pro — real subscription via RevenueCat. */}
            <View style={[styles.card, { borderColor: 'rgba(255, 255, 255, 0.1)' }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
                  <Text style={[styles.badgeText, { color: theme.ink }]}>100 CREDITS / MO</Text>
                </View>
                <Text style={[styles.cardPrice, { color: theme.ink }]}>{priceLabel(PRODUCT_IDS.PRO_MONTHLY, '$12.99')} <Text style={styles.unitText}>/mo</Text></Text>
              </View>
              <Text style={[styles.cardTitle, { color: theme.ink }]}>Amora Pro Monthly</Text>
              <Text style={[styles.cardDesc, { color: theme.inkFaint }]}>
                No Ads • 100 AI Credits / month • All Exclusive Premium Styles • Priority Fast Queue
              </Text>
              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={() => handlePurchase(PRODUCT_IDS.PRO_MONTHLY, '✨ Amora Pro Activated!', 'Welcome to Amora Pro! Your monthly credits are ready.', 'Amora Pro · Monthly')}
                disabled={busy}
              >
                {purchasingId === PRODUCT_IDS.PRO_MONTHLY ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>✨ Activate Monthly Pro ({priceLabel(PRODUCT_IDS.PRO_MONTHLY, '$12.99')})</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={restore} disabled={busy} style={styles.restoreLink}>
              {restoring ? (
                <ActivityIndicator color={theme.inkFaint} size="small" />
              ) : (
                <Text style={[styles.restoreLinkText, { color: theme.inkFaint }]}>Restore Purchases</Text>
              )}
            </TouchableOpacity>

            <Text style={[styles.footerText, { color: theme.inkFaint }]}>
              Billed through your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play account'} — cancel any time from your device&apos;s subscription settings.
            </Text>
          </ScrollView>
        </View>
      </View>

      <PurchaseSuccessModal
        visible={purchaseSuccess !== null}
        title={purchaseSuccess?.title ?? ''}
        body={purchaseSuccess?.body ?? ''}
        badgeLabel={purchaseSuccess?.badge ?? ''}
        onClose={closePurchaseSuccess}
      />
    </Modal>
  );
}
