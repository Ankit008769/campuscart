import { Brand, Radius } from '@campuscart/ui';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';

const ROWS: { icon: IconName; title: string; hint: string; href: Href }[] = [
  { icon: 'edit', title: 'Your profile', hint: 'Name, mobile number and usual hostel', href: '/profile' },
  { icon: 'print', title: 'Print Store', hint: 'Send a PDF, get it printed', href: '/print' },
  { icon: 'rider', title: 'Deliver for CampusCart', hint: 'Earn by delivering to hostels', href: '/rider' },
];

export default function AccountScreen() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const name: string = session?.user.user_metadata.full_name ?? 'Student';
  const email = session?.user.email ?? '';

  async function onSignOut() {
    setError(null);
    try {
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign out. Please try again.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.flex}>
              <ThemedText type="section" accessibilityRole="header" numberOfLines={1}>
                {name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {email}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
            {ROWS.map((row, i) => (
              <Pressable
                key={row.title}
                accessibilityRole="button"
                accessibilityHint={row.hint}
                onPress={() => router.push(row.href)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}>
                <View style={[styles.rowIcon, { backgroundColor: theme.background }]}>
                  <Icon name={row.icon} size={20} color={theme.tint} />
                </View>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{row.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.hint}
                  </ThemedText>
                </View>
                <Icon name="chevron" size={20} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            style={({ pressed }) => [
              styles.row,
              styles.signOut,
              { backgroundColor: theme.backgroundElement },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <View style={[styles.rowIcon, { backgroundColor: theme.background }]}>
              <Icon name="logout" size={20} color={Brand.red} />
            </View>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Brand.ink,
    fontSize: 24,
    fontWeight: 800,
  },
  flex: {
    flex: 1,
  },
  group: {
    borderRadius: Radius.large,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    borderRadius: Radius.large,
  },
  signOutText: {
    color: Brand.red,
    fontSize: 15,
    fontWeight: 800,
  },
  error: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
    textAlign: 'center',
  },
});
