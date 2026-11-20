import { formatPaise, recentMonths, shopMonthOrders, shopMonthlyBills } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Bill = Awaited<ReturnType<typeof shopMonthlyBills>>[number];
type Line = Awaited<ReturnType<typeof shopMonthOrders>>[number];

const MONTHS = recentMonths(6);
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// Each shop's completed orders for a month and the ₹4-per-order platform fee CampusCart collects from it.
export default function BillsScreen() {
  const [month, setMonth] = useState(MONTHS[0].value);
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [error, setError] = useState<string | null>(null);

  function chooseMonth(next: string) {
    if (next === month) return;
    setMonth(next);
    setBills(null);
    setOpen(null);
    setLines({});
  }

  useEffect(() => {
    let active = true;
    shopMonthlyBills(supabase, month).then(
      (next) => active && setBills(next),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [month]);

  async function toggle(shopId: string) {
    if (open === shopId) {
      setOpen(null);
      return;
    }
    setOpen(shopId);
    if (lines[shopId]) return;
    try {
      const next = await shopMonthOrders(supabase, shopId, month);
      setLines((prev) => ({ ...prev, [shopId]: next }));
    } catch (e) {
      setError(messageOf(e));
    }
  }

  function share(bill: Bill) {
    const label = MONTHS.find((m) => m.value === month)?.label ?? month;
    const orders = lines[bill.shop_id] ?? [];
    const rows = orders.map((l) => `#${l.token_no} ${l.code} · ${when(l.completed_at)} · ${formatPaise(l.platform_fee_paise)}`);
    Share.share({
      message: [
        `CampusCart platform fee · ${bill.shop_name} · ${label}`,
        `${bill.orders} completed orders · amount due ${formatPaise(bill.platform_fee_paise)}`,
        ...(rows.length ? ['', ...rows] : []),
      ].join('\n'),
    }).catch(() => {});
  }

  const due = bills?.reduce((sum, b) => sum + b.platform_fee_paise, 0) ?? 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>
          {MONTHS.map((m) => (
            <Pressable
              key={m.value}
              accessibilityRole="button"
              accessibilityState={{ selected: m.value === month }}
              onPress={() => chooseMonth(m.value)}
              style={[styles.chip, m.value === month && styles.chipActive]}>
              <Text style={[styles.chipText, m.value === month && styles.chipTextActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {!bills && !error && <ActivityIndicator style={styles.loading} />}
        {bills && (
          <ThemedText type="small" themeColor="textSecondary">
            Shops collect the platform fee from students at handover. Total to collect this month: {formatPaise(due)}.
          </ThemedText>
        )}
        {bills?.map((bill) => (
          <ThemedView key={bill.shop_id} type="backgroundElement" style={styles.card}>
            <Pressable accessibilityRole="button" onPress={() => toggle(bill.shop_id)} style={styles.row}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{bill.shop_name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {bill.orders} {bill.orders === 1 ? 'order' : 'orders'} · sales {formatPaise(bill.item_sales_paise)} · delivery {formatPaise(bill.delivery_paise)}
                </ThemedText>
              </View>
              <View style={styles.amount}>
                <ThemedText type="smallBold">{formatPaise(bill.platform_fee_paise)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  due
                </ThemedText>
              </View>
            </Pressable>
            {open === bill.shop_id &&
              (lines[bill.shop_id] ? (
                <>
                  {lines[bill.shop_id].length === 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      No completed orders this month.
                    </ThemedText>
                  )}
                  {lines[bill.shop_id].map((l) => (
                    <View key={l.order_id} style={styles.line}>
                      <ThemedText type="small" style={styles.flex}>
                        #{l.token_no} · {when(l.completed_at)} · {l.mode === 'delivery' ? 'Delivery' : 'Pickup'}
                      </ThemedText>
                      <ThemedText type="small">{formatPaise(l.platform_fee_paise)}</ThemedText>
                    </View>
                  ))}
                  {lines[bill.shop_id].length > 0 && (
                    <Pressable accessibilityRole="button" onPress={() => share(bill)}>
                      <ThemedText type="linkPrimary">Share this bill</ThemedText>
                    </Pressable>
                  )}
                </>
              ) : (
                <ActivityIndicator />
              ))}
          </ThemedView>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  months: {
    gap: Spacing.two,
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
    fontWeight: 500,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  loading: {
    marginTop: Spacing.five,
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
  amount: {
    alignItems: 'flex-end',
  },
  line: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
