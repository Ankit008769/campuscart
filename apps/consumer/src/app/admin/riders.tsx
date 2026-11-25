import { decideRider, listRiders, type RiderStatus } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CallButton } from '@/components/call-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Rider = Awaited<ReturnType<typeof listRiders>>[number];

const LABEL: Record<RiderStatus, string> = { applied: 'Waiting for you', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' };
const ORDER: RiderStatus[] = ['applied', 'approved', 'suspended', 'rejected'];
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function confirm(title: string, message: string, ok: string, act: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) act();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Back', style: 'cancel' },
    { text: ok, onPress: act },
  ]);
}

/**
 * Admin → Riders: students who applied to deliver, waiting ones first. Approve or reject an
 * application, suspend an approved rider, or take a suspended one back.
 */
export default function RidersScreen() {
  const theme = useTheme();
  const [riders, setRiders] = useState<Rider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      listRiders(supabase).then(
        (rows) => {
          setRiders([...rows].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)));
          setError(null);
        },
        (e: unknown) => setError(messageOf(e)),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  function decide(r: Rider, status: RiderStatus, note: string) {
    const name = r.profiles?.name ?? 'this student';
    const verb = { approved: 'Approve', rejected: 'Reject', suspended: 'Suspend', applied: 'Reset' }[status];
    confirm(`${verb} ${name}?`, note, verb, async () => {
      setBusy(r.profile_id);
      try {
        await decideRider(supabase, r.profile_id, status, note);
        await reload();
      } catch (e) {
        Alert.alert('Could not do that', messageOf(e));
      } finally {
        setBusy(null);
      }
    });
  }

  const waiting = riders?.filter((r) => r.status === 'applied').length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {!riders && !error && <ActivityIndicator />}
        {error && <Text style={styles.error}>{error}</Text>}
        {riders && (
          <ThemedText type="small" themeColor="textSecondary">
            {riders.length} riders · {waiting} waiting for a decision · {riders.filter((r) => r.status === 'approved' && r.online).length} online now
          </ThemedText>
        )}
        {riders?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Nobody has applied to deliver yet.
          </ThemedText>
        )}
        {riders?.map((r) => (
          <View key={r.profile_id} style={[styles.card, { borderColor: theme.backgroundSelected }, r.status === 'applied' && styles.cardWaiting]}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.text }]}>{r.profiles?.name ?? 'Student'}</Text>
                <ThemedText type="small" themeColor="textSecondary">
                  {LABEL[r.status]}
                  {r.status === 'approved' ? (r.online ? ' · online' : ' · offline') : ''} · applied {day(r.applied_at)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.profiles?.email}
                  {r.upi_vpa ? ` · UPI ${r.upi_vpa}` : ''}
                </ThemedText>
                {!!r.admin_note && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Note: {r.admin_note}
                  </ThemedText>
                )}
              </View>
              <CallButton phone={r.profiles?.phone} who={r.profiles?.name ?? 'the rider'} />
            </View>
            <View style={styles.actions}>
              {r.status === 'applied' && (
                <>
                  <Action label="Approve" busy={busy === r.profile_id} onPress={() => decide(r, 'approved', 'Approved to deliver')} primary />
                  <Action label="Reject" busy={busy === r.profile_id} onPress={() => decide(r, 'rejected', 'Not approved this time')} />
                </>
              )}
              {r.status === 'approved' && (
                <Action label="Suspend" busy={busy === r.profile_id} onPress={() => decide(r, 'suspended', 'Suspended by the CampusCart team')} />
              )}
              {(r.status === 'suspended' || r.status === 'rejected') && (
                <Action label="Approve" busy={busy === r.profile_id} onPress={() => decide(r, 'approved', 'Approved to deliver')} primary />
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

function Action({ label, onPress, busy, primary = false }: { label: string; onPress: () => void; busy: boolean; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[primary ? styles.primary : styles.secondary, busy && styles.disabled]}>
      <Text style={primary ? styles.primaryText : styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  error: { fontFamily: Font.medium, color: Brand.red },
  card: { borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  cardWaiting: { backgroundColor: '#FFFBEF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { fontFamily: Font.bold, fontSize: 15 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  primary: { flex: 1, minHeight: 40, borderRadius: Radius.medium, backgroundColor: Brand.green, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Font.bold, fontSize: 14, color: '#ffffff' },
  secondary: { flex: 1, minHeight: 40, borderRadius: Radius.medium, borderWidth: 1, borderColor: '#DDDDDD', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Font.semibold, fontSize: 14, color: Brand.red },
  disabled: { opacity: 0.5 },
});
