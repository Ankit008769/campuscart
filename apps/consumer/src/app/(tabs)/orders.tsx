import { ORDER_STATUS_LABEL, formatPaise, isFinal, listMyOrders, slotLabel, watchOrders } from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { SectionHeader } from '@/components/section-header';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardScroll } from '@/components/keyboard-scroll';
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

/** When the order is for (a scheduled slot) or when it was placed, then how it comes and the total. */
function orderLine(order: Order): string {
  const when =
    order.status === 'scheduled' && order.scheduled_for
      ? (() => {
          const slot = slotLabel(new Date(order.scheduled_for), new Date());
          return `For ${slot.day} ${slot.time}`;
        })()
      : new Date(order.placed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const how =
    order.mode === 'delivery' ? 'Delivery' : order.status === 'scheduled' ? 'Pickup' : `Pickup, token #${order.token_no}`;
  return `${when} · ${how} · ${formatPaise(order.total_paise)}`;
}

export default function OrdersScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = () =>
      listMyOrders(supabase, userId).then(
        (next) => {
          if (!active) return;
          setOrders(next);
          setError(null);
        },
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load your orders.'),
      );
    load();
    const unsubscribe = watchOrders(supabase, `student_id=eq.${userId}`, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, attempt]);

  const current = orders?.filter((order) => !isFinal(order.status)) ?? [];
  const past = orders?.filter((order) => isFinal(order.status)) ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <ThemedText type="subtitle" accessibilityRole="header">
            Your orders
          </ThemedText>

          {!orders && !error && <SkeletonList label="Loading your orders" />}
          {error && !orders && (
            <EmptyState
              icon="error"
              title="Couldn't load your orders"
              body={error}
              action={{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }}
            />
          )}
          {orders?.length === 0 && (
            <EmptyState
              icon="orders"
              title="No orders yet"
              body="Pick a shop, add a few items and your first order shows up here."
              action={{ label: 'Browse shops', onPress: () => router.navigate('/') }}
            />
          )}

          {current.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="On the way" subtitle="Updates live as the shop works on them" />
              {current.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </View>
          )}

          {past.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Past orders" />
              {past.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </View>
          )}

          <View style={styles.section}>
            <SectionHeader title="Ordering with friends?" subtitle="Join their group order with its 6-letter code." />
            <JoinGroup />
          </View>
        </KeyboardScroll>
      </SafeAreaView>
    </ThemedView>
  );
}

function OrderCard({ order }: { order: Order }) {
  const theme = useTheme();
  return (
    <Card
      accessibilityHint="Opens the order"
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}>
      <View style={styles.row}>
        <Icon name="store" size={18} color={theme.textSecondary} />
        <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
          {order.shops?.name}
        </ThemedText>
        <StatusBadge label={ORDER_STATUS_LABEL[order.status]} tone={toneOf(order)} />
      </View>
      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
          {orderLine(order)}
        </ThemedText>
        <Icon name="chevron" size={18} color={theme.textSecondary} />
      </View>
    </Card>
  );
}

/** Joins a friend's group order by its 6-letter code. */
function JoinGroup() {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const ready = code.length === 6;
  return (
    <View style={styles.row}>
      <TextInput
        value={code}
        onChangeText={(text) => setCode(text.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        accessibilityLabel="Group order code"
        placeholder="ABC123"
        placeholderTextColor={theme.textSecondary}
        style={[styles.codeInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={() => router.push({ pathname: '/group/join/[code]', params: { code } })}
        style={({ pressed }) => [styles.join, !ready && styles.joinDisabled, pressed && styles.pressed]}>
        <Text style={styles.joinText}>Join</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  codeInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 3,
  },
  join: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinDisabled: {
    opacity: 0.4,
  },
  joinText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.8,
  },
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
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
