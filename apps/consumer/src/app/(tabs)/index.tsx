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
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoCredits } from '@/components/photo-credits';
import { ProductImage } from '@/components/product-image';
import { ProductStrip } from '@/components/product-strip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useNeedsPhone } from '@/hooks/use-needs-phone';
import { useAuth } from '@/lib/auth';
import { readCache, writeCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';

type Shop = Awaited<ReturnType<typeof listShops>>[number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Again = Awaited<ReturnType<typeof buyAgain>>[number];
type Ratings = Awaited<ReturnType<typeof getShopRatings>>;
type Banner = Awaited<ReturnType<typeof myBanners>>[number];
type Collection = Awaited<ReturnType<typeof listCollectionsForStudents>>[number];


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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <SafeAreaView edges={['top']} style={styles.headerInner}>
            <Text style={styles.greeting}>Hi, {firstName}</Text>
            <Text style={styles.subtitle}>
              {shops ? `${openCount} of ${shops.length} campus shops open now` : 'Checking which shops are open…'}
            </Text>
            <Pressable accessibilityRole="search" onPress={() => router.push('/search')} style={styles.search}>
              <Text style={styles.searchHint}>Search for Maggi, notebooks, juice…</Text>
            </Pressable>
          </SafeAreaView>
        </View>

        {banners.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banners}>
            {banners.map((banner) => (
              <Pressable
                key={banner.id}
                accessibilityRole={banner.shop_id || banner.category_id ? 'button' : 'text'}
                disabled={!banner.shop_id && !banner.category_id}
                onPress={() => {
                  if (banner.shop_id) router.push({ pathname: '/shop/[id]', params: { id: banner.shop_id } });
                  else if (banner.category_id) router.push({ pathname: '/search', params: { categoryId: banner.category_id } });
                }}
                style={styles.banner}>
                <Text style={styles.bannerTitle}>{banner.title}</Text>
                {!!banner.body && <Text style={styles.bannerBody}>{banner.body}</Text>}
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.section}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/print')}>
            <ThemedView type="backgroundElement" style={styles.shopCard}>
              <ThemedText type="smallBold">Print Store</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Send a PDF, pick it up printed or have it delivered. Only the shop sees your file.
              </ThemedText>
            </ThemedView>
          </Pressable>
        </View>

        {needsPhone && (
          <View style={styles.section}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/profile')}>
              <ThemedView type="backgroundElement" style={styles.shopCard}>
                <ThemedText type="smallBold">Add your mobile number and hostel</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Shops call you if something runs out, and checkout fills in your usual drop point.
                </ThemedText>
                <ThemedText type="linkPrimary">Complete your profile</ThemedText>
              </ThemedView>
            </Pressable>
          </View>
        )}

        {collections.map((collection) => (
          <View key={collection.id} style={styles.section}>
            <ProductStrip title={collection.title} subtitle={collection.subtitle} products={collection.items} />
          </View>
        ))}

        {again.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="smallBold">Buy again</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.againRow}>
              {again.map((item) => (
                <Pressable
                  key={item.variant_id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/shop/[id]', params: { id: item.shop_id } })}
                  style={styles.againCard}>
                  {item.image_path ? (
                    <ProductImage path={item.image_path} style={styles.againPhoto} label={item.product_name} />
                  ) : (
                    <View style={styles.againPhoto} />
                  )}
                  <ThemedText type="small" numberOfLines={2}>
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

        {categories.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="smallBold">Shop by category</ThemedText>
            <View style={styles.grid}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/search', params: { categoryId: category.id, category: category.name } })}
                  style={styles.tile}>
                  <Text style={styles.tileLabel} numberOfLines={2}>
                    {category.name}
                  </Text>
                  <Text style={styles.tileCount}>{category.product_count} items</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText type="smallBold">Shops on campus</ThemedText>

          {!shops && !error && <ActivityIndicator style={styles.loading} />}

          {error && (
            <ThemedView type="backgroundElement" style={styles.shopCard}>
              <ThemedText type="smallBold">Couldn&apos;t load shops</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {error}
              </ThemedText>
              <Pressable onPress={load}>
                <ThemedText type="linkPrimary">Try again</ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {shops?.map((shop) => (
            <Pressable
              key={shop.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}>
              <ThemedView type="backgroundElement" style={styles.shopCard}>
                <View style={styles.shopRow}>
                  <ThemedText type="smallBold" style={styles.shopName}>
                    {shop.name}
                  </ThemedText>
                  {ratings.has(shop.id) && (
                    <ThemedText type="small">
                      ★ {ratings.get(shop.id)?.average.toFixed(1)} ({ratings.get(shop.id)?.ratings})
                    </ThemedText>
                  )}
                  <StatusBadge label={shop.is_open ? 'Open' : 'Closed'} tone={shop.is_open ? 'good' : 'bad'} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {shop.kind}
                </ThemedText>
                <ThemedText type="small">
                  {shop.is_open
                    ? `${isRushing(shop) ? 'Busy right now · ' : ''}Ready in about ${effectivePrepMinutes(shop)} min`
                    : closedNote(shop.hours)}
                  {shop.does_pickup ? ' · Pickup available' : ''}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}

          <ThemedText type="small" themeColor="textSecondary">
            Delivery {formatPaise(DEFAULT_FEE_RULES.deliveryFeePaise)} · no small-cart fee from{' '}
            {formatPaise(DEFAULT_FEE_RULES.smallCartLimitPaise)}
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: BottomTabInset + Spacing.four,
  },
  header: {
    backgroundColor: Brand.yellow,
    borderBottomLeftRadius: Radius.large,
    borderBottomRightRadius: Radius.large,
  },
  headerInner: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  greeting: {
    color: Brand.ink,
    fontSize: 24,
    fontWeight: 800,
  },
  subtitle: {
    color: Brand.ink,
    fontSize: 14,
    fontWeight: 600,
  },
  search: {
    marginTop: Spacing.two,
    backgroundColor: '#ffffff',
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  searchHint: {
    color: Brand.inkSoft,
    fontSize: 14,
  },
  section: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: '31%',
    aspectRatio: 1.3,
    backgroundColor: Brand.greenSoft,
    borderRadius: Radius.medium,
    padding: Spacing.two,
    justifyContent: 'flex-end',
  },
  tileLabel: {
    color: Brand.ink,
    fontSize: 13,
    fontWeight: 700,
  },
  tileCount: {
    color: Brand.inkSoft,
    fontSize: 11,
  },
  loading: {
    marginVertical: Spacing.four,
  },
  banners: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  banner: {
    width: 260,
    backgroundColor: Brand.green,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 800,
  },
  bannerBody: {
    color: '#ffffff',
    fontSize: 13,
  },
  againRow: {
    gap: Spacing.two,
  },
  againCard: {
    width: 120,
    gap: Spacing.half,
  },
  againPhoto: {
    width: 120,
    height: 90,
    borderRadius: Radius.medium,
    backgroundColor: '#00000011',
  },
  shopCard: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  shopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  shopName: {
    flex: 1,
  },
});
