import type { listCategories } from '@campuscart/core';
import { Brand, Radius } from '@campuscart/ui';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { RiseIn } from '@/components/rise-in';
import { Spacing } from '@/constants/theme';

type Category = Awaited<ReturnType<typeof listCategories>>[number];

// Tiles without a photo alternate the two soft brand colours so the row reads as separate buttons.
const TILE_COLORS = [Brand.greenSoft, Brand.yellowSoft];

/** "Shop by category" on Home: a photo of something in each category, its name and item count. */
export function CategoryTiles({ categories, photos }: { categories: Category[]; photos: Record<string, string> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {categories.map((category, i) => {
        const photo = photos[category.id];
        return (
          <RiseIn key={category.id} index={i}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${category.name}, ${category.product_count} items`}
              onPress={() => router.push({ pathname: '/search', params: { categoryId: category.id, category: category.name } })}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              {photo ? (
                <ProductImage path={photo} style={styles.photo} />
              ) : (
                <View style={[styles.photo, { backgroundColor: TILE_COLORS[i % TILE_COLORS.length] }]} />
              )}
              <Text style={styles.label} numberOfLines={1}>
                {category.name}
              </Text>
              <Text style={styles.count}>{category.product_count} items</Text>
            </Pressable>
          </RiseIn>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
  },
  tile: {
    width: 104,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  photo: {
    width: 104,
    height: 78,
    borderRadius: Radius.medium,
  },
  label: {
    color: Brand.ink,
    fontSize: 13,
    fontWeight: 500,
    marginTop: Spacing.one,
  },
  count: {
    color: Brand.inkSoft,
    fontSize: 12,
    fontWeight: 400,
  },
});
