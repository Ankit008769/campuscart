import { OPEN_STATUSES, ORDER_DETAIL, type CampusClient } from './api';
import { listAllCategories, saveCatalogItem } from './catalog';
import type { CsvItem } from './catalog-csv';
import type { Database } from './database.types';
import type { OrderStatus } from './orders';

/**
 * Calls only admins can make. Row-level security refuses them for everyone else, so the admin
 * panel's own sign-in check is a convenience, not the protection.
 */

export type StaffRole = Exclude<Database['public']['Enums']['user_role'], 'student'>;

/** Whether the signed-in person is an admin (and not blocked). */
export async function amIAdmin(client: CampusClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_admin');
  if (error) throw error;
  return data;
}

/** Every open order across all shops, oldest first, for the live board. */
export async function listOpenOrders(client: CampusClient) {
  const { data, error } = await client
    .from('orders')
    .select(ORDER_DETAIL)
    .in('status', OPEN_STATUSES)
    .order('placed_at');
  if (error) throw error;
  return data;
}

/** Status and money of every order placed since `since` (an ISO time), for the day's totals. */
export async function listOrdersSince(client: CampusClient, since: string) {
  const { data, error } = await client
    .from('orders')
    .select('id, status, total_paise, shop_id')
    .gte('placed_at', since)
    .limit(5000);
  if (error) throw error;
  return data;
}

/** Every shop with the settings admins manage. */
export async function listShopsForAdmin(client: CampusClient) {
  const { data, error } = await client
    .from('shops')
    .select('id, name, kind, phone, upi_vpa, is_open, hours, prep_minutes, commission_bps, does_delivery, does_pickup')
    .order('name');
  if (error) throw error;
  return data;
}

/** upi_vpa is where students pay by UPI; only admins can change it, never shop staff. */
export type ShopUpdate = Partial<
  Pick<
    Database['public']['Tables']['shops']['Update'],
    'name' | 'kind' | 'is_open' | 'hours' | 'prep_minutes' | 'commission_bps' | 'does_delivery' | 'does_pickup' | 'phone' | 'upi_vpa'
  >
>;

export async function updateShop(client: CampusClient, shopId: string, update: ShopUpdate) {
  const { error } = await client.from('shops').update(update).eq('id', shopId);
  if (error) throw error;
}

/** Adds a shop, closed until its staff open it. Give its owner an ID on the admin side of the app. */
export async function createShop(
  client: CampusClient,
  shop: { name: string; kind: string; phone: string | null; prepMinutes: number },
): Promise<string> {
  const { data, error } = await client
    .from('shops')
    .insert({ name: shop.name.trim(), kind: shop.kind.trim(), phone: shop.phone, prep_minutes: shop.prepMinutes, is_open: false })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/** Month as 'YYYY-MM-01'. Each shop's completed orders that month and the platform fee it owes. */
export async function shopMonthlyBills(client: CampusClient, month: string) {
  const { data, error } = await client.rpc('shop_monthly_bills', { p_month: month });
  if (error) throw error;
  return data;
}

/** The completed orders behind one shop's bill for a month ('YYYY-MM-01'), oldest first. */
export async function shopMonthOrders(client: CampusClient, shopId: string, month: string) {
  const { data, error } = await client.rpc('shop_month_orders', { p_shop_id: shopId, p_month: month });
  if (error) throw error;
  return data;
}

/** The first day ('YYYY-MM-01') of this month and the months before it, in Indian time, newest first. */
export function recentMonths(count: number, now = new Date()): { value: string; label: string }[] {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - i, 1));
    return {
      value: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
  });
}

