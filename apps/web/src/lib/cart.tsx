import type { CartItemInput } from '@campuscart/core';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

/** One size of one shop's product in the bag. Prices here are for display; the database re-prices every line. */
export type CartLine = {
  variantId: string;
  productId: string;
  productName: string;
  label: string;
  pricePaise: number;
  imagePath: string | null;
  shopId: string;
  shopName: string;
  qty: number;
};

type Cart = {
  lines: CartLine[];
  count: number;
  subtotalPaise: number;
  qtyOf: (variantId: string) => number;
  set: (line: Omit<CartLine, 'qty'>, qty: number) => void;
  /** The lines as route_cart and place_cart take them. */
  items: () => CartItemInput[];
  clear: () => void;
};

// place_order accepts 1 to 50 of each item.
const MAX_QTY = 50;
const STORAGE_KEY = 'campuscart:web-cart';

const CartContext = createContext<Cart | null>(null);

function readSaved(): CartLine[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** The bag, kept in this browser so a refresh doesn't empty it. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readSaved);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private windows may refuse storage; the bag still works until the tab closes.
    }
  }, [lines]);

  const value = useMemo<Cart>(
    () => ({
      lines,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      subtotalPaise: lines.reduce((sum, l) => sum + l.pricePaise * l.qty, 0),
      qtyOf: (variantId) => lines.find((l) => l.variantId === variantId)?.qty ?? 0,
      set: (line, qty) =>
        setLines((current) => {
          const n = Math.min(Math.max(qty, 0), MAX_QTY);
          if (n === 0) return current.filter((l) => l.variantId !== line.variantId);
          return current.some((l) => l.variantId === line.variantId)
            ? current.map((l) => (l.variantId === line.variantId ? { ...l, ...line, qty: n } : l))
            : [...current, { ...line, qty: n }];
        }),
      items: () => lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      clear: () => setLines([]),
    }),
    [lines],
  );
  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): Cart {
  const cart = use(CartContext);
  if (!cart) throw new Error('useCart must be used inside CartProvider');
  return cart;
}

/** The bag split by shop, in the order shops were added. */
export function linesByShop(lines: CartLine[]) {
  const groups = new Map<string, { shopId: string; shopName: string; lines: CartLine[]; subtotalPaise: number }>();
  for (const line of lines) {
    const group = groups.get(line.shopId) ?? { shopId: line.shopId, shopName: line.shopName, lines: [], subtotalPaise: 0 };
    group.lines.push(line);
    group.subtotalPaise += line.pricePaise * line.qty;
    groups.set(line.shopId, group);
  }
  return [...groups.values()];
}
