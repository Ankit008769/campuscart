import { describeShopHours, effectivePrepMinutes, isRushing, parseShopHours, type listShops } from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ProductImage } from '@/components/product-image';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Shop = Awaited<ReturnType<typeof listShops>>[number];

// Star colour dark enough to read on the light cards (Brand.yellow is too pale for a small glyph).
const STAR = '#C98A00';

/** What a closed shop's card says: its usual hours when the shop has set them. */
function closedNote(hours: Shop['hours']): string {
  const parsed = parseShopHours(hours);
  return parsed ? `Closed now · usually ${describeShopHours(parsed)}` : 'Closed now';
}

/** A shop on Home: a photo from its menu (or its first letter), whether it's open, and how soon. */
export function ShopCard({ shop, photo, rating }: { shop: Shop; photo?: string; rating?: { average: number; ratings: number } }) {
  const theme = useTheme();
  return (
    <Card
      accessibilityHint="Opens the shop's menu"
      onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}
      style={!shop.is_open && styles.closed}>
      <View style={styles.row}>
        {photo ? (
          <ProductImage path={photo} style={styles.photo} label={shop.name} />
        ) : (
          <View style={[styles.photo, styles.avatar, { backgroundColor: shop.is_open ? Brand.yellowSoft : theme.backgroundSelected }]}>
            <Text style={styles.avatarText}>{shop.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.flex}>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
              {shop.name}
            </ThemedText>
            <StatusBadge label={shop.is_open ? 'Open' : 'Closed'} tone={shop.is_open ? 'good' : 'bad'} />
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {shop.kind}
          </ThemedText>
          <View style={[styles.row, styles.meta]}>
            <Icon name={shop.is_open && isRushing(shop) ? 'bolt' : 'clock'} size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={styles.flex} numberOfLines={2}>
              {shop.is_open
                ? `${isRushing(shop) ? 'Busy · ' : ''}Ready in ~${effectivePrepMinutes(shop)} min${shop.does_pickup ? ' · Pickup too' : ''}`
                : closedNote(shop.hours)}
            </ThemedText>
            {rating && (
              <View style={styles.rating} accessibilityLabel={`Rated ${rating.average.toFixed(1)} from ${rating.ratings} ratings`}>
                <Icon name="star" size={14} color={STAR} />
                <ThemedText type="smallBold">{rating.average.toFixed(1)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  ({rating.ratings})
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  closed: {
    opacity: 0.7,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: Radius.medium,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Brand.ink,
    fontSize: 22,
    fontWeight: 600,
  },
  meta: {
    marginTop: Spacing.one,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
});
