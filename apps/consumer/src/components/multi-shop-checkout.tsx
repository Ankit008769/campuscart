import {
  DEFAULT_FEE_RULES,
  deliveryCharge,
  deliverySurcharge,
  formatPaise,
  getFeeRules,
  getMyProfile,
  listDropPoints,
  placeCart,
  previewCart,
  routeCart,
  type CartRoute,
  type FeeRules,
  type OrderMode,
  type PayMethod,
} from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CouponBox, type AppliedCoupon } from '@/components/coupon-box';
import { DropPointPicker } from '@/components/drop-point-picker';
import { QtyStepper } from '@/components/qty-stepper';
import { SmartPicks } from '@/components/smart-picks';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { supabase } from '@/lib/supabase';
import { PhoneRequired } from '@/components/phone-required';
import { useNeedsPhone } from '@/hooks/use-needs-phone';

type DropPoint = Awaited<ReturnType<typeof listDropPoints>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

/**
 * Checkout for a cart with several shops, or with products CampusCart picks the shop for. The
 * preview comes from route_cart, the same routing place_cart uses; fees are charged once.
 */
export function MultiShopCheckout() {
  const cart = useCart();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [mode, setMode] = useState<OrderMode>('delivery');
  const [dropPointId, setDropPointId] = useState<string | null>(null);
  const [usualDropPointId, setUsualDropPointId] = useState<string | null>(null);
  const [roomNote, setRoomNote] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('upi_at_handover');
  const [rules, setRules] = useState<FeeRules>(DEFAULT_FEE_RULES);
  const [dropPoints, setDropPoints] = useState<DropPoint[]>([]);
  const [routes, setRoutes] = useState<CartRoute[] | null>(null);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([getFeeRules(supabase), listDropPoints(supabase), getMyProfile(supabase, userId)]).then(
      ([fees, points, profile]) => {
        if (!active) return;
        setRules(fees);
        setDropPoints(points);
        setUsualDropPointId(profile.default_drop_point_id);
        if (points.some((p) => p.id === profile.default_drop_point_id)) setDropPointId(profile.default_drop_point_id);
        if (profile.room_note) setRoomNote(profile.room_note);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  // Ask the database where each line would go, whenever the cart, mode or drop point changes.
  const itemsKey = JSON.stringify(cart.items());
  useEffect(() => {
    let active = true;
    routeCart(supabase, JSON.parse(itemsKey), mode, mode === 'delivery' ? dropPointId : null).then(
      (next) => active && setRoutes(next),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [itemsKey, mode, dropPointId]);

  const preview = routes ? previewCart(routes, mode, rules) : null;
  const primary = preview?.shops[0];
  const point = dropPoints.find((p) => p.id === dropPointId);
  const surcharge = deliverySurcharge({
    mode,
    dropPointExtraPaise: point?.extra_delivery_fee_paise ?? 0,
    at: new Date(),
    nightSurchargePaise: rules.nightSurchargePaise ?? 0,
  });
  const discount = Math.min(coupon?.discountPaise ?? 0, primary?.subtotalPaise ?? 0);
  const toPay = preview ? preview.bill.totalPaise + surcharge - discount : 0;
  const needsPhone = useNeedsPhone();
  const canPlace = !needsPhone && !!preview && preview.problems.length === 0 && preview.shops.length > 0 && !placing && (mode === 'pickup' || !!dropPointId);

  async function onPlace() {
    setPlacing(true);
    setError(null);
    try {
      const cartId = await placeCart(supabase, {
        items: cart.items(),
        mode,
        payMethod,
        dropPointId: mode === 'delivery' ? (dropPointId ?? undefined) : undefined,
        roomNote: mode === 'delivery' && roomNote.trim() ? roomNote.trim() : undefined,
        couponCode: coupon?.code,
      });
      router.replace({ pathname: '/cart-status/[id]', params: { id: cartId } });
      cart.clear();
    } catch (e) {
      setError(messageOf(e));
      setPlacing(false);
    }
  }

  // The cart's own lines, matched to where route_cart sent them (both keep the cart's order).
  const lineFor = (route: CartRoute) => cart.lines[route.line - 1];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {!preview && !error && <ActivityIndicator />}
        {preview?.problems.map((problem) => (
          <Text key={problem} style={styles.error}>
            {problem}. Remove it to order the rest.
          </Text>
        ))}
        {routes
          ?.filter((r) => r.problem)
          .map((route) => {
            const line = lineFor(route);
            return line ? (
              <View key={`problem-${route.line}`} style={styles.row}>
                <ThemedText type="small" style={styles.flex}>
                  {line.productName}
                </ThemedText>
                <Pressable onPress={() => cart.setQty(line.key, 0)}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            ) : null;
          })}

        {preview?.shops.map((shop, index) => (
          <ThemedView key={shop.shopId} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              {shop.shopName}
              {index === 0 && preview.shops.length > 1 ? ' · carries the delivery' : ''}
            </ThemedText>
            {shop.lines.map((route) => {
              const line = lineFor(route);
              if (!line) return null;
              return (
                <View key={route.line} style={styles.row}>
                  <View style={styles.flex}>
                    <ThemedText type="small">{route.product_name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {line.label ? `${line.label} · ` : ''}
                      {formatPaise(route.price_paise)}
                      {line.masterProductId ? ' · best shop picked for you' : ''}
                    </ThemedText>
                  </View>
                  <QtyStepper
                    qty={line.qty}
                    onAdd={() => cart.setQty(line.key, line.qty + 1)}
                    onRemove={() => cart.setQty(line.key, line.qty - 1)}
                  />
                </View>
              );
            })}
          </ThemedView>
        ))}

        <SmartPicks />

        <ThemedText type="smallBold">How do you want it?</ThemedText>
        <View style={styles.segments}>
          {(['delivery', 'pickup'] as const).map((option) => (
            <Pressable key={option} onPress={() => setMode(option)} style={[styles.segment, mode === option && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === option && styles.segmentTextActive]}>
                {option === 'delivery' ? 'Deliver to me' : 'I will pick it up'}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode === 'pickup' && preview && preview.shops.length > 1 && (
          <ThemedText type="small" themeColor="textSecondary">
            You collect from each shop, with each shop&apos;s own token.
          </ThemedText>
        )}
        {mode === 'delivery' && (
          <>
            <DropPointPicker points={dropPoints} value={dropPointId} onChange={setDropPointId} usualId={usualDropPointId} />
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

        <ThemedText type="smallBold">How will you pay?</ThemedText>
        <View style={styles.segments}>
          {(['upi_at_handover', 'cash'] as const).map((option) => (
            <Pressable key={option} onPress={() => setPayMethod(option)} style={[styles.segment, payMethod === option && styles.segmentActive]}>
              <Text style={[styles.segmentText, payMethod === option && styles.segmentTextActive]}>
                {option === 'cash' ? 'Cash' : 'UPI at handover'}
              </Text>
            </Pressable>
          ))}
        </View>

        {primary && <CouponBox shopId={primary.shopId} subtotalPaise={primary.subtotalPaise} applied={coupon} onChange={setCoupon} />}

        {preview && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <BillRow label="Item total" paise={preview.bill.subtotalPaise} />
            {deliveryCharge(preview.bill) > 0 && <BillRow label="Delivery (once for the cart)" paise={deliveryCharge(preview.bill)} />}
            <BillRow label="Platform fee" paise={preview.bill.platformFeePaise} />
            {surcharge > 0 && <BillRow label="Distance and night charge" paise={surcharge} />}
            {discount > 0 && <BillRow label={`Coupon ${coupon?.code}`} paise={-discount} />}
            <BillRow label="To pay" paise={toPay} bold />
            {preview.shops.length > 1 && (
              <ThemedText type="small" themeColor="textSecondary">
                Each shop sends its own order, and you pay each one when it arrives.
              </ThemedText>
            )}
          </ThemedView>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {needsPhone && <PhoneRequired />}
        <Pressable accessibilityRole="button" disabled={!canPlace} onPress={onPlace} style={[styles.placeButton, !canPlace && styles.disabled]}>
          {placing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.placeText}>
              {mode === 'delivery' && !dropPointId
                ? 'Choose where to deliver'
                : `Place ${preview && preview.shops.length > 1 ? `${preview.shops.length} orders` : 'order'} · ${formatPaise(toPay)}`}
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
  remove: {
    color: Brand.red,
    fontWeight: 500,
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
