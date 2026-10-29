import { couponLabel, listOffers, previewCoupon } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Offer = Awaited<ReturnType<typeof listOffers>>[number];
export type AppliedCoupon = { code: string; discountPaise: number };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Could not check that coupon.');

/**
 * Running offers to tap, a box for any other code, and the coupon in use. The discount shown is a
 * preview: place_order checks the code again and works out the discount itself.
 */
export function CouponBox({
  shopId,
  subtotalPaise,
  applied,
  onChange,
}: {
  shopId: string;
  subtotalPaise: number;
  applied: AppliedCoupon | null;
  onChange: (coupon: AppliedCoupon | null) => void;
}) {
  const theme = useTheme();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listOffers(supabase, shopId).then(
      (next) => active && setOffers(next),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [shopId]);

  // The cart changed under an applied coupon: check it again, and drop it if it no longer works.
  const appliedCode = applied?.code;
  useEffect(() => {
    if (!appliedCode) return;
    let active = true;
    previewCoupon(supabase, appliedCode, shopId, subtotalPaise).then(
      (discountPaise) => active && onChange({ code: appliedCode, discountPaise }),
      (e: unknown) => {
        if (!active) return;
        onChange(null);
        setError(`${appliedCode} no longer applies: ${messageOf(e)}`);
      },
    );
    return () => {
      active = false;
    };
  }, [appliedCode, shopId, subtotalPaise, onChange]);

  async function apply(next: string) {
    const trimmed = next.trim().toUpperCase();
    if (!trimmed) return;
    setChecking(true);
    setError(null);
    try {
      const discountPaise = await previewCoupon(supabase, trimmed, shopId, subtotalPaise);
      onChange({ code: trimmed, discountPaise });
      setCode('');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setChecking(false);
    }
  }

  if (applied) {
    return (
      <ThemedView type="backgroundElement" style={[styles.card, styles.row]}>
        <ThemedText type="small" style={styles.flex}>
          Coupon <Text style={styles.code}>{applied.code}</Text> applied
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => onChange(null)}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {offers.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.offers}>
          {offers.map((offer) => (
            <Pressable key={offer.code} accessibilityRole="button" onPress={() => apply(offer.code)} style={styles.offer}>
              <Text style={styles.offerCode}>{offer.code}</Text>
              <Text style={styles.offerText}>{couponLabel(offer)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.row}>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          placeholder="Have a coupon code?"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.flex, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <Pressable accessibilityRole="button" disabled={checking || !code.trim()} onPress={() => apply(code)} style={styles.apply}>
          {checking ? <ActivityIndicator color={Brand.green} /> : <Text style={styles.applyText}>Apply</Text>}
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  code: {
    fontWeight: 800,
  },
  remove: {
    color: Brand.red,
    fontWeight: 600,
  },
  offers: {
    gap: Spacing.two,
  },
  offer: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Brand.green,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  offerCode: {
    color: Brand.green,
    fontWeight: 800,
    fontSize: 13,
  },
  offerText: {
    color: Brand.inkSoft,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  apply: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  applyText: {
    color: Brand.green,
    fontWeight: 800,
  },
  error: {
    color: Brand.red,
    fontSize: 13,
  },
});
