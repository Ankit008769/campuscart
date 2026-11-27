import {
  DEFAULT_FEE_RULES,
  calculateBill,
  deliveryCharge,
  deliverySurcharge,
  isNightDelivery,
  formatPaise,
  getFeeRules,
  getMyProfile,
  listDropPoints,
  placeOrder,
  rulesForShop,
  type FeeRules,
  type OrderMode,
  type PayMethod,
} from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CouponBox, type AppliedCoupon } from '@/components/coupon-box';
import { DropPointPicker } from '@/components/drop-point-picker';
import { MultiShopCheckout } from '@/components/multi-shop-checkout';
import { QtyStepper } from '@/components/qty-stepper';
import { SmartPicks } from '@/components/smart-picks';
import { TimePicker } from '@/components/time-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNeedsPhone } from '@/hooks/use-needs-phone';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { logStep } from '@/lib/events';
import { useMenus } from '@/lib/menus';
import { supabase } from '@/lib/supabase';
import { PhoneRequired } from '@/components/phone-required';
import { KeyboardScroll } from '@/components/keyboard-scroll';

type DropPoint = Awaited<ReturnType<typeof listDropPoints>>[number];

const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: 'upi_at_handover', label: 'UPI at handover' },
  { value: 'cash', label: 'Cash' },
];

