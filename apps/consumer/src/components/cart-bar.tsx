import { formatPaise } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCart } from '@/lib/cart';

/** Sticky green "View cart" bar shown while the cart has items. */
export function CartBar({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const cart = useCart();
  const insets = useSafeAreaInsets();
  if (cart.itemCount === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/cart')}
      style={[styles.bar, { bottom: bottomOffset + insets.bottom + 12 }]}>
      <Text style={styles.summary}>
        {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} · {formatPaise(cart.subtotalPaise)}
      </Text>
      <Text style={styles.action}>View cart ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  summary: {
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 15,
  },
  action: {
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 15,
  },
});
