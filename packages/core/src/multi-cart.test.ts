import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_FEE_RULES, calculateBill } from './bill.ts';
import { previewCart, type CartRoute } from './multi-cart.ts';

const route = (line: number, shop: string, price: number, qty: number, problem: string | null = null): CartRoute => ({
  line,
  master_product_id: null as unknown as string,
  variant_id: `v${line}`,
  shop_id: shop,
  shop_name: `Shop ${shop}`,
  product_name: `Item ${line}`,
  price_paise: price,
  qty,
  problem: problem as unknown as string,
});

test('the cart preview groups by shop, biggest first, and charges fees once on the whole total', () => {
  const preview = previewCart(
    [route(1, 'a', 2000, 1), route(2, 'b', 3000, 2), route(3, 'a', 500, 2)],
    'delivery',
    DEFAULT_FEE_RULES,
  );
  assert.deepEqual(
    preview.shops.map((s) => [s.shopId, s.subtotalPaise, s.lines.length]),
    [
      ['b', 6000, 1],
      ['a', 3000, 2],
    ],
  );
  assert.deepEqual(preview.bill, calculateBill(9000, 'delivery', DEFAULT_FEE_RULES));
  assert.deepEqual(preview.problems, []);
});

test('lines that cannot be bought are listed, not priced', () => {
  const preview = previewCart([route(1, 'a', 2000, 1), route(2, 'b', 3000, 1, 'Chips is not available')], 'pickup', DEFAULT_FEE_RULES);
  assert.equal(preview.bill.subtotalPaise, 2000);
  assert.deepEqual(preview.problems, ['Chips is not available']);
});
