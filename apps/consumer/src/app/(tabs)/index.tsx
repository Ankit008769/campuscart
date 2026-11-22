import {
  DEFAULT_FEE_RULES,
  buyAgain,
  formatPaise,
  getMyProfile,
  getShopMenu,
  getShopRatings,
  homePhotos,
  listCategories,
  listCollectionsForStudents,
  listDropPoints,
  listShops,
  myBanners,
} from '@campuscart/core';
import { Brand, Radius, Storefront } from '@campuscart/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartBar } from '@/components/cart-bar';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { PhotoCredits } from '@/components/photo-credits';
import { ProductImage } from '@/components/product-image';
import { ProductStrip } from '@/components/product-strip';
import { SkeletonList } from '@/components/skeleton';
import {
  CategoryChips,
  Eyebrow,
  Hero,
  ProductCard,
  PromoCards,
  ShelfHeading,
  ShopChips,
  StoreHeader,
  type MenuProduct,
  type Promo,
} from '@/components/storefront';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { useNeedsPhone } from '@/hooks/use-needs-phone';
import { useAuth } from '@/lib/auth';
import { readCache, writeCache } from '@/lib/cache';
import { useCart } from '@/lib/cart';
import { supabase } from '@/lib/supabase';

type Shop = Awaited<ReturnType<typeof listShops>>[number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Again = Awaited<ReturnType<typeof buyAgain>>[number];
type Ratings = Awaited<ReturnType<typeof getShopRatings>>;
type Banner = Awaited<ReturnType<typeof myBanners>>[number];
type Collection = Awaited<ReturnType<typeof listCollectionsForStudents>>[number];
type Photos = Awaited<ReturnType<typeof homePhotos>>;
type Menus = Record<string, MenuProduct[]>;

const NO_PHOTOS: Photos = { byShop: {}, byCategory: {} };

// Room left at the bottom for the cart bar when it shows.
const CART_BAR_SPACE = 76;
// How many items each category shelf shows before "see all".
const SHELF_SIZE = 8;

// Ratings, buy again and the photos are extras: Home still loads if any of them fails.
const loadHome = () =>
  Promise.all([
    listShops(supabase),
    listCategories(supabase),
    getShopRatings(supabase).catch((): Ratings => new Map()),
    buyAgain(supabase).catch((): Again[] => []),
    myBanners(supabase).catch((): Banner[] => []),
    listCollectionsForStudents(supabase).catch((): Collection[] => []),
    homePhotos(supabase).catch((): Photos => NO_PHOTOS),
  ]);

type HomeData = Awaited<ReturnType<typeof loadHome>>;
// Ratings are a Map, which JSON can't hold: the cached copy keeps its entries.
type CachedHome = [Shop[], Category[], [string, { average: number; ratings: number }][], Again[], Banner[], Collection[], Photos?];
const HOME_CACHE_MS = 24 * 60 * 60 * 1000;

/** Every shop's menu, for the category shelves (the website shows the same). Cached per shop. */
async function loadMenus(shops: Shop[]): Promise<Menus> {
  const menus = await Promise.all(
    shops.map((shop) =>
      getShopMenu(supabase, shop.id).then(
        (menu) => {
          writeCache(`menu:${shop.id}`, menu);
          return [shop.id, menu.products] as const;
        },
        () => [shop.id, [] as MenuProduct[]] as const,
      ),
    ),
  );
  return Object.fromEntries(menus);
}

export default function HomeScreen() {
  const cart = useCart();
  const { session } = useAuth();
  const userId = session?.user.id;
  const fullName: string | undefined = session?.user.user_metadata.full_name;
  const firstName = fullName?.split(' ')[0] ?? 'there';

  const needsPhone = useNeedsPhone();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ratings, setRatings] = useState<Ratings>(() => new Map());
  const [again, setAgain] = useState<Again[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [menus, setMenus] = useState<Menus>({});
  const [location, setLocation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Per student: buy again and banners are personal, and phones get shared.
  const cacheKey = `home:${userId ?? 'none'}`;

  const show = useCallback((data: HomeData) => {
    const [nextShops, nextCategories, nextRatings, nextAgain, nextBanners, nextCollections] = data;
    setShops(nextShops);
    setCategories(nextCategories);
    setRatings(nextRatings);
    setAgain(nextAgain);
    setBanners(nextBanners);
    setCollections(nextCollections);
  }, []);

  const fetchAndKeep = useCallback(async () => {
    const data = await loadHome();
    const [s, c, r, a, b, col, ph] = data;
    writeCache(cacheKey, [s, c, [...r.entries()], a, b, col, ph] satisfies CachedHome);
    loadMenus(s).then(setMenus, () => {});
    return data;
  }, [cacheKey]);

  const load = useCallback(async () => {
    try {
      show(await fetchAndKeep());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load shops.');
    }
  }, [show, fetchAndKeep]);

  useEffect(() => {
    let active = true;
    let fresh = false;
    // Draw yesterday's copy at once; the live data replaces it a moment later.
    readCache<CachedHome>(cacheKey, HOME_CACHE_MS).then(async (cached) => {
      if (!active || fresh || !cached) return;
      const [s, c, r, a, b, col, ph] = cached;
      show([s, c, new Map(r), a, b, col, ph ?? NO_PHOTOS]);
      const saved = await Promise.all(s.map((shop) => readCache<{ products: MenuProduct[] }>(`menu:${shop.id}`, HOME_CACHE_MS)));
      if (active && !fresh) setMenus(Object.fromEntries(s.map((shop, i) => [shop.id, saved[i]?.products ?? []])));
    });
    fetchAndKeep().then(
      (data) => {
        fresh = true;
        if (active) show(data);
      },
      (e: unknown) => active && setError(e instanceof Error ? e.message : 'Could not load shops.'),
    );
    return () => {
      active = false;
    };
  }, [cacheKey, show, fetchAndKeep]);

  // Where orders usually go, for the header (as the website shows it).
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
    await load();
    setRefreshing(false);
  }

  const openCount = shops?.filter((shop) => shop.is_open).length ?? 0;
  // Open shops first; within each group the order the database gave.
  const sortedShops = useMemo(() => (shops ? [...shops].sort((a, b) => Number(b.is_open) - Number(a.is_open)) : null), [shops]);

  // One shelf per category, every shop's items in it: open shops and in-stock items first.
  const shelves = useMemo(() => {
    if (!sortedShops) return [];
    const byName = new Map<string, { sort: number; items: { product: MenuProduct; shop: Shop }[] }>();
    for (const shop of sortedShops) {
      for (const product of menus[shop.id] ?? []) {
        if (!product.variants.length) continue;
        const name = product.categories?.name ?? 'More to discover';
        const shelf = byName.get(name) ?? { sort: product.categories?.sort ?? 999, items: [] };
        shelf.items.push({ product, shop });
        byName.set(name, shelf);
      }
    }
    const rank = ({ product, shop }: { product: MenuProduct; shop: Shop }) =>
      (shop.is_open ? 0 : 2) + (product.variants.some((v) => v.in_stock) ? 0 : 1);
    return [...byName.entries()]
      .sort(([a, x], [b, y]) => x.sort - y.sort || a.localeCompare(b))
      .map(([name, shelf]) => ({ name, items: [...shelf.items].sort((a, b) => rank(a) - rank(b)) }));
  }, [sortedShops, menus]);

  const categoryId = (name: string) => categories.find((c) => c.name === name)?.id;

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
            ? () => router.push({ pathname: '/search', params: { categoryId: bannerCategory } })
            : undefined,
      };
    }),
    {
      key: 'menus',
      title: 'Burgers, momos,\nchai and more',
      body: 'Every campus shop’s menu, in one place.',
      action: 'Explore menus',
      emoji: '🛍️',
      onPress: () => router.push('/search'),
    },
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.top}>
        <StoreHeader location={location} onLocation={() => router.push('/profile')} />
      </SafeAreaView>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four + (cart.itemCount > 0 ? CART_BAR_SPACE : 0) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.page}>
          <Hero
            greeting={`Hi ${firstName}, campus food is a few taps away.`}
            line={
              shops
                ? `${openCount} of ${shops.length} campus shops open now. Delivered to your hostel, or pick it up.`
                : 'Checking which shops are open…'
            }
          />

          <PromoCards promos={promos} />

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

          <View style={styles.section}>
            <View style={styles.padded}>
              <Eyebrow>YOUR CAMPUS SHOPS</Eyebrow>
              <Text style={styles.heading} accessibilityRole="header">
                Your campus shops
              </Text>
              <Text style={styles.muted}>
                Pick a shop or browse them all. Delivery {formatPaise(DEFAULT_FEE_RULES.smallCartFeePaise)}, free from{' '}
                {formatPaise(DEFAULT_FEE_RULES.smallCartLimitPaise)}.
              </Text>
            </View>
            {!shops && !error && (
              <View style={styles.padded}>
                <SkeletonList label="Loading shops" />
              </View>
            )}
            {error && !shops && (
              <View style={styles.padded}>
                <EmptyState icon="error" title="Couldn't load shops" body={error} action={{ label: 'Try again', onPress: load }} />
              </View>
            )}
            {sortedShops && <ShopChips shops={sortedShops} ratings={ratings} />}
          </View>

          {categories.length > 0 && (
            <View style={styles.section}>
              <CategoryChips categories={categories} />
            </View>
          )}

          {again.length > 0 && (
            <View style={styles.section}>
              <ShelfHeading title="Buy again" action="Your orders" onAction={() => router.push('/orders')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                {again.map((item) => (
                  <Pressable
                    key={item.variant_id}
                    accessibilityRole="button"
                    accessibilityHint={`Opens ${item.shop_name}`}
                    onPress={() => router.push({ pathname: '/shop/[id]', params: { id: item.shop_id } })}
                    style={({ pressed }) => [styles.againCard, pressed && styles.pressed]}>
                    {item.image_path ? (
                      <ProductImage path={item.image_path} style={styles.againPhoto} label={item.product_name} />
                    ) : (
                      <View style={styles.againPhoto} />
                    )}
                    <Text style={styles.againName} numberOfLines={2}>
                      {item.product_name}
                      {item.label ? ` (${item.label})` : ''}
                    </Text>
                    <Text style={styles.againShop} numberOfLines={1}>
                      {formatPaise(item.price_paise)} · {item.shop_name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.padded}>
                <PhotoCredits items={again} />
              </View>
            </View>
          )}

          {collections.map((collection) => (
            <View key={collection.id} style={[styles.section, styles.padded]}>
              <ProductStrip title={collection.title} subtitle={collection.subtitle} products={collection.items} />
            </View>
          ))}

          {shelves.map((shelf) => {
            const id = categoryId(shelf.name);
            return (
              <View key={shelf.name} style={styles.section}>
                <ShelfHeading
                  title={shelf.name}
                  action={id ? 'see all' : undefined}
                  onAction={id ? () => router.push({ pathname: '/search', params: { categoryId: id } }) : undefined}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                  {shelf.items.slice(0, SHELF_SIZE).map(({ product, shop }) => (
                    <ProductCard key={product.id} product={product} shop={shop} />
                  ))}
                </ScrollView>
              </View>
            );
          })}

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
        </View>
      </ScrollView>
      <CartBar bottomOffset={BottomTabInset} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  top: {
    backgroundColor: '#ffffff',
  },
  page: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: {
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  padded: {
    paddingHorizontal: Spacing.three,
  },
  heading: {
    fontFamily: Font.heading,
    fontSize: 22,
    letterSpacing: -0.6,
    color: '#1F1F1F',
    marginTop: 4,
  },
  muted: {
    fontFamily: Font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: '#738077',
    marginTop: 4,
  },
  shelf: {
    paddingHorizontal: Spacing.three,
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  notice: {
    marginHorizontal: Spacing.three,
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
  noticeTitle: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: '#20372D',
  },
  noticeBody: {
    fontFamily: Font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: '#5F725D',
    marginTop: 2,
  },
  againCard: {
    width: 130,
    gap: 4,
  },
  againPhoto: {
    width: 130,
    height: 100,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Storefront.line,
    backgroundColor: '#F5F6F2',
  },
  againName: {
    fontFamily: Font.bold,
    fontSize: 12,
    lineHeight: 16,
    color: '#202020',
  },
  againShop: {
    fontFamily: Font.regular,
    fontSize: 11,
    color: '#8B8B8B',
  },
  print: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Storefront.lilac,
  },
  printIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
