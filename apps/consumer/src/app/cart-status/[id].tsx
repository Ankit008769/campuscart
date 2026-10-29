import { ORDER_STATUS_LABEL, formatPaise, getCart, isFinal, watchOrders } from '@campuscart/core';
import { Radius, StatusBadge } from '@campuscart/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Cart = Awaited<ReturnType<typeof getCart>>;
type Order = Cart['orders'][number];

const dropped = (o: Order) => o.status === 'rejected' || o.status === 'cancelled' || o.status === 'expired';

/** A multi-shop cart: each shop's order, live, with any that dropped out and why. */
export default function CartStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      getCart(supabase, id).then(
        (next) => active && setCart(next),
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load this cart.'),
      );
    load();
    const unsubscribe = watchOrders(supabase, `cart_id=eq.${id}`, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [id]);

  if (!cart) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        {error ? <Text>{error}</Text> : <ActivityIndicator />}
      </ThemedView>
    );
  }

  const stillComing = cart.orders.filter((o) => !dropped(o));
  const lost = cart.orders.filter(dropped);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">
          {cart.orders.length} {cart.orders.length === 1 ? 'order' : 'orders'} · {formatPaise(cart.total_paise)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Each shop prepares and sends its own part. You pay each order when it arrives.
        </ThemedText>
        {lost.length > 0 && stillComing.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {lost.length === 1 ? 'One shop' : `${lost.length} shops`} couldn&apos;t take {lost.length === 1 ? 'its' : 'their'} part. The rest is
            still coming, and the fees now sit with the orders that are.
          </ThemedText>
        )}

        {cart.orders.map((order) => (
          <Pressable
            key={order.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}>
            <ThemedView type="backgroundElement" style={[styles.card, dropped(order) && styles.dropped]}>
              <View style={styles.row}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {order.shops?.name}
                </ThemedText>
                <StatusBadge
                  label={ORDER_STATUS_LABEL[order.status]}
                  tone={dropped(order) ? 'bad' : isFinal(order.status) ? 'good' : 'neutral'}
                />
              </View>
              {order.order_items.map((item) => (
                <ThemedText key={item.id} type="small" themeColor={dropped(order) ? 'textSecondary' : 'text'}>
                  {item.qty} × {item.name_snapshot}
                </ThemedText>
              ))}
              {dropped(order) ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Dropped{order.cancel_reason ? `: ${order.cancel_reason}` : ''}. Nothing to pay for these.
                </ThemedText>
              ) : (
                <ThemedText type="small">
                  Token #{order.token_no} · pay {formatPaise(order.total_paise)}
                </ThemedText>
              )}
            </ThemedView>
          </Pressable>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  dropped: {
    opacity: 0.6,
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
