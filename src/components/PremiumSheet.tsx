import { forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export type BottomSheetModal = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  snapPoints?: (string | number)[];
  title?: string;
  subtitle?: string;
  accentColor?: string;
  showAccent?: boolean;
  onDismiss?: () => void;
  children: ReactNode;
};

/**
 * Native Modal wrapper replacing @gorhom/bottom-sheet to fix dependencies.
 * Exposes present() and dismiss() via ref.
 */
export const PremiumSheet = forwardRef<BottomSheetModal, Props>(
  (
    {
      title,
      subtitle,
      accentColor,
      showAccent = true,
      onDismiss,
      children,
    },
    ref,
  ) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const accent = accentColor ?? theme.primary;

    useImperativeHandle(ref, () => ({
      present: () => setVisible(true),
      dismiss: () => {
        setVisible(false);
        onDismiss?.();
      },
    }));

    if (!visible) return null;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setVisible(false);
          onDismiss?.();
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setVisible(false);
            onDismiss?.();
          }}
        >
          <Pressable
            style={[
              styles.sheetBg,
              { backgroundColor: theme.surface },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            {showAccent ? (
              <LinearGradient
                colors={[accent, theme.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.accentStrip}
              />
            ) : null}
            <ScrollView
              contentContainerStyle={[
                styles.content,
                { paddingBottom: Spacing.xxl + Math.max(insets.bottom, 16) },
              ]}
            >
              {title ? (
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              <View style={styles.body}>{children}</View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  },
);

PremiumSheet.displayName = 'PremiumSheet';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheetBg: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  handle: {
    backgroundColor: Colors.textDim,
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  accentStrip: {
    height: 3,
    marginHorizontal: Spacing.lg,
    marginTop: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: {
    color: Colors.textDim,
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  body: { gap: Spacing.sm },
});
