import { smartPicks } from '@campuscart/core';
import { useEffect, useState } from 'react';

import { ProductStrip, type StripProduct } from '@/components/product-strip';
import { useCart } from '@/lib/cart';
import { supabase } from '@/lib/supabase';

/** "Often bought together" for what is in the cart, from last night's refresh. */
export function SmartPicks() {
  const cart = useCart();
  const [picks, setPicks] = useState<StripProduct[]>([]);
  const variantIds = cart.lines.flatMap((l) => (l.variantId ? [l.variantId] : []));
  const masterIds = cart.lines.flatMap((l) => (l.masterProductId ? [l.masterProductId] : []));
  const key = JSON.stringify([variantIds, masterIds]);

  useEffect(() => {
    let active = true;
    const [variants, masters] = JSON.parse(key) as [string[], string[]];
    smartPicks(supabase, variants, masters).then(
      (next) => active && setPicks(next),
      // Suggestions are extras: checkout works without them.
      () => {},
    );
    return () => {
      active = false;
    };
  }, [key]);

  return <ProductStrip title="Often bought together" products={picks} />;
}
