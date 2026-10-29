import type { CartItemInput } from '@campuscart/core';
import { createContext, use, useState, type ReactNode } from 'react';

/** A shop whose items are in the cart. */
export type CartShop = { id: string; name: string; doesDelivery: boolean; doesPickup: boolean };

/**
 * A line in the cart: either a shop's own size (variantId, with its shop), or a product the
 * student added from the unified catalog (masterProductId), which route_cart sends to a shop at
 * checkout. `key` is the variant id or "m:<master id>".
 */
export type CartLine = {
  key: string;
  variantId?: string;
  masterProductId?: string;
  shop: CartShop | null;
  productName: string;
  label: string;
  /** Shown in the cart only (for routed lines, the lowest price); the database re-prices every line. */
  pricePaise: number;
  qty: number;
};

type ShopLine = { variantId: string; productName: string; label: string; pricePaise: number };
type RoutedLine = { masterProductId: string; productName: string; label: string; pricePaise: number };

type Cart = {
  lines: CartLine[];
  /** The shops whose own items are in the cart. */
  shops: CartShop[];
  /** Set when every line is one shop's own item: such carts check out as one order (with scheduling). */
  shop: CartShop | null;
  itemCount: number;
  subtotalPaise: number;
  qtyOf: (key: string) => number;
  add: (shop: CartShop, line: ShopLine) => void;
  addRouted: (line: RoutedLine) => void;
  /** Replaces the whole cart, e.g. with an earlier order's items for "Order again". */
  fill: (shop: CartShop, lines: (ShopLine & { qty: number })[]) => void;
  setQty: (key: string, qty: number) => void;
  /** The lines as place_cart and route_cart take them. */
  items: () => CartItemInput[];
  clear: () => void;
};

const MAX_QTY = 50; // place_order accepts 1 to 50 of each item.
export const routedKey = (masterProductId: string) => `m:${masterProductId}`;

const CartContext = createContext<Cart | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const bump = (line: Omit<CartLine, 'qty'>) =>
    setLines((current) =>
      current.some((l) => l.key === line.key)
        ? current.map((l) => (l.key === line.key ? { ...l, qty: Math.min(l.qty + 1, MAX_QTY) } : l))
        : [...current, { ...line, qty: 1 }],
    );

  const shops = [...new Map(lines.flatMap((l) => (l.shop ? [[l.shop.id, l.shop] as const] : []))).values()];
  const oneShop = shops.length === 1 && lines.every((l) => l.shop?.id === shops[0].id);

  const cart: Cart = {
    lines,
    shops,
    shop: oneShop ? shops[0] : null,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    subtotalPaise: lines.reduce((sum, line) => sum + line.pricePaise * line.qty, 0),
    qtyOf: (key) => lines.find((line) => line.key === key)?.qty ?? 0,
    add: (shop, line) => bump({ ...line, key: line.variantId, shop }),
    addRouted: (line) => bump({ ...line, key: routedKey(line.masterProductId), shop: null }),
    fill: (shop, next) =>
      setLines(next.map((line) => ({ ...line, key: line.variantId, shop, qty: Math.min(Math.max(line.qty, 1), MAX_QTY) }))),
    setQty: (key, qty) =>
      setLines(lines.map((line) => (line.key === key ? { ...line, qty: Math.min(qty, MAX_QTY) } : line)).filter((line) => line.qty > 0)),
    items: () =>
      lines.map((line) =>
        line.variantId ? { variantId: line.variantId, qty: line.qty } : { masterProductId: line.masterProductId ?? '', qty: line.qty },
      ),
    clear: () => setLines([]),
  };

  return <CartContext value={cart}>{children}</CartContext>;
}

export function useCart(): Cart {
  const cart = use(CartContext);
  if (!cart) throw new Error('useCart must be used inside CartProvider');
  return cart;
}
