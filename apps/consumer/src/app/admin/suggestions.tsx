import { listSuggestions, markSuggestionsRead } from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Suggestion = Awaited<ReturnType<typeof listSuggestions>>[number];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** What students sent from Account → Suggestions, newest first. Opening the list marks them read. */
export default function SuggestionsScreen() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listSuggestions(supabase).then(
        (rows) => {
          if (!active) return;
          setItems(rows);
          // Shown as new this time; read from the next visit on.
          markSuggestionsRead(
            supabase,
            rows.filter((r) => !r.read_at).map((r) => r.id),
          ).catch(() => {});
        },
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load suggestions.'),
      );
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {!items && !error && <ActivityIndicator />}
        {error && <Text style={styles.error}>{error}</Text>}
        {items?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No suggestions yet. Students send them from Account → Suggestions.
          </ThemedText>
        )}
        {items?.map((s) => (
          <ThemedView key={s.id} type="backgroundElement" style={styles.card}>
            <View style={styles.row}>
              <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
                {s.name || s.email || 'Someone'}
              </ThemedText>
              {!s.read_at && <StatusBadge label="New" tone="good" />}
              <ThemedText type="small" themeColor="textSecondary">
                {when(s.created_at)}
              </ThemedText>
            </View>
            <ThemedText type="small" selectable>
              {s.body}
            </ThemedText>
            <View style={styles.row}>
              {s.email && (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${s.email}?subject=Your Campus Cart suggestion`)}>
                  <ThemedText type="linkPrimary">Email</ThemedText>
                </Pressable>
              )}
              {s.phone && (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${s.phone}`)}>
                  <ThemedText type="linkPrimary">Call</ThemedText>
                </Pressable>
              )}
              {s.role !== 'student' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {s.role === 'admin' ? 'Admin' : 'Shop'}
                </ThemedText>
              )}
            </View>
          </ThemedView>
        ))}
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
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
