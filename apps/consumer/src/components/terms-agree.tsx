import { PRIVACY_POLICY_URL } from '@campuscart/core';
import { Brand } from '@campuscart/ui';
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsBody } from '@/components/terms-body';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * The small "I agree" tick on the first screen, with links to the terms and the privacy policy.
 * `nudge` turns it red after someone tapped a sign-in button without ticking it.
 */
export function TermsAgree({ agreed, onChange, nudge }: { agreed: boolean; onChange: (agreed: boolean) => void; nudge: boolean }) {
  const warn = nudge && !agreed;
  const [reading, setReading] = useState(false);
  return (
    <View style={styles.row}>
      <Modal visible={reading} animationType="slide" onRequestClose={() => setReading(false)}>
        <ThemedView style={styles.flex}>
          <SafeAreaView style={styles.flex}>
            <View style={styles.sheetHeader}>
              <ThemedText type="section" style={styles.flex}>
                Terms &amp; Conditions
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={() => setReading(false)} hitSlop={8}>
                <ThemedText type="linkPrimary">Close</ThemedText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheet}>
              <TermsBody />
            </ScrollView>
          </SafeAreaView>
        </ThemedView>
      </Modal>
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
        <Text style={styles.link} accessibilityRole="link" onPress={() => setReading(true)}>
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
  flex: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
  },
  sheet: {
    padding: Spacing.three,
    paddingTop: 0,
    paddingBottom: Spacing.six,
  },
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
