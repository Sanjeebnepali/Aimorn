import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';

import { showAlert } from '@/alerts/store';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';

/** The one account allowed to actually send (server's own ADMIN_USER_ID,
 * see routes/admin.ts) — this client-side check is purely so nobody else
 * ever sees the screen at all; the server 403s regardless even if someone
 * reached this route directly. */
const ADMIN_USER_ID = 'user_3Io0RPzPfuxr3LtBs9RhwPRcU2k';

/**
 * App-owner-only: compose and send a push to every opted-in user at once
 * ("new feature", "event", "we're live" — the kind of announcement every
 * app sends). No settings-list entry point — reached only via this route
 * directly, and gated by ADMIN_USER_ID above so it renders as a plain
 * "not found" for anyone else, matching the server's own 403 rather than
 * exposing a feature only one account can ever use.
 */
export default function AdminBroadcastScreen() {
  const theme = useAppTheme();
  const api = useApi();
  const { userId } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  if (userId !== ADMIN_USER_ID) return null;

  async function handleSend() {
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true);
    try {
      await api.sendBroadcast(title.trim(), body.trim());
      showAlert('Sent ✨', 'Your announcement is on its way to everyone who has notifications on.');
      setTitle('');
      setBody('');
    } catch (err) {
      showAlert('Couldn’t Send', err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>Send Announcement</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.list}>
          <Text style={[styles.notice, { color: theme.inkFaint }]}>
            Goes out as one push to every user who has notifications enabled.
          </Text>

          <GlassCard radius={radii.lg} style={styles.field}>
            <Text style={[styles.label, { color: theme.inkFaint }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. New style pack just dropped ✨"
              placeholderTextColor={theme.inkFaint}
              style={[styles.input, { color: theme.ink }]}
              maxLength={120}
            />
          </GlassCard>

          <GlassCard radius={radii.lg} style={styles.field}>
            <Text style={[styles.label, { color: theme.inkFaint }]}>Message</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What's new?"
              placeholderTextColor={theme.inkFaint}
              style={[styles.input, styles.multiline, { color: theme.ink }]}
              maxLength={500}
              multiline
            />
          </GlassCard>

          <GradientButton
            label={sending ? 'Sending…' : 'Send to Everyone'}
            onPress={() => void handleSend()}
            disabled={!title.trim() || !body.trim() || sending}
          />
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  title: { fontFamily: fonts.bodyExtraBold, fontSize: 18, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  notice: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  field: { padding: 14, gap: 6 },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { fontFamily: fonts.body, fontSize: 15, padding: 0 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
