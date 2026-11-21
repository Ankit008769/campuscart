import { Brand, Radius } from '@campuscart/ui';
import { useNetworkState } from 'expo-network';
import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** A thin strip over the top of every screen while the phone has no internet. */
export function OfflineBanner() {
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  if (network.isConnected !== false && network.isInternetReachable !== false) return null;
  return (
    <View pointerEvents="none" style={[styles.banner, { paddingTop: insets.top + 4 }]}>
      <Text style={styles.bannerText}>You&apos;re offline. Everything updates again once you&apos;re back online.</Text>
    </View>
  );
}

/** Shown instead of a screen that crashed, so the app never ends on a blank page. */
export function AppError({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.error}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{error.message || 'An unexpected error stopped this screen.'}</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: Brand.ink,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  bannerText: {
    color: '#ffffff',
    fontSize: 13,
    textAlign: 'center',
  },
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    backgroundColor: '#ffffff',
  },
  errorTitle: {
    color: Brand.ink,
    fontSize: 20,
    fontWeight: 600,
  },
  errorText: {
    color: Brand.inkSoft,
    fontSize: 14,
    textAlign: 'center',
  },
  retry: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 15,
  },
});
