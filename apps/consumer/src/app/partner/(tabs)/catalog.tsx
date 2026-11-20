import { formatPaise, listShopCatalog, setCategoryInStock, setStockCount, setVariantInStock } from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductImage } from '@/components/product-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { loadMyShop, type MyShop } from '@/lib/my-shop';
import { supabase } from '@/lib/supabase';


type Item = Awaited<ReturnType<typeof listShopCatalog>>[number];
type Section = { title: string; categoryId: string | null; sort: number; data: Item[] };

function sectionsOf(items: Item[]): Section[] {
  const byCategory = new Map<string, Section>();
  for (const item of items) {
    const key = item.categories?.id ?? '';
    const section = byCategory.get(key) ?? {
      title: item.categories?.name ?? 'No category',
      categoryId: item.categories?.id ?? null,
      sort: item.categories?.sort ?? Number.MAX_SAFE_INTEGER,
      data: [],
    };
    section.data.push(item);
    byCategory.set(key, section);
  }
  return [...byCategory.values()].sort((a, b) => a.sort - b.sort);
}

async function loadCatalog() {
  const myShop = await loadMyShop();
  return { myShop, catalog: myShop ? await listShopCatalog(supabase, myShop.id) : [] };
}

export default function CatalogScreen() {
  // undefined while loading, null when the account has no shop.
  const [shop, setShop] = useState<MyShop | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reload whenever the tab comes back into view, e.g. after saving in the item editor.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadCatalog().then(
        ({ myShop, catalog }) => {
          if (!active) return;
          setShop(myShop);
          setItems(catalog);
          setError(null);
        },
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load your catalog.'),
      );
      return () => {
        active = false;
      };
    }, []),
  );

  /** Saves one change, then shows the catalog as the database now has it. */
  async function run(change: () => Promise<unknown>) {
    setError(null);
    try {
      await change();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that change.');
    }
    try {
      const { myShop, catalog } = await loadCatalog();
      setShop(myShop);
      setItems(catalog);
    } catch {
      // Keep showing what we had; the next visit to the tab reloads.
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <SectionList
          sections={sectionsOf(items)}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.row}>
                <ThemedText type="subtitle" style={styles.flex}>
                  Catalog
                </ThemedText>
                {shop && (
                  <Pressable accessibilityRole="button" onPress={() => router.push('/partner/scan')}>
                    <ThemedText type="linkPrimary">Scan</ThemedText>
                  </Pressable>
                )}
                {shop && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/partner/item/[id]', params: { id: 'new' } })}
                    style={styles.addButton}>
                    <Text style={styles.addText}>+ Add item</Text>
                  </Pressable>
                )}
              </View>
              {shop === undefined && !error && <ActivityIndicator style={styles.loading} />}
              {shop === null && (
                <ThemedText type="small" themeColor="textSecondary">
                  This account isn&apos;t linked to a shop yet.
                </ThemedText>
              )}
              {shop && items.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No items yet. Add your first one.
                </ThemedText>
              )}
              {error && (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              )}
            </View>
          }
          renderSectionHeader={({ section }) => {
            const allOut = section.data.every((item) => item.variants.every((v) => !v.in_stock));
            return (
              <View style={[styles.row, styles.sectionHeader]}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {section.title}
                </ThemedText>
                {shop && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => run(() => setCategoryInStock(supabase, shop.id, section.categoryId, allOut))}>
                    <ThemedText type="linkPrimary">{allOut ? 'All back in stock' : 'All out of stock'}</ThemedText>
                  </Pressable>
                )}
              </View>
            );
          }}
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={[styles.card, !item.active && styles.hidden]}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Opens the item editor"
                onPress={() => router.push({ pathname: '/partner/item/[id]', params: { id: item.id } })}
                style={styles.row}>
                {item.image_path ? (
                  <ProductImage path={item.image_path} style={styles.photo} label={item.name} />
                ) : (
                  <View style={styles.photo} />
                )}
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{item.name}</ThemedText>
                  {!item.active && <StatusBadge label="Hidden from students" tone="neutral" />}
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Edit ›
                </ThemedText>
              </Pressable>
              {[...item.variants]
                .sort((a, b) => a.sort - b.sort)
                .map((variant) => (
                  <View key={variant.id} style={styles.row}>
                    <ThemedText type="small" style={styles.flex}>
                      {variant.label ? `${variant.label} · ` : ''}
                      {formatPaise(variant.price_paise)}
                    </ThemedText>
                    {!variant.in_stock && <StatusBadge label="Out of stock" tone="bad" />}
                    <TextInput
                      accessibilityLabel="How many in stock"
                      defaultValue={variant.stock_qty === null ? '' : String(variant.stock_qty)}
                      placeholder="Count"
                      keyboardType="number-pad"
                      maxLength={5}
                      style={styles.count}
                      onEndEditing={(e) => {
                        const text = e.nativeEvent.text.trim();
                        const count = text === '' ? null : Number(text);
                        if (count !== variant.stock_qty) run(() => setStockCount(supabase, variant.id, count));
                      }}
                    />
                    <Switch
                      value={variant.in_stock}
                      onValueChange={(value) => run(() => setVariantInStock(supabase, variant.id, value))}
                      trackColor={{ true: Brand.green }}
                    />
                  </View>
                ))}
            </ThemedView>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionHeader: {
    marginTop: Spacing.three,
  },
  loading: {
    marginVertical: Spacing.four,
  },
  error: {
    color: Brand.red,
  },
  addButton: {
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  addText: {
    color: '#ffffff',
    fontWeight: 600,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  hidden: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  count: {
    width: 56,
    borderWidth: 1,
    borderColor: '#88888855',
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 13,
    textAlign: 'center',
    color: '#888888',
  },
  photo: {
    width: 56,
    height: 56,
    borderRadius: Radius.small,
    backgroundColor: '#00000011',
  },
  flex: {
    flex: 1,
    gap: Spacing.half,
  },
});
