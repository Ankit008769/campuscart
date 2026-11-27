import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, settleOrders } from './harness.ts';

// A shop's own minimum for free delivery (migration 20261127100000): shops.free_delivery_min_paise.

let db: PGlite;
let student: string;
let kailash: string;
let limit: number;
let smallFee: number;

before(async () => {
  db = await createDb();
  student = await addUser(db, '23bce301@nith.ac.in', 'Kabir');
  kailash = await dropPointId(db, 'Kailash Hostel');
  const rules = await asOwner<{ key: string; value_paise: number }>(db, `select key, value_paise from public.fee_rules`);
  limit = rules.find((r) => r.key === 'small_cart_limit')?.value_paise ?? 9900;
  smallFee = rules.find((r) => r.key === 'small_cart_fee')?.value_paise ?? 1000;
});

const bill = (subtotal: number, shopId: string | null) =>
  asOwner<{ small_cart_fee_paise: number }>(db, `select small_cart_fee_paise from public.calculate_bill($1, 'delivery', $2)`, [subtotal, shopId]).then(
    ([b]) => b.small_cart_fee_paise,
  );

test('without a shop setting, the usual minimum applies, as before', async () => {
  assert.equal(await bill(limit - 100, null), smallFee);
  assert.equal(await bill(limit, null), 0);
  assert.equal(await bill(limit - 100, SHOP.general), smallFee);
  assert.equal(await bill(limit, SHOP.general), 0);
  // The two-argument call still works.
  const [old] = await asOwner<{ small_cart_fee_paise: number }>(db, `select small_cart_fee_paise from public.calculate_bill($1, 'delivery')`, [limit]);
  assert.equal(old.small_cart_fee_paise, 0);
});

test("a shop's own minimum decides its free delivery; other shops keep the usual one", async () => {
  const own = limit + 5000;
  await asOwner(db, 'update public.shops set free_delivery_min_paise = $1 where id = $2', [own, SHOP.general]);
  assert.equal(await bill(limit, SHOP.general), smallFee, 'above the usual minimum but below the shop’s, it pays');
  assert.equal(await bill(own, SHOP.general), 0, 'from the shop’s minimum, it is free');
  assert.equal(await bill(limit, SHOP.juice), 0, 'another shop is unchanged');
  // Pickup never pays for delivery.
  const [pickup] = await asOwner<{ small_cart_fee_paise: number }>(db, `select small_cart_fee_paise from public.calculate_bill($1, 'pickup', $2)`, [100, SHOP.general]);
  assert.equal(pickup.small_cart_fee_paise, 0);
});

test('placed orders are charged by the shop’s minimum', async () => {
  // One plate's worth: below a minimum set just above it, then free once the minimum drops to it.
  const placeOne = () =>
    as(db, student, () =>
      placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
    );
  const first = await placeOne();
  await asOwner(db, 'update public.shops set free_delivery_min_paise = $1 where id = $2', [first.subtotal_paise + 100, SHOP.general]);
  await settleOrders(db, student);
  const below = await placeOne();
  assert.equal(below.small_cart_fee_paise, smallFee);

  await asOwner(db, 'update public.shops set free_delivery_min_paise = $1 where id = $2', [first.subtotal_paise, SHOP.general]);
  await settleOrders(db, student);
  const at = await placeOne();
  assert.equal(at.small_cart_fee_paise, 0);
  assert.equal(at.total_paise, at.subtotal_paise + at.delivery_fee_paise + at.platform_fee_paise + (at as unknown as { surcharge_paise: number }).surcharge_paise);
});

test('the setting must be a sensible amount', async () => {
  await assert.rejects(asOwner(db, 'update public.shops set free_delivery_min_paise = -1 where id = $1', [SHOP.general]), /check/);
});
