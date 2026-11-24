/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// `tint` is the brand green darkened (light) or lightened (dark) until small text on it passes
// WCAG AA (4.5:1); Brand.green itself is only for large fills such as buttons and the cart bar.
export const Colors = {
  light: {
    text: '#1C1C1C',
    background: '#ffffff',
    backgroundElement: '#F2F3F0',
    backgroundSelected: '#E3E5DF',
    textSecondary: '#5F6368',
    tint: '#0C831F',
    border: '#E3E5DF',
  },
  dark: {
    text: '#F5F5F2',
    background: '#0E0F0D',
    backgroundElement: '#1E201C',
    backgroundSelected: '#2C2F29',
    textSecondary: '#B0B4AC',
    tint: '#4CC97A',
    border: '#2C2F29',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The app's font: Inter, a close free match for the quick-commerce look. Each weight is its own family
 * (loaded in app/_layout.tsx), because Android ignores fontWeight on custom fonts.
 */
export const Font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heading: 'Inter_800ExtraBold',
  headingBold: 'Inter_700Bold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
