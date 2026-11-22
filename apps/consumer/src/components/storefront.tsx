import { effectivePrepMinutes, formatPaise, type getShopMenu, type listCategories, type listShops } from '@campuscart/core';
import { Brand, Radius, Storefront } from '@campuscart/ui';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProductImage } from '@/components/product-image';
import { QtyStepper } from '@/components/qty-stepper';
import { Font, Spacing } from '@/constants/theme';
import { useCart, type CartShop } from '@/lib/cart';
import { logStep } from '@/lib/events';

// The storefront look shared with the website (apps/web): see Storefront in @campuscart/ui.

type Shop = Awaited<ReturnType<typeof listShops>>[number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];
export type MenuProduct = Awaited<ReturnType<typeof getShopMenu>>['products'][number];

export const cartShopOf = (shop: Pick<Shop, 'id' | 'name' | 'does_delivery' | 'does_pickup'>): CartShop => ({
  id: shop.id,
  name: shop.name,
  doesDelivery: shop.does_delivery,
  doesPickup: shop.does_pickup,
});

/** "campuscart" in the website's yellow and green. */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <Text style={[styles.wordmark, { fontSize: size }]} accessibilityLabel="CampusCart">
      campus<Text style={styles.wordmarkCart}>cart</Text>
    </Text>
  );
}

