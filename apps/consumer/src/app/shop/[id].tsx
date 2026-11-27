import {
  describeShopHours,
  effectivePrepMinutes,
  formatPaise,
  getMyProfile,
  openGroupOrder,
  getShopMenu,
  listFavouriteProductIds,
  listStockAlertVariantIds,
  parseShopHours,
  setFavourite,
  setStockAlert,
  watchCatalog,
} from '@campuscart/core';
import { Brand, Radius, Storefront } from '@campuscart/ui';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { CartBar } from '@/components/cart-bar';
import { EmptyState } from '@/components/empty-state';
import { CallShop, categoryIcon, GridProductCard } from '@/components/grid';
import { Icon } from '@/components/icon';
import { PhotoCredits } from '@/components/photo-credits';
import { ProductImage } from '@/components/product-image';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { readCache, writeCache } from '@/lib/cache';
import { logStep } from '@/lib/events';
import { supabase } from '@/lib/supabase';

type Menu = Awaited<ReturnType<typeof getShopMenu>>;
type Product = Menu['products'][number];

// Width of the category rail on the left, and the gap between the three product columns.
const RAIL = 84;
const GAP = 8;

/** Groups products under the shop's own menu categories, in menu order. */
function sectionsOf(products: Product[]) {
  const byCategory = new Map<string, { sort: number; data: Product[] }>();
  for (const product of products) {
    const title = product.categories?.name ?? 'Other';
    const section = byCategory.get(title) ?? { sort: product.categories?.sort ?? Number.MAX_SAFE_INTEGER, data: [] };
    section.data.push(product);
    byCategory.set(title, section);
  }
  return [...byCategory.entries()]
    .sort(([, a], [, b]) => a.sort - b.sort)
    .map(([title, section]) => ({ title, data: section.data }));
}

