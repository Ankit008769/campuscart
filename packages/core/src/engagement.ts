import type { CampusClient } from './api';
import { formatPaise } from './money';

/** Coupons, ratings, favourites, buy again and back-in-stock alerts for the student app. */

export type CouponSummary = {
  code: string;
  description: string;
  kind: string;
  value: number;
  max_discount_paise: number | null;
  min_subtotal_paise: number;
};

/** "₹20 off" or "50% off, up to ₹30", plus the minimum order when there is one. */
export function couponLabel(coupon: CouponSummary): string {
  const off =
    coupon.kind === 'percent'
      ? `${coupon.value}% off${coupon.max_discount_paise ? `, up to ${formatPaise(coupon.max_discount_paise)}` : ''}`
      : `${formatPaise(coupon.value)} off`;
  return coupon.min_subtotal_paise > 0 ? `${off} on ${formatPaise(coupon.min_subtotal_paise)}+` : off;
}

/** Listed coupons that are running and usable at this shop, for the cart's offers. */
export async function listOffers(client: CampusClient, shopId: string) {
  const { data, error } = await client
    .from('coupons')
    .select('code, description, kind, value, max_discount_paise, min_subtotal_paise, shop_id')
    .or(`shop_id.is.null,shop_id.eq.${shopId}`)
    .order('code');
  if (error) throw error;
  return data;
}

/** The discount a code would give on this cart, or an error saying why it can't be used. */
export async function previewCoupon(client: CampusClient, code: string, shopId: string, subtotalPaise: number): Promise<number> {
  const { data, error } = await client.rpc('preview_coupon', {
    p_code: code,
    p_shop_id: shopId,
    p_subtotal_paise: subtotalPaise,
  });
  if (error) throw error;
  return data;
}

export async function getMyRating(client: CampusClient, orderId: string) {
  const { data, error } = await client
    .from('order_ratings')
    .select('shop_stars, rider_stars, comment')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function rateOrder(
  client: CampusClient,
  rating: { orderId: string; shopStars: number; riderStars?: number; comment?: string },
) {
  const { error } = await client.rpc('rate_order', {
    p_order_id: rating.orderId,
    p_shop_stars: rating.shopStars,
    p_rider_stars: rating.riderStars,
    p_comment: rating.comment,
  });
  if (error) throw error;
}

/** Average stars by shop id (shops with 3 or more ratings in the last 90 days). */
export async function getShopRatings(client: CampusClient): Promise<Map<string, { average: number; ratings: number }>> {
  const { data, error } = await client.rpc('shop_ratings');
  if (error) throw error;
  return new Map(data.map((r) => [r.shop_id, { average: Number(r.average), ratings: r.ratings }]));
}

export async function listFavouriteProductIds(client: CampusClient): Promise<Set<string>> {
  const { data, error } = await client.from('favourites').select('product_id');
  if (error) throw error;
  return new Set(data.map((f) => f.product_id));
}

export async function setFavourite(client: CampusClient, productId: string, favourite: boolean) {
  const { error } = favourite
    ? await client.from('favourites').upsert({ product_id: productId }, { onConflict: 'student_id,product_id' })
    : await client.from('favourites').delete().eq('product_id', productId);
  if (error) throw error;
}

/** Items from the student's recent completed orders that are on sale now. */
export async function buyAgain(client: CampusClient) {
  const { data, error } = await client.rpc('buy_again');
  if (error) throw error;
  return data;
}

export async function listStockAlertVariantIds(client: CampusClient): Promise<Set<string>> {
  const { data, error } = await client.from('stock_alerts').select('variant_id');
  if (error) throw error;
  return new Set(data.map((a) => a.variant_id));
}

/** Asks for a notification when an out-of-stock size is back (or cancels the request). */
export async function setStockAlert(client: CampusClient, variantId: string, on: boolean) {
  const { error } = on
    ? await client.from('stock_alerts').upsert({ variant_id: variantId }, { onConflict: 'student_id,variant_id' })
    : await client.from('stock_alerts').delete().eq('variant_id', variantId);
  if (error) throw error;
}

/** Running banners meant for this student (their hostel, their batch, or everyone). */
export async function myBanners(client: CampusClient) {
  const { data, error } = await client.rpc('my_banners');
  if (error) throw error;
  return data;
}
