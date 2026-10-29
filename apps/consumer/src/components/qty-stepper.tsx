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
        style={[styles.add, disabled && styles.disabled]}>
        <Text style={styles.addText}>ADD</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove one" onPress={onRemove} hitSlop={8}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.qty}>{qty}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add one" disabled={disabled} onPress={onAdd} hitSlop={8}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: Radius.small,
    paddingHorizontal: 18,
    paddingVertical: 6,
    backgroundColor: Brand.greenSoft,
  },
  addText: {
    color: Brand.green,
    fontWeight: 800,
    fontSize: 13,
  },
  disabled: {
    opacity: 0.4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Brand.green,
    borderRadius: Radius.small,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepText: {
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 16,
  },
  qty: {
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 14,
    minWidth: 16,
    textAlign: 'center',
  },
});
