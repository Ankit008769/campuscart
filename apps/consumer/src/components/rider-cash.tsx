import { Brand } from '@campuscart/ui';
import { formatPaise, type getMyRiderCash } from '@campuscart/core';
import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';

type Held = Awaited<ReturnType<typeof getMyRiderCash>>;

/**
 * Cash the rider collected for shops and hasn't handed over. At the limit the database refuses new
 * deliveries, so this says so before the rider tries.
 */
export function RiderCash({ held }: { held: Held }) {
  if (held.length === 0) return null;
  const total = held.reduce((sum, row) => sum + row.amount_paise, 0);
  const limit = held[0].limit_paise;
  const atLimit = total >= limit;

  return (
    <Card>
      <ThemedText type="smallBold">Cash with you: {formatPaise(total)}</ThemedText>
      {held.map((row) => (
        <ThemedText key={row.shop_id} type="small">
          {formatPaise(row.amount_paise)} for {row.shop_name} ({row.orders} {row.orders === 1 ? 'order' : 'orders'}, since{' '}
          {new Date(row.oldest_at).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })})
        </ThemedText>
      ))}
      {atLimit ? (
        <Text style={styles.limit}>
          You&apos;ve reached the {formatPaise(limit)} cash limit. Hand the cash to the shops to take more deliveries.
        </Text>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Hand it to each shop next time you&apos;re there; they confirm it in their app. You can hold up to {formatPaise(limit)}.
        </ThemedText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  limit: {
    color: Brand.red,
    fontWeight: 700,
    fontSize: 14,
  },
});
