import { effectivePrepMinutes, formatPaise, type listCategories } from '@campuscart/core';
import { Brand, Storefront } from '@campuscart/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ProductImage } from '@/components/product-image';
import { QtyStepper } from '@/components/qty-stepper';
import { Font, Spacing } from '@/constants/theme';
import { useCart, type CartShop } from '@/lib/cart';
import { logStep } from '@/lib/events';
import type { MenuProduct, Shop } from '@/lib/menus';

// The quick-commerce look: a warm cream header with search and category tabs, grids of light tiles,
// product cards with the photo on top and ADD over its corner. Colours in Storefront (@campuscart/ui).

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type ShopLike = Pick<Shop, 'id' | 'name' | 'does_delivery' | 'does_pickup' | 'is_open' | 'prep_minutes' | 'rush_until' | 'rush_extra_minutes'>;

export const cartShopOf = (shop: Pick<Shop, 'id' | 'name' | 'does_delivery' | 'does_pickup'>): CartShop => ({
  id: shop.id,
  name: shop.name,
  doesDelivery: shop.does_delivery,
  doesPickup: shop.does_pickup,
});

// A small picture for each category tab, by name; anything else gets the bag.
const CATEGORY_ICON: [RegExp, string][] = [
  [/burger/i, '🍔'],
  [/pizza/i, '🍕'],
  [/momo/i, '🥟'],
  [/noodle|chinese/i, '🍜'],
  [/wrap|roll/i, '🌯'],
  [/fries|snack/i, '🍟'],
  [/sandwich|bread|garlic/i, '🥪'],
  [/pasta/i, '🍝'],
  [/shake|drink|juice/i, '🥤'],
  [/chai|tea|coffee/i, '☕'],
  [/soup/i, '🍲'],
  [/dosa|idli|vada|uttapam/i, '🥞'],
  [/breakfast|egg/i, '🍳'],
  [/paratha|roti|naan/i, '🫓'],
  [/rice|biryani/i, '🍛'],
  [/main course|meals|thali/i, '🍛'],
  [/stationery|print/i, '✏️'],
  [/fruit/i, '🍎'],
];
export const categoryIcon = (name: string) => CATEGORY_ICON.find(([re]) => re.test(name))?.[1] ?? '🛍️';

