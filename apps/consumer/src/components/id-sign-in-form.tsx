import { Brand, Radius } from '@campuscart/ui';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

/** The ID and password boxes shops and admins sign in with, on the sign-in screens' yellow. */
export function IdSignInForm() {
  const { signInWithLogin } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = loginId.trim() !== '' && password !== '';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signInWithLogin(loginId, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextInput
        value={loginId}
        onChangeText={setLoginId}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        placeholder="ID"
        placeholderTextColor="#6b6b6b"
        accessibilityLabel="ID"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        placeholder="Password"
        placeholderTextColor="#6b6b6b"
        accessibilityLabel="Password"
        onSubmitEditing={() => ready && submit()}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy || !ready}
        onPress={submit}
        style={({ pressed }) => [styles.button, (pressed || busy || !ready) && styles.dimmed]}>
        {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  input: {
    backgroundColor: '#ffffff',
    color: Brand.ink,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
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
