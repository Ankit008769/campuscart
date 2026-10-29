import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Credited = { photo_credit: string | null; photo_source_url: string | null };

/**
 * "Photos are representative" note plus a toggle listing each distinct photo credit once.
 * Most product photos are CC BY / CC BY-SA, so every screen that shows them shows this.
 */
export function PhotoCredits({ items }: { items: readonly Credited[] }) {
  const [shown, setShown] = useState(false);

  const seen = new Map<string, string | null>();
  for (const item of items) {
    if (item.photo_credit && !seen.has(item.photo_credit)) seen.set(item.photo_credit, item.photo_source_url);
  }
  const credits = [...seen.entries()];

  return (
    <View style={styles.footer}>
      <ThemedText type="small" themeColor="textSecondary">
        Photos are representative and may differ from what the shop serves.
      </ThemedText>
      {credits.length > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setShown((was) => !was)}>
          <ThemedText type="linkPrimary">{shown ? 'Hide photo credits' : 'Photo credits'}</ThemedText>
        </Pressable>
      )}
      {shown &&
        credits.map(([credit, url]) => (
          <Pressable key={credit} disabled={!url} onPress={() => url && WebBrowser.openBrowserAsync(url)}>
            <ThemedText type="small" themeColor="textSecondary">
              {credit}
              {url ? ' (Wikimedia Commons)' : ''}
            </ThemedText>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
});
