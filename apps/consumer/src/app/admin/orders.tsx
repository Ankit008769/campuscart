import { adminCompleteOrder, formatPaise, listLiveOrdersForAdmin, transitionOrder, watchOrders } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CallButton } from '@/components/call-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Live = Awaited<ReturnType<typeof listLiveOrdersForAdmin>>[number];
type Filter = 'all' | 'new' | 'preparing' | 'ready' | 'on_the_way';

const FILTERS: { key: Filter; label: string; statuses: Live['status'][] }[] = [
  { key: 'all', label: 'All', statuses: ['scheduled', 'placed', 'accepted', 'ready', 'out_for_delivery'] },
  { key: 'new', label: 'New', statuses: ['placed'] },
  { key: 'preparing', label: 'Preparing', statuses: ['accepted'] },
  { key: 'ready', label: 'Ready', statuses: ['ready'] },
  { key: 'on_the_way', label: 'On the way', statuses: ['out_for_delivery'] },
];

const STATUS: Record<Live['status'], { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: '#5A5A5A', bg: '#EFEFEF' },
  placed: { label: 'New · not accepted', color: '#B3261E', bg: '#FDECEA' },
  accepted: { label: 'Preparing', color: '#8A5A00', bg: '#FFF3D6' },
  ready: { label: 'Ready', color: '#0B57D0', bg: '#E7F0FE' },
  out_for_delivery: { label: 'On the way', color: Brand.green, bg: '#E6F4EA' },
  delivered: { label: 'Delivered', color: Brand.green, bg: '#E6F4EA' },
  collected: { label: 'Collected', color: Brand.green, bg: '#E6F4EA' },
  rejected: { label: 'Rejected', color: '#5A5A5A', bg: '#EFEFEF' },
  cancelled: { label: 'Cancelled', color: '#5A5A5A', bg: '#EFEFEF' },
  expired: { label: 'Expired', color: '#5A5A5A', bg: '#EFEFEF' },
};

// Reasons an admin finishes or cancels an order, kept on the order's history.
const FINISH_REASONS = ['Delivered; the shop forgot to mark it', 'The student lost or forgot the code', 'Handed over in person'];
const CANCEL_REASONS = ['The shop cannot make it', 'The student asked to cancel', 'Duplicate or test order'];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const minutesSince = (iso: string, now: number) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
const ago = (min: number) => (min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60} min ago`);

/** Asks for one of a few reasons (Alert on phones, a confirm on the web), then runs `act` with it. */
function chooseReason(title: string, message: string, reasons: string[], act: (reason: string) => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}\n\nReason: ${reasons[0]}`)) act(reasons[0]);
    return;
  }
  Alert.alert(title, message, [...reasons.map((r) => ({ text: r, onPress: () => act(r) })), { text: 'Back', style: 'cancel' as const }]);
}

/**
 * Admin → Live orders: every open order in every shop, updating live, with the student's delivery
 * code and pickup token, call buttons for the shop and the student, and a way to finish an order the
 * shop forgot to mark (no code needed) or to cancel one.
 */
