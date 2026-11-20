import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

/**
 * Fades its content up into place as a list first draws, each item a beat after the one before
 * (capped, so long lists don't keep you waiting). Reanimated skips it when the phone asks for
 * reduced motion.
 */
export function RiseIn({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)} style={style}>
      {children}
    </Animated.View>
  );
}
