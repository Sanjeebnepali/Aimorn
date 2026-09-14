import { useCallback, useEffect, useState } from 'react';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { showAlert } from '@/alerts/store';
import { useApi, type ProfileResponse } from '@/utils/api';
import { isPurchasesConfigured } from './purchases';

/**
 * All the RevenueCat plumbing paywall-modal.tsx needs, pulled into its own
 * hook purely to keep that file under the workspace's 350-line module limit
 * — this file owns "how do we buy things," the modal owns "what does the
 * screen look like."
 */
export function usePaywallPurchases(visible: boolean, onSuccess?: (profile: ProfileResponse) => void) {
  const api = useApi();
  // Keyed by product id (e.g. "amora_credits_starter"), not RevenueCat's own
  // Package identifier — our product ids are the one thing guaranteed to
  // match products.ts/creditsConfig.ts regardless of how packages happen to
  // be named inside the RevenueCat dashboard's Offering.
  const [packages, setPackages] = useState<Record<string, PurchasesPackage>>({});
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    // Not configured (no API key set — a local/dev build) or not open yet:
    // leave `packages` empty, which callers read as "show the fallback
    // price, disable the buy button until offerings actually load."
    if (!visible || !isPurchasesConfigured()) return;
    Purchases.getOfferings()
      .then((offerings) => {
        const current = offerings.current;
        if (!current) return;
        const byProductId: Record<string, PurchasesPackage> = {};
        for (const pkg of current.availablePackages) {
          byProductId[pkg.product.identifier] = pkg;
        }
        setPackages(byProductId);
      })
      .catch((err) => {
        // Best-effort — the modal still renders with fallback prices; a
        // transient network failure fetching offerings shouldn't block the
        // whole paywall from showing.
        console.warn('RevenueCat getOfferings failed:', err);
      });
  }, [visible]);

  /** Real, localized store price once offerings have loaded; the static
   * USD estimate (this file's own hardcoded copy) until they have, or on a
   * dev build with no RevenueCat key at all. */
  const priceLabel = useCallback(
    (productId: string, fallbackUsd: string) => packages[productId]?.product.priceString ?? fallbackUsd,
    [packages],
  );

  const isPurchasable = useCallback((productId: string) => productId in packages, [packages]);

  /** Buys one product, syncs the resulting entitlement/credits from the
   * server (see routes/iapSync.ts — never trusts the client's own idea of
   * what it just bought), and reports success via `onSuccess`. Returns
   * `true` on an actual purchase, `false` on a user-cancel (not an error —
   * callers shouldn't show an alert for that), and re-throws anything else
   * after showing a generic error, so a caller's own try/catch can still
   * run its `finally` cleanup. */
  const purchase = useCallback(
    async (productId: string): Promise<boolean> => {
      const pkg = packages[productId];
      if (!pkg) {
        showAlert('Not Available', 'This item isn’t available for purchase right now — please try again shortly.');
        return false;
      }
      setPurchasingId(productId);
      try {
        await Purchases.purchasePackage(pkg);
        const profile = await api.syncIap();
        onSuccess?.(profile);
        return true;
      } catch (err) {
        const isUserCancelled = typeof err === 'object' && err !== null && (err as { userCancelled?: boolean }).userCancelled;
        if (!isUserCancelled) {
          showAlert('Purchase Error', err instanceof Error ? err.message : 'Could not complete the purchase.');
        }
        return false;
      } finally {
        setPurchasingId(null);
      }
    },
    [packages, api, onSuccess],
  );

  /** Apple requires a visible "Restore Purchases" path for any app selling
   * non-consumable/subscription content (App Store Review Guideline
   * 3.1.1) — re-applies whatever this Apple ID/Google account already
   * owns to the current account, for a reinstall or a second device. */
  const restore = useCallback(async () => {
    setRestoring(true);
    try {
      await Purchases.restorePurchases();
      const profile = await api.syncIap();
      onSuccess?.(profile);
      showAlert('Restored', 'Your previous purchases have been restored to this account.');
    } catch (err) {
      showAlert('Restore Failed', err instanceof Error ? err.message : 'Could not restore purchases.');
    } finally {
      setRestoring(false);
    }
  }, [api, onSuccess]);

  return { priceLabel, isPurchasable, purchase, purchasingId, restore, restoring };
}
