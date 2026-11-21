import { Radius } from '@campuscart/ui';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A grey placeholder the shape of content that is still loading, so the screen doesn't jump. */
export function SkeletonBlock({ width = '100%', height }: { width?: DimensionValue; height: number }) {
  const theme = useTheme();
  return <View style={{ width, height, borderRadius: Radius.small, backgroundColor: theme.backgroundSelected }} />;
}

/** Placeholder cards for a list that is loading, announced once to screen readers. */
export function SkeletonList({ count = 3, label }: { count?: number; label: string }) {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <SkeletonBlock width="55%" height={16} />
          <SkeletonBlock width="80%" height={12} />
          <SkeletonBlock width="40%" height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
