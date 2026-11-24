import { getMyProfile, listDropPoints, normalizeIndianMobile, requestAccountDeletion, updateMyProfile } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { DropPointPicker } from '@/components/drop-point-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardScroll } from '@/components/keyboard-scroll';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type DropPoint = Awaited<ReturnType<typeof listDropPoints>>[number];

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const theme = useTheme();
  const userId = session?.user.id;

  const [loaded, setLoaded] = useState(false);
  const [dropPoints, setDropPoints] = useState<DropPoint[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roomNote, setRoomNote] = useState('');
  const [dropPointId, setDropPointId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([getMyProfile(supabase, userId), listDropPoints(supabase)]).then(
      ([profile, points]) => {
        if (!active) return;
        setName(profile.name);
        setPhone(profile.phone?.replace(/^\+91/, '') ?? '');
        setRoomNote(profile.room_note ?? '');
        setDropPointId(profile.default_drop_point_id);
        setDropPoints(points);
        setLoaded(true);
      },
      (e: unknown) => active && setMessage({ text: e instanceof Error ? e.message : 'Could not load your profile.', ok: false }),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  async function onSave() {
    if (!userId) return;
    const normalized = phone.trim() ? normalizeIndianMobile(phone) : null;
    if (phone.trim() && !normalized) {
      setMessage({ text: 'Enter a 10-digit Indian mobile number.', ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await updateMyProfile(supabase, userId, {
        name: name.trim(),
        phone: normalized,
        roomNote: roomNote.trim() || null,
        defaultDropPointId: dropPointId,
      });
      setMessage({ text: 'Saved.', ok: true });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not save.', ok: false });
    } finally {
      setSaving(false);
    }
  }

  function confirmDeletion() {
    Alert.alert(
      'Delete your account?',
      'Your phone number and hostel details are removed and you are signed out. Past orders stay in the shops’ records.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await requestAccountDeletion(supabase);
              await signOut();
            } catch (e) {
              setMessage({ text: e instanceof Error ? e.message : 'Could not delete the account.', ok: false });
            }
          },
        },
      ],
    );
  }

  if (!loaded && !message) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ThemedView style={styles.container}>
      <KeyboardScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          {session?.user.email}
        </ThemedText>

        <ThemedText type="smallBold">Name</ThemedText>
        <TextInput value={name} onChangeText={setName} maxLength={60} style={inputStyle} placeholderTextColor={theme.textSecondary} />

        <ThemedText type="smallBold">Mobile number</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Shops use it to reach you about an order.
        </ThemedText>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={15}
          placeholder="98765 43210"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />

        <ThemedText type="smallBold">Your usual hostel or drop point</ThemedText>
        <DropPointPicker points={dropPoints} value={dropPointId} onChange={setDropPointId} />

        <ThemedText type="smallBold">Room or wing</ThemedText>
        <TextInput
          value={roomNote}
          onChangeText={setRoomNote}
          maxLength={60}
          placeholder="B-214"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />

        {message && <Text style={[styles.message, message.ok ? styles.ok : styles.bad]}>{message.text}</Text>}

        <Pressable accessibilityRole="button" disabled={saving} onPress={onSave} style={[styles.save, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>Save</Text>}
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={confirmDeletion} style={styles.delete}>
          <Text style={styles.deleteText}>Delete my account</Text>
        </Pressable>
      </KeyboardScroll>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
    marginBottom: Spacing.two,
  },
  message: {
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontSize: 14,
  },
  ok: {
    color: Brand.green,
    backgroundColor: Brand.greenSoft,
  },
  bad: {
    color: Brand.red,
    backgroundColor: Brand.redSoft,
  },
  save: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginVertical: Spacing.two,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  delete: {
    marginTop: Spacing.six,
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  deleteText: {
    color: Brand.red,
    fontWeight: 600,
  },
});
