import { DEFAULT_FEE_RULES, formatPaise, listAllDropPoints, listCampaigns, sendCampaign, type Audience } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardScroll } from '@/components/keyboard-scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Campaign = Awaited<ReturnType<typeof listCampaigns>>[number];
type DropPoint = Awaited<ReturnType<typeof listAllDropPoints>>[number];

// The database's limits (campaigns table): a short title, a body that fits on a lock screen.
const TITLE_MAX = 60;
const BODY_MAX = 140;

// Ready-made messages to start from; every one can be edited before sending.
const TEMPLATES: { label: string; title: string; body: string }[] = [
  { label: '🍔 Late-night', title: 'Hungry at midnight? 🌙', body: 'Campus shops are open late tonight. Order now and get it at your hostel.' },
  { label: '🛵 Free delivery', title: 'Free delivery today 🛵', body: `Order from ${formatPaise(DEFAULT_FEE_RULES.smallCartLimitPaise)} and delivery is on us. Pickup is always free.` },
  { label: '🆕 New shop', title: 'A new shop just opened 🎉', body: 'Fresh menu, campus prices. Open Campus Cart and have a look.' },
  { label: '☔ Rain', title: 'Raining? Stay in ☔', body: 'Hot chai, maggi and momos, delivered to your hostel. No umbrella needed.' },
  { label: '📚 Exams', title: 'Exam fuel, delivered 📚', body: 'Snacks, coffee and printouts without leaving your desk. Good luck!' },
  { label: '⚠️ Notice', title: 'A quick note from Campus Cart', body: '' },
];

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Admins send a push notification to students' phones: every student, one hostel or one batch.
 * At most three go out a day (send_campaign enforces it), so students don't learn to ignore them.
 */
