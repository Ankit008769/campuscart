import { Brand, Radius } from '@campuscart/ui';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';

/** Shown in place of the order button until the student saves a mobile number; shops need it to call. */
export function PhoneRequired() {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Add your mobile number to order</Text>
      <Text style={styles.body}>The shop calls you if something runs out or when they reach your drop point.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.button}>
        <Text style={styles.buttonText}>Add mobile number</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Brand.yellowSoft,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  title: {
    color: Brand.ink,
    fontSize: 15,
    fontWeight: 600,
  },
  body: {
    color: Brand.ink,
    fontSize: 14,
  },
  button: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    alignItems: 'center',
    padding: Spacing.three,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 600,
  },
});
