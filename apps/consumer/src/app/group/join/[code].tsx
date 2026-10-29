import { joinGroupOrder } from '@campuscart/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** Opened from a shared group order link: joins, then shows the group. */
export default function JoinGroupScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    joinGroupOrder(supabase, code).then(
      (groupId) => active && router.replace({ pathname: '/group/[id]', params: { id: groupId } }),
      (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not join this group order.'),
    );
    return () => {
      active = false;
    };
  }, [code]);

  return (
    <ThemedView style={styles.container}>
      {error ? (
        <>
          <ThemedText type="smallBold">{error}</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')}>
            <ThemedText type="linkPrimary">Go to Home</ThemedText>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
