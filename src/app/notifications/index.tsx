import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';
import type { NotificationItem } from '@/utils/apiTypes';

/** "2m ago" / "3h ago" / "5d ago" / a plain date beyond that — a notification
 * feed reads as a timeline, so relative-to-now is what every other app in
 * this category (Gallery, Posts) DOESN'T need but this screen specifically
 * does. Self-contained here rather than a shared util since nowhere else in
 * the app has needed this shape yet. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * In-app Notification History — every push actually sent to this account
 * (personal, like partner-paired, and broadcast, like an announcement),
 * whether or not the OS tray notification for it still exists. Read state
 * is one timestamp comparison (User.notificationsViewedAt on the server),
 * not per-item — see server's routes/notifications.ts for why that's
 * enough for a single linear feed. This screen fetches the first page
 * (which carries each item's already-computed `unread` flag) BEFORE
 * calling markNotificationsViewed(), so the user still sees what was
 * unread on this exact visit rather than everything looking read
 * immediately.
 */
export default function NotificationsScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api
      .getNotifications()
      .then((res) => {
        setItems(res.items);
        setCursor(res.nextCursor);
        // Fire-and-forget, deliberately AFTER the fetch above already has
        // this visit's unread flags in hand — see this screen's own doc
        // comment.
        void api.markNotificationsViewed();
      })
      .catch(() => {
        // Best-effort — the feed just stays empty this visit, same
        // "degrade, don't crash" reasoning as this app's other reads.
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    api
      .getNotifications(cursor)
      .then((res) => {
        setItems((prev) => [...prev, ...res.items]);
        setCursor(res.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loadingMore]);

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('notifications.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={theme.accent1} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="bell" size={32} color={theme.inkFaint} />
            <Text style={[styles.emptyText, { color: theme.inkFaint }]}>{t('notifications.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.accent1} style={{ marginVertical: 16 }} /> : null}
            renderItem={({ item }) => (
              <GlassCard radius={radii.lg} style={[styles.row, item.unread && { borderColor: theme.accent1 }]}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowTitle, { color: theme.ink }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.unread && <View style={[styles.dot, { backgroundColor: theme.accent1 }]} />}
                </View>
                <Text style={[styles.rowBody, { color: theme.inkFaint }]} numberOfLines={3}>
                  {item.body}
                </Text>
                <Text style={[styles.rowTime, { color: theme.inkFaint }]}>{relativeTime(item.createdAt)}</Text>
              </GlassCard>
            )}
          />
        )}
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
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 10 },
  row: { padding: 14, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 15, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  rowBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  rowTime: { fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
  emptyText: { fontFamily: fonts.body, fontSize: 13 },
});
