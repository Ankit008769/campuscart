import { authenticatorStatus, startAuthenticatorSetup, verifyAuthenticatorCode, type AuthenticatorSetup } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdSignInForm } from '@/components/id-sign-in-form';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

// Admin sign-in: ID and password, then a Google Authenticator code. The database gives admins no
// powers until the code is accepted, so this screen is a convenience, not the protection.
export default function AdminSignInScreen() {
  const { session, needsAdminCode, signOut } = useAuth();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          {needsAdminCode ? (
            <>
              <Pressable accessibilityRole="button" onPress={signOut} hitSlop={8}>
                <Text style={styles.back}>‹ Sign out</Text>
              </Pressable>
              <CodeStep />
            </>
          ) : session ? (
            <ActivityIndicator color={Brand.ink} style={styles.opening} />
          ) : (
            <>
              <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.back}>‹ Back</Text>
              </Pressable>
              <Text style={styles.title}>Admin</Text>
              <IdSignInForm />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function CodeStep() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const status = await authenticatorStatus(supabase);
      if (status.factorId) {
        if (active) setFactorId(status.factorId);
        return;
      }
      const next = await startAuthenticatorSetup(supabase);
      if (active) {
        setSetup(next);
        setFactorId(next.factorId);
      }
    })().catch((e: unknown) => active && setError(messageOf(e)));
    return () => {
      active = false;
    };
  }, []);

  async function verify() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyAuthenticatorCode(supabase, factorId, code);
    } catch (e) {
      setError(messageOf(e));
      setCode('');
      setBusy(false);
    }
  }

  if (!factorId) return error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={Brand.ink} style={styles.opening} />;

  return (
    <>
      <Text style={styles.title}>{setup ? 'Link Google Authenticator' : 'Enter your code'}</Text>
      {setup ? (
        <>
          <Text style={styles.hint}>
            This is done once. Add CampusCart to Google Authenticator, then type the 6-digit code it shows.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => Linking.openURL(setup.uri).catch(() => setError('Install Google Authenticator first, or type the key below into it.'))}
            style={({ pressed }) => [styles.button, pressed && styles.dimmed]}>
            <Text style={styles.buttonText}>Open Google Authenticator</Text>
          </Pressable>
          <Text style={styles.hint}>Or enter this setup key in the app:</Text>
          <Text selectable style={styles.key}>
            {setup.secret}
          </Text>
        </>
      ) : (
        <Text style={styles.hint}>Open Google Authenticator and type the 6-digit CampusCart code.</Text>
      )}
      <TextInput
        value={code}
        onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        placeholder="6-digit code"
        placeholderTextColor="#6b6b6b"
        accessibilityLabel="6-digit code"
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy || code.length !== 6}
        onPress={verify}
        style={({ pressed }) => [styles.button, (pressed || busy || code.length !== 6) && styles.dimmed]}>
        {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Continue</Text>}
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.yellow,
  },
  safe: {
    flex: 1,
  },
  inner: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  opening: {
    marginTop: Spacing.six,
  },
  back: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: 500,
  },
  title: {
    color: Brand.ink,
    fontSize: 28,
    fontWeight: 600,
    marginTop: Spacing.four,
  },
  hint: {
    color: Brand.ink,
    fontSize: 15,
  },
  key: {
    backgroundColor: '#ffffff',
    color: Brand.ink,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#ffffff',
    color: Brand.ink,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 20,
    letterSpacing: 4,
  },
  button: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    alignItems: 'center',
    padding: Spacing.three,
  },
  dimmed: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 600,
  },
  error: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
    textAlign: 'center',
  },
});