/** The warm header: where it goes, the cart, search, and the category tabs under it. */
export function WarmHeader({
  location,
  onLocation,
  categories,
  selected,
  onSelect,
}: {
  location: string | null;
  onLocation: () => void;
  categories: Category[];
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  const cart = useCart();
  return (
    <View style={styles.header}>
      <SafeAreaView edges={['top']}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityHint="Sets your usual drop point" onPress={onLocation} style={styles.flex}>
            <Text style={styles.brand}>Campus Cart</Text>
            <Text style={styles.where} numberOfLines={1}>
              {location ? `Delivering to ${location}` : 'Set your hostel'} ▾
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open cart, ${cart.itemCount} items`}
            onPress={() => router.push('/cart')}
            hitSlop={8}
            style={styles.cartButton}>
            <Icon name="cart" size={22} color="#1C1C1C" />
            {cart.itemCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{cart.itemCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search"
          onPress={() => router.push('/search')}
          style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
          <Icon name="search" size={20} color="#1C1C1C" />
          <Text style={styles.searchHint}>Search for maggi, momos, coke and more</Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {[{ id: null as string | null, name: 'All' }, ...categories.map((c) => ({ id: c.id as string | null, name: c.name }))].map((c) => {
            const on = selected === c.id;
            return (
              <Pressable key={c.id ?? 'all'} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onSelect(c.id)} style={styles.tab}>
                <Text style={styles.tabIcon}>{c.id ? categoryIcon(c.name) : '🛒'}</Text>
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                  {c.name}
                </Text>
                <View style={[styles.tabLine, on && styles.tabLineOn]} />
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** A section title on the white page ("Shops on campus"). */
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {!!action && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * One shop as a light tile with four of its items in a 2×2 grid that changes every few seconds,
 * "+N more" across the middle, and the shop's name under it.
 */
export function ShopTile({ shop, photos, total, width }: { shop: Shop; photos: string[]; total: number; width: number }) {
  const [offset, setOffset] = useState(0);
  const many = photos.length > 4;
  useEffect(() => {
    if (!many) return;
    // Each tile starts at a different moment, so the grid doesn't change all at once.
    const start = setTimeout(() => setOffset((o) => o + 1), 800 + (shop.name.length % 7) * 300);
    const timer = setInterval(() => setOffset((o) => o + 1), 3500);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [many, shop.name]);
  const four = Array.from({ length: 4 }, (_, i) => (photos.length ? photos[(offset * 4 + i) % photos.length] : null));
  const cell = (width - 6 * 3) / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shop.name}, ${shop.is_open ? 'open' : 'closed'}`}
      onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      <View style={[styles.tile, !shop.is_open && styles.tileClosed]}>
        <View style={styles.tileGrid}>
          {four.map((path, i) => (
            <View key={i} style={[styles.tileCell, { width: cell, height: cell }]}>
              {path ? <ProductImage path={path} style={styles.fill} /> : <Text style={styles.tileEmoji}>🍽️</Text>}
            </View>
          ))}
        </View>
        {total > 4 && (
          <View style={styles.morePill}>
            <Text style={styles.moreText}>+{total - 4} more</Text>
          </View>
        )}
        {!shop.is_open && (
          <View style={styles.closedPill}>
            <Text style={styles.closedText}>Closed</Text>
          </View>
        )}
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {shop.name}
      </Text>
      {!shop.is_open && !!shop.phone && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${shop.name} is closed. Call ${phoneParts(shop.phone).shown} to ask`}
          onPress={() => Linking.openURL(`tel:${phoneParts(shop.phone ?? '').dial}`)}
          hitSlop={6}>
          <Text style={styles.tileCall}>📞 Call to ask</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

/** The card for one item: photo on top with ADD over its corner, then size, price, name, shop and time. */
export function GridProductCard({
  product,
  shop,
  width,
  showShop = true,
  favourite,
  onToggleFavourite,
  alerted,
  onToggleAlert,
}: {
  product: MenuProduct;
  shop: ShopLike;
  width: number;
  showShop?: boolean;
  /** Shop screen only: the heart, and "notify me" for sold-out sizes. */
  favourite?: boolean;
  onToggleFavourite?: () => void;
  alerted?: ReadonlySet<string>;
  onToggleAlert?: (variantId: string) => void;
}) {
  const cart = useCart();
  const [sizes, setSizes] = useState(false);
  const variants = [...product.variants].sort((a, b) => a.sort - b.sort);
  const first = variants.find((v) => v.in_stock) ?? variants[0];
  if (!first) return null;
  const soldOut = !variants.some((v) => v.in_stock);
  const canAdd = shop.is_open && !soldOut;
  const inCart = variants.reduce((n, v) => n + cart.qtyOf(v.id), 0);
  const add = (variant: (typeof variants)[number]) => {
    logStep('add_to_cart', shop.id);
    cart.add(cartShopOf(shop), { variantId: variant.id, productName: product.name, label: variant.label, pricePaise: variant.price_paise });
  };
  const discount = first.mrp_paise && first.mrp_paise > first.price_paise ? first.mrp_paise : null;

  return (
    <View style={{ width }}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={`Opens ${shop.name}`}
        onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}
        style={[styles.cardPhoto, { height: width }]}>
        {product.image_path ? <ProductImage path={product.image_path} style={styles.fill} label={product.name} /> : null}
        {product.is_veg != null && (
          <View style={[styles.vegBox, { borderColor: product.is_veg ? '#0F8A2F' : '#C62828' }]}>
            <View style={[styles.vegDot, { backgroundColor: product.is_veg ? '#0F8A2F' : '#C62828' }]} />
          </View>
        )}
        {onToggleFavourite && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !!favourite }}
            accessibilityLabel={favourite ? `Remove ${product.name} from favourites` : `Add ${product.name} to favourites`}
            onPress={onToggleFavourite}
            hitSlop={10}
            style={styles.heart}>
            <Icon name={favourite ? 'heartFilled' : 'heart'} size={18} color={favourite ? Brand.red : '#8A8A8A'} />
          </Pressable>
        )}
        {(soldOut || !shop.is_open) && (
          <View style={styles.soldOut}>
            <Text style={styles.soldOutText}>{soldOut ? 'Sold out' : 'Shop closed'}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.addWrap}>
        {variants.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name}, choose a size`}
            disabled={!canAdd}
            onPress={() => setSizes(true)}
            style={[styles.addButton, !canAdd && styles.disabled, inCart > 0 && styles.addButtonOn]}>
            <Text style={[styles.addText, inCart > 0 && styles.addTextOn]}>{inCart > 0 ? `${inCart} added` : 'ADD'}</Text>
            <Text style={[styles.options, inCart > 0 && styles.addTextOn]}>{variants.length} options</Text>
          </Pressable>
        ) : (
          <QtyStepper compact qty={cart.qtyOf(first.id)} disabled={!canAdd} onAdd={() => add(first)} onRemove={() => cart.setQty(first.id, cart.qtyOf(first.id) - 1)} />
        )}
      </View>
      <View style={styles.cardInfo}>
        {!!first.label && (
          <Text style={styles.size} numberOfLines={1}>
            {first.label}
          </Text>
        )}
        <Text style={styles.price}>
          {formatPaise(first.price_paise)}
          {discount ? <Text style={styles.mrp}> {formatPaise(discount)}</Text> : null}
        </Text>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {showShop && (
          <Text style={styles.shopName} numberOfLines={1}>
            {shop.name}
          </Text>
        )}
        <Text style={styles.time}>◷ {effectivePrepMinutes(shop)} mins</Text>
        {soldOut && onToggleAlert && alerted && (
          <Pressable accessibilityRole="button" onPress={() => onToggleAlert(first.id)} hitSlop={6}>
            <Text style={styles.notify}>{alerted.has(first.id) ? "We'll tell you" : 'Notify me'}</Text>
          </Pressable>
        )}
      </View>

      <Modal visible={sizes} transparent animationType="slide" onRequestClose={() => setSizes(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSizes(false)} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Text style={styles.sheetTitle}>{product.name}</Text>
          <Text style={styles.shopName}>{shop.name}</Text>
          {variants.map((v) => (
            <View key={v.id} style={styles.sheetRow}>
              <View style={styles.flex}>
                <Text style={styles.sheetSize}>{v.label || 'Regular'}</Text>
                <Text style={styles.sheetPrice}>{v.in_stock ? formatPaise(v.price_paise) : 'Sold out'}</Text>
              </View>
              <QtyStepper
                qty={cart.qtyOf(v.id)}
                disabled={!shop.is_open || !v.in_stock}
                onAdd={() => add(v)}
                onRemove={() => cart.setQty(v.id, cart.qtyOf(v.id) - 1)}
              />
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setSizes(false)} style={styles.sheetDone}>
            <Text style={styles.sheetDoneText}>Done</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** A phone number as people write it (98765 43210), and the number to dial (+91 for Indian mobiles). */
export function phoneParts(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return digits.length === 10
    ? { shown: `${digits.slice(0, 5)} ${digits.slice(5)}`, dial: `+91${digits}` }
    : { shown: phone, dial: phone.replace(/[^\d+]/g, '') };
}

/**
 * Call the shop: a card with the Call button and the number written under it, so it can also be
 * read out or dialled by hand. Nothing shows when the shop has no number.
 */
export function CallShop({ phone, title = 'Call the shop', note }: { phone: string | null | undefined; title?: string; note?: string }) {
  if (!phone) return null;
  const { shown, dial } = phoneParts(phone);
  return (
    <View style={styles.call}>
      <View style={styles.callIcon}>
        <Icon name="phone" size={18} color="#ffffff" />
      </View>
      <View style={styles.flex}>
        <Text style={styles.callTitle}>{title}</Text>
        {!!note && <Text style={styles.callNote}>{note}</Text>}
      </View>
      <View style={styles.callSide}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${shown}`}
          onPress={() => Linking.openURL(`tel:${dial}`)}
          style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}>
          <Text style={styles.callButtonText}>Call</Text>
        </Pressable>
        <Text style={styles.callNumber} selectable>
          {shown}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },

  header: { backgroundColor: Storefront.header },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  brand: { fontFamily: Font.heading, fontSize: 18, color: '#1C1C1C', letterSpacing: -0.4 },
  where: { fontFamily: Font.semibold, fontSize: 12, color: '#3D3D3D', marginTop: 2 },
  cartButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: Font.bold, fontSize: 10, color: '#ffffff' },
  search: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EFE4CC',
  },
  searchHint: { fontFamily: Font.regular, fontSize: 15, color: '#5A5A5A' },
  tabs: { paddingHorizontal: Spacing.two, paddingTop: Spacing.three, gap: 4 },
  tab: { alignItems: 'center', paddingHorizontal: 10, minWidth: 64 },
  tabIcon: { fontSize: 24 },
  tabText: { fontFamily: Font.medium, fontSize: 12, color: '#4A4A4A', marginTop: 4, maxWidth: 90 },
  tabTextOn: { fontFamily: Font.bold, color: '#1C1C1C' },
  tabLine: { height: 3, width: '80%', marginTop: 8, borderRadius: 2, backgroundColor: 'transparent' },
  tabLineOn: { backgroundColor: '#1C1C1C' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three },
  sectionTitle: { fontFamily: Font.heading, fontSize: 19, color: '#1C1C1C', letterSpacing: -0.3 },
  sectionAction: { fontFamily: Font.semibold, fontSize: 13, color: Brand.green },

  tile: { backgroundColor: Storefront.tile, borderRadius: 16, padding: 6 },
  tileClosed: { opacity: 0.6 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tileCell: { backgroundColor: Storefront.tileInner, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileEmoji: { fontSize: 22 },
  morePill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: '50%',
    transform: [{ translateY: 11 }],
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E4E8EE',
  },
  moreText: { fontFamily: Font.semibold, fontSize: 10, color: '#5A5A5A' },
  closedPill: { position: 'absolute', top: 10, left: 10, backgroundColor: '#1C1C1C', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  closedText: { fontFamily: Font.bold, fontSize: 9, color: '#ffffff' },
  tileCall: { fontFamily: Font.semibold, fontSize: 11, color: Brand.green, textAlign: 'center', marginTop: 2 },
  tileName: { fontFamily: Font.semibold, fontSize: 13, lineHeight: 17, color: '#1C1C1C', textAlign: 'center', marginTop: 8 },

  cardPhoto: { borderRadius: 12, borderWidth: 1, borderColor: '#ECECEC', backgroundColor: '#ffffff', overflow: 'hidden', padding: 8 },
  vegBox: { position: 'absolute', right: 8, bottom: 8, width: 14, height: 14, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  vegDot: { width: 6, height: 6, borderRadius: 3 },
  heart: { position: 'absolute', right: 6, top: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#ffffffE6', alignItems: 'center', justifyContent: 'center' },
  notify: { fontFamily: Font.semibold, fontSize: 12, color: Brand.green, marginTop: 2 },
  soldOut: { position: 'absolute', left: 8, top: 8, backgroundColor: '#ffffff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  soldOutText: { fontFamily: Font.semibold, fontSize: 10, color: '#1C1C1C' },
  addWrap: { alignItems: 'flex-end', marginTop: -22, marginRight: 6 },
  addButton: {
    minWidth: 72,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.green,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  addButtonOn: { backgroundColor: Brand.green },
  addText: { fontFamily: Font.bold, fontSize: 13, color: Brand.green },
  addTextOn: { color: '#ffffff' },
  options: { fontFamily: Font.medium, fontSize: 9, color: Brand.green },
  cardInfo: { gap: 2, marginTop: 6 },
  size: { fontFamily: Font.medium, fontSize: 11, color: Storefront.muted },
  price: { fontFamily: Font.heading, fontSize: 15, color: '#1C1C1C' },
  mrp: { fontFamily: Font.regular, fontSize: 12, color: '#8A8A8A', textDecorationLine: 'line-through' },
  name: { fontFamily: Font.semibold, fontSize: 13, lineHeight: 17, color: '#1C1C1C' },
  shopName: { fontFamily: Font.regular, fontSize: 11, color: Storefront.muted },
  time: { fontFamily: Font.medium, fontSize: 11, color: '#5A5A5A' },

  sheetBackdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: Spacing.three, gap: Spacing.two },
  sheetTitle: { fontFamily: Font.heading, fontSize: 18, color: '#1C1C1C' },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  sheetSize: { fontFamily: Font.semibold, fontSize: 14, color: '#1C1C1C' },
  sheetPrice: { fontFamily: Font.bold, fontSize: 14, color: '#1C1C1C', marginTop: 2 },
  sheetDone: { marginTop: Spacing.two, backgroundColor: Brand.green, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  sheetDoneText: { fontFamily: Font.bold, fontSize: 15, color: '#ffffff' },

  call: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Brand.green,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#F7FFF9',
  },
  callIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Brand.green, alignItems: 'center', justifyContent: 'center' },
  callTitle: { fontFamily: Font.bold, fontSize: 14, color: '#1C1C1C' },
  callNote: { fontFamily: Font.regular, fontSize: 12, lineHeight: 16, color: Storefront.muted, marginTop: 2 },
  callSide: { alignItems: 'center', gap: 4 },
  callButton: { minWidth: 84, minHeight: 36, borderRadius: 18, backgroundColor: Brand.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  callButtonText: { fontFamily: Font.bold, fontSize: 14, color: '#ffffff' },
  callNumber: { fontFamily: Font.semibold, fontSize: 12, color: '#1C1C1C' },
});