/** Lets every app build in (0), or makes phones below this Android versionCode update first. */
export async function setMinAndroidVersionCode(client: CampusClient, versionCode: number) {
  if (!Number.isInteger(versionCode) || versionCode < 0) throw new Error('Use a whole build number, 0 or more.');
  const { error } = await client.from('app_settings').update({ min_android_version_code: versionCode, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) throw error;
}

/** Fee settings as stored (key, paise), for editing. */
export async function listFeeRules(client: CampusClient) {
  const { data, error } = await client.from('fee_rules').select('key, value_paise').order('key');
  if (error) throw error;
  return data;
}

export async function setFeeRule(client: CampusClient, key: string, valuePaise: number) {
  if (!Number.isInteger(valuePaise) || valuePaise < 0) throw new Error('Fees are whole paise, zero or more.');
  const { error } = await client.from('fee_rules').upsert({ key, value_paise: valuePaise });
  if (error) throw error;
}

/** Google sign-ins admins have approved that aren't college accounts (riders, admins, reviewers). */
export async function listAllowedLogins(client: CampusClient) {
  const { data, error } = await client
    .from('allowed_logins')
    .select('email, role, note, created_at, shops (id, name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type AllowedLoginInput = { email: string; role: StaffRole; shopId?: string | null; note?: string };

/** Approves a Gmail (or any address) to sign in. Shop roles need a shop; other roles must not have one. */
export async function addAllowedLogin(client: CampusClient, input: AllowedLoginInput) {
  const shopRole = input.role === 'merchant_owner' || input.role === 'merchant_staff';
  if (shopRole && !input.shopId) throw new Error('Pick the shop this person works at.');
  const { error } = await client.from('allowed_logins').insert({
    email: input.email.trim().toLowerCase(),
    role: input.role,
    shop_id: shopRole ? input.shopId : null,
    note: input.note?.trim() || null,
  });
  if (error) throw error;
}

/** Withdraws an approval. It stops new sign-ups with that address; existing accounts stay until blocked. */
export async function removeAllowedLogin(client: CampusClient, email: string) {
  const { error } = await client.from('allowed_logins').delete().eq('email', email);
  if (error) throw error;
}

/** Accounts whose owners asked for deletion in the app; contact details are already wiped. */
export async function listDeletionRequests(client: CampusClient) {
  const { data, error } = await client
    .from('profiles')
    .select('id, name, email, role, deletion_requested_at')
    .not('deletion_requested_at', 'is', null)
    .order('deletion_requested_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type OrderSearch = {
  /** Order code, student name, email or at least 4 digits of their phone. */
  query?: string;
  shopId?: string;
  status?: OrderStatus;
  /** ISO times; `to` is exclusive. */
  from?: string;
  to?: string;
};

/** Up to 100 matching orders, newest first. */
export async function searchOrders(client: CampusClient, search: OrderSearch) {
  const { data, error } = await client.rpc('search_orders', {
    p_query: search.query?.trim() || undefined,
    p_shop_id: search.shopId,
    p_status: search.status,
    p_from: search.from,
    p_to: search.to,
  });
  if (error) throw error;
  return data;
}

/** Every status change of one order, oldest first, with who made it. */
export async function listOrderEvents(client: CampusClient, orderId: string) {
  const { data, error } = await client
    .from('order_events')
    .select('id, from_status, to_status, actor, note, at')
    .eq('order_id', orderId)
    .order('at');
  if (error) throw error;
  return data;
}

/** All drop points, inactive ones too. */
export async function listAllDropPoints(client: CampusClient) {
  const { data, error } = await client
    .from('drop_points')
    .select('id, name, kind, gate_only, active, extra_delivery_fee_paise, lat, lng')
    .order('name');
  if (error) throw error;
  return data;
}

export type DropPointInput = {
  /** Omit to add a new drop point. */
  id?: string;
  name: string;
  kind: Database['public']['Enums']['drop_point_kind'];
  gateOnly: boolean;
  active: boolean;
  /** Added to every delivery here, e.g. for a far hostel. */
  extraDeliveryFeePaise: number;
  /** Where it is, for the rider tracking map; null when not set. */
  lat?: number | null;
  lng?: number | null;
};

export async function saveDropPoint(client: CampusClient, point: DropPointInput) {
  const row = {
    name: point.name.trim(),
    kind: point.kind,
    gate_only: point.gateOnly,
    active: point.active,
    extra_delivery_fee_paise: point.extraDeliveryFeePaise,
    lat: point.lat ?? null,
    lng: point.lng ?? null,
  };
  const { error } = point.id
    ? await client.from('drop_points').update(row).eq('id', point.id)
    : await client.from('drop_points').insert(row);
  if (error) throw error;
}

export type ImportResult = { added: string[]; skipped: string[]; failed: { name: string; error: string }[] };

/**
 * Adds items read by parseCatalogCsv to a shop. Missing categories are created first. Items whose
 * name the shop already has are skipped, so running the same file twice adds nothing twice.
 */
export async function importCatalog(client: CampusClient, shopId: string, items: CsvItem[]): Promise<ImportResult> {
  const { data: existing, error } = await client.from('products').select('name').eq('shop_id', shopId);
  if (error) throw error;
  const taken = new Set(existing.map((p) => p.name.toLowerCase()));

  let categories = await listAllCategories(client);
  const missing = [...new Set(items.map((i) => i.category))].filter(
    (name) => !categories.some((c) => c.name.toLowerCase() === name.toLowerCase()),
  );
  if (missing.length > 0) {
    const { error: addError } = await client.from('categories').insert(missing.map((name) => ({ name, sort: 1000 })));
    if (addError) throw addError;
    categories = await listAllCategories(client);
  }
  const categoryId = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;

  const result: ImportResult = { added: [], skipped: [], failed: [] };
  for (const item of items) {
    if (taken.has(item.name.toLowerCase())) {
      result.skipped.push(item.name);
      continue;
    }
    try {
      await saveCatalogItem(client, {
        shopId,
        name: item.name,
        description: item.description,
        categoryId: categoryId(item.category),
        isVeg: null,
        imagePath: null,
        active: true,
        variants: item.sizes.map((size) => ({ label: size.label, pricePaise: size.pricePaise, mrpPaise: size.mrpPaise, inStock: true })),
      });
      result.added.push(item.name);
      taken.add(item.name.toLowerCase());
    } catch (e) {
      result.failed.push({ name: item.name, error: e instanceof Error ? e.message : 'Could not save' });
    }
  }
  return result;
}

export const FUNNEL_STEP_LABEL: Record<string, string> = {
  app_open: 'Opened the app',
  shop_view: 'Opened a shop',
  add_to_cart: 'Added to cart',
  checkout_view: 'Opened checkout',
  ordered: 'Placed an order',
};

/** Distinct students at each step from opening the app to ordering, between two ISO times. */
export async function funnelReport(client: CampusClient, from: string, to: string) {
  const { data, error } = await client.rpc('funnel_report', { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

/** Every coupon with how many orders used it, newest first. */
export async function listCoupons(client: CampusClient) {
  const { data, error } = await client
    .from('coupons')
    .select(
      'code, description, kind, value, max_discount_paise, min_subtotal_paise, shop_id, funded_by, starts_at, ends_at, max_uses, per_student_limit, first_order_only, listed, active, created_at, shops (name), coupon_redemptions (count)',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type CouponInput = {
  code: string;
  description: string;
  kind: 'flat' | 'percent';
  /** Paise for flat coupons, a whole percent for percent coupons. */
  value: number;
  maxDiscountPaise: number | null;
  minSubtotalPaise: number;
  shopId: string | null;
  fundedBy: 'platform' | 'shop';
  startsAt: string;
  endsAt: string | null;
  maxUses: number | null;
  perStudentLimit: number;
  firstOrderOnly: boolean;
  listed: boolean;
};

export async function createCoupon(client: CampusClient, coupon: CouponInput) {
  const { error } = await client.from('coupons').insert({
    code: coupon.code.trim().toUpperCase(),
    description: coupon.description.trim(),
    kind: coupon.kind,
    value: coupon.value,
    max_discount_paise: coupon.kind === 'percent' ? coupon.maxDiscountPaise : null,
    min_subtotal_paise: coupon.minSubtotalPaise,
    shop_id: coupon.shopId,
    funded_by: coupon.fundedBy,
    starts_at: coupon.startsAt,
    ends_at: coupon.endsAt,
    max_uses: coupon.maxUses,
    per_student_limit: coupon.perStudentLimit,
    first_order_only: coupon.firstOrderOnly,
    listed: coupon.listed,
  });
  if (error) throw error;
}

export async function setCouponActive(client: CampusClient, code: string, active: boolean) {
  const { error } = await client.from('coupons').update({ active }).eq('code', code);
  if (error) throw error;
}

/** Print rates of every shop that has them, on or off. */
export async function listPrintSettings(client: CampusClient) {
  const { data, error } = await client
    .from('print_settings')
    .select('shop_id, bw_page_paise, color_page_paise, max_pages, active');
  if (error) throw error;
  return data;
}

export type PrintSettingsInput = {
  shopId: string;
  bwPagePaise: number;
  colorPagePaise: number;
  maxPages: number;
  active: boolean;
};

/** Turns Print Store on or off for a shop and sets its per-page rates. */
export async function savePrintSettings(client: CampusClient, settings: PrintSettingsInput) {
  const { error } = await client.from('print_settings').upsert({
    shop_id: settings.shopId,
    bw_page_paise: settings.bwPagePaise,
    color_page_paise: settings.colorPagePaise,
    max_pages: settings.maxPages,
    active: settings.active,
  });
  if (error) throw error;
}

/** Who a banner or campaign is for: everyone, one hostel's students, or one batch. */
export type Audience = { dropPointId: string | null; batch: string | null };

export async function listBanners(client: CampusClient) {
  const { data, error } = await client
    .from('banners')
    .select('id, title, body, shop_id, category_id, drop_point_id, batch, starts_at, ends_at, active, created_at, shops (name), categories (name), drop_points (name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type BannerInput = Audience & {
  title: string;
  body: string;
  shopId: string | null;
  categoryId: string | null;
  endsAt: string | null;
};

export async function createBanner(client: CampusClient, banner: BannerInput) {
  const { error } = await client.from('banners').insert({
    title: banner.title.trim(),
    body: banner.body.trim(),
    shop_id: banner.shopId,
    category_id: banner.shopId ? null : banner.categoryId,
    drop_point_id: banner.dropPointId,
    batch: banner.batch,
    ends_at: banner.endsAt,
  });
  if (error) throw error;
}

export async function setBannerActive(client: CampusClient, id: string, active: boolean) {
  const { error } = await client.from('banners').update({ active }).eq('id', id);
  if (error) throw error;
}

/** Pushes a message to every student in the audience. Returns how many students it reached. */
export async function sendCampaign(client: CampusClient, campaign: Audience & { title: string; body: string }): Promise<number> {
  const { data, error } = await client.rpc('send_campaign', {
    p_title: campaign.title,
    p_body: campaign.body,
    p_drop_point_id: campaign.dropPointId ?? undefined,
    p_batch: campaign.batch ?? undefined,
  });
  if (error) throw error;
  return data;
}

export async function listCampaigns(client: CampusClient) {
  const { data, error } = await client
    .from('campaigns')
    .select('id, title, body, batch, sent_at, recipients, drop_points (name)')
    .order('sent_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

/** One row per day across every shop, between two ISO times. */
export async function platformReport(client: CampusClient, from: string, to: string) {
  const { data, error } = await client.rpc('platform_report', { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

/** Master products with how many shops list them, matching a name or barcode. */
export async function listMasterProducts(client: CampusClient, query?: string) {
  const { data, error } = await client.rpc('list_master_products', { p_query: query?.trim() || undefined });
  if (error) throw error;
  return data;
}

export type MasterProductUpdate = { name: string; brand: string | null; size: string; barcode: string | null };

export async function updateMasterProduct(client: CampusClient, id: string, update: MasterProductUpdate) {
  const barcode = update.barcode?.replace(/\s/g, '') || null;
  if (barcode && !/^\d{8,14}$/.test(barcode)) throw new Error('Barcodes are 8 to 14 digits.');
  const { error } = await client
    .from('master_products')
    .update({ name: update.name.trim(), brand: update.brand?.trim() || null, size: update.size.trim(), barcode })
    .eq('id', id);
  if (error) throw error;
}

/** Folds a duplicate into the product to keep. Returns how many shop listings moved. */
export async function mergeMasterProducts(client: CampusClient, keepId: string, mergeId: string): Promise<number> {
  const { data, error } = await client.rpc('merge_master_products', { p_keep: keepId, p_merge: mergeId });
  if (error) throw error;
  return data;
}

/** Every collection with its products, for curating. */
export async function listCollections(client: CampusClient) {
  const { data, error } = await client
    .from('collections')
    .select('id, title, subtitle, active, ends_at, collection_items (master_product_id, master_products (name, size))')
    .order('sort')
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function createCollection(client: CampusClient, input: { title: string; subtitle: string; endsAt: string | null }) {
  const { error } = await client.from('collections').insert({ title: input.title.trim(), subtitle: input.subtitle.trim(), ends_at: input.endsAt });
  if (error) throw error;
}

export async function setCollectionActive(client: CampusClient, id: string, active: boolean) {
  const { error } = await client.from('collections').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function addToCollection(client: CampusClient, collectionId: string, masterProductId: string) {
  const { error } = await client.from('collection_items').upsert({ collection_id: collectionId, master_product_id: masterProductId });
  if (error) throw error;
}

export async function removeFromCollection(client: CampusClient, collectionId: string, masterProductId: string) {
  const { error } = await client.from('collection_items').delete().eq('collection_id', collectionId).eq('master_product_id', masterProductId);
  if (error) throw error;
}

/**
 * Admin → Live orders: every open order in every shop, oldest first, with the student's delivery code
 * and pickup token (admins only), so an admin can help when a student or shop is stuck.
 */
export async function listLiveOrdersForAdmin(client: CampusClient) {
  const { data, error } = await client.rpc('admin_live_orders');
  if (error) throw error;
  // Columns a left join may leave empty (drop point, code, rider) come back null.
  return data as (Omit<(typeof data)[number], 'accepted_at' | 'ready_at' | 'out_at' | 'delivery_otp' | 'drop_point' | 'room_note' | 'rider_name' | 'shop_phone' | 'student_phone'> & {
    accepted_at: string | null;
    ready_at: string | null;
    out_at: string | null;
    delivery_otp: string | null;
    drop_point: string | null;
    room_note: string | null;
    rider_name: string | null;
    shop_phone: string | null;
    student_phone: string | null;
  })[];
}

/**
 * Finishes an open order a shop forgot to mark, without the student's code: a delivery becomes
 * delivered, a pickup collected. Admins only; the reason is kept on the order's history.
 */
export async function adminCompleteOrder(client: CampusClient, orderId: string, reason: string) {
  const { error } = await client.rpc('admin_complete_order', { p_order_id: orderId, p_note: reason.trim() });
  if (error) throw error;
}

/** Admin → Students: everyone who signed in as a student, newest first, with their order counts. */
export async function listStudentsForAdmin(client: CampusClient) {
  const { data, error } = await client.rpc('admin_list_students');
  if (error) throw error;
  return data;
}