export default function CartScreen() {
  const cart = useCart();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const shop = cart.shop;
  const needsPhone = useNeedsPhone();
  const { shops } = useMenus();

  const [mode, setMode] = useState<OrderMode>(shop?.doesDelivery === false ? 'pickup' : 'delivery');
  const [dropPointId, setDropPointId] = useState<string | null>(null);
  const [usualDropPointId, setUsualDropPointId] = useState<string | null>(null);
  const [roomNote, setRoomNote] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('upi_at_handover');
  const [feeRules, setFeeRules] = useState<FeeRules | null>(null);
  const [dropPoints, setDropPoints] = useState<DropPoint[] | null>(null);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [mustSchedule, setMustSchedule] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cartShopId = shop?.id;
  useEffect(() => {
    if (cartShopId) logStep('checkout_view', cartShopId);
  }, [cartShopId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([getFeeRules(supabase), listDropPoints(supabase), getMyProfile(supabase, userId)]).then(
      ([fees, points, profile]) => {
        if (!active) return;
        setFeeRules(fees);
        setDropPoints(points);
        // Start from the student's usual hostel and room; they can still change both for this order.
        setUsualDropPointId(profile.default_drop_point_id);
        if (points.some((p) => p.id === profile.default_drop_point_id)) setDropPointId(profile.default_drop_point_id);
        if (profile.room_note) setRoomNote(profile.room_note);
      },
      (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load checkout.'),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  if (cart.itemCount === 0) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText type="smallBold">Your cart is empty</ThemedText>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="linkPrimary">Back to shops</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }
  // Several shops, or products CampusCart picks the shop for: one order per shop.
  if (!shop) return <MultiShopCheckout />;

  // The shop's own free-delivery minimum, when it has one (shops.free_delivery_min_paise).
  const rules = rulesForShop(feeRules ?? DEFAULT_FEE_RULES, shops?.find((s) => s.id === shop.id));
  const chosenPoint = dropPoints?.find((p) => p.id === dropPointId);
  const bill = calculateBill(cart.subtotalPaise, mode, rules);
  const discount = Math.min(coupon?.discountPaise ?? 0, bill.subtotalPaise);
  // Far drop points and night deliveries cost extra, judged at the delivery time (place_order agrees).
  const deliverAt = slot ?? new Date();
  const surcharge = deliverySurcharge({
    mode,
    dropPointExtraPaise: chosenPoint?.extra_delivery_fee_paise ?? 0,
    at: deliverAt,
    nightSurchargePaise: rules.nightSurchargePaise ?? 0,
  });
  const night = mode === 'delivery' && isNightDelivery(deliverAt) && (rules.nightSurchargePaise ?? 0) > 0;
  const toPay = bill.totalPaise - discount + surcharge;
  const shortOfFreeDelivery = rules.smallCartLimitPaise - cart.subtotalPaise;
  const canPlace = !needsPhone && !placing && (mode === 'pickup' || !!dropPointId) && (!mustSchedule || !!slot);

  async function onPlaceOrder() {
    if (!shop) return;
    setPlacing(true);
    setError(null);
    try {
      const order = await placeOrder(supabase, {
        shopId: shop.id,
        mode,
        payMethod,
        // A one-shop cart holds only that shop's own sizes.
        items: cart.lines.flatMap((line) => (line.variantId ? [{ variantId: line.variantId, qty: line.qty }] : [])),
        dropPointId: mode === 'delivery' ? (dropPointId ?? undefined) : undefined,
        roomNote: mode === 'delivery' && roomNote.trim() ? roomNote.trim() : undefined,
        couponCode: coupon?.code,
        scheduledFor: slot ?? undefined,
      });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
      cart.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the order.');
      setPlacing(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardScroll contentContainerStyle={styles.content}>
        <ThemedText type="smallBold">{shop.name}</ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          {cart.lines.map((line) => (
            <View key={line.variantId} style={styles.row}>
              <View style={styles.flex}>
                <ThemedText type="small">{line.productName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {line.label ? `${line.label} · ` : ''}
                  {formatPaise(line.pricePaise)}
                </ThemedText>
              </View>
              <QtyStepper
                qty={line.qty}
                onAdd={() => cart.setQty(line.key, line.qty + 1)}
                onRemove={() => cart.setQty(line.key, line.qty - 1)}
              />
            </View>
          ))}
        </ThemedView>

        <SmartPicks />

        <ThemedText type="smallBold">How do you want it?</ThemedText>
        <View style={styles.segments}>
          {(['delivery', 'pickup'] as const).map((option) => {
            const offered = option === 'delivery' ? shop.doesDelivery : shop.doesPickup;
            return (
              <Pressable
                key={option}
                disabled={!offered}
                onPress={() => setMode(option)}
                style={[styles.segment, mode === option && styles.segmentActive, !offered && styles.disabled]}>
                <Text style={[styles.segmentText, mode === option && styles.segmentTextActive]}>
                  {option === 'delivery' ? 'Deliver to me' : 'I will pick it up'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'delivery' && (
          <>
            <ThemedText type="smallBold">Where should it come?</ThemedText>
            {!dropPoints && !error && <ActivityIndicator />}
            {dropPoints && (
              <DropPointPicker points={dropPoints} value={dropPointId} onChange={setDropPointId} usualId={usualDropPointId} />
            )}
            <TextInput
              value={roomNote}
              onChangeText={setRoomNote}
              placeholder="Room or wing (optional), e.g. B-214"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              maxLength={60}
            />
          </>
        )}

        <TimePicker
          shopId={shop.id}
          mode={mode}
          dropPointId={dropPointId}
          value={slot}
          onChange={setSlot}
          onMustSchedule={setMustSchedule}
        />

        <ThemedText type="smallBold">How will you pay?</ThemedText>
        <View style={styles.segments}>
          {PAY_METHODS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setPayMethod(option.value)}
              style={[styles.segment, payMethod === option.value && styles.segmentActive]}>
              <Text style={[styles.segmentText, payMethod === option.value && styles.segmentTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <CouponBox shopId={shop.id} subtotalPaise={cart.subtotalPaise} applied={coupon} onChange={setCoupon} />

        <ThemedView type="backgroundElement" style={styles.card}>
          <BillRow label="Item total" paise={bill.subtotalPaise} />
          {mode === 'delivery' && <BillRow label="Delivery" paise={deliveryCharge(bill)} />}
          <BillRow label="Platform fee" paise={bill.platformFeePaise} />
          {surcharge > 0 && <BillRow label={night ? 'Night and distance charge' : 'Distance charge'} paise={surcharge} />}
          {discount > 0 && <BillRow label={`Coupon ${coupon?.code}`} paise={-discount} />}
          <View style={styles.divider} />
          <BillRow label="To pay" paise={toPay} bold />
          {bill.smallCartFeePaise > 0 && shortOfFreeDelivery > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Add {formatPaise(shortOfFreeDelivery)} more for free delivery.
            </ThemedText>
          )}
        </ThemedView>

        {error && <Text style={styles.error}>{error}</Text>}
      </KeyboardScroll>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {needsPhone && <PhoneRequired />}
        <Pressable
          accessibilityRole="button"
          disabled={!canPlace}
          onPress={onPlaceOrder}
          style={[styles.placeButton, !canPlace && styles.disabled]}>
          {placing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.placeText}>
              {mode === 'delivery' && !dropPointId
                ? 'Choose where to deliver'
                : mustSchedule && !slot
                  ? 'Pick a time'
                  : `${slot ? 'Schedule order' : 'Place order'} · ${formatPaise(toPay)}`}
            </Text>
          )}
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function BillRow({ label, paise, bold }: { label: string; paise: number; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={bold ? 'smallBold' : 'small'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'smallBold' : 'small'}>{formatPaise(paise)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: 140,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
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
  segments: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two + Spacing.one,
  },
  segmentActive: {
    backgroundColor: Brand.green,
  },
  segmentText: {
    color: Brand.green,
    fontWeight: 600,
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#88888855',
  },
  error: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three,
  },
  placeButton: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  placeText: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.45,
  },
});