/** Matches every word of the search in the item's name, description or category. */
function matches(product: Product, query: string) {
  const text = `${product.name} ${product.description ?? ''} ${product.categories?.name ?? ''}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: screen } = useWindowDimensions();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<ReadonlySet<string>>(() => new Set());
  const [alerts, setAlerts] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listFavouriteProductIds(supabase), listStockAlertVariantIds(supabase)]).then(
      ([favs, asked]) => {
        if (!active) return;
        setFavourites(favs);
        setAlerts(asked);
      },
      // Hearts and alerts are extras: the menu works without them.
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);

  /** Flips one id in a set on screen first, then saves; puts it back if saving fails. */
  function toggle(set: ReadonlySet<string>, update: (next: ReadonlySet<string>) => void, key: string, save: (on: boolean) => Promise<void>) {
    const on = !set.has(key);
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    update(next);
    save(on).catch(() => update(set));
  }

  // The shop opening or closing, or changing a price or stock, reloads the menu at once.
  const [version, setVersion] = useState(0);
  useEffect(() => watchCatalog(supabase, () => setVersion((v) => v + 1), { shopId: id }), [id]);

  useEffect(() => {
    let active = true;
    let fresh = false;
    if (version === 0) logStep('shop_view', id);
    // The last copy of this menu draws at once; the live one replaces it a moment later.
    readCache<Menu>(`menu:${id}`, 24 * 60 * 60 * 1000).then((cached) => {
      if (active && !fresh && cached) setMenu(cached);
    });
    getShopMenu(supabase, id).then(
      (loaded) => {
        fresh = true;
        writeCache(`menu:${id}`, loaded);
        if (active) setMenu(loaded);
      },
      (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load this menu.'),
    );
    return () => {
      active = false;
    };
  }, [id, version]);

  const sections = useMemo(() => sectionsOf(menu?.products ?? []), [menu]);

  if (error && !menu) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <EmptyState
          icon="error"
          title="Couldn't load this menu"
          body={error}
          action={{ label: 'Back to shops', onPress: () => router.back() }}
        />
      </ThemedView>
    );
  }

  if (!menu) {
    return (
      <ThemedView style={[styles.container, styles.loading]}>
        <SkeletonList count={4} label="Loading the menu" />
      </ThemedView>
    );
  }

  const { shop, products } = menu;
  const hours = parseShopHours(shop.hours);
  const searching = query.trim().length > 0;
  const current = sections.find((s) => s.title === picked) ?? sections[0];
  const shown = searching ? products.filter((p) => matches(p, query)) : (current?.data ?? []);
  const pane = Math.min(screen, MaxContentWidth) - (searching ? 0 : RAIL);
  const cardWidth = Math.floor((pane - GAP * 4) / 3);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: shop.name }} />
      <View style={styles.top}>
        <View style={styles.infoRow}>
          <View style={[styles.status, { backgroundColor: shop.is_open ? '#E6F4EA' : '#FDECEA' }]}>
            <Text style={[styles.statusText, { color: shop.is_open ? Brand.green : Brand.red }]}>{shop.is_open ? 'Open' : 'Closed'}</Text>
          </View>
          <Text style={styles.info} numberOfLines={2}>
            {shop.is_open ? `Ready in about ${effectivePrepMinutes(shop)} min` : 'Closed now. You can schedule an order for later'}
            {shop.does_pickup ? ' · Pickup' : ''}
            {hours ? ` · Open ${describeShopHours(hours)}` : ''}
            {shop.does_delivery && shop.free_delivery_min_paise != null ? ` · Free delivery from ${formatPaise(shop.free_delivery_min_paise)}` : ''}
          </Text>
        </View>
        <CallShop phone={shop.phone} note={shop.is_open ? undefined : 'Closed now: call to ask when it opens, or about an item.'} />
        {shop.does_delivery && shop.is_open && <OrderTogether shopId={shop.id} />}
        <View style={styles.search}>
          <Icon name="search" size={18} color="#5A5A5A" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search in ${shop.name}`}
            placeholderTextColor="#8A8A8A"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={`Search in ${shop.name}`}
            style={styles.searchInput}
          />
          {searching && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}>
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {!searching && sections.length > 1 && (
          <ScrollView style={styles.rail} contentContainerStyle={styles.railContent} showsVerticalScrollIndicator={false}>
            {sections.map((section) => {
              const on = section.title === current?.title;
              const photo = section.data.find((p) => p.image_path)?.image_path;
              return (
                <Pressable
                  key={section.title}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setPicked(section.title)}
                  style={[styles.railItem, on && styles.railItemOn]}>
                  <View style={[styles.railPhoto, on && styles.railPhotoOn]}>
                    {photo ? <ProductImage path={photo} style={styles.fill} /> : <Text style={styles.railEmoji}>{categoryIcon(section.title)}</Text>}
                  </View>
                  <Text style={[styles.railText, on && styles.railTextOn]} numberOfLines={2}>
                    {section.title}
                  </Text>
                  {on && <View style={styles.railMark} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <FlatList
          key={searching ? 'search3' : 'menu3'}
          data={shown}
          numColumns={3}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={
            <Text style={styles.paneTitle} accessibilityRole="header">
              {searching ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'} for “${query.trim()}”` : current?.title}
            </Text>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              {searching ? 'Nothing in this shop matches. Try another word.' : 'Nothing on the menu yet.'}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <GridProductCard
              product={item}
              shop={shop}
              width={cardWidth}
              showShop={false}
              favourite={favourites.has(item.id)}
              onToggleFavourite={() => toggle(favourites, setFavourites, item.id, (on) => setFavourite(supabase, item.id, on))}
              alerted={alerts}
              onToggleAlert={(variantId) => toggle(alerts, setAlerts, variantId, (on) => setStockAlert(supabase, variantId, on))}
            />
          )}
          ListFooterComponent={<PhotoCredits items={shown} />}
        />
      </View>
      <CartBar />
    </ThemedView>
  );
}

/** Starts a group order for the student's wing: everyone adds their own items, one delivery. */
function OrderTogether({ shopId }: { shopId: string }) {
  const theme = useTheme();
  const { session } = useAuth();
  const [starting, setStarting] = useState(false);

  async function start() {
    const userId = session?.user.id;
    if (!userId) return;
    setStarting(true);
    try {
      const profile = await getMyProfile(supabase, userId);
      if (!profile.default_drop_point_id) {
        Alert.alert('Where should it come?', 'Set your usual hostel in your profile, then start the group order.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open profile', onPress: () => router.push('/profile') },
        ]);
        return;
      }
      const group = await openGroupOrder(supabase, {
        shopId,
        dropPointId: profile.default_drop_point_id,
        closesInMinutes: 30,
        roomNote: profile.room_note ?? undefined,
      });
      router.push({ pathname: '/group/[id]', params: { id: group.id } });
    } catch (e) {
      Alert.alert('Could not start a group order', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Everyone in your wing adds their own items; one delivery"
      disabled={starting}
      onPress={start}
      style={({ pressed }) => [styles.together, { borderColor: theme.border, backgroundColor: theme.background }, pressed && styles.pressed]}>
      <Icon name="group" size={20} color={theme.tint} />
      <View style={styles.flex}>
        <ThemedText type="smallBold">{starting ? 'Starting…' : 'Order together with your wing'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Everyone adds their own items, one delivery
        </ThemedText>
      </View>
      <Icon name="chevron" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  together: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  pressed: { opacity: 0.75 },
  container: { flex: 1, backgroundColor: Storefront.page },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  loading: { padding: Spacing.three },
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  top: { backgroundColor: Storefront.header, padding: Spacing.three, gap: Spacing.two },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  status: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontFamily: Font.bold, fontSize: 12 },
  info: { flex: 1, fontFamily: Font.medium, fontSize: 12, lineHeight: 17, color: '#3D3D3D' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EFE4CC',
  },
  searchInput: { flex: 1, fontFamily: Font.regular, fontSize: 15, color: '#1C1C1C', paddingVertical: 10 },
  body: { flex: 1, flexDirection: 'row', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  rail: { width: RAIL, flexGrow: 0, flexShrink: 0, backgroundColor: '#F7F8FA', borderRightWidth: 1, borderRightColor: '#EDEFF2' },
  railContent: { paddingBottom: 120 },
  railItem: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  railItemOn: { backgroundColor: '#ffffff' },
  railPhoto: { width: 52, height: 52, borderRadius: 26, backgroundColor: Storefront.tile, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  railPhotoOn: { backgroundColor: '#E6F4EA' },
  railEmoji: { fontSize: 24 },
  railText: { fontFamily: Font.medium, fontSize: 11, lineHeight: 14, color: '#5A5A5A', textAlign: 'center', marginTop: 6 },
  railTextOn: { fontFamily: Font.bold, color: '#1C1C1C' },
  railMark: { position: 'absolute', right: 0, top: 10, bottom: 10, width: 4, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: Brand.green },
  grid: { padding: GAP, paddingBottom: 120, gap: Spacing.three },
  column: { gap: GAP },
  clear: { fontSize: 16, color: '#5A5A5A' },
  paneTitle: { fontFamily: Font.heading, fontSize: 16, color: '#1C1C1C' },
});
