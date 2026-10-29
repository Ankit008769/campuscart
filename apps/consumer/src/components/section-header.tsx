import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** A heading inside a screen, with an optional short action on the right ("See all"). */
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string | null;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <ThemedText type="section" accessibilityRole="header">
          {title}
        </ThemedText>
        {!!subtitle && (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        )}
      </View>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={12} style={styles.action}>
          <ThemedText type="linkPrimary">{action.label}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  action: {
    minHeight: 44,
    justifyContent: 'flex-end',
  },
});
