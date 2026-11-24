import { logSearch, searchCatalog } from '@campuscart/core';
import { Storefront } from '@campuscart/ui';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { CartBar } from '@/components/cart-bar';
import { GridProductCard } from '@/components/grid';
import { Icon } from '@/components/icon';
import { PhotoCredits } from '@/components/photo-credits';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCart } from '@/lib/cart';
import { rankOffers, useMenus, type Offer } from '@/lib/menus';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 250;
const GAP = 12;

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Search across every shop. Each result is one shop's own item, so it adds to that shop's order;
 * the cart's shop comes first, then open shops with it in stock. Matches come from the menus on
 * the phone (every word in the name, description or category) and from the catalog search, which
 * forgives spelling.
 */
export default function SearchScreen() {
  // Opened from a category tile, the screen lists that category and the box narrows it further.
  const { categoryId, category } = useLocalSearchParams<{ categoryId?: string; category?: string }>();
  const cart = useCart();
  const { shops, menus } = useMenus();
  const { width: screen } = useWindowDimensions();
  const cardWidth = Math.floor((Math.min(screen, MaxContentWidth) - Spacing.three * 2 - GAP) / 2);
  const [query, setQuery] = useState('');
  // Catalog products the fuzzy search found, for the search they answer.
  const [fuzzy, setFuzzy] = useState<{ key: string; ids: Set<string> } | null>(null);

  const trimmed = query.trim();
  const key = `${categoryId ?? ''}|${trimmed.toLowerCase()}`;
  const wantsResults = !!categoryId || trimmed.length >= 2;

  useEffect(() => {
    if (!wantsResults) return;
    let active = true;
    const timer = setTimeout(() => {
      searchCatalog(supabase, { query: trimmed, categoryId }).then(
        (hits) => {
          if (!active) return;
          setFuzzy({ key, ids: new Set(hits.map((h) => h.master_product_id)) });
          // What was searched and how much came back (not who), for the missed-demand report.
          if (trimmed.length >= 2) void logSearch(supabase, trimmed, hits.length);
        },
        // The menus on the phone still answer without it.
        () => active && setFuzzy({ key, ids: new Set() }),
      );
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, trimmed, categoryId, wantsResults]);

  const results = useMemo(() => {
    if (!wantsResults || !shops) return [];
    const wanted = words(trimmed);
    const fuzzyIds = fuzzy?.key === key ? fuzzy.ids : new Set<string>();
    const found: Offer[] = [];
    for (const shop of shops) {
      for (const product of menus[shop.id] ?? []) {
        if (!product.variants.length) continue;
        const inCategory = !categoryId || (!!category && product.categories?.name === category);
        const text = `${product.name} ${product.description ?? ''} ${product.categories?.name ?? ''}`.toLowerCase();
        const local = inCategory && wanted.every((w) => text.includes(w));
        const catalog = product.variants.some((v) => v.master_product_id && fuzzyIds.has(v.master_product_id));
        if (local || catalog) found.push({ shop, product });
      }
    }
    return rankOffers(found, cart.shops[0]?.id);
  }, [wantsResults, shops, menus, trimmed, fuzzy, key, categoryId, category, cart.shops]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: category ?? 'Search' }} />
      <View style={styles.top}>
        <View style={styles.search}>
          <Icon name="search" size={18} color="#5A5A5A" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus={!categoryId}
            autoCorrect={false}
            returnKeyType="search"
            placeholder={category ? `Search in ${category}` : 'Search for maggi, momos, coke…'}
            placeholderTextColor="#8A8A8A"
            accessibilityLabel="Search"
            style={styles.input}
          />
        </View>
        {cart.shops[0] && wantsResults && <Text style={styles.hint}>Items from {cart.shops[0].name}, your cart’s shop, come first.</Text>}
      </View>
      <FlatList
        data={results}
        numColumns={2}
        keyExtractor={(o) => o.product.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary">
            {!wantsResults
              ? 'Type at least two letters. Spelling doesn’t have to be exact.'
              : !shops
                ? 'Loading the menus…'
                : trimmed
                  ? `Nothing matches “${trimmed}” right now.`
                  : 'Nothing in this category right now.'}
          </ThemedText>
        }
        renderItem={({ item }) => <GridProductCard product={item.product} shop={item.shop} width={cardWidth} />}
        ListFooterComponent={results.length > 0 ? <PhotoCredits items={results.map((r) => r.product)} /> : undefined}
      />
      <CartBar />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Storefront.page },
  top: { backgroundColor: Storefront.header, padding: Spacing.three, gap: Spacing.two },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EFE4CC',
  },
  input: { flex: 1, fontFamily: Font.regular, fontSize: 15, color: '#1C1C1C', paddingVertical: 10 },
  hint: { fontFamily: Font.medium, fontSize: 12, color: '#3D3D3D' },
  content: {
    padding: Spacing.three,
    // Room for the cart bar.
    paddingBottom: 120,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  column: { gap: GAP },
});
