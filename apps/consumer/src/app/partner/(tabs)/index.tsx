import {
  ACCEPT_WINDOW_MS,
  formatPaise,
  listShopOrders,
  loginIdOf,
  printFileLink,
  transitionOrder,
  watchCatalog,
  watchOrders,
  type OrderStatus,
} from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShopRiderCash } from '@/components/shop-rider-cash';
import { OrderItemsEditor } from '@/components/order-items-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { loadMyShops, type MyShop } from '@/lib/my-shop';
import { useNewOrderAlarm } from '@/lib/new-order-alarm';
import { supabase } from '@/lib/supabase';

type Order = Awaited<ReturnType<typeof listShopOrders>>[number];

const TABS: { name: string; statuses: OrderStatus[] }[] = [
  { name: 'New', statuses: ['placed'] },
  { name: 'Preparing', statuses: ['accepted'] },
  { name: 'Ready', statuses: ['ready', 'out_for_delivery'] },
];
const PREP_CHOICES = [5, 10, 15];
const REJECT_REASONS = ['Item out of stock', 'Closing now', 'Too busy right now'];
// After accepting: the student is told the shop cancelled, with this reason, and pays nothing.
const CANCEL_REASONS = ['Item out of stock', 'Accepted by mistake', 'Closing now', 'Cannot make it now'];
const PAY_LABEL = { cash: 'cash', upi_at_handover: 'UPI' } as const;

