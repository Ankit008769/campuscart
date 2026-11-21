import {
  formatPaise,
  isRushing,
  missedDemand,
  reportCsv,
  reportPeriods,
  reportSummary,
  setRush,
  shopReport,
  shopTopItems,
} from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OutletSwitcher } from '@/components/outlet-switcher';
import { ShopLogins } from '@/components/shop-logins';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { chooseOutlet, loadMyShop, loadMyShops, type MyShop } from '@/lib/my-shop';
import { supabase } from '@/lib/supabase';

type ReportDay = Awaited<ReturnType<typeof shopReport>>[number];
type TopItem = Awaited<ReturnType<typeof shopTopItems>>[number];

const RUSH_CHOICES = [30, 60, 120];
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export default function ShopScreen() {
  // undefined while loading, null when the account has no shop.
  const [shop, setShop] = useState<MyShop | null | undefined>(undefined);
  const [shops, setShops] = useState<MyShop[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([loadMyShops(), loadMyShop()]).then(
      ([all, one]) => {
        setShops(all);
        setShop(one);
      },
      (e: unknown) => setError(messageOf(e)),
    );
  }, []);

  function pickOutlet(next: MyShop) {
    setShop(next);
    chooseOutlet(next.id);
  }
  useFocusEffect(reload);

  async function rush(minutes: number | null) {
    if (!shop) return;
    setError(null);
    try {
      await setRush(supabase, shop.id, minutes);
      reload();
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Shop</ThemedText>
          <OutletSwitcher shops={shops} value={shop?.id} onChange={pickOutlet} />
          {shop === undefined && !error && <ActivityIndicator />}
          {error && <Text style={styles.error}>{error}</Text>}
          {shop === null && (
            <ThemedText type="small" themeColor="textSecondary">
              This account isn&apos;t linked to a shop yet.
            </ThemedText>
          )}

          {shop && (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Rush mode</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {isRushing(shop)
                    ? `On until ${new Date(shop.rush_until ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Students see a wait of about ${shop.prep_minutes + shop.rush_extra_minutes} minutes instead of ${shop.prep_minutes}.`
                    : `Too many orders at once? Students will see ${shop.rush_extra_minutes} extra minutes of waiting, so nobody is surprised.`}
                </ThemedText>
                <View style={styles.row}>
                  {isRushing(shop) ? (
                    <Pressable accessibilityRole="button" onPress={() => rush(null)} style={styles.chip}>
                      <Text style={styles.chipText}>Turn off</Text>
                    </Pressable>
                  ) : (
                    RUSH_CHOICES.map((minutes) => (
                      <Pressable key={minutes} accessibilityRole="button" onPress={() => rush(minutes)} style={styles.chip}>
                        <Text style={styles.chipText}>
                          {minutes < 60 ? `${minutes} min` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </View>
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">UPI payments</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {shop.upi_vpa
                    ? `Students who pay by UPI pay ${shop.upi_vpa}, even when a rider brings the order.`
                    : 'No UPI ID set yet, so students ask for your UPI QR code at handover.'}{' '}
                  To change it, contact the CampusCart team; it can&apos;t be changed from the app, so nobody can redirect your payments.
                </ThemedText>
              </ThemedView>

              {shop.role === 'owner' ? (
                <>
                  <Reports shopId={shop.id} />
                  <MissedDemand />
                  <ShopLogins shopId={shop.id} />
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Sales reports and staff are on the owner&apos;s login.
                </ThemedText>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Reports({ shopId }: { shopId: string }) {
  const [periods] = useState(() => reportPeriods());
  const [periodKey, setPeriodKey] = useState(periods[0].key);
  const [days, setDays] = useState<ReportDay[] | null>(null);
  const [top, setTop] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];

  useEffect(() => {
    let active = true;
    Promise.all([shopReport(supabase, shopId, period), shopTopItems(supabase, shopId, period)]).then(
      ([nextDays, nextTop]) => {
        if (!active) return;
        setDays(nextDays);
        setTop(nextTop);
        setError(null);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [shopId, period]);

  const commission = days?.reduce((t, d) => t + d.commission_paise, 0) ?? 0;
  const sales = days?.reduce((t, d) => t + d.sales_paise, 0) ?? 0;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Sales</ThemedText>
      <View style={styles.row}>
        {periods.map((p) => (
          <Pressable key={p.key} onPress={() => setPeriodKey(p.key)} style={[styles.chip, p.key === periodKey && styles.chipActive]}>
            <Text style={[styles.chipText, p.key === periodKey && styles.chipTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {!days && !error && <ActivityIndicator />}
      {days && (
        <>
          <ThemedText type="small">{reportSummary(days)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Commission {formatPaise(commission)} · you keep {formatPaise(sales - commission)}
          </ThemedText>
          {days.map((d) => (
            <View key={d.day} style={styles.row}>
              <ThemedText type="small" style={styles.flex}>
                {new Date(`${d.day}T00:00:00`).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {d.completed}/{d.orders} orders
              </ThemedText>
              <ThemedText type="small">{formatPaise(d.sales_paise)}</ThemedText>
            </View>
          ))}
          {top.length > 0 && (
            <>
              <ThemedText type="smallBold">Best sellers</ThemedText>
              {top.slice(0, 5).map((item) => (
                <View key={item.name} style={styles.row}>
                  <ThemedText type="small" style={styles.flex} numberOfLines={1}>
                    {item.qty} × {item.name}
                  </ThemedText>
                  <ThemedText type="small">{formatPaise(item.sales_paise)}</ThemedText>
                </View>
              ))}
            </>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={days.length === 0}
            onPress={() =>
              Share.share({
                title: `Sales, ${period.label.toLowerCase()}`,
                message: reportCsv(days),
              })
            }>
            <ThemedText type="linkPrimary">Share as a spreadsheet (CSV)</ThemedText>
          </Pressable>
        </>
      )}
    </ThemedView>
  );
}

/** What students searched for in the last 30 days and nobody had: ideas for what to stock. */
function MissedDemand() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof missedDemand>>>([]);
  useEffect(() => {
    let active = true;
    const now = new Date();
    missedDemand(supabase, new Date(now.getTime() - 30 * 24 * 3600_000).toISOString(), now.toISOString()).then(
      (next) => active && setRows(next),
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);
  if (rows.length === 0) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Students looked for these and found nothing</ThemedText>
      {rows.slice(0, 10).map((row) => (
        <View key={row.query} style={styles.row}>
          <ThemedText type="small" style={styles.flex}>
            {row.query}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {row.searches} {row.searches === 1 ? 'search' : 'searches'}
          </ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Last 30 days, across campus. Stocking one of these could bring new orders.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
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
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  chip: {
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  chipActive: {
    backgroundColor: Brand.green,
  },
  chipText: {
    color: Brand.green,
    fontSize: 13,
    fontWeight: 600,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
