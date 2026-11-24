import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GridProductCard, SectionTitle } from '@/components/grid';
import { PhotoCredits } from '@/components/photo-credits';
import { Font, Spacing } from '@/constants/theme';
import { useCart } from '@/lib/cart';
import { offersForMasters, useMenus } from '@/lib/menus';

export type StripProduct = {
  master_product_id: string;
  name: string;
  size: string;
  image_path: string | null;
  photo_credit: string | null;
  photo_source_url: string | null;
  min_price_paise: number;
};

/**
 * A sideways row of catalog products, each shown as one shop's own item so it adds straight to
 * that shop's order: the cart's shop when it sells it, else an open shop that has it. With
 * `onlyCartShop`, only the cart's shop's items show (for "often bought together" in the cart).
 */
export function ProductStrip({
  title,
  subtitle,
  products,
  onlyCartShop = false,
}: {
  title: string;
  subtitle?: string | null;
  products: StripProduct[];
  onlyCartShop?: boolean;
}) {
  const cart = useCart();
  const { shops, menus } = useMenus();
  const cartShopId = cart.shops[0]?.id ?? null;
  if (onlyCartShop && !cartShopId) return null;
  const offers = offersForMasters(
    shops,
    menus,
    products.map((p) => p.master_product_id),
    cartShopId,
    onlyCartShop ? cartShopId : null,
  ).filter((o, i, all) => all.findIndex((x) => x.product.id === o.product.id) === i);
  if (offers.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionTitle title={title} />
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {offers.map(({ shop, product }) => (
          <GridProductCard key={product.id} product={product} shop={shop} width={118} showShop={!onlyCartShop} />
        ))}
      </ScrollView>
      {products.some((p) => p.photo_credit) && (
        <View style={styles.credits}>
          <PhotoCredits items={products} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  subtitle: { fontFamily: Font.regular, fontSize: 13, color: '#666666', paddingHorizontal: Spacing.three, marginTop: -4 },
  row: { paddingHorizontal: Spacing.three, gap: 12 },
  credits: { paddingHorizontal: Spacing.three },
});
