import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// One icon set for the whole app: SF Symbols on iOS, Material Symbols on Android and web.
const ICONS = {
  home: { ios: 'house.fill', android: 'home' },
  orders: { ios: 'bag.fill', android: 'shopping_bag' },
  account: { ios: 'person.crop.circle.fill', android: 'account_circle' },
  search: { ios: 'magnifyingglass', android: 'search' },
  cart: { ios: 'cart.fill', android: 'shopping_cart' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  star: { ios: 'star.fill', android: 'star' },
  heart: { ios: 'heart', android: 'favorite' },
  heartFilled: { ios: 'heart.fill', android: 'favorite' },
  print: { ios: 'printer.fill', android: 'print' },
  rider: { ios: 'bicycle', android: 'two_wheeler' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  edit: { ios: 'pencil', android: 'edit' },
  clock: { ios: 'clock', android: 'schedule' },
  store: { ios: 'storefront', android: 'storefront' },
  receipt: { ios: 'list.bullet.rectangle.portrait', android: 'receipt_long' },
  inventory: { ios: 'shippingbox', android: 'inventory_2' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on' },
  group: { ios: 'person.3', android: 'group' },
  bolt: { ios: 'bolt.fill', android: 'bolt' },
  error: { ios: 'exclamationmark.circle', android: 'error' },
  idea: { ios: 'lightbulb', android: 'lightbulb' },
  document: { ios: 'doc.text', android: 'description' },
  phone: { ios: 'phone.fill', android: 'call' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

/** A decorative icon: pair it with visible text, or give the control around it an accessibilityLabel. */
export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { ios, android } = ICONS[name];
  return (
    <SymbolView
      name={{ ios, android, web: android }}
      size={size}
      tintColor={color ?? theme.text}
      style={style}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
