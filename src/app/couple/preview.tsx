import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { useAppTheme } from '@/theme/use-app-theme';
import { SimpleButton } from '../../components/SimpleButton';
import { type CoupleRole, getCouplePack, soloImageForRole } from '../../couple/packs';
import { refreshCoupleState } from '../../couple/bootstrap';
import { useCoupleStore, useCouplePackId, useMyRole } from '../../couple/store';
import { toast } from '../../lib/toast';
import { useApi } from '../../utils/api';
import { styles } from '../../components/couplePreview/styles';

/**
 * Couple Preview — the "pick your side" screen.
 *
 * Reached by tapping a pack on the Gallery feed (with `?packId=…`). Shows the
 * together image (both halves combined) as the hero, then the two solo
 * halves as selectable cards. Each partner taps the half that's theirs, then
 * continues to pairing (or, if already linked, the pick applies immediately).
 *
 * Rewired onto `@/couple/*` (Amora's real, Neon-backed store/packs) instead
 * of `constants/couplePacks` + `store/couple` — those talked to a fake
 * Supabase stub with no real project behind it. Role is `'A' | 'B'` here
 * (matches the real server), not the donor app's lowercase `'a' | 'b'`.
 *
 * Re-themed 2026-09-08 onto Amora's real gradient-glass system
 * (`GradientScreen`/`useAppTheme()`) — see `couple/setup.tsx`'s doc comment
 * for the full re-theme story. The hero/solo photo cards keep the same
 * full-bleed shape `template-card.tsx` uses elsewhere (a plain bordered
 * View, not `GlassCard` — the photo is the surface here, not a panel over
 * one) and each pack's own `accent` color stays exactly as it was: that's a
 * real per-pack feature (Golden Hour vs. Ocean Blue, etc.), not leftover
 * styling from the donor app.
 */
export default function CouplePreview() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const hasPartner = useCoupleStore((s) => s.hasPartner);
  const proximity = useCoupleStore((s) => s.proximity);
  const activePackId = useCouplePackId();
  const myLinkedRole = useMyRole();
  const params = useLocalSearchParams<{ packId?: string }>();

  // Pack: from the tapped card, else the active linked pack, else first.
  const pack = useMemo(() => getCouplePack(params.packId ?? activePackId ?? null), [params.packId, activePackId]);

  const [role, setRole] = useState<CoupleRole>(myLinkedRole ?? 'A');
  const [saving, setSaving] = useState(false);

  const { width } = useWindowDimensions();
  const heroW = width - 40;
  const heroH = Math.round(heroW * 0.82);
  const soloW = Math.floor((width - 40 - 12) / 2);
  const soloH = Math.round(soloW * 1.5);

  const onContinue = () => {
    router.push(`/couple/setup?packId=${pack.id}&role=${role}` as Href);
  };

  // Tap a side. Before linking it's just the local pick carried to setup.
  // After linking it PERSISTS immediately via PATCH /couple/role — swapping
  // to the other half (the server rejects picking the side your partner
  // already holds with a 409, surfaced here as a toast).
  const onPickSide = async (value: CoupleRole) => {
    setRole(value); // instant highlight either way
    if (!hasPartner || value === myLinkedRole) return;
    setSaving(true);
    try {
      await api.setCoupleRole(value);
      await refreshCoupleState();
      toast(t('couple.preview.nowRole', { role: value === 'A' ? pack.roleALabel : pack.roleBLabel }));
    } catch (err) {
      setRole(myLinkedRole ?? 'A'); // revert the optimistic highlight
      toast(err instanceof Error ? err.message : t('couple.preview.couldNotChangeSide'));
    } finally {
      setSaving(false);
    }
  };

  const roles: { value: CoupleRole; label: string; emoji?: string; image: number | string }[] = [
    { value: 'A', label: pack.roleALabel, emoji: pack.roleAEmoji, image: soloImageForRole(pack, 'A') },
    { value: 'B', label: pack.roleBLabel, emoji: pack.roleBEmoji, image: soloImageForRole(pack, 'B') },
  ];

  const chosenLabel = role === 'A' ? pack.roleALabel : pack.roleBLabel;
  const isNear = proximity === 'near';

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{pack.name}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* ── Together hero ── */}
          <View
            style={[styles.hero, { width: heroW, height: heroH, borderColor: pack.accent + '66', shadowColor: pack.accent }]}
          >
            <Image source={pack.togetherImage} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.8)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[styles.heroPill, { backgroundColor: theme.accent1 }]}>
              <Icon name="heart" size={12} color="#131313" />
              <Text style={styles.heroPillText}>{t('couple.preview.together')}</Text>
            </View>
            <View style={styles.heroFooter}>
              <Text style={styles.heroTitle}>{t('couple.preview.completeMoment')}</Text>
              <Text style={styles.heroSub}>{t('couple.preview.bothPhonesShow', { blurb: pack.blurb })}</Text>
            </View>
          </View>

          {/* ── Pick your side ── */}
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>
              {hasPartner ? t('couple.preview.yourSide') : t('couple.preview.pickYourSide')}
            </Text>
            <Text style={[styles.sectionSub, { color: theme.inkFaint }]}>{t('couple.preview.sideHint')}</Text>
          </View>

          <View style={styles.soloRow}>
            {roles.map((r) => {
              const selected = r.value === role;
              return (
                <SimpleButton
                  key={r.value}
                  onPress={() => onPickSide(r.value)}
                  style={[
                    styles.soloCard,
                    { width: soloW, height: soloH, borderColor: theme.glassBorder },
                    selected && { borderColor: pack.accent, borderWidth: 2.5 },
                  ]}
                >
                  <Image source={r.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={140} />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.82)']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {selected ? (
                    <View style={[styles.check, { backgroundColor: pack.accent }]}>
                      <Icon name="check" size={14} color="#131313" />
                    </View>
                  ) : null}
                  <View style={styles.soloFooter}>
                    <Text style={styles.soloLabel}>
                      {r.emoji ?? ''} {r.label}
                    </Text>
                    <Text style={styles.soloHint}>{selected ? t('couple.preview.thisIsMe') : t('couple.preview.tapToChoose')}</Text>
                  </View>
                </SimpleButton>
              );
            })}
          </View>

          {/* ── Action ── */}
          {hasPartner ? (
            <View style={styles.statusWrap}>
              <View style={[styles.statusDot, { backgroundColor: isNear ? theme.accent1 : theme.accent2 }]} />
              <Text style={[styles.statusText, { color: theme.ink }]}>
                {t('couple.preview.onPhoneNow')}
                <Text style={{ fontWeight: '800' }}>
                  {isNear ? t('couple.preview.togetherImage') : t('couple.preview.halfSuffix', { role: chosenLabel })}
                </Text>
              </Text>
            </View>
          ) : null}

          <GradientButton
            label={
              hasPartner ? t('couple.preview.openDashboard') : t('couple.preview.pairAs', { role: chosenLabel })
            }
            icon={hasPartner ? 'sparkle' : 'heart'}
            onPress={hasPartner ? () => router.push('/couple/dashboard' as Href) : onContinue}
            disabled={saving}
          />

          {!hasPartner ? (
            <Text style={[styles.footnote, { color: theme.inkFaint }]}>{t('couple.preview.pairingFootnote')}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}
