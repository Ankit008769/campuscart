import { PRIVACY_POLICY_URL } from '@campuscart/core';
import { Brand } from '@campuscart/ui';
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';

/**
 * The small "I agree" tick on the first screen, with links to the terms and the privacy policy.
 * `nudge` turns it red after someone tapped a sign-in button without ticking it.
 */
export function TermsAgree({ agreed, onChange, nudge }: { agreed: boolean; onChange: (agreed: boolean) => void; nudge: boolean }) {
  const warn = nudge && !agreed;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel="I agree to the Terms & Conditions and the Privacy Policy"
        onPress={() => onChange(!agreed)}
        hitSlop={10}
        style={[styles.box, agreed && styles.boxOn, warn && styles.boxWarn]}>
        {agreed && <Text style={styles.tick}>✓</Text>}
      </Pressable>
      <Text style={[styles.text, warn && styles.textWarn]} onPress={() => onChange(!agreed)}>
        I agree to the{' '}
        <Text style={styles.link} accessibilityRole="link" onPress={() => router.push('/terms')}>
          Terms &amp; Conditions
        </Text>{' '}
        and{' '}
        <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          Privacy Policy
        </Text>
        {warn ? '. Tick this to continue.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  boxOn: {
    backgroundColor: Brand.green,
    borderColor: Brand.green,
  },
  boxWarn: {
    borderColor: Brand.red,
  },
  tick: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
  },
  text: {
    flex: 1,
    color: Brand.ink,
    fontSize: 13,
  },
  textWarn: {
    color: Brand.red,
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: 600,
  },
});