export default function OrdersScreen() {
  const { session, signOut } = useAuth();
  const signedInAs = loginIdOf(session?.user.email) ?? session?.user.email;
  // Every outlet this login takes orders for (one owner can run several on one phone).
  // undefined while loading, empty when the account has no shop.
  const [shops, setShops] = useState<MyShop[] | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingOpen, setSavingOpen] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const alarm = useNewOrderAlarm(orders.filter((o) => o.status === 'placed').map((o) => o.id));

  useEffect(() => {
    let active = true;
    loadMyShops().then(
      (found) => active && setShops(found),
      (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load your shop.'),
    );
    return () => {
      active = false;
    };
  }, []);

  // Open/closed set from another phone or the website shows here at once.
  useEffect(
    () =>
      watchCatalog(supabase, () => {
        loadMyShops().then(setShops, () => {});
      }),
    [],
  );

  // Live orders from every outlet: reload on any change. New orders ring through useNewOrderAlarm.
  const shopIds = shops?.map((s) => s.id).join(',') ?? '';
  useEffect(() => {
    if (!shopIds) return;
    const ids = shopIds.split(',');
    let active = true;
    const load = () =>
      listShopOrders(supabase, ids).then(
        (next) => active && setOrders(next),
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load orders.'),
      );
    load();
    const unsubscribes = ids.map((id) => watchOrders(supabase, `shop_id=eq.${id}`, load));
    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [shopIds]);

  // Keep the "accept within" countdowns moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  async function setOpen(shop: MyShop, isOpen: boolean) {
    setSavingOpen(shop.id);
    setError(null);
    const { data, error: saveError } = await supabase
      .from('shops')
      .update({ is_open: isOpen })
      .eq('id', shop.id)
      .select('is_open')
      .single();
    if (saveError) setError(saveError.message);
    else setShops((prev) => prev?.map((s) => (s.id === shop.id ? { ...s, is_open: data.is_open } : s)));
    setSavingOpen(null);
  }

  const visible = orders.filter((o) => TABS[tab].statuses.includes(o.status));
  const several = (shops?.length ?? 0) > 1;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {shops === undefined && !error && <ActivityIndicator style={styles.loading} />}

          {shops?.length === 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">This account isn&apos;t linked to a shop yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Ask the CampusCart team to add {signedInAs} to your shop, then sign in again.
              </ThemedText>
            </ThemedView>
          )}

          {shops && shops.length > 0 && (
            <>
              <ThemedText type="subtitle">{several ? 'Orders' : shops[0].name}</ThemedText>
              {several && (
                <ThemedText type="small" themeColor="textSecondary">
                  Every order from {shops.map((s) => s.name).join(', ')} comes here. Each card says which outlet it is for.
                </ThemedText>
              )}

              {alarm.ringing && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Stop the new order alarm"
                  onPress={() => {
                    alarm.silence();
                    setTab(0);
                  }}
                  style={styles.alarm}>
                  <Text style={styles.alarmTitle}>New order! Tap to stop the ringing</Text>
                  <Text style={styles.alarmText}>Accept or reject it within {ACCEPT_WINDOW_MS / 60000} minutes, or it is cancelled.</Text>
                </Pressable>
              )}

              <ThemedView type="backgroundElement" style={styles.card}>
                {shops.map((shop) => (
                  <View key={shop.id} style={styles.row}>
                    <View style={[styles.flex, styles.openLabel]}>
                      <ThemedText type="smallBold">{several ? shop.name : 'Accepting orders'}</ThemedText>
                      <StatusBadge label={shop.is_open ? 'Open' : 'Closed'} tone={shop.is_open ? 'good' : 'bad'} />
                    </View>
                    <Switch
                      accessibilityLabel={`${shop.name} accepting orders`}
                      value={shop.is_open}
                      onValueChange={(isOpen) => setOpen(shop, isOpen)}
                      disabled={savingOpen === shop.id}
                      trackColor={{ true: Brand.green }}
                    />
                  </View>
                ))}
              </ThemedView>

              <View style={styles.tabs}>
                {TABS.map((t, index) => {
                  const count = orders.filter((o) => t.statuses.includes(o.status)).length;
                  return (
                    <Pressable key={t.name} onPress={() => setTab(index)} style={[styles.tab, tab === index && styles.tabActive]}>
                      <Text style={[styles.tabText, tab === index && styles.tabTextActive]}>
                        {t.name} ({count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {visible.length === 0 && (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {tab === 0
                      ? `No new orders. New ones ring until someone taps; accept within ${ACCEPT_WINDOW_MS / 60000} minutes or they are cancelled.`
                      : 'Nothing here right now.'}
                  </ThemedText>
                </ThemedView>
              )}

              {visible.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  outlet={several ? order.shops?.name : undefined}
                  now={now}
                  onError={setError}
                  onHandled={alarm.handled}
                />
              ))}

              {shops.map((shop) => (
                <ShopRiderCash key={shop.id} shopId={shop.id} orders={orders} />
              ))}
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <ThemedView type="backgroundElement" style={[styles.card, styles.account]}>
            <ThemedText type="small" themeColor="textSecondary">
              Signed in as {signedInAs}
            </ThemedText>
            <Pressable accessibilityRole="button" onPress={signOut}>
              <ThemedText type="linkPrimary">Sign out</ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function OrderCard({
  order,
  outlet,
  now,
  onError,
  onHandled,
}: {
  order: Order;
  /** Which outlet it is for, when this login takes orders for several. */
  outlet?: string;
  now: number;
  onError: (message: string | null) => void;
  onHandled: (orderId: string) => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [code, setCode] = useState('');
  // Accepted or packed, and still at the shop: the shop can still call it off.
  const cancellable = order.status === 'accepted' || order.status === 'ready';

  const placedAgoMin = Math.max(0, Math.floor((now - Date.parse(order.released_at ?? order.placed_at)) / 60000));
  const acceptLeftSec = Math.max(0, Math.round((ACCEPT_WINDOW_MS - (now - Date.parse(order.released_at ?? order.placed_at))) / 1000));

  async function move(to: OrderStatus, extra: { note?: string; code?: string; prepMinutes?: number } = {}) {
    // Stop the ring now; the list only reloads once the server has the new status.
    if (to === 'accepted' || to === 'rejected') onHandled(order.id);
    setBusy(true);
    onError(null);
    try {
      await transitionOrder(supabase, { orderId: order.id, to, ...extra });
      // The live subscription reloads the list with the new status.
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update the order.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.flex}>
          #{order.token_no} · {order.mode === 'delivery' ? 'Delivery' : 'Pickup'}
        </ThemedText>
        {outlet && (
          <View style={styles.outlet}>
            <Text style={styles.outletText} numberOfLines={1}>
              {outlet}
            </Text>
          </View>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {placedAgoMin === 0 ? 'just now' : `${placedAgoMin} min ago`}
        </ThemedText>
      </View>

      {order.status === 'placed' && (
        <StatusBadge
          label={
            acceptLeftSec > 0
              ? `Accept within ${Math.floor(acceptLeftSec / 60)}:${String(acceptLeftSec % 60).padStart(2, '0')}`
              : 'Expiring'
          }
          tone="bad"
        />
      )}

      <View style={styles.row}>
        <ThemedText type="small" style={styles.flex}>
          {order.profiles?.name || 'Student'}
          {order.mode === 'delivery' ? ` · ${order.drop_points?.name ?? ''}${order.room_note ? `, ${order.room_note}` : ''}` : ''}
        </ThemedText>
        {order.profiles?.phone && (
          <Pressable onPress={() => Linking.openURL(`tel:${order.profiles?.phone}`)}>
            <ThemedText type="linkPrimary">Call</ThemedText>
          </Pressable>
        )}
      </View>
      {order.mode === 'delivery' && order.drop_points?.gate_only && (
        <ThemedText type="small" themeColor="textSecondary">
          Hand over at the hostel reception.
        </ThemedText>
      )}
      {order.rider && order.status !== 'placed' && (
        <View style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Rider: {order.rider.name || 'CampusCart rider'}
          </ThemedText>
          {order.rider.phone && (
            <Pressable onPress={() => Linking.openURL(`tel:${order.rider?.phone}`)}>
              <ThemedText type="linkPrimary">Call rider</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      <OrderItemsEditor orderId={order.id} status={order.status} items={order.order_items} onError={onError} />
      {order.print_jobs &&
        (order.print_jobs.file_deleted_at ? (
          <ThemedText type="small" themeColor="textSecondary">
            The PDF has been deleted.
          </ThemedText>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const path = order.print_jobs?.file_path;
              if (!path) return;
              // A fresh 10-minute link each time; only this shop's staff can make one.
              printFileLink(supabase, path).then(
                (url) => Linking.openURL(url),
                (e: unknown) => onError(e instanceof Error ? e.message : 'Could not open the PDF.'),
              );
            }}>
            <ThemedText type="linkPrimary">Open the PDF to print ({order.print_jobs.double_sided ? 'both sides' : 'one side'})</ThemedText>
          </Pressable>
        ))}
      <ThemedText type="smallBold">
        Collect {formatPaise(order.total_paise)} by {PAY_LABEL[order.pay_method]}
      </ThemedText>

      {order.status === 'placed' && !rejecting && (
        <View style={styles.actions}>
          {PREP_CHOICES.map((minutes) => (
            <ActionButton
              key={minutes}
              label={`Accept · ${minutes} min`}
              disabled={busy}
              onPress={() => move('accepted', { prepMinutes: minutes })}
            />
          ))}
          <ActionButton label="Reject" tone="bad" disabled={busy} onPress={() => setRejecting(true)} />
        </View>
      )}
      {order.status === 'placed' && rejecting && (
        <View style={styles.actions}>
          {REJECT_REASONS.map((reason) => (
            <ActionButton key={reason} label={reason} tone="bad" disabled={busy} onPress={() => move('rejected', { note: reason })} />
          ))}
          <ActionButton label="Back" tone="quiet" disabled={busy} onPress={() => setRejecting(false)} />
        </View>
      )}
      {cancellable && cancelling && (
        <View style={styles.cancelBox}>
          <ThemedText type="smallBold">Why are you cancelling?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The student is told right away, with this reason, and pays nothing.
            {order.status === 'accepted' && order.order_items.length > 1
              ? ' Only one item ran out? Use "Some items not in stock?" above instead and keep the order.'
              : ''}
          </ThemedText>
          <View style={styles.actions}>
            {CANCEL_REASONS.map((reason) => (
              <ActionButton key={reason} label={reason} tone="bad" disabled={busy} onPress={() => move('cancelled', { note: reason })} />
            ))}
            <ActionButton label="Keep the order" tone="quiet" disabled={busy} onPress={() => setCancelling(false)} />
          </View>
        </View>
      )}
      {order.status === 'accepted' && !cancelling && (
        <ActionButton label="Mark packed and ready" disabled={busy} onPress={() => move('ready')} />
      )}
      {order.status === 'ready' && order.mode === 'delivery' && !cancelling && (
        <ActionButton
          label={order.rider ? 'Handed to the rider' : 'Out for delivery'}
          disabled={busy}
          onPress={() => move('out_for_delivery')}
        />
      )}
      {order.status === 'out_for_delivery' && order.rider_id && (
        <ThemedText type="small" themeColor="textSecondary">
          With the rider. They finish it with the student&apos;s code.
        </ThemedText>
      )}
      {((order.status === 'out_for_delivery' && !order.rider_id) || (order.status === 'ready' && order.mode === 'pickup' && !cancelling)) && (
        <View style={styles.row}>
          <TextInput
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
            placeholder={order.mode === 'delivery' ? "Student's 4-digit code" : 'Token number'}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ActionButton
            label={order.mode === 'delivery' ? 'Delivered' : 'Handed over'}
            disabled={busy || code.length === 0}
            onPress={() =>
              move(order.mode === 'delivery' ? 'delivered' : 'collected', {
                code,
              })
            }
          />
        </View>
      )}
      {cancellable && !cancelling && (
        <Pressable accessibilityRole="button" onPress={() => setCancelling(true)} hitSlop={8} style={styles.cancelLink}>
          <ThemedText type="small" style={styles.cancelText}>
            Cancel this order
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  tone = 'good',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'good' | 'bad' | 'quiet';
}) {
  const color = tone === 'good' ? Brand.green : tone === 'bad' ? Brand.red : Brand.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        {
          borderColor: color,
          backgroundColor: tone === 'good' ? color : 'transparent',
        },
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.actionText, { color: tone === 'good' ? '#ffffff' : color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  alarm: {
    backgroundColor: Brand.red,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  alarmTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 600,
  },
  alarmText: {
    color: '#ffffff',
    fontSize: 13,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  loading: {
    marginVertical: Spacing.five,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  account: {
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  openLabel: {
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  outlet: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    maxWidth: 140,
  },
  outletText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 600,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Brand.green,
    paddingVertical: Spacing.two,
  },
  tabActive: {
    backgroundColor: Brand.green,
  },
  tabText: {
    color: Brand.green,
    fontWeight: 600,
    fontSize: 14,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cancelBox: {
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Brand.red,
    borderRadius: Radius.small,
    padding: Spacing.three,
  },
  cancelLink: {
    alignSelf: 'flex-start',
  },
  cancelText: {
    color: Brand.red,
    fontWeight: 600,
  },
  action: {
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actionText: {
    fontWeight: 600,
    fontSize: 13,
  },
  disabled: {
    opacity: 0.45,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
    letterSpacing: 2,
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
