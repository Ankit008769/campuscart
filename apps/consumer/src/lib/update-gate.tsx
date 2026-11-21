import { minAndroidVersionCode } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const PACKAGE = 'com.campuscart.student';
// This build's Android versionCode, from app.json.
const thisBuild: number = Constants.expoConfig?.android?.versionCode ?? 0;

/**
 * True when admins have set a newer minimum build than this one (app_settings). Checked at start
 * and whenever the app comes back to the front. Offline or on error, the app carries on.
 */
export function useUpdateRequired(): boolean {
  const [required, setRequired] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    const check = () =>
      minAndroidVersionCode(supabase).then(
        (min) => active && setRequired(thisBuild > 0 && thisBuild < min),
        () => {},
      );
    check();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return required;
}

/** Fills the screen until the student or shop installs the new version from Google Play. */
export function UpdateRequired() {
  function openStore() {
    Linking.openURL(`market://details?id=${PACKAGE}`).catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${PACKAGE}`),
    );
  }
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <Text style={styles.brand}>CampusCart</Text>
        <Text style={styles.title}>Update to keep ordering</Text>
        <Text style={styles.body}>
          This version is too old to place or take orders. The update takes a minute on Google Play.
        </Text>
        <Pressable accessibilityRole="button" onPress={openStore} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Update on Google Play</Text>
        </Pressable>
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
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  brand: {
    color: Brand.ink,
    fontSize: 32,
    fontWeight: 600,
  },
  title: {
    color: Brand.ink,
    fontSize: 22,
    fontWeight: 600,
  },
  body: {
    color: Brand.ink,
    fontSize: 16,
  },
  button: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    alignItems: 'center',
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 600,
  },
});
