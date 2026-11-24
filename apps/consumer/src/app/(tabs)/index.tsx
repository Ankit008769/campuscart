import {
  DEFAULT_FEE_RULES,
  buyAgain,
  formatPaise,
  getMyProfile,
  listCategories,
  listCollectionsForStudents,
  listDropPoints,
  myBanners,
} from '@campuscart/core';
import { Brand, Radius, Storefront } from '@campuscart/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CartBar } from '@/components/cart-bar';
import { EmptyState } from '@/components/empty-state';
import { GridProductCard, SectionTitle, ShopTile, WarmHeader } from '@/components/grid';
import { Icon } from '@/components/icon';
import { ProductStrip } from '@/components/product-strip';
import { SkeletonList } from '@/components/skeleton';
import { PromoCards, type Promo } from '@/components/storefront';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useNeedsPhone } from '@/hooks/use-needs-phone';
import { useAuth } from '@/lib/auth';
import { readCache, writeCache } from '@/lib/cache';
import { useCart } from '@/lib/cart';
import { offerForVariant, rankOffers, useMenus, type Offer } from '@/lib/menus';
import { supabase } from '@/lib/supabase';

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Again = Awaited<ReturnType<typeof buyAgain>>[number];
type Banner = Awaited<ReturnType<typeof myBanners>>[number];
type Collection = Awaited<ReturnType<typeof listCollectionsForStudents>>[number];

// Room left at the bottom for the cart bar when it shows.
const CART_BAR_SPACE = 76;
// How many items each category shelf shows before "see all".
const SHELF_SIZE = 10;
// Side gutter and the gap between grid columns.
const GUTTER = Spacing.three;
const GAP = 12;

// Buy again, banners and collections are extras: Home still shows the shops if any of them fails.
const loadExtras = () =>
  Promise.all([
    listCategories(supabase).catch((): Category[] => []),
    buyAgain(supabase).catch((): Again[] => []),
    myBanners(supabase).catch((): Banner[] => []),
    listCollectionsForStudents(supabase).catch((): Collection[] => []),
  ]);
type Extras = Awaited<ReturnType<typeof loadExtras>>;
const EXTRAS_CACHE_MS = 24 * 60 * 60 * 1000;