export default function LiveOrdersScreen() {
  const theme = useTheme();
  const [orders, setOrders] = useState<Live[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(
    () =>
      listLiveOrdersForAdmin(supabase).then(
        (rows) => {
          setOrders(rows);
          setNow(Date.now());
          setError(null);
        },
        (e: unknown) => setError(messageOf(e)),
      ),
    [],
  );

  // Any order in any shop changing reloads the list; the clock keeps "x min ago" current.
  useFocusEffect(
    useCallback(() => {
      reload();
      const stop = watchOrders(supabase, null, () => void reload());
      const tick = setInterval(() => setNow(Date.now()), 30000);
      return () => {
        stop();
        clearInterval(tick);
      };
    }, [reload]),
  );

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    try {
      await action();
      await reload();
    } catch (e) {
      Alert.alert('Could not do that', messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  const finish = (o: Live) =>
    chooseReason(
      o.mode === 'delivery' ? 'Mark delivered?' : 'Mark collected?',
      `Order #${o.code} from ${o.shop_name} to ${o.student_name}. No code is needed; the reason is kept on the order.`,
      FINISH_REASONS,
      (reason) => run(o.id, () => adminCompleteOrder(supabase, o.id, reason)),
    );
  const cancel = (o: Live) =>
    chooseReason(
      'Cancel this order?',
      `Order #${o.code} from ${o.shop_name}. The student is told and pays nothing.`,
      CANCEL_REASONS,
      (reason) => run(o.id, () => transitionOrder(supabase, { orderId: o.id, to: 'cancelled', note: reason })),
    );

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, (orders ?? []).filter((o) => f.statuses.includes(o.status)).length]));
  const shown = (orders ?? []).filter((o) => FILTERS.find((f) => f.key === filter)!.statuses.includes(o.status));

  return (
    <ThemedView style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersBar} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, { borderColor: theme.backgroundSelected }, filter === f.key && styles.chipOn]}>
            <Text style={[styles.chipText, { color: theme.text }, filter === f.key && styles.chipTextOn]}>
              {f.label} {counts[f.key] ? `(${counts[f.key]})` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }>
        {!orders && !error && <ActivityIndicator />}
        {error && <Text style={styles.error}>{error}</Text>}
        {orders && shown.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {orders.length === 0 ? 'No open orders right now. New ones show up here the moment they are placed.' : 'Nothing in this group.'}
          </ThemedText>
        )}
        {shown.map((o) => {
          const s = STATUS[o.status];
          const waited = minutesSince(o.placed_at, now);
          // A new order nobody has accepted for 2 minutes, or one out longer than 45, needs a look.
          const late = (o.status === 'placed' && waited >= 2) || (o.status === 'out_for_delivery' && o.out_at && minutesSince(o.out_at, now) >= 45);
          const open = o.status === 'accepted' || o.status === 'ready' || o.status === 'out_for_delivery';
          return (
            <View key={o.id} style={[styles.card, { borderColor: late ? '#E8A39C' : theme.backgroundSelected }, late && styles.cardLate]}>
              <View style={styles.row}>
                <Text style={[styles.shop, { color: theme.text }]} numberOfLines={1}>
                  {o.shop_name}
                </Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                #{o.code} · placed {ago(waited)} · {formatPaise(o.total_paise)}
                {late ? ' · needs a look' : ''}
              </ThemedText>
              <ThemedText type="small">{o.items}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {o.student_name} ·{' '}
                {o.mode === 'delivery' ? `Deliver to ${o.drop_point ?? '?'}${o.room_note ? `, ${o.room_note}` : ''}` : 'Pickup at the shop'}
                {o.rider_name ? ` · Rider ${o.rider_name}` : ''}
              </ThemedText>

              <View style={styles.codeBox}>
                <View style={styles.flex}>
                  <Text style={styles.codeLabel}>{o.mode === 'delivery' ? 'Delivery code' : 'Pickup token'}</Text>
                  <Text style={styles.code} selectable>
                    {o.mode === 'delivery' ? (o.delivery_otp ?? '—') : `#${o.token_no}`}
                  </Text>
                </View>
                <CallButton phone={o.shop_phone} label="Shop" who={o.shop_name} />
                <CallButton phone={o.student_phone} label="Student" who={o.student_name} />
              </View>

              <View style={styles.actions}>
                {open && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy === o.id}
                    onPress={() => finish(o)}
                    style={[styles.primary, busy === o.id && styles.disabled]}>
                    <Text style={styles.primaryText}>{o.mode === 'delivery' ? 'Mark delivered' : 'Mark collected'}</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy === o.id}
                  onPress={() => cancel(o)}
                  style={[styles.secondary, { borderColor: theme.backgroundSelected }, busy === o.id && styles.disabled]}>
                  <Text style={styles.secondaryText}>Cancel order</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  filtersBar: { flexGrow: 0 },
  filters: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: Brand.green, borderColor: Brand.green },
  chipText: { fontFamily: Font.medium, fontSize: 13 },
  chipTextOn: { color: '#ffffff' },
  content: { padding: Spacing.three, paddingTop: Spacing.one, paddingBottom: Spacing.six, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  error: { fontFamily: Font.medium, color: Brand.red },
  card: { borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, gap: 4 },
  cardLate: { backgroundColor: '#FFF8F7' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  shop: { flex: 1, fontFamily: Font.bold, fontSize: 15 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: Font.bold, fontSize: 11 },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: '#F5FBF4',
    borderWidth: 1,
    borderColor: '#E6EFE4',
  },
  codeLabel: { fontFamily: Font.medium, fontSize: 11, color: '#5A5A5A' },
  code: { fontFamily: Font.heading, fontSize: 24, letterSpacing: 4, color: '#1C1C1C' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  primary: { flex: 1, minHeight: 42, borderRadius: Radius.medium, backgroundColor: Brand.green, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Font.bold, fontSize: 14, color: '#ffffff' },
  secondary: { minHeight: 42, borderRadius: Radius.medium, borderWidth: 1, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Font.semibold, fontSize: 14, color: Brand.red },
  disabled: { opacity: 0.5 },
});
