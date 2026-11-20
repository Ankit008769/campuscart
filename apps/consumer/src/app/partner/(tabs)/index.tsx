import {
  ACCEPT_WINDOW_MS,
  formatPaise,
  listShopOrders,
  loginIdOf,
  printFileLink,
  transitionOrder,
  watchOrders,
  type OrderStatus,
} from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShopRiderCash } from '@/components/shop-rider-cash';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { loadMyShop, type MyShop } from '@/lib/my-shop';
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
const PAY_LABEL = { cash: 'cash', upi_at_handover: 'UPI' } as const;

export default function OrdersScreen() {
  const { session, signOut } = useAuth();
  const signedInAs = loginIdOf(session?.user.email) ?? session?.user.email;
  // undefined while loading, null when the account has no shop.
  const [shop, setShop] = useState<MyShop | null | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingOpen, setSavingOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const alarm = useNewOrderAlarm(orders.filter((o) => o.status === 'placed').map((o) => o.id));

  useEffect(() => {
    let active = true;
    loadMyShop().then(
      (found) => active && setShop(found),
      (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load your shop.'),
    );
    return () => {
      active = false;
    };
  }, []);

  // Live orders: reload on every change. New orders ring through useNewOrderAlarm.
  const shopId = shop?.id;
  useEffect(() => {
    if (!shopId) return;
    let active = true;
    const load = () =>
      listShopOrders(supabase, shopId).then(
        (next) => active && setOrders(next),
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load orders.'),
      );
    load();
    const unsubscribe = watchOrders(supabase, `shop_id=eq.${shopId}`, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [shopId]);

  // Keep the "accept within" countdowns moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  async function setOpen(isOpen: boolean) {
    if (!shop) return;
    setSavingOpen(true);
    setError(null);
    const { data, error: saveError } = await supabase
      .from('shops')
      .update({ is_open: isOpen })
      .eq('id', shop.id)
      .select('is_open')
      .single();
    if (saveError) setError(saveError.message);
    else setShop({ ...shop, is_open: data.is_open });
    setSavingOpen(false);
  }

  const visible = orders.filter((o) => TABS[tab].statuses.includes(o.status));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {shop === undefined && !error && <ActivityIndicator style={styles.loading} />}

          {shop === null && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">This account isn&apos;t linked to a shop yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Ask the CampusCart team to add {signedInAs} to your shop, then sign in again.
              </ThemedText>
            </ThemedView>
          )}

          {shop && (
            <>
              <ThemedText type="subtitle">{shop.name}</ThemedText>

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
                  <Text style={styles.alarmText}>
                    Accept or reject it within {ACCEPT_WINDOW_MS / 60000} minutes, or it is cancelled.
                  </Text>
                </Pressable>
              )}

              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.row}>
                  <ThemedText type="smallBold" style={styles.flex}>
                    Accepting orders
                  </ThemedText>
                  <Switch value={shop.is_open} onValueChange={setOpen} disabled={savingOpen} trackColor={{ true: Brand.green }} />
                </View>
                <StatusBadge label={shop.is_open ? 'Shop open' : 'Shop closed'} tone={shop.is_open ? 'good' : 'bad'} />
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
                <OrderCard key={order.id} order={order} now={now} onError={setError} />
              ))}

              <ShopRiderCash shopId={shop.id} orders={orders} />
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

function OrderCard({ order, now, onError }: { order: Order; now: number; onError: (message: string | null) => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState('');

  const placedAgoMin = Math.max(0, Math.floor((now - Date.parse(order.released_at ?? order.placed_at)) / 60000));
  const acceptLeftSec = Math.max(0, Math.round((ACCEPT_WINDOW_MS - (now - Date.parse(order.released_at ?? order.placed_at))) / 1000));

  async function move(to: OrderStatus, extra: { note?: string; code?: string; prepMinutes?: number } = {}) {
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
        <ThemedText type="small" themeColor="textSecondary">
          {placedAgoMin === 0 ? 'just now' : `${placedAgoMin} min ago`}
        </ThemedText>
      </View>

      {order.status === 'placed' && (
        <StatusBadge
          label={acceptLeftSec > 0 ? `Accept within ${Math.floor(acceptLeftSec / 60)}:${String(acceptLeftSec % 60).padStart(2, '0')}` : 'Expiring'}
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
      {order.mode === 'delivery' && order.status !== 'placed' && (
        <View style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {order.rider
              ? `Rider: ${order.rider.name || 'CampusCart rider'}`
              : 'No rider yet. One may take it, or deliver it yourself.'}
          </ThemedText>
          {order.rider?.phone && (
            <Pressable onPress={() => Linking.openURL(`tel:${order.rider?.phone}`)}>
              <ThemedText type="linkPrimary">Call rider</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {order.order_items.map((item) => (
        <ThemedText key={item.id} type="small">
          {item.qty} × {item.name_snapshot}
        </ThemedText>
      ))}
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
            <ThemedText type="linkPrimary">
              Open the PDF to print ({order.print_jobs.double_sided ? 'both sides' : 'one side'})
            </ThemedText>
          </Pressable>
        ))}
      <ThemedText type="smallBold">
        Collect {formatPaise(order.total_paise)} by {PAY_LABEL[order.pay_method]}
      </ThemedText>

      {order.status === 'placed' && !rejecting && (
        <View style={styles.actions}>
          {PREP_CHOICES.map((minutes) => (
            <ActionButton key={minutes} label={`Accept · ${minutes} min`} disabled={busy} onPress={() => move('accepted', { prepMinutes: minutes })} />
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
      {order.status === 'accepted' && (
        <ActionButton label="Mark packed and ready" disabled={busy} onPress={() => move('ready')} />
      )}
      {order.status === 'ready' && order.mode === 'delivery' && (
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
      {((order.status === 'out_for_delivery' && !order.rider_id) || (order.status === 'ready' && order.mode === 'pickup')) && (
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
            onPress={() => move(order.mode === 'delivery' ? 'delivered' : 'collected', { code })}
          />
        </View>
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
      style={[styles.action, { borderColor: color, backgroundColor: tone === 'good' ? color : 'transparent' }, disabled && styles.disabled]}>
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