/** Small caps line above a heading ("YOUR CAMPUS SHOPS"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

/** The website's header: where it's delivered, the green cart button, and search. */
export function StoreHeader({ location, onLocation }: { location: string | null; onLocation: () => void }) {
  const cart = useCart();
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityHint="Sets your usual drop point" onPress={onLocation} style={styles.location}>
          <Text style={styles.locationTitle}>Delivery on campus</Text>
          <Text style={styles.locationPlace} numberOfLines={1}>
            {location ?? 'Select your delivery location'} ▾
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open cart, ${cart.itemCount} items`}
          onPress={() => router.push('/cart')}
          style={({ pressed }) => [styles.cartButton, pressed && styles.pressed]}>
          <Icon name="cart" size={18} color="#ffffff" />
          {cart.itemCount ? (
            <View>
              <Text style={styles.cartText}>{cart.itemCount} items</Text>
              <Text style={styles.cartSmall}>{formatPaise(cart.subtotalPaise)}</Text>
            </View>
          ) : (
            <Text style={styles.cartText}>My cart</Text>
          )}
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Search products"
        onPress={() => router.push('/search')}
        style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
        <Icon name="search" size={20} color="#222222" />
        <Text style={styles.searchHint}>Search for Maggi, momos, juice or shops</Text>
      </Pressable>
    </View>
  );
}

/** The light-green hero with the campuscart bag, as on the website. */
export function Hero({ greeting, line }: { greeting: string; line: string }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroCopy}>
        <Text style={styles.heroKicker}>NIT HAMIRPUR. YOUR CAMPUS SHOPS.</Text>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {greeting}
        </Text>
        <Text style={styles.heroLine}>{line}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/search')}
          style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}>
          <Text style={styles.heroButtonText}>Shop now →</Text>
        </Pressable>
      </View>
      <View style={styles.heroArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.goods, styles.goodsOne]}>🍔</Text>
        <Text style={[styles.goods, styles.goodsTwo]}>🥤</Text>
        <View style={styles.bagHandle} />
        <View style={styles.bag}>
          <Wordmark size={15} />
          <Text style={styles.bagSmall}>good things inside.</Text>
        </View>
        <Text style={[styles.goods, styles.goodsThree]}>🍜</Text>
        <Text style={[styles.goods, styles.goodsFour]}>☕</Text>
      </View>
    </View>
  );
}

const PROMO_COLORS = [Storefront.mint, Storefront.lemon, Storefront.lilac];

export type Promo = { key: string; title: string; body?: string | null; action?: string; emoji?: string; onPress?: () => void };

/** The website's pastel promo cards, swiped sideways. */
export function PromoCards({ promos }: { promos: Promo[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promos}>
      {promos.map((promo, i) => (
        <Pressable
          key={promo.key}
          accessibilityRole={promo.onPress ? 'button' : 'text'}
          disabled={!promo.onPress}
          onPress={promo.onPress}
          style={({ pressed }) => [styles.promo, { backgroundColor: PROMO_COLORS[i % PROMO_COLORS.length] }, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text style={styles.promoTitle}>{promo.title}</Text>
            {!!promo.body && <Text style={styles.promoBody}>{promo.body}</Text>}
            {!!promo.action && (
              <View style={styles.promoAction}>
                <Text style={styles.promoActionText}>{promo.action} →</Text>
              </View>
            )}
          </View>
          {!!promo.emoji && <Text style={styles.promoEmoji}>{promo.emoji}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** "Your campus shops": one chip per shop with whether it's open, as on the website. */
export function ShopChips({ shops, ratings }: { shops: Shop[]; ratings: Map<string, { average: number; ratings: number }> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {shops.map((shop) => {
        const rating = ratings.get(shop.id);
        return (
          <Pressable
            key={shop.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}
            style={({ pressed }) => [styles.shopChip, pressed && styles.pressed]}>
            <Text style={styles.shopChipName} numberOfLines={1}>
              {shop.name}
            </Text>
            {rating && rating.ratings >= 3 && (
              <Text style={styles.shopChipSmall}>
                ★ {rating.average.toFixed(1)} · {rating.ratings} ratings
              </Text>
            )}
            <Text style={[styles.shopChipSmall, !shop.is_open && styles.closed]}>
              {shop.is_open ? `Open · ready in about ${effectivePrepMinutes(shop)} min` : 'Closed now'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The website's category bar: rounded chips with item counts. */
export function CategoryChips({ categories }: { categories: Category[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {categories.map((category) => (
        <Pressable
          key={category.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/search', params: { categoryId: category.id } })}
          style={({ pressed }) => [styles.categoryChip, pressed && styles.pressed]}>
          <Text style={styles.categoryText}>{category.name}</Text>
          <Text style={styles.categoryCount}>{category.product_count}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** The website's product card: photo, ready time, name, shop, price and ADD. */
export function ProductCard({
  product,
  shop,
  width = 156,
}: {
  product: MenuProduct;
  shop: Pick<Shop, 'id' | 'name' | 'does_delivery' | 'does_pickup' | 'is_open' | 'prep_minutes' | 'rush_until' | 'rush_extra_minutes'>;
  width?: number;
}) {
  const cart = useCart();
  const variants = [...product.variants].sort((a, b) => a.sort - b.sort);
  const [variantId, setVariantId] = useState((variants.find((v) => v.in_stock) ?? variants[0])?.id);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  if (!variant) return null;
  const soldOut = !variants.some((v) => v.in_stock);
  const canAdd = shop.is_open && variant.in_stock;

  return (
    <View style={[styles.card, { width }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={`Opens ${shop.name}`}
        onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}
        style={styles.cardImageBox}>
        {product.image_path ? (
          <ProductImage path={product.image_path} style={styles.cardImage} label={product.name} />
        ) : (
          <View style={styles.cardImage} />
        )}
        {(soldOut || !shop.is_open) && (
          <View style={styles.stockBadge}>
            <Text style={styles.stockBadgeText}>{soldOut ? 'Sold out' : 'Shop closed'}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.cardInfo}>
        <View style={styles.readyChip}>
          <Text style={styles.readyChipText}>◷ {effectivePrepMinutes(shop)} MINS</Text>
        </View>
        <Text style={styles.cardName} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.cardShop} numberOfLines={1}>
          {shop.name}
        </Text>
        {variants.length > 1 && (
          <View style={styles.sizes}>
            {variants.map((v) => (
              <Pressable
                key={v.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: v.id === variant.id, disabled: !v.in_stock }}
                onPress={() => setVariantId(v.id)}
                style={[styles.size, v.id === variant.id && styles.sizeOn, !v.in_stock && styles.sizeOut]}>
                <Text style={[styles.sizeText, v.id === variant.id && styles.sizeTextOn]} numberOfLines={1}>
                  {v.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.cardBottom}>
          <Text style={styles.cardPrice}>{formatPaise(variant.price_paise)}</Text>
          <QtyStepper
            compact
            qty={cart.qtyOf(variant.id)}
            disabled={!canAdd}
            onAdd={() => {
              logStep('add_to_cart', shop.id);
              cart.add(cartShopOf(shop), {
                variantId: variant.id,
                productName: product.name,
                label: variant.label,
                pricePaise: variant.price_paise,
              });
            }}
            onRemove={() => cart.setQty(variant.id, cart.qtyOf(variant.id) - 1)}
          />
        </View>
      </View>
    </View>
  );
}

/** A heading row over a shelf: title on the left, "see all →" on the right. */
export function ShelfHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.shelfHeading}>
      <Text style={styles.shelfTitle} accessibilityRole="header">
        {title}
      </Text>
      {!!action && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={styles.shelfAction}>{action} →</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  wordmark: { fontFamily: Font.heading, color: Storefront.wordYellow, letterSpacing: -1.2 },
  wordmarkCart: { color: Storefront.wordGreen },
  eyebrow: { fontFamily: Font.bold, fontSize: 10, letterSpacing: 1.7, color: Brand.green },

  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two + 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  location: { flex: 1, gap: 4 },
  locationTitle: { fontFamily: Font.heading, fontSize: 17, color: '#202020', letterSpacing: -0.3 },
  locationPlace: { fontFamily: Font.regular, fontSize: 12, color: '#202020' },
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Brand.green,
  },
  cartText: { fontFamily: Font.bold, fontSize: 13, color: '#ffffff' },
  cartSmall: { fontFamily: Font.medium, fontSize: 10, color: '#ffffff' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Storefront.searchLine,
    backgroundColor: Storefront.search,
  },
  searchHint: { fontFamily: Font.regular, fontSize: 13, color: '#757575' },

  hero: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    minHeight: 200,
    borderRadius: Radius.large,
    backgroundColor: Storefront.hero,
    padding: 20,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  heroCopy: { flex: 1, gap: 6, zIndex: 1 },
  heroKicker: { fontFamily: Font.bold, fontSize: 9, letterSpacing: 1.5, color: Storefront.heroText },
  heroTitle: { fontFamily: Font.heading, fontSize: 27, lineHeight: 30, letterSpacing: -1, color: Storefront.heroInk, marginTop: 4 },
  heroLine: { fontFamily: Font.regular, fontSize: 12, lineHeight: 17, color: '#486C3D' },
  heroButton: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 },
  heroButtonText: { fontFamily: Font.bold, fontSize: 12, color: Storefront.heroInk },
  heroArt: { width: 120, alignItems: 'center', justifyContent: 'center' },
  bag: {
    width: 96,
    height: 112,
    borderRadius: 9,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: Storefront.bag,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
    shadowColor: '#264A29',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 8, height: 12 },
    elevation: 4,
  },
  bagHandle: {
    width: 44,
    height: 30,
    borderWidth: 6,
    borderBottomWidth: 0,
    borderColor: Storefront.bagHandle,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginBottom: -6,
    transform: [{ rotate: '8deg' }, { translateX: 6 }],
  },
  bagSmall: { fontFamily: Font.medium, fontSize: 7, color: '#486125', marginTop: 4 },
  goods: { position: 'absolute', fontSize: 34 },
  goodsOne: { left: -6, top: 8, transform: [{ rotate: '-14deg' }] },
  goodsTwo: { right: -6, top: 4, transform: [{ rotate: '20deg' }] },
  goodsThree: { left: -2, bottom: 0 },
  goodsFour: { right: -4, bottom: 4, transform: [{ rotate: '12deg' }] },

  promos: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: 12 },
  promo: { width: 245, minHeight: 150, borderRadius: Radius.medium, padding: 18, flexDirection: 'row', gap: 8 },
  promoTitle: { fontFamily: Font.heading, fontSize: 18, lineHeight: 21, letterSpacing: -0.6, color: '#202020' },
  promoBody: { fontFamily: Font.regular, fontSize: 11, lineHeight: 15, color: '#585858', marginTop: 6 },
  promoAction: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF99', borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6, marginTop: 12 },
  promoActionText: { fontFamily: Font.bold, fontSize: 10, color: '#202020' },
  promoEmoji: { fontSize: 40, alignSelf: 'center', transform: [{ rotate: '-10deg' }] },

  chipsRow: { paddingHorizontal: Spacing.three, gap: 10 },
  shopChip: {
    minWidth: 190,
    maxWidth: 240,
    gap: 4,
    borderWidth: 1,
    borderColor: '#DCE5DC',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  shopChipName: { fontFamily: Font.bold, fontSize: 14, color: '#25382A' },
  shopChipSmall: { fontFamily: Font.regular, fontSize: 12, color: '#667568' },
  closed: { color: Brand.red },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Storefront.chipLine,
    borderRadius: 24,
    backgroundColor: '#ffffff',
  },
  categoryText: { fontFamily: Font.semibold, fontSize: 13, color: '#465347' },
  categoryCount: { fontFamily: Font.regular, fontSize: 11, color: '#697769' },

  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Storefront.line,
    borderRadius: 9,
    overflow: 'hidden',
  },
  cardImageBox: { backgroundColor: '#ffffff', aspectRatio: 1.1, padding: 10 },
  cardImage: { flex: 1, borderRadius: 6, backgroundColor: '#F5F6F2' },
  stockBadge: { position: 'absolute', left: 8, bottom: 8, backgroundColor: '#ffffff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  stockBadgeText: { fontFamily: Font.semibold, fontSize: 10, color: '#202020' },
  cardInfo: { padding: 10, gap: 4, flex: 1 },
  readyChip: { alignSelf: 'flex-start', backgroundColor: Storefront.chip, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  readyChipText: { fontFamily: Font.bold, fontSize: 8, letterSpacing: 0.3, color: '#444444' },
  cardName: { fontFamily: Font.bold, fontSize: 12, lineHeight: 17, color: '#202020', minHeight: 34 },
  cardShop: { fontFamily: Font.regular, fontSize: 10, color: '#8B8B8B' },
  sizes: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  size: { borderWidth: 1, borderColor: Storefront.line, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  sizeOn: { borderColor: Brand.green, backgroundColor: Brand.greenSoft },
  sizeOut: { opacity: 0.4 },
  sizeText: { fontFamily: Font.medium, fontSize: 10, color: '#444444' },
  sizeTextOn: { color: Brand.green },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto', paddingTop: 6 },
  cardPrice: { fontFamily: Font.bold, fontSize: 13, color: '#202020' },

  shelfHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: Spacing.three },
  shelfTitle: { fontFamily: Font.heading, fontSize: 20, letterSpacing: -0.5, color: '#1F1F1F', flexShrink: 1 },
  shelfAction: { fontFamily: Font.semibold, fontSize: 13, color: Brand.green },
});
