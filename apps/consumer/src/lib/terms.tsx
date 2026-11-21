import { TERMS_VERSION, acceptTerms, normalizeIndianMobile, updateMyProfile } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsBody } from '@/components/terms-body';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { phoneSaved } from '@/hooks/use-needs-phone';
import { useTheme } from '@/hooks/use-theme';
import type { Side } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// The tick on the sign-in screen happens before there is an account to record it on, so it waits
// here until sign-in finishes. Each account's agreed version is cached so later launches skip the check,
// and the phone question is asked once per account on this phone (the cart asks again when it's needed).
const TICKED_KEY = 'campuscart:terms-ticked';
const agreedKey = (userId: string) => `campuscart:terms:${userId}`;
const phoneAskedKey = (userId: string) => `campuscart:phone-asked:${userId}`;

/** Called when someone ticks "I agree" on the sign-in screen and goes on to sign in. */
export function rememberTermsTicked(): void {
  AsyncStorage.setItem(TICKED_KEY, String(TERMS_VERSION)).catch(() => {});
}

/**
 * The welcome card after signing in, asking only for what is missing:
 * - the terms: ticked on this phone before signing in, they are recorded quietly; otherwise (signed
 *   in before the terms existed, or the terms changed) the card asks;
 * - a student's mobile number, so shops can call: asked once up front instead of at the first
 *   checkout. It can be skipped; the cart still asks before the first order.
 * If the check can't run (offline), nobody is blocked.
 */
export function TermsGate({ userId, side }: { userId: string | null; side: Side | null }) {
  const theme = useTheme();
  // What this account still has to do; kept with its id so it never shows for the next account.
  const [ask, setAsk] = useState<{ userId: string; terms: boolean; phone: boolean } | null>(null);
  const needTerms = !!ask && ask.userId === userId && ask.terms;
  const needPhone = !!ask && ask.userId === userId && ask.phone;
  const setNeedTerms = (terms: boolean) => setAsk((prev) => prev && { ...prev, terms });
  const setNeedPhone = (phone: boolean) => setAsk((prev) => prev && { ...prev, phone });
  const [phone, setPhone] = useState('');
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || (side !== 'student' && side !== 'shop')) return;
    let active = true;
    (async () => {
      const [agreed, phoneAsked, ticked] = (
        await AsyncStorage.multiGet([agreedKey(userId), phoneAskedKey(userId), TICKED_KEY]).catch(() => [])
      ).map(([, value]) => value);
      const termsDone = Number(agreed) >= TERMS_VERSION;
      const askPhone = side === 'student' && !phoneAsked;
      if (termsDone && !askPhone) return;

      const { data, error: readError } = await supabase.from('profiles').select('terms_version, phone').eq('id', userId).single();
      if (readError) throw readError;
      if (!active) return;

      let terms = false;
      if (data.terms_version >= TERMS_VERSION) {
        await AsyncStorage.setItem(agreedKey(userId), String(TERMS_VERSION)).catch(() => {});
      } else if (Number(ticked) >= TERMS_VERSION) {
        await acceptTerms(supabase);
        await AsyncStorage.setItem(agreedKey(userId), String(TERMS_VERSION)).catch(() => {});
        await AsyncStorage.removeItem(TICKED_KEY).catch(() => {});
      } else {
        terms = true;
      }
      const phone = askPhone && !data.phone?.trim();
      if (active && (terms || phone)) setAsk({ userId, terms, phone });
    })().catch((e: unknown) => console.warn('Could not check the terms', e));
    return () => {
      active = false;
    };
  }, [userId, side]);

  async function save() {
    if (!userId) return;
    const mobile = needPhone ? normalizeIndianMobile(phone) : null;
    if (needPhone && !mobile) {
      setError('Enter your 10-digit mobile number, or tap “Add it later”.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mobile) {
        await updateMyProfile(supabase, userId, { phone: mobile });
        phoneSaved();
        await AsyncStorage.setItem(phoneAskedKey(userId), '1').catch(() => {});
        setNeedPhone(false);
      }
      if (needTerms) {
        await acceptTerms(supabase);
        await AsyncStorage.setItem(agreedKey(userId), String(TERMS_VERSION)).catch(() => {});
        setNeedTerms(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  function later() {
    if (userId) AsyncStorage.setItem(phoneAskedKey(userId), '1').catch(() => {});
    setNeedPhone(false);
    setError(null);
  }

  if (!userId || (!needTerms && !needPhone)) return null;

  if (reading) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setReading(false)}>
        <ThemedView style={styles.flex}>
          <SafeAreaView style={styles.flex}>
            <ScrollView contentContainerStyle={styles.reading}>
              <TermsBody />
            </ScrollView>
            <View style={styles.readingBar}>
              <Pressable accessibilityRole="button" onPress={() => setReading(false)} style={styles.primary}>
                <Text style={styles.primaryText}>Back</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </ThemedView>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="section">{needTerms ? 'Welcome to Campus Cart' : 'One quick thing'}</ThemedText>

          {needPhone && (
            <View style={styles.block}>
              <ThemedText type="smallBold">Your mobile number</ThemedText>
              <TextInput
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  setError(null);
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={15}
                placeholder="98765 43210"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Your mobile number"
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
              <ThemedText type="small" themeColor="textSecondary">
                The shop calls this number if something runs out or when they reach your drop point. Nobody else sees it.
              </ThemedText>
            </View>
          )}

          {needTerms && (
            <View style={styles.block}>
              <ThemedText type="small" themeColor="textSecondary">
                The shop makes and hands over your order, you pay the shop directly, you always see the full price first, and we
                help if something goes wrong.
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={() => setReading(true)} hitSlop={6}>
                <ThemedText type="linkPrimary">Read the Terms &amp; Conditions</ThemedText>
              </Pressable>
            </View>
          )}

          <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[styles.primary, busy && styles.busy]}>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryText}>{needTerms ? 'I agree, continue' : 'Save number'}</Text>
            )}
          </Pressable>
          {needPhone && (
            <Pressable accessibilityRole="button" onPress={later} hitSlop={6} style={styles.later}>
              <ThemedText type="small" themeColor="textSecondary">
                Add it later
              </ThemedText>
            </Pressable>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </ThemedView>
      </View>
    </Modal>
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
  block: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    fontSize: 16,
    letterSpacing: 1,
  },
  reading: {
    padding: Spacing.three,
    paddingBottom: Spacing.four,
  },
  readingBar: {
    padding: Spacing.three,
  },
  primary: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  busy: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 600,
  },
  later: {
    alignSelf: 'center',
  },
  error: {
    color: Brand.red,
    fontSize: 13,
  },
});
