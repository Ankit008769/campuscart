import { isUpiVpa, listShopsForAdmin, updateShop } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { ShopLogins } from '@/components/shop-logins';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Shop = Awaited<ReturnType<typeof listShopsForAdmin>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

// One shop: its details, where students pay it, and who can sign in to it.
export default function AdminShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [shop, setShop] = useState<Shop | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [phone, setPhone] = useState('');
  const [upi, setUpi] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listShopsForAdmin(supabase).then(
      (shops) => {
        const found = shops.find((s) => s.id === id);
        if (!active) return;
        if (!found) {
          setError('This shop no longer exists.');
          return;
        }
        setShop(found);
        setName(found.name);
        setKind(found.kind);
        setPhone(found.phone ?? '');
        setUpi(found.upi_vpa ?? '');
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [id]);

  async function save() {
    const upiId = upi.trim();
    if (upiId && !isUpiVpa(upiId)) {
      setError('Enter a UPI ID like name@okaxis.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateShop(supabase, id, { name: name.trim(), kind: kind.trim(), phone: phone.trim() || null, upi_vpa: upiId || null });
      setMessage('Saved.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: shop?.name ?? 'Shop' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!shop && !error && <ActivityIndicator style={styles.loading} />}
        {shop && (
          <>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Details</ThemedText>
              <TextInput value={name} onChangeText={setName} placeholder="Shop name" placeholderTextColor={theme.textSecondary} accessibilityLabel="Shop name" style={inputStyle} />
              <TextInput value={kind} onChangeText={setKind} placeholder="What it sells" placeholderTextColor={theme.textSecondary} accessibilityLabel="What it sells" style={inputStyle} />
              <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone" placeholderTextColor={theme.textSecondary} accessibilityLabel="Phone" style={inputStyle} />
              <ThemedText type="smallBold">Payments</ThemedText>
              <TextInput
                value={upi}
                onChangeText={setUpi}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="UPI ID, like name@okaxis"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="UPI ID"
                style={inputStyle}
              />
              <ThemedText type="small" themeColor="textSecondary">
                Students pay this UPI ID at handover. Check it with the shop: the money goes straight there.
              </ThemedText>
              <Pressable accessibilityRole="button" disabled={busy || !name.trim()} onPress={save} style={[styles.save, (busy || !name.trim()) && styles.disabled]}>
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
              {message && <ThemedText type="small">{message}</ThemedText>}
            </ThemedView>
            <ShopLogins shopId={shop.id} admin />
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  loading: {
    marginTop: Spacing.five,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  save: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    alignItems: 'center',
    padding: Spacing.two,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: 700,
  },
  disabled: {
    opacity: 0.45,
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
