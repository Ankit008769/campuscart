import { ScrollView, StyleSheet } from 'react-native';

import { TermsBody } from '@/components/terms-body';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** The Terms & Conditions screen, open to everyone, signed in or not. */
export default function TermsScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TermsBody />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
  },
});
