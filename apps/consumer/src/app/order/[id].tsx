import {
  ORDER_STATUS_LABEL,
  formatPaise,
  getOrder,
  getReorder,
  isFinal,
  orderSteps,
  slotLabel,
  transitionOrder,
  watchOrders,
} from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PayAtHandover } from '@/components/pay-at-handover';
import { RateOrder } from '@/components/rate-order';
import { TrackingMap } from '@/components/tracking-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCart } from '@/lib/cart';
import { useRiderPosition } from '@/lib/live-location';
import { supabase } from '@/lib/supabase';

type Loaded = Awaited<ReturnType<typeof getOrder>>;

const PAY_LABEL = { cash: 'cash', upi_at_handover: 'UPI' } as const;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reordering, setReordering] = useState(false);
  const cart = useCart();
  // Follow the rider only while they are carrying this order; the database stops it at delivery.
  const onTheWay = loaded?.order.status === 'out_for_delivery' && !!loaded.order.rider_id;
  const riderPosition = useRiderPosition(id, onTheWay);

  // Load once, then reload whenever the shop moves the order along.
  useEffect(() => {
    let active = true;
    const load = () =>
      getOrder(supabase, id).then(
        (next) => active && setLoaded(next),
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load this order.'),
      );
    load();
    const unsubscribe = watchOrders(supabase, `id=eq.${id}`, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [id]);

  if (error && !loaded) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText type="small">{error}</ThemedText>
      </ThemedView>
    );
  }
  if (!loaded) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const { order, deliveryOtp } = loaded;
  const steps = orderSteps(order.mode);
  const reached = steps.indexOf(order.status);
  const ended = isFinal(order.status) && reached === -1; // rejected, cancelled or expired

  async function orderAgain() {
    setReordering(true);
    setError(null);
    try {
      const { shop, available, unavailable } = await getReorder(supabase, id);
      if (!shop || available.length === 0) {
        Alert.alert('Nothing to reorder', 'None of these items are on the menu right now.');
        return;
      }
      const fillCart = () => {
        cart.fill(
          { id: shop.id, name: shop.name, doesDelivery: shop.does_delivery, doesPickup: shop.does_pickup },
          available,
        );
        router.push('/cart');
        const notes = [
          !shop.is_open && `${shop.name} is closed right now. You can place the order once it opens.`,
          unavailable.length > 0 && `No longer available: ${unavailable.join(', ')}.`,
        ].filter((note): note is string => !!note);
        if (notes.length > 0) Alert.alert('Added to your cart', [...notes, "Prices are today's prices."].join('\n\n'));
      };
      if (cart.itemCount === 0) fillCart();
      else
        Alert.alert('Replace your cart?', 'Your cart already has items. Replace them with this order?', [
          { text: 'Keep my cart', style: 'cancel' },
          { text: 'Replace', onPress: fillCart },
        ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this order again.');
    } finally {
      setReordering(false);
    }
  }

  function confirmCancel() {
    Alert.alert('Cancel this order?', 'The shop has not accepted it yet.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            const updated = await transitionOrder(supabase, { orderId: order.id, to: 'cancelled' });
            setLoaded((current) => current && { ...current, order: { ...current.order, ...updated } });
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not cancel.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, ended && styles.heroEnded]}>
          <Text style={styles.heroTitle}>{ORDER_STATUS_LABEL[order.status]}</Text>
          <Text style={styles.heroSub}>
            {order.shops?.name}
            {order.status === 'scheduled' ? '' : ` · Token #${order.token_no}`} · Order {order.code}
          </Text>
          {order.status === 'scheduled' && order.scheduled_for && order.release_at && (
            <Text style={styles.heroSub}>
              For {whenText(order.scheduled_for)}. The shop gets it at {slotLabel(new Date(order.release_at), new Date()).time}.
            </Text>
          )}
          {order.status === 'accepted' && order.prep_minutes && (
            <Text style={styles.heroSub}>The shop needs about {order.prep_minutes} minutes.</Text>
          )}
          {ended && order.cancel_reason && <Text style={styles.heroSub}>{order.cancel_reason}</Text>}
        </View>

        {!ended && (
          <ThemedView type="backgroundElement" style={styles.card}>
            {steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={[styles.dot, index <= reached && styles.dotDone]} />
                <ThemedText type={index === reached ? 'smallBold' : 'small'} themeColor={index <= reached ? 'text' : 'textSecondary'}>
                  {ORDER_STATUS_LABEL[step]}
                </ThemedText>
              </View>
            ))}
          </ThemedView>
        )}

        {!isFinal(order.status) && order.rider && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{order.rider.name || 'A CampusCart rider'} is bringing your order</ThemedText>
            {order.rider.phone && (
              <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${order.rider?.phone}`)}>
                <ThemedText type="linkPrimary">Call {order.rider.phone}</ThemedText>
              </Pressable>
            )}
          </ThemedView>
        )}

        {order.shops?.phone && <CallShop name={order.shops.name} phone={order.shops.phone} />}

        {onTheWay && <TrackingMap rider={riderPosition} dropPoint={order.drop_points} />}

        {!isFinal(order.status) && order.mode === 'delivery' && deliveryOtp && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Delivery code. Give it to whoever brings your order, only when you have it.
            </ThemedText>
            <Text style={styles.code}>{deliveryOtp}</Text>
          </ThemedView>
        )}

        {!isFinal(order.status) && order.mode === 'pickup' && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              {order.status === 'ready' ? 'Ready! Show this token at the counter.' : 'Your pickup token'}
            </ThemedText>
            <Text style={styles.code}>#{order.token_no}</Text>
          </ThemedView>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">
            {order.mode === 'delivery'
              ? `Delivery to ${order.drop_points?.name ?? 'your drop point'}${order.room_note ? `, ${order.room_note}` : ''}`
              : 'Pickup at the counter'}
          </ThemedText>
          {order.order_items.map((item) => (
            <View key={item.id} style={styles.row}>
              <ThemedText type="small" style={styles.flex}>
                {item.qty} × {item.name_snapshot}
              </ThemedText>
              <ThemedText type="small">{formatPaise(item.price_paise_snapshot * item.qty)}</ThemedText>
            </View>
          ))}
          <FeeRow label="Delivery" paise={order.delivery_fee_paise + order.small_cart_fee_paise} />
          <FeeRow label="Platform fee" paise={order.platform_fee_paise} />
          <FeeRow label="Distance and night charge" paise={order.surcharge_paise} />
          <FeeRow label={`Coupon ${order.coupon_code ?? ''}`} paise={-order.discount_paise} />
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.flex}>
              Pay {PAY_LABEL[order.pay_method]} at handover
            </ThemedText>
            <ThemedText type="smallBold">{formatPaise(order.total_paise)}</ThemedText>
          </View>
          {(order.status === 'delivered' || order.status === 'collected') && <StatusBadge label="Completed" tone="good" />}
        </ThemedView>

        {!isFinal(order.status) && (
          <PayAtHandover
            payMethod={order.pay_method}
            totalPaise={order.total_paise}
            shopName={order.shops?.name ?? 'the shop'}
            shopUpi={order.shops?.upi_vpa ?? null}
            orderCode={order.code}
            byRider={order.mode === 'delivery' && !!order.rider_id}
          />
        )}

        {(order.status === 'delivered' || order.status === 'collected') && order.completed_at && (
          <RateOrder
            orderId={order.id}
            shopName={order.shops?.name ?? 'the shop'}
            hasRider={!!order.rider_id}
            completedAt={order.completed_at}
          />
        )}

        {isFinal(order.status) && (
          <Pressable accessibilityRole="button" disabled={reordering} onPress={orderAgain} style={styles.again}>
            <Text style={styles.againText}>{reordering ? 'Checking the menu…' : 'Order again'}</Text>
          </Pressable>
        )}
        {(order.status === 'placed' || order.status === 'scheduled') && (
          <Pressable accessibilityRole="button" disabled={cancelling} onPress={confirmCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>{cancelling ? 'Cancelling…' : 'Cancel order'}</Text>
          </Pressable>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </ThemedView>
  );
}

/** "today at 6:30 PM", "tomorrow at 9 AM", "Sat 31 Oct at 1 PM". */
function whenText(iso: string): string {
  const { day, time } = slotLabel(new Date(iso), new Date());
  return `${day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day} at ${time}`;
}

function FeeRow({ label, paise }: { label: string; paise: number }) {
  if (paise === 0) return null;
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatPaise(paise)}
      </ThemedText>
    </View>
  );
}

/** The shop's number on every order, so the student can call about a delay, a missing item or the handover. */
function CallShop({ name, phone }: { name: string; phone: string }) {
  const digits = phone.replace(/\D/g, '');
  const shown = digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Call ${name}, ${shown}`}
      onPress={() => Linking.openURL(`tel:${digits.length === 10 ? `+91${digits}` : phone}`)}
      style={({ pressed }) => [styles.callShop, pressed && styles.callShopPressed]}>
      <View style={styles.callIcon}>
        <Icon name="phone" size={18} color="#ffffff" />
      </View>
      <View style={styles.flex}>
        <ThemedText type="smallBold">Questions? Call {name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {shown}
        </ThemedText>
      </View>
      <ThemedText type="linkPrimary">Call</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  callShop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  callShopPressed: {
    opacity: 0.7,
  },
  callIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  hero: {
    backgroundColor: Brand.green,
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  heroEnded: {
    backgroundColor: Brand.red,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 600,
  },
  heroSub: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 500,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Brand.green,
  },
  dotDone: {
    backgroundColor: Brand.green,
  },
  code: {
    fontSize: 40,
    fontWeight: 600,
    letterSpacing: 8,
    color: Brand.green,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  again: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  againText: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 15,
  },
  cancel: {
    borderWidth: 1,
    borderColor: Brand.red,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  cancelText: {
    color: Brand.red,
    fontWeight: 600,
    fontSize: 15,
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
