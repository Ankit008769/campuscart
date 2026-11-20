import { createShop, listShopsForAdmin } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { AppVersionCard } from '@/components/app-version-card';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Shop = Awaited<ReturnType<typeof listShopsForAdmin>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

// Every shop on CampusCart, and adding a new one.
export default function AdminShopsScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listShopsForAdmin(supabase).then(
        (next) => active && setShops(next),
        (e: unknown) => active && setError(messageOf(e)),
      );
      return () => {
        active = false;
      };
    }, []),
  );

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const id = await createShop(supabase, { name, kind, phone: phone.trim() || null, prepMinutes: 10 });
      setName('');
      setKind('');
      setPhone('');
      router.push(`/admin/shop/${id}`);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card accessibilityLabel="Monthly bills" onPress={() => router.push('/admin/bills')}>
          <ThemedText type="smallBold">Monthly bills</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Each shop&apos;s orders this month and the ₹4 platform fee to collect.
          </ThemedText>
        </Card>
        {!shops && !error && <ActivityIndicator style={styles.loading} />}
        {shops?.map((shop) => (
          <Card key={shop.id} accessibilityLabel={shop.name} onPress={() => router.push(`/admin/shop/${shop.id}`)}>
            <ThemedText type="smallBold">{shop.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {shop.kind || 'No description'} · {shop.is_open ? 'Open' : 'Closed'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {shop.upi_vpa ? `UPI: ${shop.upi_vpa}` : 'No UPI ID yet'}
            </ThemedText>
          </Card>
        ))}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Add a shop</ThemedText>
          <TextInput value={name} onChangeText={setName} placeholder="Shop name" placeholderTextColor={theme.textSecondary} accessibilityLabel="Shop name" style={inputStyle} />
          <TextInput value={kind} onChangeText={setKind} placeholder="What it sells, like snacks, chai" placeholderTextColor={theme.textSecondary} accessibilityLabel="What it sells" style={inputStyle} />
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone (optional)" placeholderTextColor={theme.textSecondary} accessibilityLabel="Phone" style={inputStyle} />
          <Pressable accessibilityRole="button" disabled={busy || !name.trim()} onPress={add} style={[styles.add, (busy || !name.trim()) && styles.disabled]}>
            <Text style={styles.addText}>Add shop</Text>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            New shops start closed. Give the owner a login on the shop&apos;s page.
          </ThemedText>
        </ThemedView>

        <AppVersionCard />

        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" onPress={signOut}>
          <ThemedText type="linkPrimary">Sign out</ThemedText>
        </Pressable>
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
  add: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    alignItems: 'center',
    padding: Spacing.two,
  },
  addText: {
    color: '#ffffff',
    fontWeight: 600,
  },
  disabled: {
    opacity: 0.45,
  },
  error: {
    color: Brand.red,
    fontSize: 14,
  },
});
