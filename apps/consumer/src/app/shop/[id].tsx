import {
  describeShopHours,
  effectivePrepMinutes,
  getMyProfile,
  openGroupOrder,
  formatPaise,
  getShopMenu,
  listFavouriteProductIds,
  listStockAlertVariantIds,
  parseShopHours,
  setFavourite,
  setStockAlert,
} from '@campuscart/core';
import { Brand, Radius, StatusBadge } from '@campuscart/ui';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';

import { CartBar } from '@/components/cart-bar';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { PhotoCredits } from '@/components/photo-credits';
import { ProductImage } from '@/components/product-image';
import { QtyStepper } from '@/components/qty-stepper';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { readCache, writeCache } from '@/lib/cache';
import { useCart, type CartShop } from '@/lib/cart';
import { logStep } from '@/lib/events';
import { supabase } from '@/lib/supabase';

type Menu = Awaited<ReturnType<typeof getShopMenu>>;
type Product = Menu['products'][number];


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

export default function ShopScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<ReadonlySet<string>>(() => new Set());
  const [alerts, setAlerts] = useState<ReadonlySet<string>>(() => new Set());

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

  useEffect(() => {
    let active = true;
    let fresh = false;
    logStep('shop_view', id);
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
  }, [id]);

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
      <ThemedView style={[styles.container, styles.content]}>
        <SkeletonList count={4} label="Loading the menu" />
      </ThemedView>
    );
  }

  const { shop, products } = menu;
  const hours = parseShopHours(shop.hours);
  const cartShop: CartShop = {
    id: shop.id,
    name: shop.name,
    doesDelivery: shop.does_delivery,
    doesPickup: shop.does_pickup,
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: shop.name }} />
      <SectionList
        sections={sectionsOf(products)}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {shop.kind}
              </ThemedText>
              <StatusBadge label={shop.is_open ? 'Open' : 'Closed'} tone={shop.is_open ? 'good' : 'bad'} />
            </View>
            <View style={styles.row}>
              <Icon name="clock" size={16} color={theme.textSecondary} />
              <ThemedText type="smallBold" style={styles.flex}>
                {shop.is_open
                  ? `Ready in about ${effectivePrepMinutes(shop)} min`
                  : 'Closed right now. You can still schedule an order for later'}
                {shop.does_pickup ? ' · Pickup available' : ''}
              </ThemedText>
            </View>
            {hours && (
              <View style={styles.row}>
                <Icon name="store" size={16} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                  Open {describeShopHours(hours)}
                </ThemedText>
              </View>
            )}
            {shop.does_delivery && <OrderTogether shopId={shop.id} />}
          </ThemedView>
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="section" accessibilityRole="header" style={styles.sectionTitle}>
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            shop={cartShop}
            favourite={favourites.has(item.id)}
            onToggleFavourite={() => toggle(favourites, setFavourites, item.id, (on) => setFavourite(supabase, item.id, on))}
            alerted={alerts}
            onToggleAlert={(variantId) => toggle(alerts, setAlerts, variantId, (on) => setStockAlert(supabase, variantId, on))}
          />
        )}
        ListFooterComponent={<PhotoCredits items={products} />}
      />
      <CartBar />
    </ThemedView>
  );
}

function ProductRow({
  product,
  shop,
  favourite,
  onToggleFavourite,
  alerted,
  onToggleAlert,
}: {
  product: Product;
  shop: CartShop;
  favourite: boolean;
  onToggleFavourite: () => void;
  alerted: ReadonlySet<string>;
  onToggleAlert: (variantId: string) => void;
}) {
  const theme = useTheme();
  const cart = useCart();
  const available = product.variants.some((v) => v.in_stock);

  function addVariant(variant: Product['variants'][number]) {
    const line = { variantId: variant.id, productName: product.name, label: variant.label, pricePaise: variant.price_paise };
    logStep('add_to_cart', shop.id);
    // Carts take items from several shops; each shop gets its own order at checkout.
    cart.add(shop, line);
  }

  return (
    <ThemedView type="backgroundElement" style={[styles.product, !available && styles.unavailable]}>
      {product.image_path ? (
        <ProductImage path={product.image_path} style={styles.photo} label={product.name} />
      ) : (
        <View style={styles.photo} />
      )}
      <View style={styles.details}>
        <View style={styles.row}>
          <ThemedText type="smallBold" style={styles.flex}>
            {product.name}
          </ThemedText>
          {product.is_veg === false && <StatusBadge label="Non-veg" tone="bad" />}
          {product.is_veg === true && <StatusBadge label="Veg" tone="good" />}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: favourite }}
            accessibilityLabel={favourite ? `Remove ${product.name} from favourites` : `Add ${product.name} to favourites`}
            onPress={onToggleFavourite}
            hitSlop={12}>
            <Icon name={favourite ? 'heartFilled' : 'heart'} size={22} color={favourite ? Brand.red : theme.textSecondary} />
          </Pressable>
        </View>
        {!!product.description && (
          <ThemedText type="small" themeColor="textSecondary">
            {product.description}
          </ThemedText>
        )}
        {[...product.variants]
          .sort((a, b) => a.sort - b.sort)
          .map((variant) => (
            <View key={variant.id} style={styles.variantRow}>
              <ThemedText type="small" style={styles.flex}>
                {variant.label ? `${variant.label} · ` : ''}
                <ThemedText type="smallBold">{formatPaise(variant.price_paise)}</ThemedText>
              </ThemedText>
              {!variant.in_stock && (
                <Pressable accessibilityRole="button" onPress={() => onToggleAlert(variant.id)} hitSlop={6}>
                  <ThemedText type="linkPrimary">{alerted.has(variant.id) ? "We'll tell you" : 'Notify me'}</ThemedText>
                </Pressable>
              )}
              <QtyStepper
                qty={cart.qtyOf(variant.id)}
                disabled={!variant.in_stock}
                onAdd={() => addVariant(variant)}
                onRemove={() => cart.setQty(variant.id, cart.qtyOf(variant.id) - 1)}
              />
            </View>
          ))}
        {!!product.availability_note && (
          <ThemedText type="small" themeColor="textSecondary">
            {product.availability_note}
          </ThemedText>
        )}
        {!available && <StatusBadge label="Out of stock" tone="bad" />}
      </View>
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
    minHeight: 56,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.75,
  },
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    // Room for the cart bar.
    paddingBottom: 120,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  sectionTitle: {
    marginTop: Spacing.four,
    marginBottom: Spacing.one,
  },
  product: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderRadius: Radius.medium,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  unavailable: {
    opacity: 0.5,
  },
  photo: {
    width: 76,
    height: 76,
    borderRadius: Radius.small,
    backgroundColor: '#00000011',
  },
  details: {
    flex: 1,
    gap: Spacing.half,
    justifyContent: 'center',
  },
});
