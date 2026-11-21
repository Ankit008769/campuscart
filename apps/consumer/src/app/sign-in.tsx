import { Brand, Radius } from '@campuscart/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsAgree } from '@/components/terms-agree';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { rememberTermsTicked } from '@/lib/terms';

// The first screen of the app. Students continue with Google; shops and admins sign in with an ID.
export default function SignInScreen() {
  const { session, signIn, authError } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  // Students and shops tick the terms before signing in; the tick is recorded once the account opens.
  const [agreed, setAgreed] = useState(false);
  const [nudge, setNudge] = useState(false);
  const error = localError ?? authError;
  // Signed in, and the app is reading which side this account belongs to.
  const opening = !!session;

  /** True when the terms are ticked; otherwise points at the tick box instead of going on. */
  function ready(): boolean {
    if (!agreed) {
      setNudge(true);
      return false;
    }
    rememberTermsTicked();
    return true;
  }

  async function onGoogle(anyAccount: boolean) {
    if (!ready()) return;
    setBusy(true);
    setError(null);
    try {
      await signIn({ anyAccount });
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

        {opening ? (
          <View style={styles.opening}>
            <ActivityIndicator color={Brand.ink} />
            <Text style={styles.question}>Opening CampusCart…</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Text style={styles.question}>How do you use CampusCart?</Text>
            <TermsAgree agreed={agreed} onChange={setAgreed} nudge={nudge} />
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Order from campus shops. Use your @nith.ac.in Google account."
              onPress={() => onGoogle(false)}
              disabled={busy}
              style={({ pressed }) => [styles.choice, (pressed || busy) && styles.choicePressed]}>
              <View style={styles.choiceText}>
                <Text style={styles.choiceTitle}>I&apos;m a student</Text>
                <Text style={styles.choiceHint}>Order from campus shops. Use your @nith.ac.in Google account.</Text>
              </View>
              {busy ? <ActivityIndicator color={Brand.ink} /> : <Text style={styles.choiceGo}>Continue with Google</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Take orders for your shop. Use the ID and password from the CampusCart team."
              onPress={() => ready() && router.push('/shop-sign-in')}
              disabled={busy}
              style={({ pressed }) => [styles.choice, styles.choiceShop, pressed && styles.choicePressed]}>
              <View style={styles.choiceText}>
                <Text style={[styles.choiceTitle, styles.onGreen]}>I run a shop</Text>
                <Text style={[styles.choiceHint, styles.onGreen]}>
                  Take orders for your shop. Use the ID and password from the CampusCart team.
                </Text>
              </View>
              <Text style={[styles.choiceGo, styles.onGreen]}>Sign in with your ID</Text>
            </Pressable>
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.smallLinks}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => onGoogle(true)} hitSlop={8}>
                <Text style={styles.smallLink}>Use another Google account</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/admin-sign-in')} hitSlop={8}>
                <Text style={styles.smallLink}>Admin</Text>
              </Pressable>
            </View>
          </View>
        )}
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
    fontWeight: 600,
  },
  tagline: {
    color: Brand.ink,
    fontSize: 18,
    fontWeight: 500,
  },
  opening: {
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.six,
  },
  actions: {
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  question: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: 600,
  },
  choice: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  choiceShop: {
    backgroundColor: Brand.green,
  },
  choicePressed: {
    opacity: 0.7,
  },
  choiceText: {
    gap: Spacing.one,
  },
  choiceTitle: {
    color: Brand.ink,
    fontSize: 20,
    fontWeight: 600,
  },
  choiceHint: {
    color: Brand.ink,
    fontSize: 14,
  },
  choiceGo: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: 600,
  },
  onGreen: {
    color: '#ffffff',
  },
  smallLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  smallLink: {
    color: Brand.ink,
    fontSize: 13,
    fontWeight: 500,
    opacity: 0.75,
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
