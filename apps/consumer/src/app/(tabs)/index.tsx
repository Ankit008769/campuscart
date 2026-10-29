import {
  DEFAULT_FEE_RULES,
  buyAgain,
  describeShopHours,
  effectivePrepMinutes,
  formatPaise,
  getShopRatings,
  isRushing,
  listCollectionsForStudents,
  listCategories,
  listShops,
  myBanners,
  parseShopHours,
} from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CartBar } from '@/components/cart-bar';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { PhotoCredits } from '@/components/photo-credits';
import { ProductImage } from '@/components/product-image';
import { ProductStrip } from '@/components/product-strip';
import { SectionHeader } from '@/components/section-header';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useNeedsPhone } from '@/hooks/use-needs-phone';
import { useTheme } from '@/hooks/use-theme';
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

// Star colour dark enough to read on the light cards (Brand.yellow is too pale for a small glyph).
const STAR = '#C98A00';
// Category tiles alternate the two soft brand colours so the row reads as separate buttons.
const TILE_COLORS = [Brand.greenSoft, Brand.yellowSoft];
// Room left at the bottom for the cart bar when it shows.
const CART_BAR_SPACE = 76;

/** What a closed shop's card says: its usual hours when the shop has set them. */
function closedNote(hours: Shop['hours']): string {
  const parsed = parseShopHours(hours);
  return parsed ? `Closed now · usually ${describeShopHours(parsed)}` : 'Closed now';
}

// Ratings and buy again are extras: Home still loads if either fails.
const loadHome = () =>
  Promise.all([
    listShops(supabase),
    listCategories(supabase),
    getShopRatings(supabase).catch((): Ratings => new Map()),
    buyAgain(supabase).catch((): Again[] => []),
    myBanners(supabase).catch((): Banner[] => []),
    listCollectionsForStudents(supabase).catch((): Collection[] => []),
  ]);

type HomeData = Awaited<ReturnType<typeof loadHome>>;
// Ratings are a Map, which JSON can't hold: the cached copy keeps its entries.
type CachedHome = [Shop[], Category[], [string, { average: number; ratings: number }][], Again[], Banner[], Collection[]];
const HOME_CACHE_MS = 24 * 60 * 60 * 1000;

