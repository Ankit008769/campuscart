import { formatPaise } from '@campuscart/core';
import { Brand } from '@campuscart/ui';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Font } from '@/constants/theme';
import { useCart } from '@/lib/cart';

/** Sticky green "View cart" bar shown while the cart has items. */
export function CartBar({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const cart = useCart();
  const insets = useSafeAreaInsets();
  if (cart.itemCount === 0) return null;
  const items = `${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View cart, ${items}, ${formatPaise(cart.subtotalPaise)}`}
      onPress={() => router.push('/cart')}
      style={({ pressed }) => [styles.bar, { bottom: bottomOffset + insets.bottom + 12 }, pressed && styles.pressed]}>
      <View style={styles.cartIcon}>
        <Icon name="cart" size={20} color="#ffffff" />
      </View>
      <View style={styles.summary}>
        <Text style={styles.items}>{items}</Text>
        <Text style={styles.total}>{formatPaise(cart.subtotalPaise)}</Text>
      </View>
      <Text style={styles.action}>Review order</Text>
      <Icon name="chevron" size={20} color="#ffffff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Brand.green,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: {
    opacity: 0.9,
  },
  cartIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#ffffff26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    flex: 1,
  },
  items: {
    color: '#ffffff',
    fontFamily: Font.medium,
    fontSize: 12,
  },
  total: {
    color: '#ffffff',
    fontFamily: Font.bold,
    fontSize: 16,
  },
  action: {
    color: '#ffffff',
    fontFamily: Font.bold,
    fontSize: 15,
  },
});
