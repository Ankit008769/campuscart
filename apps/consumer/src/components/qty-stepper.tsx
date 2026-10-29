import { Brand, Radius } from '@campuscart/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Blinkit-style ADD button that turns into − qty + once the item is in the cart. */
export function QtyStepper({
  qty,
  disabled,
  onAdd,
  onRemove,
}: {
  qty: number;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  if (qty === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add to cart"
        disabled={disabled}
        onPress={onAdd}
        hitSlop={8}
        style={({ pressed }) => [styles.add, disabled && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.addText}>ADD</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.stepper}>
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
    borderWidth: 1.5,
    borderColor: Brand.green,
    borderRadius: Radius.small,
    paddingHorizontal: 18,
    backgroundColor: '#ffffff',
  },
  addText: {
    color: Brand.green,
    fontWeight: 800,
    fontSize: 14,
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
    gap: 12,
    backgroundColor: Brand.green,
    borderRadius: Radius.small,
    paddingHorizontal: 12,
  },
  stepText: {
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.75,
  },
  qty: {
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 14,
    minWidth: 16,
    textAlign: 'center',
  },
});
