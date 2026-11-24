import { getShopMenu, listShops, watchCatalog } from '@campuscart/core';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { readCache, writeCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';

export type Shop = Awaited<ReturnType<typeof listShops>>[number];
export type MenuProduct = Awaited<ReturnType<typeof getShopMenu>>['products'][number];

type Menus = {
  /** Every shop, open ones first. Null until the first copy (cached or live) is in. */
  shops: Shop[] | null;
  /** Each shop's active menu, by shop id. */
  menus: Record<string, MenuProduct[]>;
  error: string | null;
  reload: () => Promise<void>;
};

const MenusContext = createContext<Menus | null>(null);
const CACHE_MS = 24 * 60 * 60 * 1000;
const sortShops = (shops: Shop[]) => [...shops].sort((a, b) => Number(b.is_open) - Number(a.is_open));

/** Every shop and each one's menu, read live and kept for next time. A menu that fails reads as empty. */
async function fetchMenus() {
  const list = await listShops(supabase);
  const loaded = await Promise.all(
    list.map((shop) =>
      getShopMenu(supabase, shop.id).then(
        (menu) => {
          writeCache(`menu:${shop.id}`, menu);
          return [shop.id, menu.products] as const;
        },
        () => [shop.id, [] as MenuProduct[]] as const,
      ),
    ),
  );
  writeCache('shops', list);
  return [list, Object.fromEntries(loaded) as Record<string, MenuProduct[]>] as const;
}

/**
 * Every shop and its menu, for Home, search and recommendations: drawn from yesterday's copy at
 * once, then read live, and read again whenever a shop opens or closes or a menu, price or stock
 * level changes (watchCatalog). Only for students; other sides never load it.
 */
export function MenusProvider({ children }: { children: ReactNode }) {
  const { side, session } = useAuth();
  const active = side === 'student' && !!session;
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [menus, setMenus] = useState<Record<string, MenuProduct[]>>({});
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((list: Shop[], loaded: Record<string, MenuProduct[]>) => {
    setShops(sortShops(list));
    setMenus(loaded);
    setError(null);
  }, []);
  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the shops.'), []);
  const reload = useCallback(() => fetchMenus().then(([list, loaded]) => apply(list, loaded), fail), [apply, fail]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    let fresh = false;
    readCache<Shop[]>('shops', CACHE_MS).then(async (cached) => {
      if (fresh || !cached) return;
      const saved = await Promise.all(cached.map((s) => readCache<{ products: MenuProduct[] }>(`menu:${s.id}`, CACHE_MS)));
      if (live && !fresh) apply(cached, Object.fromEntries(cached.map((s, i) => [s.id, saved[i]?.products ?? []])));
    });
    fetchMenus().then(([list, loaded]) => {
      fresh = true;
      if (live) apply(list, loaded);
    }, fail);
    const stop = watchCatalog(supabase, () => void reload());
    return () => {
      live = false;
      stop();
    };
  }, [active, apply, fail, reload]);

  const value = useMemo(() => ({ shops, menus, error, reload }), [shops, menus, error, reload]);
  return <MenusContext value={value}>{children}</MenusContext>;
}

export function useMenus(): Menus {
  const menus = use(MenusContext);
  if (!menus) throw new Error('useMenus must be used inside MenusProvider');
  return menus;
}

/** An item as one shop sells it. */
export type Offer = { shop: Shop; product: MenuProduct };

const lowestPrice = (product: MenuProduct) => Math.min(...product.variants.map((v) => v.price_paise));
const sellable = ({ shop, product }: Offer) => shop.is_open && product.variants.some((v) => v.in_stock);

/**
 * Orders offers for showing: the cart's shop first (one order is one shop, so its items are the
 * useful suggestions), then shops that are open with the item in stock, then the rest.
 */
export function rankOffers(offers: Offer[], cartShopId: string | null | undefined): Offer[] {
  const rank = (o: Offer) => (o.shop.id === cartShopId ? 0 : 1) * 4 + (o.shop.is_open ? 0 : 2) + (sellable(o) ? 0 : 1);
  return [...offers].sort((a, b) => rank(a) - rank(b));
}

/**
 * Finds a shop's own item for each catalog product (collections and "often bought together" name
 * catalog products, not a shop's item). Picks the cart's shop when it sells it, else an open shop
 * with it in stock, cheapest first. With `onlyShopId`, only that shop's items count.
 */
export function offersForMasters(
  shops: Shop[] | null,
  menus: Record<string, MenuProduct[]>,
  masterIds: string[],
  cartShopId: string | null | undefined,
  onlyShopId?: string | null,
): Offer[] {
  if (!shops) return [];
  const all: (Offer & { masterId: string })[] = [];
  for (const shop of shops) {
    if (onlyShopId && shop.id !== onlyShopId) continue;
    for (const product of menus[shop.id] ?? []) {
      for (const masterId of new Set(product.variants.flatMap((v) => (v.master_product_id ? [v.master_product_id] : [])))) {
        all.push({ shop, product, masterId });
      }
    }
  }
  return masterIds.flatMap((id) => {
    const choices = all.filter((o) => o.masterId === id);
    const best = [...choices].sort(
      (a, b) =>
        Number(b.shop.id === cartShopId) - Number(a.shop.id === cartShopId) ||
        Number(sellable(b)) - Number(sellable(a)) ||
        lowestPrice(a.product) - lowestPrice(b.product),
    )[0];
    return best ? [{ shop: best.shop, product: best.product }] : [];
  });
}

/** Finds the shop item a variant belongs to (for "buy again", which names variants). */
export function offerForVariant(shops: Shop[] | null, menus: Record<string, MenuProduct[]>, shopId: string, variantId: string): Offer | null {
  const shop = shops?.find((s) => s.id === shopId);
  const product = menus[shopId]?.find((p) => p.variants.some((v) => v.id === variantId));
  return shop && product ? { shop, product } : null;
}
