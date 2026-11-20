import { MIN_PASSWORD, createShopLogin, isLoginId, listShopStaff, loginIdOf, removeShopLogin, resetShopLoginPassword, type StaffJob } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Staff = Awaited<ReturnType<typeof listShopStaff>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

/**
 * The IDs people use at a shop. Owners manage their counter staff here; admins (`admin`) manage
 * owners too. The shop-logins function checks this again, so this only decides what to offer.
 */
export function ShopLogins({ shopId, admin = false }: { shopId: string; admin?: boolean }) {
  const theme = useTheme();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [job, setJob] = useState<StaffJob>(admin ? 'owner' : 'counter');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // The one row showing its new-password box or its remove confirmation.
  const [open, setOpen] = useState<{ profileId: string; action: 'password' | 'remove' } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    let active = true;
    listShopStaff(supabase, shopId).then(
      (next) => active && setStaff(next),
      (e: unknown) => active && setMessage(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [shopId, version]);

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];
  const ready = isLoginId(loginId) && password.length >= MIN_PASSWORD;

  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage(done);
      setOpen(null);
      setNewPassword('');
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const id = loginId.trim().toLowerCase();
    return run(async () => {
      await createShopLogin(supabase, { shopId, loginId: id, password, name, staffRole: job });
      setName('');
      setLoginId('');
      setPassword('');
    }, `${id} can sign in now. Give them the ID and password.`);
  }

  const canChange = (member: Staff) => admin || member.role === 'counter';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{admin ? 'Logins' : 'Staff'}</ThemedText>
      {staff.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Nobody can sign in to this shop yet.
        </ThemedText>
      )}
      {staff.map((member) => {
        const id = loginIdOf(member.profiles?.email);
        const label = member.profiles?.name || id || member.profiles?.email;
        const showing = open?.profileId === member.profile_id ? open.action : null;
        return (
          <View key={member.profile_id} style={styles.member}>
            <ThemedText type="small">
              {label} · {member.role === 'owner' ? 'Owner' : 'Counter'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {id ? `ID: ${id}` : `Google: ${member.profiles?.email}. Give them an ID, then remove this.`}
            </ThemedText>
            {canChange(member) && (
              <View style={styles.row}>
                {id && (
                  <Pressable accessibilityRole="button" onPress={() => setOpen({ profileId: member.profile_id, action: 'password' })}>
                    <Text style={styles.link}>New password</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" onPress={() => setOpen({ profileId: member.profile_id, action: 'remove' })}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            )}
            {showing === 'password' && (
              <View style={styles.row}>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="New password"
                  placeholderTextColor={theme.textSecondary}
                  accessibilityLabel="New password"
                  style={[...inputStyle, styles.flex]}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || newPassword.length < MIN_PASSWORD}
                  onPress={() => run(() => resetShopLoginPassword(supabase, shopId, member.profile_id, newPassword), `New password set for ${id}.`)}
                  style={[styles.chip, (busy || newPassword.length < MIN_PASSWORD) && styles.disabled]}>
                  <Text style={styles.chipText}>Save</Text>
                </Pressable>
              </View>
            )}
            {showing === 'remove' && (
              <View style={styles.row}>
                <ThemedText type="small" style={styles.flex}>
                  {label} will no longer see this shop&apos;s orders.
                </ThemedText>
                <Pressable accessibilityRole="button" onPress={() => setOpen(null)}>
                  <Text style={styles.link}>Keep</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => run(() => removeShopLogin(supabase, shopId, member.profile_id), `${label} was removed.`)}>
                  <Text style={styles.remove}>Yes, remove</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {!admin && (
        <ThemedText type="small" themeColor="textSecondary">
          Counter staff take orders and change stock. They don&apos;t see sales, commission or staff.
        </ThemedText>
      )}
      <ThemedText type="smallBold">{admin ? 'Add a login' : 'Add counter staff'}</ThemedText>
      <TextInput value={name} onChangeText={setName} placeholder="Their name" placeholderTextColor={theme.textSecondary} accessibilityLabel="Their name" style={inputStyle} />
      <TextInput
        value={loginId}
        onChangeText={setLoginId}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="ID, like 4h.counter"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="ID"
        style={inputStyle}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={`Password, at least ${MIN_PASSWORD} characters`}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Password"
        style={inputStyle}
      />
      <View style={styles.row}>
        {admin &&
          (['owner', 'counter'] as const).map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityState={{ selected: job === choice }}
              onPress={() => setJob(choice)}
              style={[styles.chip, job === choice && styles.chipActive]}>
              <Text style={[styles.chipText, job === choice && styles.chipTextActive]}>{choice === 'owner' ? 'Owner' : 'Counter'}</Text>
            </Pressable>
          ))}
        <Pressable accessibilityRole="button" disabled={busy || !ready} onPress={add} style={[styles.add, (busy || !ready) && styles.disabled]}>
          <Text style={styles.addText}>Add login</Text>
        </Pressable>
      </View>
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
  member: {
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  link: {
    color: Brand.green,
    fontWeight: 500,
  },
  remove: {
    color: Brand.red,
    fontWeight: 500,
  },
  chip: {
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  chipActive: {
    backgroundColor: Brand.green,
  },
  chipText: {
    color: Brand.green,
    fontSize: 13,
    fontWeight: 600,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  add: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  addText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
  },
  disabled: {
    opacity: 0.45,
  },
});
