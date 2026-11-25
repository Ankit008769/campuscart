import { ORDER_STATUS_LABEL, formatPaise, listOrderEvents, searchOrders } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CallButton } from '@/components/call-button';
import { KeyboardScroll } from '@/components/keyboard-scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Hit = Awaited<ReturnType<typeof searchOrders>>[number];
type Event = Awaited<ReturnType<typeof listOrderEvents>>[number];

const OPEN = new Set(['scheduled', 'placed', 'accepted', 'ready', 'out_for_delivery']);
const WHO: Record<string, string> = { student: 'Student', shop: 'Shop', rider: 'Rider', admin: 'Admin', system: 'CampusCart' };
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Admin → Find an order: any order, open or old, by its code or the student's name, phone or email,
 * with every status change (who made it and why) and a call button for the student.
 */
export default function FindOrderScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ query: string; rows: Hit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, Event[]>>({});

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      searchOrders(supabase, { query: trimmed }).then(
        (rows) => {
          if (!active) return;
          setHits({ query: trimmed, rows });
          setError(null);
        },
        (e: unknown) => active && setError(messageOf(e)),
      );
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  function toggle(id: string) {
    setOpened(opened === id ? null : id);
    if (events[id]) return;
    listOrderEvents(supabase, id).then(
      (rows) => setEvents((all) => ({ ...all, [id]: rows })),
      (e: unknown) => setError(messageOf(e)),
    );
  }

  const rows = hits && hits.query === trimmed ? hits.rows : null;

  return (
    <ThemedView style={styles.container}>
      <KeyboardScroll contentContainerStyle={styles.content}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Order code, student name, phone or email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        {trimmed.length >= 2 && !rows && !error && <ActivityIndicator />}
        {trimmed.length < 2 && (
          <ThemedText type="small" themeColor="textSecondary">
            Type at least two letters or digits.
          </ThemedText>
        )}
        {rows?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No order matches “{trimmed}”.
          </ThemedText>
        )}
        {rows?.map((o) => (
          <View key={o.id} style={[styles.card, { borderColor: theme.backgroundSelected }]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: opened === o.id }} onPress={() => toggle(o.id)}>
              <View style={styles.row}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  #{o.code} · {o.shop_name}
                </Text>
                <Text style={[styles.status, OPEN.has(o.status) && styles.statusOpen]}>{ORDER_STATUS_LABEL[o.status]}</Text>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {when(o.placed_at)} · {o.mode === 'delivery' ? 'Delivery' : 'Pickup'} · {formatPaise(o.total_paise)}
              </ThemedText>
              <ThemedText type="small">
                {o.student_name}
                {o.student_email ? ` · ${o.student_email}` : ''}
              </ThemedText>
            </Pressable>
            {opened === o.id && (
              <View style={styles.details}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    {!events[o.id] && <ActivityIndicator />}
                    {events[o.id]?.map((e) => (
                      <ThemedText key={e.id} type="small">
                        {when(e.at)} · {e.from_status ? `${ORDER_STATUS_LABEL[e.from_status]} → ` : ''}
                        {ORDER_STATUS_LABEL[e.to_status]} · {WHO[e.actor] ?? e.actor}
                        {e.note ? ` (“${e.note}”)` : ''}
                      </ThemedText>
                    ))}
                  </View>
                  <CallButton phone={o.student_phone} label="Student" who={o.student_name} />
                </View>
                {OPEN.has(o.status) && (
                  <Pressable accessibilityRole="button" onPress={() => router.push('/admin/orders')} style={styles.link}>
                    <Text style={styles.linkText}>Open in Live orders to finish or cancel it →</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}
      </KeyboardScroll>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, gap: 4 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, paddingVertical: 10, fontSize: 15, fontFamily: Font.regular },
  error: { fontFamily: Font.medium, color: Brand.red },
  card: { borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1, fontFamily: Font.bold, fontSize: 14 },
  status: { fontFamily: Font.semibold, fontSize: 12, color: '#5A5A5A' },
  statusOpen: { color: Brand.green },
  details: { marginTop: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDDDDD', gap: Spacing.two },
  link: { paddingVertical: 4 },
  linkText: { fontFamily: Font.semibold, fontSize: 13, color: Brand.green },
});
