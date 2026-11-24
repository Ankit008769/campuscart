import { smartPicks } from '@campuscart/core';
import { useEffect, useState } from 'react';

import { ProductStrip, type StripProduct } from '@/components/product-strip';
import { useCart } from '@/lib/cart';
import { supabase } from '@/lib/supabase';

/**
 * "Often bought together" for what is in the cart, from last night's refresh. Only the cart's
 * shop's items show, since one order is one shop.
 */
export function SmartPicks() {
  const cart = useCart();
  const [picks, setPicks] = useState<StripProduct[]>([]);
  const variantIds = cart.lines.flatMap((l) => (l.variantId ? [l.variantId] : []));
  const key = JSON.stringify(variantIds);

  useEffect(() => {
    let active = true;
    smartPicks(supabase, JSON.parse(key) as string[], []).then(
      (next) => active && setPicks(next),
      // Suggestions are extras: checkout works without them.
      () => {},
    );
    return () => {
      active = false;
    };
  }, [key]);

  return <ProductStrip title={`More from ${cart.shops[0]?.name ?? 'this shop'}`} products={picks} onlyCartShop />;
}
