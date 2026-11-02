import { formatPaise, listShopRiderCash, settleRiderCash } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Row = Awaited<ReturnType<typeof listShopRiderCash>>[number];

/**
 * Cash riders collected for this shop on deliveries and haven't handed over. Staff confirm it once
 * it's in the till; the rider gets a notification, and a rider at the cash limit can take orders
 * again. Reloads whenever `orders` changes, since a delivered cash order adds to it.
 */
export function ShopRiderCash({ shopId, orders }: { shopId: string; orders: unknown }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    listShopRiderCash(supabase, shopId).then(
      (next) => active && setRows(next),
      (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load rider cash.'),
    );
    return () => {
      active = false;
    };
  }, [shopId, orders, version]);

  if (rows.length === 0 && !error) return null;

  const settle = async (row: Row) => {
    setBusy(row.rider_id);
    setError(null);
    try {
      await settleRiderCash(supabase, shopId, row.rider_id);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record it.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = (row: Row) => {
    const message = `Confirm you received ${formatPaise(row.amount_paise)} in cash from ${row.rider_name}? This records it for both of you.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void settle(row);
      return;
    }
    Alert.alert('Cash received', message, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Received', onPress: () => void settle(row) },
    ]);
  };

  return (
    <Card>
      <ThemedText type="smallBold">Cash from riders</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Riders collected this for you on cash deliveries. Confirm only once the money is in your hands.
      </ThemedText>
      {rows.map((row) => (
        <View key={row.rider_id} style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="smallBold">
              {row.rider_name}: {formatPaise(row.amount_paise)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {row.orders} {row.orders === 1 ? 'order' : 'orders'} since{' '}
              {new Date(row.oldest_at).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </ThemedText>
            {row.rider_phone && (
              <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${row.rider_phone}`)}>
                <ThemedText type="linkPrimary">Call {row.rider_phone}</ThemedText>
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Received ${formatPaise(row.amount_paise)} from ${row.rider_name}`}
            disabled={busy !== null}
            onPress={() => confirm(row)}
            style={[styles.button, busy !== null && styles.disabled]}>
            <Text style={styles.buttonText}>{busy === row.rider_id ? 'Saving…' : 'Received'}</Text>
          </Pressable>
        </View>
      ))}
      {error && <Text style={styles.error}>{error}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  button: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 800,
  },
  error: {
    color: Brand.red,
  },
});
