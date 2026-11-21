import { getMyRating, rateOrder } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const RATING_DAYS = 7;

/** Stars for the shop (and the rider, if one delivered), for 7 days after the order is completed. */
export function RateOrder({ orderId, shopName, hasRider, completedAt }: { orderId: string; shopName: string; hasRider: boolean; completedAt: string }) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [shopStars, setShopStars] = useState(0);
  const [riderStars, setRiderStars] = useState(0);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const open = now - Date.parse(completedAt) < RATING_DAYS * 24 * 60 * 60 * 1000;

  useEffect(() => {
    let active = true;
    getMyRating(supabase, orderId).then(
      (rating) => {
        if (!active) return;
        if (rating) {
          setShopStars(rating.shop_stars);
          setRiderStars(rating.rider_stars ?? 0);
          setComment(rating.comment ?? '');
          setSaved(true);
        }
        setLoaded(true);
      },
      () => active && setLoaded(true),
    );
    return () => {
      active = false;
    };
  }, [orderId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await rateOrder(supabase, {
        orderId,
        shopStars,
        riderStars: hasRider && riderStars > 0 ? riderStars : undefined,
        comment: comment.trim() || undefined,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your rating.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || (!open && !saved)) return null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{saved ? 'Your rating' : `How was ${shopName}?`}</ThemedText>
      <Stars value={shopStars} onChange={open ? setShopStars : undefined} label="Shop" />
      {hasRider && <Stars value={riderStars} onChange={open ? setRiderStars : undefined} label="Rider" />}
      {open && (
        <>
          <TextInput
            value={comment}
            onChangeText={setComment}
            maxLength={300}
            placeholder="Anything the shop should know? (optional)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={saving || shopStars === 0}
            onPress={save}
            style={[styles.save, (saving || shopStars === 0) && styles.disabled]}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>{saved ? 'Update rating' : 'Send rating'}</Text>}
          </Pressable>
        </>
      )}
      {saved && !saving && (
        <ThemedText type="small" themeColor="textSecondary">
          Thanks! Shops see ratings and comments to get better.
        </ThemedText>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </ThemedView>
  );
}

function Stars({ value, onChange, label }: { value: number; onChange?: (stars: number) => void; label: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" style={styles.label}>
        {label}
      </ThemedText>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${star} ${star === 1 ? 'star' : 'stars'}`}
          disabled={!onChange}
          onPress={() => onChange?.(star)}
          hitSlop={6}>
          <Text style={[styles.star, star <= value && styles.starOn]}>★</Text>
        </Pressable>
      ))}
    </View>
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
  label: {
    width: 48,
  },
  star: {
    fontSize: 28,
    color: '#88888855',
  },
  starOn: {
    color: Brand.yellow,
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
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontWeight: 600,
  },
  disabled: {
    opacity: 0.45,
  },
  error: {
    color: Brand.red,
    fontSize: 13,
  },
});
