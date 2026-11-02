import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_FEE_RULES, type FeeRules } from './bill';
import { DEFAULT_WALK_MINUTES } from './schedule';
import type { Database } from './database.types';
import type { OrderMode, OrderStatus } from './orders';

/**
 * Typed calls to the CampusCart database, shared by the student app, shop app and admin panel.
 * Each app creates its own client (session storage differs per platform) and passes it in.
 */
export type CampusClient = SupabaseClient<Database>;

type Tables = Database['public']['Tables'];
export type ShopRow = Tables['shops']['Row'];
export type DropPointRow = Tables['drop_points']['Row'];
export type OrderRow = Tables['orders']['Row'];
export type PayMethod = Database['public']['Enums']['pay_method'];

// Compile-time guards: these fail to type-check if the database enums and packages/core drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const statusesMatch: Same<Database['public']['Enums']['order_status'], OrderStatus> = true;
const modesMatch: Same<Database['public']['Enums']['order_mode'], OrderMode> = true;
void statusesMatch;
void modesMatch;

/** Every shop, open ones first, for the student home screen. */
export async function listShops(client: CampusClient) {
  const { data, error } = await client
    .from('shops')
    .select('id, name, kind, is_open, hours, prep_minutes, rush_until, rush_extra_minutes, does_delivery, does_pickup')
    .order('is_open', { ascending: false })
    .order('name');
  if (error) throw error;
  return data;
}

/**
 * Where a photo's small copy lives: a thumbs folder beside it (menu-food/thumbs/x.jpg,
 * shops/<id>/thumbs/x.jpg), so shop staff's storage rules for their folder cover it too.
 */
export function thumbPath(imagePath: string): string {
  const slash = imagePath.lastIndexOf('/');
  return `${imagePath.slice(0, slash + 1)}thumbs/${imagePath.slice(slash + 1)}`;
}

/** Thumbnails are this wide: plenty for lists and menu rows, about a tenth of the full photo. */
export const THUMB_WIDTH = 320;

/** Public URL of a product photo in the product-photos storage bucket, full size or its thumbnail. */
export function productPhotoUrl(supabaseUrl: string, imagePath: string, size: 'full' | 'thumb' = 'full'): string {
  return `${supabaseUrl}/storage/v1/object/public/product-photos/${size === 'thumb' ? thumbPath(imagePath) : imagePath}`;
}

/** One shop and its active menu (category, variants, photo credit per product), for the shop screen. */
export async function getShopMenu(client: CampusClient, shopId: string) {
  const [shop, products] = await Promise.all([
    client
      .from('shops')
      .select('id, name, kind, is_open, hours, prep_minutes, rush_until, rush_extra_minutes, does_delivery, does_pickup')
      .eq('id', shopId)
      .single(),
    client
      .from('products')
      // One literal string, so supabase-js can infer the row type from it.
      .select(
        'id, name, description, image_path, is_veg, photo_credit, photo_source_url, availability_note, categories (name, sort), variants (id, label, price_paise, mrp_paise, in_stock, sort)',
      )
      .eq('shop_id', shopId)
      .eq('active', true)
      .order('name'),
  ]);
  if (shop.error) throw shop.error;
  if (products.error) throw products.error;
  return { shop: shop.data, products: products.data };
}

/** Menu search across every shop; typo-tolerant ("magi" finds Maggi). Optionally within one category. */
export async function searchProducts(client: CampusClient, input: { query?: string; categoryId?: string }) {
  const { data, error } = await client.rpc('search_products', {
    p_query: input.query?.trim() || undefined,
    p_category_id: input.categoryId,
  });
  if (error) throw error;
  return data;
}

/** Categories that currently have products, in menu order, for the home screen tiles. */
export async function listCategories(client: CampusClient) {
  const { data, error } = await client.rpc('list_categories');
  if (error) throw error;
  return data;
}

