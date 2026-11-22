import { formatPaise, logSearch, searchCatalog, watchCatalog } from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';

import { CartBar } from '@/components/cart-bar';
import { PhotoCredits } from '@/components/photo-credits';
import { ProductImage } from '@/components/product-image';
import { QtyStepper } from '@/components/qty-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { routedKey, useCart } from '@/lib/cart';
import { logStep } from '@/lib/events';
import { supabase } from '@/lib/supabase';

// Each product once, across every shop; CampusCart picks the shop at checkout (route_cart).
type Hit = Awaited<ReturnType<typeof searchCatalog>>[number];

const DEBOUNCE_MS = 250;

export default function SearchScreen() {
  // Opened from a category tile, the screen lists that category and the box narrows it further.
  const { categoryId, category } = useLocalSearchParams<{ categoryId?: string; category?: string }>();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  // Results remember which search they answer, so a stale reply never shows under a newer query.
  const [results, setResults] = useState<{ key: string; hits: Hit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const key = `${categoryId ?? ''}|${trimmed.toLowerCase()}`;
  const wantsResults = !!categoryId || trimmed.length >= 2;

  // Prices, stock and open shops change while the student looks: search again when they do.
  const [version, setVersion] = useState(0);
  useEffect(() => watchCatalog(supabase, () => setVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!wantsResults) return;
    let active = true;
    const timer = setTimeout(() => {
      searchCatalog(supabase, { query: trimmed, categoryId }).then(
        (hits) => {
          if (!active) return;
          setResults({ key, hits });
          setError(null);
          // What was searched and how much came back (not who), for the missed-demand report.
          if (trimmed.length >= 2 && version === 0) void logSearch(supabase, trimmed, hits.length);
        },
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Search failed.'),
      );
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, trimmed, categoryId, wantsResults, version]);

  const current = results?.key === key ? results.hits : null;
  const searching = wantsResults && !current && !error;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: category ?? 'Search' }} />
      <FlatList
        data={wantsResults ? (current ?? []) : []}
        keyExtractor={(hit) => hit.master_product_id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus={!categoryId}
              autoCorrect={false}
              returnKeyType="search"
              placeholder={category ? `Search in ${category}` : 'Search for Maggi, notebooks, juice…'}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            {searching && <ActivityIndicator style={styles.loading} />}
            {error && (
              <ThemedText type="small" themeColor="textSecondary">
                {error}
              </ThemedText>
            )}
            {!wantsResults && (
              <ThemedText type="small" themeColor="textSecondary">
                Type at least two letters. Spelling doesn&apos;t have to be exact.
              </ThemedText>
            )}
            {current?.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {trimmed ? `Nothing matches “${trimmed}” right now.` : 'Nothing in this category right now.'}
              </ThemedText>
            )}
          </View>
        }
        renderItem={({ item }) => <HitRow hit={item} />}
        ListFooterComponent={current && current.length > 0 ? <PhotoCredits items={current} /> : undefined}
      />
      <CartBar />
    </ThemedView>
  );
}

function HitRow({ hit }: { hit: Hit }) {
  const cart = useCart();
  const key = routedKey(hit.master_product_id);
  const add = () => {
    logStep('add_to_cart');
    cart.addRouted({
      masterProductId: hit.master_product_id,
      productName: hit.name,
      label: hit.size,
      pricePaise: hit.min_price_paise ?? 0,
    });
  };
  return (
    <ThemedView type="backgroundElement" style={[styles.hit, !hit.available && styles.unavailable]}>
      {hit.image_path ? (
        <ProductImage path={hit.image_path} style={styles.photo} label={hit.name} />
      ) : (
        <View style={styles.photo} />
      )}
      <View style={styles.details}>
        <ThemedText type="smallBold">
          {hit.name}
          {hit.size ? ` · ${hit.size}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hit.category_name ?? ''}
          {hit.shops > 1 ? `${hit.category_name ? ' · ' : ''}sold at ${hit.shops} shops` : ''}
        </ThemedText>
        <View style={styles.row}>
          {hit.available ? (
            <ThemedText type="small" style={styles.flex}>
              {hit.shops > 1 ? 'from ' : ''}
              {formatPaise(hit.min_price_paise ?? 0)}
            </ThemedText>
          ) : (
            <View style={styles.flex}>
              <StatusBadge label="Not available right now" tone="bad" />
            </View>
          )}
          <QtyStepper
            qty={cart.qtyOf(key)}
            disabled={!hit.available}
            onAdd={add}
            onRemove={() => cart.setQty(key, cart.qtyOf(key) - 1)}
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    // Room for the cart bar.
    paddingBottom: 120,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 15,
  },
  loading: {
    marginVertical: Spacing.three,
  },
  hit: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderRadius: Radius.medium,
    padding: Spacing.two,
  },
  unavailable: {
    opacity: 0.55,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: Radius.small,
    backgroundColor: '#00000011',
  },
  details: {
    flex: 1,
    gap: Spacing.half,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
