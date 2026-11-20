import { minAndroidVersionCode, setMinAndroidVersionCode } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const thisBuild: number = Constants.expoConfig?.android?.versionCode ?? 0;
const thisVersion = Constants.expoConfig?.version ?? '';

/**
 * Makes older app builds show "Update to keep ordering" until they install this one. Only press it
 * once this build is live on Google Play, or people will have nothing to update to.
 */
export function AppVersionCard() {
  const [min, setMin] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    minAndroidVersionCode(supabase).then(setMin, () => setMessage('Could not read the update setting.'));
  }, []);

  async function save(next: number) {
    setMessage(null);
    try {
      await setMinAndroidVersionCode(supabase, next);
      setMin(next);
      setConfirming(false);
      setMessage(next === 0 ? 'Every version can order again.' : `Builds older than ${thisVersion} now have to update.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">App updates</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {min === null
          ? 'Checking…'
          : min === 0
            ? `Every version can order. This phone runs ${thisVersion} (build ${thisBuild}).`
            : `Builds older than ${min} must update. This phone runs ${thisVersion} (build ${thisBuild}).`}
      </ThemedText>
      {min !== null && min < thisBuild && !confirming && (
        <Pressable accessibilityRole="button" onPress={() => setConfirming(true)}>
          <ThemedText type="linkPrimary">Make everyone update to {thisVersion}</ThemedText>
        </Pressable>
      )}
      {confirming && (
        <View style={styles.confirm}>
          <ThemedText type="small">Only do this once {thisVersion} is live on Google Play. Older phones will stop until they update.</ThemedText>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={() => save(thisBuild)} style={styles.button}>
              <Text style={styles.buttonText}>Yes, require {thisVersion}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setConfirming(false)}>
              <ThemedText type="linkPrimary">Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
      {min !== null && min > 0 && (
        <Pressable accessibilityRole="button" onPress={() => save(0)}>
          <ThemedText type="linkPrimary">Let every version order again</ThemedText>
        </Pressable>
      )}
      {message && <ThemedText type="small">{message}</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  confirm: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  button: {
    backgroundColor: Brand.red,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
  },
});
