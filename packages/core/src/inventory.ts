import type { CampusClient } from './api';

/** Stock counts, smart picks, collections and missed demand (Phase 3). */

/** Sets how many of a size the shop has, or null to stop counting it. Any staff member may. */
export async function setStockCount(client: CampusClient, variantId: string, count: number | null) {
  if (count !== null && (!Number.isInteger(count) || count < 0 || count > 100000)) throw new Error('Enter a whole number of items.');
  const { error } = await client
    .from('variants')
    .update(count === null ? { stock_qty: null } : { stock_qty: count, in_stock: count > 0 })
    .eq('id', variantId);
  if (error) throw error;
}

/** A shop's sizes whose master product has this barcode, for the shop's scanner. */
export async function findByBarcode(client: CampusClient, shopId: string, barcode: string) {
  const { data: master, error } = await client.from('master_products').select('id, name, size').eq('barcode', barcode).maybeSingle();
  if (error) throw error;
  if (!master) return { master: null, listings: [] };
  const { data, error: listingsError } = await client
    .from('variants')
    .select('id, label, price_paise, stock_qty, in_stock, products!inner (name, shop_id)')
    .eq('master_product_id', master.id)
    .eq('products.shop_id', shopId);
  if (listingsError) throw listingsError;
  return { master, listings: data };
}

/** Records a finished search and how many results it had (not who searched). Never throws. */
export async function logSearch(client: CampusClient, query: string, results: number): Promise<void> {
  const { error } = await client.rpc('log_search', { p_query: query, p_results: results });
  if (error) console.warn('Could not log search', error.message);
}

/** What students searched for most and found nothing, between two ISO times. Owners and admins. */
export async function missedDemand(client: CampusClient, from: string, to: string) {
  const { data, error } = await client.rpc('missed_demand', { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

/** Products often bought with the cart's items, available now. */
export async function smartPicks(client: CampusClient, variantIds: string[], masterIds: string[]) {
  const { data, error } = await client.rpc('smart_picks', { p_variant_ids: variantIds, p_master_ids: masterIds });
  if (error) throw error;
  return data;
}

/** Running collections, each with the products available now. */
export async function listCollectionsForStudents(client: CampusClient) {
  const { data, error } = await client.rpc('collection_products');
  if (error) throw error;
  const collections = new Map<string, { id: string; title: string; subtitle: string; items: typeof data }>();
  for (const row of data) {
    const c = collections.get(row.collection_id) ?? { id: row.collection_id, title: row.title, subtitle: row.subtitle, items: [] };
    c.items.push(row);
    collections.set(row.collection_id, c);
  }
  return [...collections.values()];
}
