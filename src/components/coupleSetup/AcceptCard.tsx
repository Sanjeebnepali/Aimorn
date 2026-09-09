import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { type ThemeTokens } from '@/theme/tokens';
import { type CoupleRole } from '../../utils/api';
import { styles } from './styles';

/**
 * ACCEPT CARD — "I'm Person B". Code input + optional role override chips
 * (Auto / Side A / Side B) + the Link button. Self-contained: all state +
 * callbacks via props.
 *
 * Codes are 6 characters (`server/src/lib/codes.ts`'s `generatePairingCode`),
 * not the donor app's hyphenated "LOVE-XXXX" — placeholder/maxLength updated
 * to match.
 *
 * Re-themed onto Amora's gradient-glass primitives — see `YourCodeCard.tsx`'s
 * doc comment. The role chips now reuse the app's own `Chip` primitive
 * (same one Home's category rail uses) instead of a bespoke pill style;
 * `key` has no equivalent in Amora's custom `Icon` set so it stays on
 * `Ionicons`.
 */
export function AcceptCard({
  theme,
  enterInput,
  setEnterInput,
  acceptRole,
  setAcceptRole,
  busy,
  onAccept,
}: {
  theme: ThemeTokens;
  enterInput: string;
  setEnterInput: (t: string) => void;
  acceptRole: CoupleRole | null;
  setAcceptRole: (r: CoupleRole | null) => void;
  busy: 'accept' | null;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  const roleOptions: { v: CoupleRole | null; labelKey: string }[] = [
    { v: null, labelKey: 'couple.setup.auto' },
    { v: 'A', labelKey: 'couple.setup.sideA' },
    { v: 'B', labelKey: 'couple.setup.sideB' },
  ];
  return (
    <GlassCard style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: theme.accent2 }]}>
          <Ionicons name="key" size={18} color="#131313" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('couple.setup.acceptTitle')}</Text>
          <Text style={[styles.cardBody, { color: theme.inkSoft }]}>{t('couple.setup.acceptBody')}</Text>
        </View>
      </View>

      <Pressable style={[styles.input, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
        <TextInput
          value={enterInput}
          onChangeText={(v) => setEnterInput(v.toUpperCase())}
          placeholder="ABCDEF"
          placeholderTextColor={theme.inkFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={[styles.inputText, { color: theme.ink }]}
        />
      </Pressable>

      {/* OPTIONAL ROLE OVERRIDE — picked here as a convenience, but actually
          applied via a separate PATCH /couple/role call after pairing
          succeeds (Amora's server doesn't accept a role at pairing time).
          "Auto" just skips that call and leaves the role choice for the
          preview/dashboard screen, same as never having picked one. */}
      <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>{t('couple.setup.pickSide')}</Text>
      <Text style={[styles.sectionSubLabel, { color: theme.inkFaint }]}>{t('couple.setup.pickSideHint')}</Text>
      <View style={styles.acceptRoleRow}>
        {roleOptions.map(({ v, labelKey }) => (
          <Chip key={labelKey} label={t(labelKey)} active={v === acceptRole} onPress={() => setAcceptRole(v)} />
        ))}
      </View>

      <GradientButton
        label={busy === 'accept' ? t('couple.setup.linking') : t('couple.setup.linkWithPartner')}
        onPress={onAccept}
        disabled={busy != null}
      />
    </GlassCard>
  );
}