export default function HomeScreen() {
  const cart = useCart();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { shops, menus, error, reload } = useMenus();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, MaxContentWidth);
  const third = Math.floor((width - GUTTER * 2 - GAP * 2) / 3);

  const needsPhone = useNeedsPhone();
  const [[categories, again, banners, collections], setExtras] = useState<Extras>([[], [], [], []]);
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Per student: buy again and banners are personal, and phones get shared.
  const cacheKey = `home-extras:${userId ?? 'none'}`;
  const fetchExtras = useCallback(async () => {
    const extras = await loadExtras();
    writeCache(cacheKey, extras);
    return extras;
  }, [cacheKey]);

  useEffect(() => {
    let active = true;
    let fresh = false;
    readCache<Extras>(cacheKey, EXTRAS_CACHE_MS).then((cached) => active && !fresh && cached && setExtras(cached));
    fetchExtras().then((extras) => {
      fresh = true;
      if (active) setExtras(extras);
    });
    return () => {
      active = false;
    };
  }, [cacheKey, fetchExtras]);

  // Where orders usually go, for the header.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([getMyProfile(supabase, userId), listDropPoints(supabase)]).then(
      ([profile, points]) => active && setLocation(points.find((p) => p.id === profile.default_drop_point_id)?.name ?? null),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [userId, needsPhone]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([reload(), fetchExtras().then(setExtras)]);
    setRefreshing(false);
  }

  // The cart's shop: its items lead every shelf, since one order is one shop.
  const cartShopId = cart.shops[0]?.id ?? null;

  // Each shop's photos for its tile, in-stock items first.
  const photosOf = useCallback(
    (shopId: string) =>
      [...(menus[shopId] ?? [])]
        .sort((a, b) => Number(b.variants.some((v) => v.in_stock)) - Number(a.variants.some((v) => v.in_stock)))
        .flatMap((p) => (p.image_path ? [p.image_path] : [])),
    [menus],
  );

  // One shelf per category with every shop's items in it.
  const shelves = useMemo(() => {
    if (!shops) return [];
    const byName = new Map<string, { id: string | null; sort: number; items: Offer[] }>();
    for (const shop of shops) {
      for (const product of menus[shop.id] ?? []) {
        if (!product.variants.length) continue;
        const name = product.categories?.name ?? 'More to discover';
        const shelf = byName.get(name) ?? { id: categories.find((c) => c.name === name)?.id ?? null, sort: product.categories?.sort ?? 999, items: [] };
        shelf.items.push({ product, shop });
        byName.set(name, shelf);
      }
    }
    return [...byName.entries()]
      .sort(([a, x], [b, y]) => x.sort - y.sort || a.localeCompare(b))
      .map(([name, shelf]) => ({ name, id: shelf.id, items: rankOffers(shelf.items, cartShopId) }));
  }, [shops, menus, categories, cartShopId]);

  const picked = category ? shelves.find((s) => s.id === category) : null;
  const againOffers = again.flatMap((a) => offerForVariant(shops, menus, a.shop_id, a.variant_id) ?? []);
  const againShown = rankOffers(
    againOffers.filter((o, i) => againOffers.findIndex((x) => x.product.id === o.product.id) === i),
    cartShopId,
  );

  const promos: Promo[] = [
    ...banners.map((banner) => {
      const shopId = banner.shop_id;
      const bannerCategory = banner.category_id;
      return {
        key: banner.id,
        title: banner.title,
        body: banner.body,
        action: shopId || bannerCategory ? 'Order now' : undefined,
        onPress: shopId
          ? () => router.push({ pathname: '/shop/[id]', params: { id: shopId } })
          : bannerCategory
            ? () => setCategory(bannerCategory)
            : undefined,
      };
    }),
    {
      key: 'delivery',
      title: `Free delivery\nfrom ${formatPaise(DEFAULT_FEE_RULES.smallCartLimitPaise)}`,
      body: 'Smaller orders pay a small delivery charge. Pickup is always free.',
      emoji: '🧺',
    },
    {
      key: 'pay',
      title: 'Pay when\nyou get it.',
      body: 'Cash or UPI to the shop at handover. Track every order live.',
      action: 'Track my orders',
      emoji: '🛵',
      onPress: () => router.push('/orders'),
    },
  ];

  const openCount = shops?.filter((shop) => shop.is_open).length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four + (cart.itemCount > 0 ? CART_BAR_SPACE : 0) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <WarmHeader
          location={location}
          onLocation={() => router.push('/profile')}
          categories={categories.filter((c) => shelves.some((s) => s.id === c.id))}
          selected={category}
          onSelect={setCategory}
        />
        <View style={styles.page}>
          {needsPhone && (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens your profile"
              onPress={() => router.push('/profile')}
              style={({ pressed }) => [styles.notice, pressed && styles.pressed]}>
              <Icon name="location" size={20} color={Brand.green} />
              <View style={styles.flex}>
                <Text style={styles.noticeTitle}>Add your mobile number and hostel</Text>
                <Text style={styles.noticeBody}>Shops call you if something runs out, and checkout fills in your usual drop point.</Text>
              </View>
              <Icon name="chevron" size={20} color={Brand.inkSoft} />
            </Pressable>
          )}

          {picked ? (
            <View style={styles.section}>
              <SectionTitle title={picked.name} action="All shops" onAction={() => setCategory(null)} />
              <View style={styles.grid}>
                {picked.items.map(({ product, shop }) => (
                  <GridProductCard key={product.id} product={product} shop={shop} width={third} />
                ))}
              </View>
            </View>
          ) : (
            <>
              <View style={styles.banner}>
                <PromoCards promos={promos} />
              </View>

              <View style={styles.section}>
                <SectionTitle title="Shops on campus" />
                {shops && <Text style={styles.muted}>{openCount} of {shops.length} open now</Text>}
                {!shops && !error && (
                  <View style={styles.padded}>
                    <SkeletonList label="Loading shops" />
                  </View>
                )}
                {error && !shops && (
                  <View style={styles.padded}>
                    <EmptyState icon="error" title="Couldn't load shops" body={error} action={{ label: 'Try again', onPress: reload }} />
                  </View>
                )}
                {shops && (
                  <View style={styles.grid}>
                    {shops.map((shop) => (
                      <ShopTile key={shop.id} shop={shop} photos={photosOf(shop.id)} total={menus[shop.id]?.length ?? 0} width={third} />
                    ))}
                  </View>
                )}
              </View>

              {againShown.length > 0 && (
                <View style={styles.section}>
                  <SectionTitle title="Buy again" action="Your orders" onAction={() => router.push('/orders')} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                    {againShown.map(({ product, shop }) => (
                      <GridProductCard key={product.id} product={product} shop={shop} width={third} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {collections.map((collection) => (
                <View key={collection.id} style={styles.section}>
                  <ProductStrip title={collection.title} subtitle={collection.subtitle} products={collection.items} />
                </View>
              ))}

              {shelves.map((shelf) => (
                <View key={shelf.name} style={styles.section}>
                  <SectionTitle
                    title={shelf.name}
                    action={shelf.id ? 'see all' : undefined}
                    onAction={shelf.id ? () => setCategory(shelf.id) : undefined}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                    {shelf.items.slice(0, SHELF_SIZE).map(({ product, shop }) => (
                      <GridProductCard key={product.id} product={product} shop={shop} width={third} />
                    ))}
                  </ScrollView>
                </View>
              ))}

              <View style={[styles.section, styles.padded]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Opens the Print Store"
                  onPress={() => router.push('/print')}
                  style={({ pressed }) => [styles.print, pressed && styles.pressed]}>
                  <View style={styles.printIcon}>
                    <Icon name="print" size={22} color={Brand.green} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.noticeTitle}>Print Store</Text>
                    <Text style={styles.noticeBody}>Send a PDF, pick it up printed or have it delivered. Only the shop sees your file.</Text>
                  </View>
                  <Icon name="chevron" size={20} color={Brand.inkSoft} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
      <CartBar bottomOffset={BottomTabInset} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Storefront.page },
  page: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  section: { paddingTop: Spacing.four, gap: Spacing.three },
  banner: { paddingTop: Spacing.three },
  padded: { paddingHorizontal: GUTTER },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: Spacing.three, paddingHorizontal: GUTTER },
  shelf: { paddingHorizontal: GUTTER, gap: GAP },
  muted: { fontFamily: Font.regular, fontSize: 13, color: Storefront.muted, paddingHorizontal: GUTTER, marginTop: -Spacing.two },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  notice: {
    marginHorizontal: GUTTER,
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: '#E6EFE4',
    backgroundColor: '#F5FBF4',
  },
  noticeTitle: { fontFamily: Font.bold, fontSize: 14, color: '#1C1C1C' },
  noticeBody: { fontFamily: Font.regular, fontSize: 12, lineHeight: 17, color: '#5A5A5A', marginTop: 2 },
  print: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, backgroundColor: Storefront.lilac },
  printIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
});
