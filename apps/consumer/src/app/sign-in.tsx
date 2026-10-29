import { Brand, Radius } from '@campuscart/ui';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function SignInScreen() {
  const { signIn, authError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  const error = localError ?? authError;

  async function onContinue() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <View style={styles.hero}>
          <Text style={styles.brand}>CampusCart</Text>
          <Text style={styles.tagline}>Campus shops, delivered to your hostel.</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onContinue}
            disabled={busy}
            style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}>
            {busy ? <ActivityIndicator color={Brand.ink} /> : <Text style={styles.buttonText}>Continue with Google</Text>}
          </Pressable>
          <Text style={styles.hint}>Use your @nith.ac.in college account.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.yellow,
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.four,
  },
  hero: {
    marginTop: Spacing.six,
    gap: Spacing.two,
  },
  brand: {
    color: Brand.ink,
    fontSize: 40,
    fontWeight: 800,
  },
  tagline: {
    color: Brand.ink,
    fontSize: 18,
    fontWeight: 600,
  },
  actions: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  button: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: 700,
  },
  hint: {
    color: Brand.ink,
    fontSize: 14,
    textAlign: 'center',
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
