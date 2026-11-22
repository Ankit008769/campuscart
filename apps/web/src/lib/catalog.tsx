import {
  DEFAULT_FEE_RULES,
  getFeeRules,
  getShopMenu,
  getShopRatings,
  listFavouriteProductIds,
  listShops,
  listStockAlertVariantIds,
  productPhotoUrl,
  setFavourite,
  setStockAlert,
  watchCatalog,
  type FeeRules,
} from '@campuscart/core';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from './auth';
import { SUPABASE_URL, supabase } from './supabase';

export type Shop = Awaited<ReturnType<typeof listShops>>[number];

export type Variant = { id: string; label: string; pricePaise: number; mrpPaise: number | null; inStock: boolean };

/** A menu item as the website shows it: one product of one shop, with its sizes. */
export type Product = {
  id: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  isVeg: boolean | null;
  photoCredit: string | null;
  photoSourceUrl: string | null;
  category: string;
  categorySort: number;
  shop: Shop;
  variants: Variant[];
};

type Catalog = {
  shops: Shop[];
  /** Delivery and platform fees as admins set them (fee_rules); the database charges these. */
  rules: FeeRules;
  products: Product[];
  ratings: Map<string, { average: number; ratings: number }>;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Goes up each time a shop or menu changes live, so screens that ask the database again (checkout) can. */
  liveVersion: number;
  favourites: Set<string>;
  toggleFavourite: (productId: string) => Promise<void>;
  alerts: Set<string>;
  toggleAlert: (variantId: string) => Promise<void>;
};

const CatalogContext = createContext<Catalog | null>(null);

// Where product photos are served from: the project's public storage. Overridable for a local copy
// of the menus whose photo files live only on the live project.
const PHOTO_BASE = (import.meta.env.VITE_PHOTO_BASE_URL as string | undefined) || SUPABASE_URL;

export const photoUrl = (path: string | null, size: 'full' | 'thumb' = 'thumb') =>
  path && PHOTO_BASE ? productPhotoUrl(PHOTO_BASE, path, size) : '/product-placeholder.svg';

/** A product is orderable when its shop is open and one of its sizes is in stock. */
export const orderable = (p: Product) => p.shop.is_open && p.variants.some((v) => v.inStock);

/**
 * Every shop's menu, read straight from the app's database, so a price, stock or photo the shop
 * changes in its app shows here on the next load. Menus are only readable once signed in.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ratings, setRatings] = useState<Catalog['ratings']>(new Map());
  const [rules, setRules] = useState<FeeRules>(DEFAULT_FEE_RULES);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Live changes (a shop opening, an item selling out) reload quietly, without the loading state.
  const [liveVersion, setLiveVersion] = useState(0);
  const quiet = useRef(false);

  useEffect(() => {
    if (!userId) return;
    return watchCatalog(supabase, () => {
      quiet.current = true;
      setLiveVersion((v) => v + 1);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setShops([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    let active = true;
    if (!quiet.current) setLoading(true);
    quiet.current = false;
    setError(null);
    (async () => {
      try {
        const list = await listShops(supabase);
        const menus = await Promise.all(list.map((s) => getShopMenu(supabase, s.id)));
        const [fees, stars, favs, watched] = await Promise.all([
          getFeeRules(supabase).catch(() => DEFAULT_FEE_RULES),
          getShopRatings(supabase).catch(() => new Map()),
          listFavouriteProductIds(supabase).catch(() => new Set<string>()),
          listStockAlertVariantIds(supabase).catch(() => new Set<string>()),
        ]);
        if (!active) return;
        const all: Product[] = menus.flatMap(({ products: rows }, i) =>
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            imagePath: row.image_path,
            isVeg: row.is_veg,
            photoCredit: row.photo_credit,
            photoSourceUrl: row.photo_source_url,
            category: row.categories?.name ?? 'More to discover',
            categorySort: row.categories?.sort ?? 999,
            shop: list[i],
            variants: [...row.variants]
              .sort((a, b) => a.sort - b.sort)
              .map((v) => ({ id: v.id, label: v.label, pricePaise: v.price_paise, mrpPaise: v.mrp_paise, inStock: v.in_stock })),
          })),
        );
        setShops(list);
        setRules(fees);
        setProducts(all.filter((p) => p.variants.length > 0));
        setRatings(stars);
        setFavourites(favs);
        setAlerts(watched);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load the shops.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, version, liveVersion]);

  const toggleFavourite = useCallback(
    async (productId: string) => {
      const on = !favourites.has(productId);
      await setFavourite(supabase, productId, on);
      setFavourites((prev) => {
        const next = new Set(prev);
        if (on) next.add(productId);
        else next.delete(productId);
        return next;
      });
    },
    [favourites],
  );

  const toggleAlert = useCallback(
    async (variantId: string) => {
      const on = !alerts.has(variantId);
      await setStockAlert(supabase, variantId, on);
      setAlerts((prev) => {
        const next = new Set(prev);
        if (on) next.add(variantId);
        else next.delete(variantId);
        return next;
      });
    },
    [alerts],
  );

  const value = useMemo<Catalog>(
    () => ({
      shops,
      rules,
      products,
      ratings,
      loading,
      error,
      reload: () => setVersion((v) => v + 1),
      liveVersion,
      favourites,
      toggleFavourite,
      alerts,
      toggleAlert,
    }),
    [shops, rules, products, ratings, loading, error, liveVersion, favourites, toggleFavourite, alerts, toggleAlert],
  );
  return <CatalogContext value={value}>{children}</CatalogContext>;
}

export function useCatalog(): Catalog {
  const catalog = use(CatalogContext);
  if (!catalog) throw new Error('useCatalog must be used inside CatalogProvider');
  return catalog;
}
