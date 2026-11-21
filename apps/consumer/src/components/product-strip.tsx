import { formatPaise } from '@campuscart/core';
import { Radius } from '@campuscart/ui';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PhotoCredits } from '@/components/photo-credits';
import { ProductImage } from '@/components/product-image';
import { QtyStepper } from '@/components/qty-stepper';
import { RiseIn } from '@/components/rise-in';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { routedKey, useCart } from '@/lib/cart';
import { logStep } from '@/lib/events';

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
 * A sideways row of products the student can add straight to the cart; CampusCart picks the shop
 * at checkout. Used for collections on Home and "often bought together" in the cart.
 */
export function ProductStrip({ title, subtitle, products }: { title: string; subtitle?: string; products: StripProduct[] }) {
  const cart = useCart();
  if (products.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title={title} subtitle={subtitle} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {products.map((p, i) => {
          const key = routedKey(p.master_product_id);
          return (
            <RiseIn key={p.master_product_id} index={i} style={styles.card}>
              {p.image_path ? (
                <ProductImage path={p.image_path} style={styles.photo} label={p.name} />
              ) : (
                <View style={styles.photo} />
              )}
              <ThemedText type="small" numberOfLines={2}>
                {p.name}
                {p.size ? ` · ${p.size}` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatPaise(p.min_price_paise)}
              </ThemedText>
              <QtyStepper
                qty={cart.qtyOf(key)}
                onAdd={() => {
                  logStep('add_to_cart');
                  cart.addRouted({ masterProductId: p.master_product_id, productName: p.name, label: p.size, pricePaise: p.min_price_paise });
                }}
                onRemove={() => cart.setQty(key, cart.qtyOf(key) - 1)}
              />
            </RiseIn>
          );
        })}
      </ScrollView>
      {products.some((p) => p.photo_credit) && <PhotoCredits items={products} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.three,
  },
  card: {
    width: 120,
    gap: Spacing.one,
  },
  photo: {
    width: 120,
    height: 90,
    borderRadius: Radius.medium,
    backgroundColor: '#00000011',
  },
});