export default function NotifyScreen() {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>({ dropPointId: null, batch: null });
  const [dropPoints, setDropPoints] = useState<DropPoint[]>([]);
  const [recent, setRecent] = useState<Campaign[] | null>(null);
  // How many went out in the last 24 hours, counted when the list loads.
  const [sentToday, setSentToday] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecent = useCallback(
    () =>
      listCampaigns(supabase).then((rows) => {
        const since = Date.now() - 24 * 60 * 60 * 1000;
        return { rows, today: rows.filter((c) => new Date(c.sent_at).getTime() > since).length };
      }),
    [],
  );
  const showRecent = useCallback(({ rows, today }: { rows: Campaign[]; today: number }) => {
    setRecent(rows);
    setSentToday(today);
  }, []);
  useEffect(() => {
    let active = true;
    fetchRecent().then((r) => active && showRecent(r), () => active && setRecent([]));
    listAllDropPoints(supabase).then((rows) => active && setDropPoints(rows.filter((d) => d.active)), () => {});
    return () => {
      active = false;
    };
  }, [fetchRecent, showRecent]);

  const kind = audience.dropPointId ? 'hostel' : audience.batch !== null ? 'batch' : 'all';
  const hostel = dropPoints.find((d) => d.id === audience.dropPointId);
  const who = hostel ? `students of ${hostel.name}` : audience.batch ? `the 20${audience.batch} batch` : 'every student';
  const problem = !title.trim()
    ? 'Write a title.'
    : !body.trim()
      ? 'Write the message.'
      : kind === 'batch' && !/^\d{2}$/.test(audience.batch ?? '')
        ? 'Enter the batch as two digits, like 24.'
        : null;

  function send() {
    if (problem) {
      setError(problem);
      return;
    }
    Alert.alert('Send this notification?', `“${title.trim()}” goes to ${who} now. It can't be taken back.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          setSending(true);
          setError(null);
          try {
            const reached = await sendCampaign(supabase, { title: title.trim(), body: body.trim(), ...audience });
            setTitle('');
            setBody('');
            showRecent(await fetchRecent());
            Alert.alert('Sent', `On its way to ${reached} ${reached === 1 ? 'student' : 'students'}.`);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not send it.');
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  }

  const input = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ThemedView style={styles.container}>
      <KeyboardScroll contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Goes to students&apos; phones as a push notification. {sentToday}/3 sent in the last 24 hours.
        </ThemedText>

        <Text style={[styles.label, { color: theme.text }]}>Start from</Text>
        <View style={styles.chips}>
          {TEMPLATES.map((t) => (
            <Pressable
              key={t.label}
              accessibilityRole="button"
              onPress={() => {
                setTitle(t.title);
                setBody(t.body);
                setError(null);
              }}
              style={[styles.chip, { borderColor: theme.backgroundSelected }]}>
              <Text style={[styles.chipText, { color: theme.text }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: theme.text }]}>Title</Text>
        <TextInput
          value={title}
          onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
          placeholder="Hungry at midnight? 🌙"
          placeholderTextColor={theme.textSecondary}
          style={input}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
          {title.length}/{TITLE_MAX}
        </ThemedText>

        <Text style={[styles.label, { color: theme.text }]}>Message</Text>
        <TextInput
          value={body}
          onChangeText={(t) => setBody(t.slice(0, BODY_MAX))}
          placeholder="Short and clear: what, and why open the app now."
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[input, styles.multiline]}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
          {body.length}/{BODY_MAX}
        </ThemedText>

        <Text style={[styles.label, { color: theme.text }]}>Send to</Text>
        <View style={styles.chips}>
          {(
            [
              ['all', 'Every student', { dropPointId: null, batch: null }],
              ['hostel', 'One hostel', { dropPointId: dropPoints[0]?.id ?? null, batch: null }],
              ['batch', 'One batch', { dropPointId: null, batch: '' }],
            ] as const
          ).map(([k, label, next]) => (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
              disabled={k === 'hostel' && !dropPoints.length}
              onPress={() => setAudience(next)}
              style={[styles.chip, { borderColor: theme.backgroundSelected }, kind === k && styles.chipOn]}>
              <Text style={[styles.chipText, { color: theme.text }, kind === k && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {kind === 'hostel' && (
          <View style={styles.chips}>
            {dropPoints.map((d) => (
              <Pressable
                key={d.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: d.id === audience.dropPointId }}
                onPress={() => setAudience({ dropPointId: d.id, batch: null })}
                style={[styles.chip, { borderColor: theme.backgroundSelected }, d.id === audience.dropPointId && styles.chipOn]}>
                <Text style={[styles.chipText, { color: theme.text }, d.id === audience.dropPointId && styles.chipTextOn]}>{d.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {kind === 'batch' && (
          <TextInput
            value={audience.batch ?? ''}
            onChangeText={(t) => setAudience({ dropPointId: null, batch: t.replace(/\D/g, '').slice(0, 2) })}
            placeholder="Batch year, like 24"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={2}
            style={input}
          />
        )}

        <Text style={[styles.label, { color: theme.text }]}>Preview</Text>
        <View style={styles.preview}>
          <Text style={styles.previewApp}>Campus Cart · now</Text>
          <Text style={styles.previewTitle}>{title.trim() || 'Your title'}</Text>
          <Text style={styles.previewBody}>{body.trim() || 'Your message'}</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          accessibilityRole="button"
          disabled={sending || sentToday >= 3}
          onPress={send}
          style={[styles.send, (sending || sentToday >= 3) && styles.disabled]}>
          {sending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.sendText}>Send to {who}</Text>}
        </Pressable>
        {sentToday >= 3 && (
          <ThemedText type="small" themeColor="textSecondary">
            Three went out in the last 24 hours. The next one can go when the oldest is a day old.
          </ThemedText>
        )}

        <Text style={[styles.label, { color: theme.text }]}>Sent before</Text>
        {!recent && <ActivityIndicator />}
        {recent?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing sent yet.
          </ThemedText>
        )}
        {recent?.slice(0, 15).map((c) => (
          <View key={c.id} style={[styles.past, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">{c.title}</ThemedText>
            {!!c.body && (
              <ThemedText type="small" themeColor="textSecondary">
                {c.body}
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {when(c.sent_at)} · {c.drop_points?.name ?? (c.batch ? `20${c.batch} batch` : 'Every student')} · {c.recipients} students
            </ThemedText>
          </View>
        ))}
      </KeyboardScroll>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  label: { fontFamily: Font.bold, fontSize: 14, marginTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: Brand.green, borderColor: Brand.green },
  chipText: { fontFamily: Font.medium, fontSize: 13 },
  chipTextOn: { color: '#ffffff' },
  input: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, paddingVertical: 10, fontSize: 15, fontFamily: Font.regular },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  count: { alignSelf: 'flex-end' },
  preview: { borderRadius: 14, padding: Spacing.three, backgroundColor: '#F2F2F2', gap: 2 },
  previewApp: { fontFamily: Font.medium, fontSize: 11, color: '#6B6B6B' },
  previewTitle: { fontFamily: Font.bold, fontSize: 14, color: '#1C1C1C' },
  previewBody: { fontFamily: Font.regular, fontSize: 13, color: '#3D3D3D' },
  error: { fontFamily: Font.medium, fontSize: 13, color: Brand.red },
  send: { marginTop: Spacing.two, minHeight: 50, borderRadius: Radius.medium, backgroundColor: Brand.green, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: Font.bold, fontSize: 15, color: '#ffffff' },
  disabled: { opacity: 0.5 },
  past: { borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, gap: 2 },
});
