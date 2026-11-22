import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Font, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'section' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  // Links take the accessible brand green unless a colour is asked for.
  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'tint' : 'text')];

  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Font.regular,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Font.bold,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Font.regular,
  },
  title: {
    fontSize: 44,
    lineHeight: 50,
    fontFamily: Font.heading,
    letterSpacing: -1.5,
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 34,
    fontFamily: Font.heading,
    letterSpacing: -0.8,
  },
  // A heading inside a screen ("Shops on campus", "Buy again").
  section: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Font.heading,
    letterSpacing: -0.5,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
    fontFamily: Font.regular,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    fontFamily: Font.bold,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 600 }) ?? 400,
    fontSize: 12,
  },
});