/** The signed-in person's own profile. */
export async function getMyProfile(client: CampusClient, userId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, name, email, phone, room_note, default_drop_point_id, role')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export type ProfileUpdate = { name?: string; phone?: string | null; roomNote?: string | null; defaultDropPointId?: string | null };

/** Saves the contact details a person may edit themselves (the database rejects anything else). */
export async function updateMyProfile(client: CampusClient, userId: string, update: ProfileUpdate) {
  const { error } = await client
    .from('profiles')
    .update({
      name: update.name,
      phone: update.phone,
      room_note: update.roomNote,
      default_drop_point_id: update.defaultDropPointId,
    })
    .eq('id', userId);
  if (error) throw error;
}

/** Asks for the account to be deleted: wipes contact details and blocks it; past orders stay. */
export async function requestAccountDeletion(client: CampusClient) {
  const { error } = await client.rpc('request_account_deletion');
  if (error) throw error;
}

/** Which side of the app a push token gets messages for: 'consumer' (students) or 'merchant' (shops). */
export type PushApp = 'consumer' | 'merchant';

/** Saves this phone's Expo push token for the signed-in person, taking it over from any other account. */
export async function registerDeviceToken(client: CampusClient, app: PushApp, expoToken: string) {
  const { error } = await client.rpc('register_device_token', { p_app: app, p_token: expoToken });
  if (error) throw error;
}

/** Stops order pushes to this phone. Call it before signing out. */
export async function forgetDeviceToken(client: CampusClient, expoToken: string) {
  const { error } = await client.from('device_tokens').delete().eq('expo_token', expoToken);
  if (error) throw error;
}

export type AppEvent = 'app_open' | 'shop_view' | 'add_to_cart' | 'checkout_view';

/**
 * Records one step of a student's way to an order, for the admin funnel report. Never throws:
 * a lost event must not get in the way of ordering.
 */
export async function logEvent(client: CampusClient, name: AppEvent, shopId?: string): Promise<void> {
  const { error } = await client.from('app_events').insert({ name, shop_id: shopId ?? null });
  if (error) console.warn('Could not log app event', name, error.message);
}

/** A shop's opening state, hours and prep time, for the checkout's time picker. */
export async function getShopTimes(client: CampusClient, shopId: string) {
  const { data, error } = await client.from('shops').select('is_open, hours, prep_minutes').eq('id', shopId).single();
  if (error) throw error;
  return data;
}

/** Minutes from a shop to a drop point, as measured in walk_times, or the default. */
export async function getWalkMinutes(client: CampusClient, shopId: string, dropPointId: string): Promise<number> {
  const { data, error } = await client
    .from('walk_times')
    .select('minutes')
    .eq('shop_id', shopId)
    .eq('drop_point_id', dropPointId)
    .maybeSingle();
  if (error) throw error;
  return data?.minutes ?? DEFAULT_WALK_MINUTES;
}

/** Active hostels and other drop points, for the address picker. */
export async function listDropPoints(client: CampusClient) {
  const { data, error } = await client
    .from('drop_points')
    .select('id, name, kind, gate_only, extra_delivery_fee_paise')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
}

export type PlaceOrderInput = {
  shopId: string;
  mode: OrderMode;
  payMethod: PayMethod;
  items: { variantId: string; qty: number }[];
  dropPointId?: string;
  roomNote?: string;
  /** Checked and priced again by the database; an invalid code fails the order with its reason. */
  couponCode?: string;
  /** A slot from scheduleSlots; the shop gets the order at the slot minus prep and walk time. */
  scheduledFor?: Date;
};

/** Places an order. The database re-prices every item; the app never sends prices. */
export async function placeOrder(client: CampusClient, input: PlaceOrderInput): Promise<OrderRow> {
  const { data, error } = await client.rpc('place_order', {
    p_shop_id: input.shopId,
    p_mode: input.mode,
    p_pay_method: input.payMethod,
    p_items: input.items.map((item) => ({ variant_id: item.variantId, qty: item.qty })),
    p_drop_point_id: input.dropPointId,
    p_room_note: input.roomNote,
    p_coupon_code: input.couponCode,
    p_scheduled_for: input.scheduledFor?.toISOString(),
  });
  if (error) throw error;
  return data;
}

export type TransitionOrderInput = {
  orderId: string;
  to: OrderStatus;
  /** Required to reject or cancel as a shop or admin. */
  note?: string;
  /** The student's delivery OTP to deliver, or the pickup token to hand over a pickup order. */
  code?: string;
  prepMinutes?: number;
};

/** Moves an order to its next status, as the signed-in student, shop staff member or admin. */
export async function transitionOrder(client: CampusClient, input: TransitionOrderInput): Promise<OrderRow> {
  const { data, error } = await client.rpc('transition_order', {
    p_order_id: input.orderId,
    p_to: input.to,
    p_note: input.note,
    p_code: input.code,
    p_prep_minutes: input.prepMinutes,
  });
  if (error) throw error;
  return data;
}

/** The fees admins set in fee_rules, for the cart preview. Missing keys fall back to the defaults. */
export async function getFeeRules(client: CampusClient): Promise<FeeRules> {
  const { data, error } = await client.from('fee_rules').select('key, value_paise');
  if (error) throw error;
  const value = (key: string) => data.find((row) => row.key === key)?.value_paise;
  return {
    deliveryFeePaise: value('delivery_fee') ?? DEFAULT_FEE_RULES.deliveryFeePaise,
    smallCartLimitPaise: value('small_cart_limit') ?? DEFAULT_FEE_RULES.smallCartLimitPaise,
    smallCartFeePaise: value('small_cart_fee') ?? DEFAULT_FEE_RULES.smallCartFeePaise,
    platformFeePaise: value('platform_fee') ?? DEFAULT_FEE_RULES.platformFeePaise,
    nightSurchargePaise: value('night_surcharge') ?? 0,
  };
}

// Kept as one literal so supabase-js can infer the row type. Orders point at profiles twice
// (student and rider), so each embed names its foreign key.
export const ORDER_DETAIL =
  'id, code, status, mode, pay_method, subtotal_paise, delivery_fee_paise, small_cart_fee_paise, platform_fee_paise, surcharge_paise, discount_paise, coupon_code, total_paise, token_no, prep_minutes, room_note, cancel_reason, scheduled_for, release_at, released_at, placed_at, accepted_at, ready_at, out_at, completed_at, cancelled_at, shops (id, name), drop_points (name, gate_only, lat, lng), order_items (id, name_snapshot, price_paise_snapshot, qty), rider_id, profiles!orders_student_id_fkey (name, phone), rider:profiles!orders_rider_id_fkey (name, phone), print_jobs (file_path, file_name, pages, copies, color, double_sided, file_deleted_at)' as const;

/**
 * One order with its items, shop, drop point and customer. The delivery code comes back only for
 * the student who placed the order (row-level security on order_secrets); everyone else gets null.
 */
export async function getOrder(client: CampusClient, orderId: string) {
  const [order, secret] = await Promise.all([
    client.from('orders').select(ORDER_DETAIL).eq('id', orderId).single(),
    client.from('order_secrets').select('delivery_otp').eq('order_id', orderId).maybeSingle(),
  ]);
  if (order.error) throw order.error;
  if (secret.error) throw secret.error;
  return { order: order.data, deliveryOtp: secret.data?.delivery_otp ?? null };
}

/**
 * An earlier order as it would be bought today, for "Order again": every item still on sale at
 * today's price, and the names of items the shop has since removed, hidden or run out of.
 */
export async function getReorder(client: CampusClient, orderId: string) {
  const { data, error } = await client
    .from('orders')
    .select(
      'shops (id, name, is_open, does_delivery, does_pickup), order_items (qty, name_snapshot, variants (id, label, price_paise, in_stock, products (name, active)))',
    )
    .eq('id', orderId)
    .single();
  if (error) throw error;
  const available: { variantId: string; productName: string; label: string; pricePaise: number; qty: number }[] = [];
  const unavailable: string[] = [];
  for (const item of data.order_items) {
    const variant = item.variants;
    // Hidden items come back without their variant: row-level security only shows active ones.
    if (variant?.in_stock && variant.products?.active) {
      available.push({
        variantId: variant.id,
        productName: variant.products.name,
        label: variant.label,
        pricePaise: variant.price_paise,
        qty: item.qty,
      });
    } else {
      unavailable.push(item.name_snapshot);
    }
  }
  return { shop: data.shops, available, unavailable };
}

/** A student's own orders, newest first. */
export async function listMyOrders(client: CampusClient, studentId: string) {
  const { data, error } = await client
    .from('orders')
    .select('id, code, status, mode, total_paise, token_no, placed_at, scheduled_for, shops (name)')
    .eq('student_id', studentId)
    .order('placed_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export const OPEN_STATUSES = ['placed', 'accepted', 'ready', 'out_for_delivery'] as const satisfies readonly OrderStatus[];

/** A shop's open orders, oldest first, so the counter works through them in order. */
export async function listShopOrders(client: CampusClient, shopId: string) {
  const { data, error } = await client
    .from('orders')
    .select(ORDER_DETAIL)
    .eq('shop_id', shopId)
    .in('status', OPEN_STATUSES)
    .order('placed_at');
  if (error) throw error;
  return data;
}

/**
 * Calls onChange whenever an order matching `filter` (a Realtime filter on student_id, rider_id,
 * shop_id, cart_id or id, such as `shop_id=eq.<id>`, or null for the admin board's every order) is
 * created or changes. The channel is private: can_watch_orders_channel lets each person join only
 * their own lists, and Realtime applies the same row-level security as reads. Returns an unsubscribe.
 */
export function watchOrders(client: CampusClient, filter: string | null, onChange: () => void): () => void {
  const suffix = Math.random().toString(36).slice(2) || '0';
  const channel = client
    .channel(`orders:${filter ?? 'all'}:${suffix}`, { config: { private: true } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', ...(filter ? { filter } : {}) }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
