import { thumbPath, type CampusClient } from './api';

/** Catalog editing for shop staff (their own shop) and admins (any shop). */

// Kept as one literal so supabase-js can infer the row type.
const CATALOG_ITEM =
  'id, name, description, image_path, is_veg, active, photo_credit, category_id, categories (id, name, sort), variants (id, label, price_paise, mrp_paise, in_stock, stock_qty, sort)' as const;

/** Every item of one shop, including hidden ones, for the shop's catalog screen. */
export async function listShopCatalog(client: CampusClient, shopId: string) {
  const { data, error } = await client.from('products').select(CATALOG_ITEM).eq('shop_id', shopId).order('name');
  if (error) throw error;
  return data;
}

/** One item with its sizes, for the item editor. */
export async function getCatalogItem(client: CampusClient, productId: string) {
  const { data, error } = await client.from('products').select(CATALOG_ITEM).eq('id', productId).single();
  if (error) throw error;
  return data;
}

/** All categories in menu order, for the editor's category picker (admins add new ones). */
export async function listAllCategories(client: CampusClient) {
  const { data, error } = await client.from('categories').select('id, name').order('sort').order('name');
  if (error) throw error;
  return data;
}

export type VariantInput = {
  /** Omit for a new size. */
  id?: string;
  label: string;
  pricePaise: number;
  mrpPaise: number;
  inStock: boolean;
};

export type CatalogItemInput = {
  /** Omit to add a new item. */
  productId?: string;
  shopId: string;
  name: string;
  description: string;
  categoryId: string | null;
  /** Only the shop knows: true veg, false non-veg, null not stated. */
  isVeg: boolean | null;
  imagePath: string | null;
  active: boolean;
  /** In display order. Sizes left out are removed. */
  variants: VariantInput[];
};

/** Saves an item and all its sizes in one go. The database checks prices against MRP. */
export async function saveCatalogItem(client: CampusClient, item: CatalogItemInput): Promise<string> {
  const { data, error } = await client.rpc('save_product', {
    // Left out (undefined) means the SQL default: a new item, no category, veg not stated, no photo.
    p_product_id: item.productId,
    p_shop_id: item.shopId,
    p_name: item.name,
    p_description: item.description,
    p_category_id: item.categoryId ?? undefined,
    p_is_veg: item.isVeg ?? undefined,
    p_image_path: item.imagePath ?? undefined,
    p_active: item.active,
    p_variants: item.variants.map((v) => ({
      id: v.id,
      label: v.label,
      price_paise: v.pricePaise,
      mrp_paise: v.mrpPaise,
      in_stock: v.inStock,
    })),
  });
  if (error) throw error;
  return data;
}

export async function setVariantInStock(client: CampusClient, variantId: string, inStock: boolean) {
  const { error } = await client.from('variants').update({ in_stock: inStock }).eq('id', variantId);
  if (error) throw error;
}

/** Every size of every item in one category of a shop, in or out of stock. Returns how many changed. */
export async function setCategoryInStock(
  client: CampusClient,
  shopId: string,
  categoryId: string | null,
  inStock: boolean,
): Promise<number> {
  const { data, error } = await client.rpc('set_category_in_stock', {
    p_shop_id: shopId,
    p_category_id: categoryId ?? undefined,
    p_in_stock: inStock,
  });
  if (error) throw error;
  return data;
}

/**
 * Uploads a shop's own item photo (JPEG bytes) to shops/<shop id>/ in the product-photos bucket,
 * with its thumbnail beside it, and returns the photo's path for saveCatalogItem. Storage policies
 * only let staff write to their own shop's folder. A failed thumbnail isn't fatal: lists then load
 * the full photo instead.
 */
export async function uploadItemPhoto(client: CampusClient, shopId: string, jpeg: ArrayBuffer, thumb?: ArrayBuffer): Promise<string> {
  const path = `shops/${shopId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const bucket = client.storage.from('product-photos');
  const { error } = await bucket.upload(path, jpeg, { contentType: 'image/jpeg' });
  if (error) throw error;
  if (thumb) {
    const { error: thumbError } = await bucket.upload(thumbPath(path), thumb, { contentType: 'image/jpeg' });
    if (thumbError) console.warn('Could not upload the thumbnail', thumbError.message);
  }
  return path;
}
