import { Brand } from '@campuscart/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MyShop } from '@/lib/my-shop';

/** Chips to pick which outlet a tab works on. Shows nothing for a login with one shop. */
export function OutletSwitcher({
  shops,
  value,
  onChange,
}: {
  shops: MyShop[];
  value: string | undefined;
  onChange: (shop: MyShop) => void;
}) {
  const theme = useTheme();
  if (shops.length < 2) return null;
  return (
    <View style={styles.chips} accessibilityRole="tablist">
      {shops.map((s) => {
        const on = s.id === value;
        return (
          <Pressable
            key={s.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(s)}
            style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, { color: on ? '#ffffff' : theme.text }]} numberOfLines={1}>
              {s.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  chipOn: {
    backgroundColor: Brand.green,
  },
  chipText: {
    fontSize: 13,
    fontWeight: 500,
  },
});
