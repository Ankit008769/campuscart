import type { CampusClient, PayMethod } from './api';
import { calculateBill, type Bill, type FeeRules } from './bill';
import type { OrderMode } from './orders';

/**
 * One cart across shops. route_cart decides which shop each line goes to (the same function
 * place_cart uses), and the cart pays its fees once, on the whole item total.
 */

/** A shop's own size, or a product CampusCart routes to a shop at checkout. */
export type CartItemInput = { variantId: string; qty: number } | { masterProductId: string; qty: number };

const toJson = (items: CartItemInput[]) =>
  items.map((item) =>
    'variantId' in item ? { variant_id: item.variantId, qty: item.qty } : { master_product_id: item.masterProductId, qty: item.qty },
  );

/** Where each line would be bought now, in the order given. `problem` says why a line can't be. */
export async function routeCart(client: CampusClient, items: CartItemInput[], mode: OrderMode, dropPointId?: string | null) {
  const { data, error } = await client.rpc('route_cart', {
    p_items: toJson(items),
    p_mode: mode,
    p_drop_point_id: dropPointId ?? undefined,
  });
  if (error) throw error;
  return [...data].sort((a, b) => a.line - b.line);
}

export type CartRoute = Awaited<ReturnType<typeof routeCart>>[number];

export type CartPreview = {
  /** One group per shop, the fee-paying shop first. */
  shops: { shopId: string; shopName: string; subtotalPaise: number; lines: CartRoute[] }[];
  bill: Bill;
  problems: string[];
};

/** Groups routed lines by shop and works out the cart's fees once, as place_cart will. */
/**
 * `rulesFor` gives a shop's own rules (rulesForShop): the shop with the biggest share of the cart
 * carries the cart's fees, as place_cart does, so its free-delivery minimum applies.
 */
export function previewCart(
  routes: CartRoute[],
  mode: OrderMode,
  rules: FeeRules,
  rulesFor: (shopId: string) => FeeRules = () => rules,
): CartPreview {
  const groups = new Map<string, CartPreview['shops'][number]>();
  for (const route of routes) {
    if (route.problem || !route.shop_id || route.price_paise === null) continue;
    const group = groups.get(route.shop_id) ?? { shopId: route.shop_id, shopName: route.shop_name ?? '', subtotalPaise: 0, lines: [] };
    group.subtotalPaise += route.price_paise * route.qty;
    group.lines.push(route);
    groups.set(route.shop_id, group);
  }
  const shops = [...groups.values()].sort((a, b) => b.subtotalPaise - a.subtotalPaise || a.shopId.localeCompare(b.shopId));
  const subtotal = shops.reduce((t, s) => t + s.subtotalPaise, 0);
  return {
    shops,
    bill: calculateBill(subtotal, mode, shops[0] ? rulesFor(shops[0].shopId) : rules),
    problems: routes.flatMap((r) => (r.problem ? [r.problem] : [])),
  };
}

export type CartOrderInput = {
  items: CartItemInput[];
  mode: OrderMode;
  payMethod: PayMethod;
  dropPointId?: string;
  roomNote?: string;
  couponCode?: string;
};

/** Places the whole cart: one order per shop, all or nothing. Returns the cart's id. */
export async function placeCart(client: CampusClient, input: CartOrderInput): Promise<string> {
  const { data, error } = await client.rpc('place_cart', {
    p_items: toJson(input.items),
    p_mode: input.mode,
    p_pay_method: input.payMethod,
    p_drop_point_id: input.dropPointId,
    p_room_note: input.roomNote,
    p_coupon_code: input.couponCode,
  });
  if (error) throw error;
  return data.id;
}

/** A cart with each shop's order, for the student's cart status screen. */
export async function getCart(client: CampusClient, cartId: string) {
  const { data, error } = await client
    .from('carts')
    .select(
      'id, mode, total_paise, created_at, orders (id, code, status, token_no, subtotal_paise, delivery_fee_paise, small_cart_fee_paise, platform_fee_paise, surcharge_paise, discount_paise, total_paise, cancel_reason, shops (name), order_items (id, name_snapshot, qty, price_paise_snapshot))',
    )
    .eq('id', cartId)
    .single();
  if (error) throw error;
  return data;
}

/** Every product once, with its lowest price among shops that have it now. */
export async function searchCatalog(client: CampusClient, input: { query?: string; categoryId?: string }) {
  const { data, error } = await client.rpc('search_catalog', {
    p_query: input.query?.trim() || undefined,
    p_category_id: input.categoryId,
  });
  if (error) throw error;
  return data;
}
