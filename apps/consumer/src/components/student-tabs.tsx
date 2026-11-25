import { Brand } from '@campuscart/ui';
import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Font, MaxContentWidth } from '@/constants/theme';

/**
 * The student side's tabs: Home, Orders and Account in a bar along the bottom, the same on phones
 * and the web. The screen sits above the bar (not under it), so nothing on it is ever covered.
 */
export default function StudentTabs() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The tab buttons must be direct children of TabList: it only looks one level down for them,
  // and buttons it doesn't find never switch tabs. Wide screens keep them centred with padding.
  const side = Math.max(0, (width - MaxContentWidth) / 2);
  return (
    <Tabs style={styles.flex}>
      <TabSlot style={styles.flex} />
      <TabList style={[styles.bar, { paddingBottom: insets.bottom + 8, paddingHorizontal: side }]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton icon="home" label="Home" />
        </TabTrigger>
        <TabTrigger name="orders" href="/orders" asChild>
          <TabButton icon="orders" label="Orders" />
        </TabTrigger>
        <TabTrigger name="account" href="/account" asChild>
          <TabButton icon="account" label="Account" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

// The trigger's ref is typed for a View, which Pressable's ref rejects; a tab button doesn't need it.
function TabButton({ icon, label, isFocused, ref: _ref, ...props }: TabTriggerSlotProps & { icon: IconName; label: string }) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <View style={[styles.pill, isFocused && styles.pillOn]}>
        <Icon name={icon} size={22} color={isFocused ? Brand.green : '#8A8A8A'} />
      </View>
      <Text style={[styles.label, isFocused && styles.labelOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E6E6',
    paddingTop: 10,
    // A soft shadow upwards, so the bar floats over the page.
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 52, justifyContent: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  pill: { width: 60, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: Brand.greenSoft },
  label: { fontFamily: Font.medium, fontSize: 11, color: '#6B6B6B' },
  labelOn: { fontFamily: Font.bold, color: '#1C1C1C' },
});
