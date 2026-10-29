import { Brand, Radius } from '@campuscart/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** What a screen shows when it has nothing yet (or couldn't load): why, and the next thing to do. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.badge, { backgroundColor: theme.background }]}>
        <Icon name={icon} size={28} color={theme.tint} />
      </View>
      <ThemedText type="section" style={styles.center}>
        {title}
      </ThemedText>
      {!!body && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {body}
        </ThemedText>
      )}
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  center: {
    textAlign: 'center',
  },
  button: {
    marginTop: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 800,
  },
});
