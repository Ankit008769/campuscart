import { Brand, Storefront } from '@campuscart/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Font } from '@/constants/theme';

/** The website's ADD button that turns into − qty + once the item is in the cart. `compact` fits product cards. */
export function QtyStepper({
  qty,
  disabled,
  onAdd,
  onRemove,
  compact = false,
}: {
  qty: number;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  if (qty === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add to cart"
        disabled={disabled}
        onPress={onAdd}
        hitSlop={8}
        style={({ pressed }) => [styles.add, compact && styles.compact, disabled && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.addText}>ADD</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.stepper, compact && styles.compact]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove one" onPress={onRemove} hitSlop={12}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.qty} accessibilityLabel={`${qty} in cart`}>
        {qty}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add one" disabled={disabled} onPress={onAdd} hitSlop={12}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    minHeight: 36,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: 6,
    paddingHorizontal: 16,
    backgroundColor: Storefront.addFill,
  },
  compact: {
    minHeight: 32,
    minWidth: 64,
    paddingHorizontal: 10,
  },
  addText: {
    color: Brand.green,
    fontFamily: Font.bold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.4,
  },
  stepper: {
    minHeight: 36,
    minWidth: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: Brand.green,
    borderRadius: 6,
    paddingHorizontal: 10,
  },
  stepText: {
    color: '#ffffff',
    fontFamily: Font.bold,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.75,
  },
  qty: {
    color: '#ffffff',
    fontFamily: Font.bold,
    fontSize: 13,
    minWidth: 16,
    textAlign: 'center',
  },
});
