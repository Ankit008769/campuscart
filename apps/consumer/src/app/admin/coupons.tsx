import { createCoupon, formatPaise, listCoupons, setCouponActive } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { KeyboardScroll } from '@/components/keyboard-scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Coupon = Awaited<ReturnType<typeof listCoupons>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const describe = (c: Coupon) =>
  c.kind === 'percent'
    ? `${c.value}% off${c.max_discount_paise ? ` (up to ${formatPaise(c.max_discount_paise)})` : ''}`
    : `${formatPaise(c.value)} off`;

/**
 * Admin → Coupons: every coupon with how often it was used, switched on or off with one tap, and a
 * quick form for a new CampusCart-funded coupon on all shops. (Shop-funded and finer settings are on
 * the web admin's Coupons page.)
 */
export default function CouponsScreen() {
  const theme = useTheme();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  // When the list was read, to tell which coupons have ended.
  const [readAt, setReadAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState(true);
  const [value, setValue] = useState('');
  const [cap, setCap] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [days, setDays] = useState('7');
  const [maxUses, setMaxUses] = useState('');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(
    () =>
      listCoupons(supabase).then(
        (rows) => {
          setCoupons(rows);
          setReadAt(Date.now());
          setError(null);
        },
        (e: unknown) => setError(messageOf(e)),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function toggle(c: Coupon, active: boolean) {
    try {
      await setCouponActive(supabase, c.code, active);
      await reload();
    } catch (e) {
      Alert.alert('Could not change it', messageOf(e));
    }
  }

  const n = (s: string) => (s.trim() ? Number(s) : NaN);
  async function save() {
    const v = n(value);
    const problem = !/^[A-Za-z0-9]{3,20}$/.test(code.trim())
      ? 'Use 3 to 20 letters or digits for the code.'
      : !(v > 0) || (percent && v > 90)
        ? percent
          ? 'Give a percent between 1 and 90.'
          : 'Give the rupees off.'
        : !(n(days) >= 1)
          ? 'Give how many days it lasts.'
          : null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date();
      await createCoupon(supabase, {
        code: code.trim(),
        description: percent ? `${v}% off` : `₹${v} off`,
        kind: percent ? 'percent' : 'flat',
        value: percent ? Math.round(v) : Math.round(v * 100),
        maxDiscountPaise: percent && n(cap) > 0 ? Math.round(n(cap) * 100) : null,
        minSubtotalPaise: n(minOrder) > 0 ? Math.round(n(minOrder) * 100) : 0,
        shopId: null,
        fundedBy: 'platform',
        startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() + n(days) * 864e5).toISOString(),
        maxUses: n(maxUses) > 0 ? Math.round(n(maxUses)) : null,
        perStudentLimit: 1,
        firstOrderOnly,
        listed: true,
      });
      setCode('');
      setValue('');
      setCap('');
      setMinOrder('');
      setMaxUses('');
      await reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  const input = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ThemedView style={styles.container}>
      <KeyboardScroll contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.text }]}>New coupon</Text>
        <ThemedText type="small" themeColor="textSecondary">
          Paid by CampusCart, on every shop, once per student.
        </ThemedText>
        <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Code, like WELCOME20" placeholderTextColor={theme.textSecondary} autoCapitalize="characters" style={input} />
        <View style={styles.row}>
          {[true, false].map((p) => (
            <Pressable key={String(p)} accessibilityRole="radio" accessibilityState={{ selected: percent === p }} onPress={() => setPercent(p)} style={[styles.chip, { borderColor: theme.backgroundSelected }, percent === p && styles.chipOn]}>
              <Text style={[styles.chipText, { color: theme.text }, percent === p && styles.chipTextOn]}>{p ? 'Percent off' : 'Rupees off'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <TextInput value={value} onChangeText={setValue} placeholder={percent ? '% off, like 20' : '₹ off, like 30'} placeholderTextColor={theme.textSecondary} keyboardType="number-pad" style={[input, styles.flex]} />
          {percent && <TextInput value={cap} onChangeText={setCap} placeholder="Up to ₹ (optional)" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" style={[input, styles.flex]} />}
        </View>
        <View style={styles.row}>
          <TextInput value={minOrder} onChangeText={setMinOrder} placeholder="Min order ₹ (optional)" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" style={[input, styles.flex]} />
          <TextInput value={days} onChangeText={setDays} placeholder="Days it lasts" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" style={[input, styles.flex]} />
        </View>
        <TextInput value={maxUses} onChangeText={setMaxUses} placeholder="Total uses allowed (optional)" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" style={input} />
        <View style={styles.row}>
          <ThemedText type="small" style={styles.flex}>
            First order only
          </ThemedText>
          <Switch value={firstOrderOnly} onValueChange={setFirstOrderOnly} />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={saving} onPress={save} style={[styles.primary, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Create coupon</Text>}
        </Pressable>

        <Text style={[styles.heading, { color: theme.text }]}>All coupons</Text>
        {!coupons && !error && <ActivityIndicator />}
        {coupons?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No coupons yet.
          </ThemedText>
        )}
        {coupons?.map((c) => {
          const used = (c.coupon_redemptions as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
          const over = c.ends_at && new Date(c.ends_at).getTime() < readAt;
          return (
            <View key={c.code} style={[styles.card, { borderColor: theme.backgroundSelected }]}>
              <View style={styles.flex}>
                <Text style={[styles.code, { color: theme.text }]}>{c.code}</Text>
                <ThemedText type="small" themeColor="textSecondary">
                  {describe(c)}
                  {c.min_subtotal_paise ? ` · min ${formatPaise(c.min_subtotal_paise)}` : ''}
                  {c.shops?.name ? ` · ${c.shops.name} only` : ''}
                  {c.first_order_only ? ' · first order' : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Used {used}
                  {c.max_uses ? ` of ${c.max_uses}` : ''} · {over ? 'ended' : c.ends_at ? `until ${day(c.ends_at)}` : 'no end date'}
                </ThemedText>
              </View>
              <Switch value={c.active} onValueChange={(on) => toggle(c, on)} accessibilityLabel={`${c.code} ${c.active ? 'on' : 'off'}`} />
            </View>
          );
        })}
      </KeyboardScroll>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  heading: { fontFamily: Font.bold, fontSize: 15, marginTop: Spacing.two },
  input: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, paddingVertical: 10, fontSize: 15, fontFamily: Font.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: Brand.green, borderColor: Brand.green },
  chipText: { fontFamily: Font.medium, fontSize: 13 },
  chipTextOn: { color: '#ffffff' },
  error: { fontFamily: Font.medium, color: Brand.red },
  primary: { minHeight: 46, borderRadius: Radius.medium, backgroundColor: Brand.green, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
  primaryText: { fontFamily: Font.bold, fontSize: 15, color: '#ffffff' },
  disabled: { opacity: 0.5 },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three },
  code: { fontFamily: Font.bold, fontSize: 15, letterSpacing: 1 },
});
