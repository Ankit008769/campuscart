import { listStudentsForAdmin } from '@campuscart/core';
import { Radius, StatusBadge } from '@campuscart/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Student = Awaited<ReturnType<typeof listStudentsForAdmin>>[number];

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Everyone who has signed in as a student, newest first, with their contact details and orders. */
export default function StudentsScreen() {
  const theme = useTheme();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listStudentsForAdmin(supabase).then(
        (rows) => active && setStudents(rows),
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load students.'),
      );
      return () => {
        active = false;
      };
    }, []),
  );

  const q = query.trim().toLowerCase();
  const shown = (students ?? []).filter((s) => !q || `${s.name} ${s.email ?? ''} ${s.phone ?? ''} ${s.drop_point ?? ''}`.toLowerCase().includes(q));
  const ordered = students?.filter((s) => s.orders > 0).length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!students && !error && <ActivityIndicator />}
        {error && <Text style={styles.error}>{error}</Text>}
        {students && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {students.length} students registered · {ordered} have ordered
            </ThemedText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, email, phone or hostel"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              style={[styles.search, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </>
        )}
        {shown.map((s) => (
          <ThemedView key={s.id} type="backgroundElement" style={styles.card}>
            <View style={styles.row}>
              <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
                {s.name || 'No name'}
              </ThemedText>
              {s.blocked && <StatusBadge label="Blocked" tone="bad" />}
              {s.deletion_requested && <StatusBadge label="Asked to delete" tone="bad" />}
              {s.rider_status === 'approved' && <StatusBadge label="Rider" tone="good" />}
            </View>
            <ThemedText type="small" selectable>
              {s.email ?? 'No email'}
              {s.phone ? ` · ${s.phone}` : ' · no phone'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {s.drop_point ? `${s.drop_point}${s.room_note ? `, ${s.room_note}` : ''}` : 'No usual drop point'} · joined {day(s.joined_at)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {s.orders === 0
                ? 'No orders yet'
                : `${s.orders} ${s.orders === 1 ? 'order' : 'orders'} (${s.completed_orders} completed) · last ${day(s.last_order_at ?? s.joined_at)}`}
              {s.terms_accepted_at ? '' : ' · terms not accepted yet'}
            </ThemedText>
            <View style={styles.row}>
              {s.phone && (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${s.phone}`)}>
                  <ThemedText type="linkPrimary">Call</ThemedText>
                </Pressable>
              )}
              {s.email && (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${s.email}`)}>
                  <ThemedText type="linkPrimary">Email</ThemedText>
                </Pressable>
              )}
            </View>
          </ThemedView>
        ))}
        {students && shown.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {students.length === 0 ? 'No students yet.' : 'Nobody matches that search.'}
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two, maxWidth: MaxContentWidth, paddingBottom: Spacing.six },
  card: { borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  search: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 15 },
  error: { color: '#C62828' },
});
