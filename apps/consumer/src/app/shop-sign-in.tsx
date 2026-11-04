import { Brand } from '@campuscart/ui';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdSignInForm } from '@/components/id-sign-in-form';
import { Spacing } from '@/constants/theme';

// Shop owners and counter staff sign in here with the ID and password they were given.
export default function ShopSignInScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Sign in to your shop</Text>
        <Text style={styles.hint}>Use the ID and password from the CampusCart team. Forgot them? Ask the team for a new password.</Text>
        <IdSignInForm />
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
  back: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: 600,
  },
  title: {
    color: Brand.ink,
    fontSize: 28,
    fontWeight: 800,
    marginTop: Spacing.four,
  },
  hint: {
    color: Brand.ink,
    fontSize: 15,
  },
});
