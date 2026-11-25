import { Brand } from '@campuscart/ui';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { phoneParts } from '@/components/grid';
import { Icon } from '@/components/icon';
import { Font } from '@/constants/theme';

/**
 * A compact Call button with the number written under it, so it can also be read out or dialled by
 * hand (shop order cards, admin screens). Nothing shows when there is no number.
 */
export function CallButton({ phone, label = 'Call', who }: { phone: string | null | undefined; label?: string; who?: string }) {
  if (!phone) return null;
  const { shown, dial } = phoneParts(phone);
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${who ? ` ${who}` : ''}, ${shown}`}
        onPress={() => Linking.openURL(`tel:${dial}`)}
        hitSlop={6}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Icon name="phone" size={14} color="#ffffff" />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      <Text style={styles.number} selectable>
        {shown}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    minWidth: 76,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: Brand.green,
  },
  pressed: { opacity: 0.75 },
  label: { fontFamily: Font.bold, fontSize: 13, color: '#ffffff' },
  number: { fontFamily: Font.semibold, fontSize: 11, color: '#3D3D3D' },
});
