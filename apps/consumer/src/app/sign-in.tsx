import { Brand, Radius } from '@campuscart/ui';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useAuth, type Side } from '@/lib/auth';

// The first screen of the app: students and shops sign in here, then the app opens their side.
const CHOICES: { side: Side; title: string; hint: string }[] = [
  {
    side: 'student',
    title: "I'm a student",
    hint: 'Order from campus shops. Use your @nith.ac.in Google account.',
  },
  {
    side: 'shop',
    title: 'I run a shop',
    hint: 'Take orders for your shop. Use the Google account the CampusCart team approved.',
  },
];

export default function SignInScreen() {
  const { session, signIn, authError } = useAuth();
  const [busy, setBusy] = useState<Side | null>(null);
  const [localError, setError] = useState<string | null>(null);
  const error = localError ?? authError;
  // Signed in, and the app is reading which side this account belongs to.
  const opening = !!session;

  async function onContinue(side: Side) {
    setBusy(side);
    setError(null);
    try {
      await signIn(side);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(null);
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
            {CHOICES.map(({ side, title, hint }) => {
              const shop = side === 'shop';
              return (
                <Pressable
                  key={side}
                  accessibilityRole="button"
                  accessibilityHint={hint}
                  onPress={() => onContinue(side)}
                  disabled={busy !== null}
                  style={({ pressed }) => [
                    styles.choice,
                    shop && styles.choiceShop,
                    (pressed || busy === side) && styles.choicePressed,
                  ]}>
                  <View style={styles.choiceText}>
                    <Text style={[styles.choiceTitle, shop && styles.onGreen]}>{title}</Text>
                    <Text style={[styles.choiceHint, shop && styles.onGreen]}>{hint}</Text>
                  </View>
                  {busy === side ? (
                    <ActivityIndicator color={shop ? '#ffffff' : Brand.ink} />
                  ) : (
                    <Text style={[styles.choiceGo, shop && styles.onGreen]}>Continue with Google</Text>
                  )}
                </Pressable>
              );
            })}
            {error && <Text style={styles.error}>{error}</Text>}
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
    fontWeight: 800,
  },
  tagline: {
    color: Brand.ink,
    fontSize: 18,
    fontWeight: 600,
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
    fontWeight: 700,
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
    fontWeight: 800,
  },
  choiceHint: {
    color: Brand.ink,
    fontSize: 14,
  },
  choiceGo: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: 700,
  },
  onGreen: {
    color: '#ffffff',
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