export default function HomeScreen() {
  const theme = useTheme();
  const cart = useCart();
  const { session } = useAuth();
  const fullName: string | undefined = session?.user.user_metadata.full_name;
  const firstName = fullName?.split(' ')[0] ?? 'there';

  const needsPhone = useNeedsPhone();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ratings, setRatings] = useState<Ratings>(() => new Map());
  const [again, setAgain] = useState<Again[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Per student: buy again and banners are personal, and phones get shared.
  const cacheKey = `home:${session?.user.id ?? 'none'}`;

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
    const [s, c, r, a, b, col] = data;
    writeCache(cacheKey, [s, c, [...r.entries()], a, b, col] satisfies CachedHome);
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
    readCache<CachedHome>(cacheKey, HOME_CACHE_MS).then((cached) => {
      if (!active || fresh || !cached) return;
      const [s, c, r, a, b, col] = cached;
      show([s, c, new Map(r), a, b, col]);
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

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const openCount = shops?.filter((shop) => shop.is_open).length ?? 0;
  // Open shops first; within each group the order the database gave.
  const sortedShops = shops ? [...shops].sort((a, b) => Number(b.is_open) - Number(a.is_open)) : null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four + (cart.itemCount > 0 ? CART_BAR_SPACE : 0) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <SafeAreaView edges={['top']} style={styles.headerInner}>
            <Text style={styles.greeting} accessibilityRole="header">
              Hi, {firstName}
            </Text>
            <Text style={styles.subtitle}>
              {shops ? `${openCount} of ${shops.length} campus shops open now` : 'Checking which shops are open…'}
            </Text>
            <Pressable
              accessibilityRole="search"
              accessibilityLabel="Search products"
              onPress={() => router.push('/search')}
              style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
              <Icon name="search" size={20} color={Brand.inkSoft} />
              <Text style={styles.searchHint}>Search for Maggi, notebooks, juice…</Text>
            </Pressable>
          </SafeAreaView>
        </View>

        {banners.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banners}>
            {banners.map((banner) => {
              const linked = !!banner.shop_id || !!banner.category_id;
              return (
                <Pressable
                  key={banner.id}
                  accessibilityRole={linked ? 'button' : 'text'}
                  disabled={!linked}
                  onPress={() => {
                    if (banner.shop_id) router.push({ pathname: '/shop/[id]', params: { id: banner.shop_id } });
                    else if (banner.category_id) router.push({ pathname: '/search', params: { categoryId: banner.category_id } });
                  }}
                  style={({ pressed }) => [styles.banner, pressed && styles.pressed]}>
                  <Text style={styles.bannerTitle}>{banner.title}</Text>
                  {!!banner.body && <Text style={styles.bannerBody}>{banner.body}</Text>}
                  {linked && (
                    <View style={styles.bannerGo}>
                      <Text style={styles.bannerGoText}>Order now</Text>
                      <Icon name="chevron" size={16} color="#ffffff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {needsPhone && (
          <View style={styles.section}>
            <Card onPress={() => router.push('/profile')} accessibilityHint="Opens your profile">
              <View style={styles.row}>
                <View style={[styles.roundIcon, { backgroundColor: theme.background }]}>
                  <Icon name="location" size={20} color={theme.tint} />
                </View>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">Add your mobile number and hostel</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Shops call you if something runs out, and checkout fills in your usual drop point.
                  </ThemedText>
                </View>
                <Icon name="chevron" size={20} color={theme.textSecondary} />
              </View>
            </Card>
          </View>
        )}

        {categories.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Shop by category" action={{ label: 'Search all', onPress: () => router.push('/search') }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
              {categories.map((category, i) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.name}, ${category.product_count} items`}
                  onPress={() => router.push({ pathname: '/search', params: { categoryId: category.id, category: category.name } })}
                  style={({ pressed }) => [
                    styles.tile,
                    { backgroundColor: TILE_COLORS[i % TILE_COLORS.length] },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.tileLabel} numberOfLines={2}>
                    {category.name}
                  </Text>
                  <Text style={styles.tileCount}>{category.product_count} items</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {collections.map((collection) => (
          <View key={collection.id} style={styles.section}>
            <ProductStrip title={collection.title} subtitle={collection.subtitle} products={collection.items} />
          </View>
        ))}

        {again.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Buy again" subtitle="From your past orders" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.againRow}>
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
                    <View style={[styles.againPhoto, { backgroundColor: theme.backgroundElement }]} />
                  )}
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.product_name}
                    {item.label ? ` (${item.label})` : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {formatPaise(item.price_paise)} · {item.shop_name}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <PhotoCredits items={again} />
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader
            title="Shops on campus"
            subtitle={`Delivery ${formatPaise(DEFAULT_FEE_RULES.deliveryFeePaise)} · no small-cart fee from ${formatPaise(DEFAULT_FEE_RULES.smallCartLimitPaise)}`}
          />

          {!shops && !error && <SkeletonList label="Loading shops" />}

          {error && !shops && (
            <EmptyState icon="error" title="Couldn't load shops" body={error} action={{ label: 'Try again', onPress: load }} />
          )}

          {sortedShops?.map((shop) => {
            const rating = ratings.get(shop.id);
            return (
              <Card
                key={shop.id}
                accessibilityHint="Opens the shop's menu"
                onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}
                style={!shop.is_open && styles.closedCard}>
                <View style={styles.row}>
                  <View style={[styles.shopAvatar, { backgroundColor: shop.is_open ? Brand.yellowSoft : theme.backgroundSelected }]}>
                    <Text style={styles.shopAvatarText}>{shop.name.charAt(0).toUpperCase()}</Text>
                  </View>
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
                  </View>
                </View>
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
              </Card>
            );
          })}
        </View>

        <View style={styles.section}>
          <Card onPress={() => router.push('/print')} accessibilityHint="Opens the Print Store">
            <View style={styles.row}>
              <View style={[styles.roundIcon, { backgroundColor: theme.background }]}>
                <Icon name="print" size={20} color={theme.tint} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Print Store</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Send a PDF, pick it up printed or have it delivered. Only the shop sees your file.
                </ThemedText>
              </View>
              <Icon name="chevron" size={20} color={theme.textSecondary} />
            </View>
          </Card>
        </View>
      </ScrollView>
      <CartBar bottomOffset={BottomTabInset} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: Brand.yellow,
    borderBottomLeftRadius: Radius.large,
    borderBottomRightRadius: Radius.large,
  },
  headerInner: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  greeting: {
    color: Brand.ink,
    fontSize: 26,
    fontWeight: 800,
  },
  subtitle: {
    color: Brand.ink,
    fontSize: 14,
    fontWeight: 600,
  },
  search: {
    marginTop: Spacing.two,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#ffffff',
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
  },
  searchHint: {
    color: Brand.inkSoft,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.8,
  },
  section: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  roundIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    gap: Spacing.two,
  },
  tile: {
    width: 108,
    height: 80,
    borderRadius: Radius.medium,
    padding: Spacing.two,
    justifyContent: 'flex-end',
  },
  tileLabel: {
    color: Brand.ink,
    fontSize: 14,
    fontWeight: 800,
  },
  tileCount: {
    color: Brand.inkSoft,
    fontSize: 12,
  },
  banners: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  banner: {
    width: 280,
    backgroundColor: Brand.green,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 800,
  },
  bannerBody: {
    color: '#ffffff',
    fontSize: 14,
  },
  bannerGo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  bannerGoText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 800,
  },
  againRow: {
    gap: Spacing.three,
  },
  againCard: {
    width: 124,
    gap: Spacing.half,
  },
  againPhoto: {
    width: 124,
    height: 96,
    borderRadius: Radius.medium,
  },
  closedCard: {
    opacity: 0.7,
  },
  shopAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopAvatarText: {
    color: Brand.ink,
    fontSize: 20,
    fontWeight: 800,
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
