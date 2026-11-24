import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

/**
 * A ScrollView that keeps the field being typed in above the keyboard: when the keyboard opens it
 * scrolls the focused input (an OTP, a token, a note) into view instead of covering it. On the web
 * the browser does this itself, so it is a plain ScrollView there.
 */
export function KeyboardScroll(props: ScrollViewProps) {
  if (Platform.OS === 'web') return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
  return <KeyboardAwareScrollView bottomOffset={32} keyboardShouldPersistTaps="handled" {...props} />;
}
