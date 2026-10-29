import { ORDER_STATUS_LABEL, formatPaise, isFinal, listMyOrders, slotLabel, watchOrders } from '@campuscart/core';
import { Radius, StatusBadge } from '@campuscart/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Order = Awaited<ReturnType<typeof listMyOrders>>[number];

function toneOf(order: Order) {
  if (order.status === 'delivered' || order.status === 'collected') return 'good';
  if (isFinal(order.status)) return 'bad';
  return 'neutral';
}

export default function OrdersScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = () =>
      listMyOrders(supabase, userId).then(
        (next) => active && setOrders(next),
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load your orders.'),
      );
    load();
    const unsubscribe = watchOrders(supabase, `student_id=eq.${userId}`, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Your orders</ThemedText>

          {!orders && !error && <ActivityIndicator style={styles.loading} />}
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          {orders?.length === 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">No orders yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Pick a shop on Home, add a few items and place your first order.
              </ThemedText>
            </ThemedView>
          )}

          {orders?.map((order) => (
            <Pressable
              key={order.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.row}>
                  <ThemedText type="smallBold" style={styles.flex}>
                    {order.shops?.name}
                  </ThemedText>
                  <StatusBadge label={ORDER_STATUS_LABEL[order.status]} tone={toneOf(order)} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {order.status === 'scheduled' && order.scheduled_for
                    ? `For ${slotLabel(new Date(order.scheduled_for), new Date()).day} ${slotLabel(new Date(order.scheduled_for), new Date()).time}`
                    : new Date(order.placed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{' '}
                  ·{' '}
                  {order.mode === 'delivery' ? 'Delivery' : order.status === 'scheduled' ? 'Pickup' : `Pickup, token #${order.token_no}`} · {formatPaise(order.total_paise)}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}

          <ThemedView type="backgroundElement" style={[styles.card, styles.account]}>
            <ThemedText type="small" themeColor="textSecondary">
              Signed in as {session?.user.email}
            </ThemedText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/profile')}>
              <ThemedText type="linkPrimary">Edit profile</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/rider')}>
              <ThemedText type="linkPrimary">Deliver for CampusCart</ThemedText>
            </Pressable>
            <JoinGroup />
            <Pressable accessibilityRole="button" onPress={signOut}>
              <ThemedText type="linkPrimary">Sign out</ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Joins a friend's group order by its 6-letter code. */
function JoinGroup() {
  const theme = useTheme();
  const [code, setCode] = useState('');
  return (
    <View style={styles.row}>
      <TextInput
        value={code}
        onChangeText={(text) => setCode(text.toUpperCase())}
        autoCapitalize="characters"
        maxLength={6}
        placeholder="Group order code"
        placeholderTextColor={theme.textSecondary}
        style={[styles.codeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <Pressable
        accessibilityRole="button"
        disabled={code.length !== 6}
        onPress={() => router.push({ pathname: '/group/join/[code]', params: { code } })}>
        <ThemedText type="linkPrimary">Join</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
    letterSpacing: 2,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  loading: {
    marginVertical: Spacing.four,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  account: {
    marginTop: Spacing.four,
  },
});
