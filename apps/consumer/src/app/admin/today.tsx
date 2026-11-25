import { formatPaise, listOrdersSince, listShopsForAdmin, platformReport, watchOrders } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Day = Awaited<ReturnType<typeof platformReport>>[number];
type ShopRow = { id: string; name: string; orders: number; done: number; dropped: number; open: number; sales: number };

const DONE = new Set(['delivered', 'collected']);
const DROPPED = new Set(['rejected', 'cancelled', 'expired']);

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const startOfDay = (daysAgo = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
};
const sum = (days: Day[], key: keyof Day) => days.reduce((n, d) => n + Number(d[key] ?? 0), 0);

async function load() {
  const today = startOfDay();
  const [week, orders, shops] = await Promise.all([
    platformReport(supabase, startOfDay(6).toISOString(), new Date().toISOString()),
    listOrdersSince(supabase, today.toISOString()),
    listShopsForAdmin(supabase),
  ]);
  const byShop = new Map<string, ShopRow>(shops.map((s) => [s.id, { id: s.id, name: s.name, orders: 0, done: 0, dropped: 0, open: 0, sales: 0 }]));
  for (const o of orders) {
    const row = byShop.get(o.shop_id);
    if (!row) continue;
    row.orders++;
    if (DONE.has(o.status)) {
      row.done++;
      row.sales += o.total_paise;
    } else if (DROPPED.has(o.status)) row.dropped++;
    else row.open++;
  }
  const dayKey = today.toISOString().slice(0, 10);
  return {
    today: week.filter((d) => String(d.day).slice(0, 10) >= dayKey),
    week,
    shops: [...byShop.values()].sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name)),
  };
}

/**
 * Admin → Today: how the day is going across CampusCart (orders, sales, dropped orders, new
 * students, how fast shops accept), each shop's numbers, and the last 7 days for comparison.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof load>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(
    () =>
      load().then(
        (next) => {
          setData(next);
          setError(null);
        },
        (e: unknown) => setError(messageOf(e)),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      reload();
      // New and finished orders change the day's numbers at once.
      return watchOrders(supabase, null, () => void reload());
    }, [reload]),
  );

  const tiles = data
    ? [
        { label: 'Orders today', value: String(sum(data.today, 'orders')) },
        { label: 'Completed', value: String(sum(data.today, 'completed')) },
        { label: 'Sales', value: formatPaise(sum(data.today, 'sales_paise')) },
        { label: 'Dropped', value: String(sum(data.today, 'dropped')), bad: sum(data.today, 'dropped') > 0 },
        { label: 'Fees charged', value: formatPaise(sum(data.today, 'fees_paise')) },
        { label: 'New students', value: String(sum(data.today, 'new_students')) },
      ]
    : [];
  const acceptSecs = data?.today.find((d) => d.avg_accept_seconds)?.avg_accept_seconds;

  return (
    <ThemedView style={styles.container}>
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
        {!data && !error && <ActivityIndicator />}
        {error && <Text style={styles.error}>{error}</Text>}
        {data && (
          <>
            <View style={styles.tiles}>
              {tiles.map((t) => (
                <View key={t.label} style={[styles.tile, { borderColor: theme.backgroundSelected }]}>
                  <Text style={[styles.tileValue, { color: t.bad ? Brand.red : theme.text }]}>{t.value}</Text>
                  <Text style={styles.tileLabel}>{t.label}</Text>
                </View>
              ))}
            </View>
            {acceptSecs ? (
              <ThemedText type="small" themeColor="textSecondary">
                Shops took {Math.round(Number(acceptSecs) / 60) || '<1'} min on average to accept today.
              </ThemedText>
            ) : null}

            <Text style={[styles.heading, { color: theme.text }]}>Each shop today</Text>
            <View style={[styles.table, { borderColor: theme.backgroundSelected }]}>
              <View style={[styles.tr, styles.th]}>
                <Text style={[styles.cell, styles.shopCell, styles.thText]}>Shop</Text>
                <Text style={[styles.cell, styles.thText]}>Orders</Text>
                <Text style={[styles.cell, styles.thText]}>Open</Text>
                <Text style={[styles.cell, styles.thText]}>Dropped</Text>
                <Text style={[styles.cell, styles.salesCell, styles.thText]}>Sales</Text>
              </View>
              {data.shops.map((s) => (
                <View key={s.id} style={[styles.tr, { borderTopColor: theme.backgroundSelected }]}>
                  <Text style={[styles.cell, styles.shopCell, { color: theme.text }]} numberOfLines={2}>
                    {s.name}
                  </Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{s.orders}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{s.open}</Text>
                  <Text style={[styles.cell, { color: s.dropped ? Brand.red : theme.text }]}>{s.dropped}</Text>
                  <Text style={[styles.cell, styles.salesCell, { color: theme.text }]}>{formatPaise(s.sales)}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.heading, { color: theme.text }]}>Last 7 days</Text>
            <View style={[styles.table, { borderColor: theme.backgroundSelected }]}>
              <View style={[styles.tr, styles.th]}>
                <Text style={[styles.cell, styles.shopCell, styles.thText]}>Day</Text>
                <Text style={[styles.cell, styles.thText]}>Orders</Text>
                <Text style={[styles.cell, styles.thText]}>Done</Text>
                <Text style={[styles.cell, styles.thText]}>New</Text>
                <Text style={[styles.cell, styles.salesCell, styles.thText]}>Sales</Text>
              </View>
              {[...data.week].reverse().map((d) => (
                <View key={String(d.day)} style={[styles.tr, { borderTopColor: theme.backgroundSelected }]}>
                  <Text style={[styles.cell, styles.shopCell, { color: theme.text }]}>
                    {new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{d.orders}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{d.completed}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{d.new_students}</Text>
                  <Text style={[styles.cell, styles.salesCell, { color: theme.text }]}>{formatPaise(d.sales_paise)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  error: { fontFamily: Font.medium, color: Brand.red },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexGrow: 1, flexBasis: '30%', borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.two, gap: 2 },
  tileValue: { fontFamily: Font.heading, fontSize: 20 },
  tileLabel: { fontFamily: Font.medium, fontSize: 11, color: '#6B6B6B' },
  heading: { fontFamily: Font.bold, fontSize: 15, marginTop: Spacing.two },
  table: { borderWidth: 1, borderRadius: Radius.medium, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  th: { backgroundColor: '#F5F5F5', borderTopWidth: 0 },
  thText: { fontFamily: Font.bold, fontSize: 11, color: '#5A5A5A' },
  cell: { width: 52, fontFamily: Font.regular, fontSize: 12, textAlign: 'right' },
  shopCell: { flex: 1, width: undefined, textAlign: 'left', paddingRight: 6 },
  salesCell: { width: 72 },
});
