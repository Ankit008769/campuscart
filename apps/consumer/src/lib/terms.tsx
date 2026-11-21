import { TERMS_VERSION, acceptTerms, myTermsVersion } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsBody } from '@/components/terms-body';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// The tick on the sign-in screen happens before there is an account to record it on, so it waits
// here until sign-in finishes. Each account's agreed version is cached so later launches skip the check.
const TICKED_KEY = 'campuscart:terms-ticked';
const agreedKey = (userId: string) => `campuscart:terms:${userId}`;

/** Called when someone ticks "I agree" on the sign-in screen and goes on to sign in. */
export function rememberTermsTicked(): void {
  AsyncStorage.setItem(TICKED_KEY, String(TERMS_VERSION)).catch(() => {});
}

/**
 * Makes sure a signed-in student or shop has agreed to the current terms. Ticked on this phone
 * before signing in: it is recorded quietly. Not yet (someone signed in before the terms existed,
 * or the terms changed): a pop-up asks once. If the check can't run (offline), nobody is blocked.
 */
export function TermsGate({ userId }: { userId: string | null }) {
  const [asking, setAsking] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      if (Number(await AsyncStorage.getItem(agreedKey(userId)).catch(() => null)) >= TERMS_VERSION) return;
      const version = await myTermsVersion(supabase, userId);
      if (version < TERMS_VERSION) {
        const ticked = Number(await AsyncStorage.getItem(TICKED_KEY).catch(() => null)) >= TERMS_VERSION;
        if (!ticked) {
          if (active) setAsking(true);
          return;
        }
        await acceptTerms(supabase);
      }
      await AsyncStorage.multiSet([[agreedKey(userId), String(TERMS_VERSION)]]).catch(() => {});
      await AsyncStorage.removeItem(TICKED_KEY).catch(() => {});
    })().catch((e: unknown) => console.warn('Could not check the terms', e));
    return () => {
      active = false;
    };
  }, [userId]);

  async function agree() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(supabase);
      await AsyncStorage.setItem(agreedKey(userId), String(TERMS_VERSION)).catch(() => {});
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!userId || !asking) return null;
  return (
    <Modal visible transparent={!reading} animationType="fade" onRequestClose={() => setReading(false)}>
      {reading ? (
        <ThemedView style={styles.flex}>
          <SafeAreaView style={styles.flex}>
            <ScrollView contentContainerStyle={styles.reading}>
              <TermsBody />
            </ScrollView>
            <View style={styles.readingBar}>
              <AgreeButton busy={busy} onPress={agree} />
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          </SafeAreaView>
        </ThemedView>
      ) : (
        <View style={styles.backdrop}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="section">Our Terms &amp; Conditions</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              To keep things clear and fair for students and shops, please read and agree to the Campus Cart terms. In short: the
              shop makes and hands over your order, you pay the shop directly, you always see the full price first, and we help if
              something goes wrong.
            </ThemedText>
            <Pressable accessibilityRole="button" onPress={() => setReading(true)} hitSlop={6}>
              <ThemedText type="linkPrimary">Read the full terms</ThemedText>
            </Pressable>
            <AgreeButton busy={busy} onPress={agree} />
            {error && <Text style={styles.error}>{error}</Text>}
          </ThemedView>
        </View>
      )}
    </Modal>
  );
}

function AgreeButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.agree, busy && styles.busy]}>
      {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.agreeText}>I agree, continue</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: Spacing.three,
  },
  card: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  reading: {
    padding: Spacing.three,
    paddingBottom: Spacing.four,
  },
  readingBar: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  agree: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  busy: {
    opacity: 0.6,
  },
  agreeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 600,
  },
  error: {
    color: Brand.red,
    fontSize: 13,
  },
});
