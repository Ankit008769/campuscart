import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, transition } from './harness.ts';

let db: PGlite;
let admin: string;
let student: string;
let kailash: string;
let cola: string;
let colaAtJuice: string;
let colaAtGeneral: string;
const owners: Record<string, string> = {};

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('cart.admin@gmail.com', 'admin')`);
  admin = await addUser(db, 'cart.admin@gmail.com', 'Ops');
  for (const [key, shopId] of Object.entries({ general: SHOP.general, stationery: SHOP.stationery, juice: SHOP.juice })) {
    await asOwner(db, 'insert into public.allowed_logins (email, role, shop_id) values ($1, $2, $3)', [
      `cart.${key}@gmail.com`,
      'merchant_owner',
      shopId,
    ]);
    owners[shopId] = await addUser(db, `cart.${key}@gmail.com`, key);
  }
  student = await addUser(db, '23bce990@nith.ac.in', 'Cart Student');
  kailash = await dropPointId(db, 'Kailash Hostel');

  // One cola, sold by two shops: cheaper at the juice corner, sooner at the general store.
  const add = (shopId: string, price: number) =>
    as(db, admin, async () =>
      (
        await db.query<{ id: string }>(`select public.save_product(p_shop_id => $1, p_name => 'Test Cola', p_variants => $2::jsonb) as id`, [
          shopId,
          JSON.stringify([{ label: '250 ml', price_paise: price, mrp_paise: 2500 }]),
        ])
      ).rows[0].id,
    );
  const general = await add(SHOP.general, 2000);
  const juice = await add(SHOP.juice, 1800);
  [{ id: colaAtGeneral, m: cola }] = await asOwner<{ id: string; m: string }>(db, 'select id, master_product_id as m from public.variants where product_id = $1', [general]);
  [{ id: colaAtJuice }] = await asOwner<{ id: string }>(db, 'select id from public.variants where product_id = $1', [juice]);
});

type Route = { variant_id: string | null; shop_id: string | null; problem: string | null };
const route = (items: object[]) =>
  as(db, student, async () =>
    (await db.query<Route>(`select * from public.route_cart($1::jsonb, 'delivery', $2) order by line`, [JSON.stringify(items), kailash])).rows,
  );
const placeCart = (items: object[]) =>
  as(db, student, async () =>
    (
      await db.query<{ id: string; total_paise: number }>(`select * from public.place_cart($1::jsonb, 'delivery', 'cash', $2)`, [
        JSON.stringify(items),
        kailash,
      ])
    ).rows[0],
  );
type Order = {
  id: string;
  shop_id: string;
  status: string;
  subtotal_paise: number;
  delivery_fee_paise: number;
  small_cart_fee_paise: number;
  platform_fee_paise: number;
  surcharge_paise: number;
  total_paise: number;
};
const ordersOf = (cartId: string) =>
  asOwner<Order>(db, 'select * from public.orders where cart_id = $1 order by subtotal_paise desc', [cartId]);
const fees = (o: Order) => o.delivery_fee_paise + o.small_cart_fee_paise + o.platform_fee_paise + o.surcharge_paise;
const billFees = async (subtotal: number) => {
  const [b] = await asOwner<{ d: number; s: number; p: number }>(
    db,
    `select delivery_fee_paise as d, small_cart_fee_paise as s, platform_fee_paise as p from public.calculate_bill($1, 'delivery')`,
    [subtotal],
  );
  return b.d + b.s + b.p;
};

test('routing picks the sooner shop, unless a shop already in the cart is nearly as quick', async () => {
  // General store: 6 min prep + 10 min walk. Juice corner: 10 + 10. Both within 5 minutes.
  const [alone] = await route([{ master_product_id: cola, qty: 1 }]);
  assert.equal(alone.variant_id, colaAtGeneral, 'earliest ETA wins on its own');

  const withJuice = await route([
    { variant_id: VARIANT.mangoShake, qty: 1 },
    { master_product_id: cola, qty: 1 },
  ]);
  assert.equal(withJuice[1].variant_id, colaAtJuice, 'the juice corner is already coming');

  await asOwner(db, 'update public.variants set in_stock = false where id = $1', [colaAtGeneral]);
  assert.equal((await route([{ master_product_id: cola, qty: 1 }]))[0].variant_id, colaAtJuice, 'out of stock shops are skipped');
  await asOwner(db, 'update public.variants set in_stock = true where id = $1', [colaAtGeneral]);

  await asOwner(db, 'update public.shops set is_open = false where id = any($1::uuid[])', [[SHOP.general, SHOP.juice]]);
  const [none] = await route([{ master_product_id: cola, qty: 1 }]);
  assert.match(none.problem ?? '', /Test Cola is not available at any open shop/);
  await assert.rejects(placeCart([{ master_product_id: cola, qty: 1 }]), /not available at any open shop/);
  await asOwner(db, 'update public.shops set is_open = true where id = any($1::uuid[])', [[SHOP.general, SHOP.juice]]);
});

const threeShopCart = () =>
  placeCart([
    { variant_id: VARIANT.maggi70g, qty: 4 },
    { variant_id: VARIANT.notebook, qty: 1 },
    { variant_id: VARIANT.mangoShake, qty: 1 },
  ]);

test('a 3-shop cart makes 3 shop orders, and the cart pays its fees once', async () => {
  const cart = await threeShopCart();
  const orders = await ordersOf(cart.id);
  assert.deepEqual(new Set(orders.map((o) => o.shop_id)), new Set([SHOP.general, SHOP.stationery, SHOP.juice]));
  const carriers = orders.filter((o) => fees(o) > 0);
  assert.equal(carriers.length, 1);
  assert.equal(carriers[0].id, orders[0].id, 'the largest order carries the fees');
  const cartSubtotal = orders.reduce((t, o) => t + o.subtotal_paise, 0);
  assert.equal(fees(carriers[0]), await billFees(cartSubtotal));
  assert.equal(cart.total_paise, orders.reduce((t, o) => t + o.total_paise, 0));
});

test('every mix of rejected shops leaves exactly one open order carrying the fees for what is left', async () => {
  const shops: string[] = [SHOP.general, SHOP.stationery, SHOP.juice];
  for (let mask = 1; mask < 8; mask++) {
    const rejected = shops.filter((_, i) => mask & (1 << i));
    const cart = await threeShopCart();
    for (const o of await ordersOf(cart.id)) {
      if (rejected.includes(o.shop_id)) await as(db, owners[o.shop_id], () => transition(db, o.id, 'rejected', { note: 'Closing now' }));
    }
    const after = await ordersOf(cart.id);
    const open = after.filter((o) => o.status === 'placed');
    const carriers = open.filter((o) => fees(o) > 0);
    const label = `rejected ${rejected.length} of 3 (mask ${mask})`;
    assert.equal(carriers.length, open.length > 0 ? 1 : 0, label);
    if (open.length > 0) {
      const openSubtotal = open.reduce((t, o) => t + o.subtotal_paise, 0);
      const originalCarrierRejected = !open.some((o) => o.id === after.reduce((a, b) => (b.subtotal_paise > a.subtotal_paise ? b : a)).id);
      if (originalCarrierRejected) assert.equal(fees(carriers[0]), await billFees(openSubtotal), label);
    }
    const [{ total_paise }] = await asOwner<{ total_paise: number }>(db, 'select total_paise from public.carts where id = $1', [cart.id]);
    assert.equal(total_paise, open.reduce((t, o) => t + o.total_paise, 0), label);
  }
});

test('a cart is all or nothing, and only its student sees it', async () => {
  const count = async () =>
    (await asOwner<{ n: number }>(db, 'select count(*)::int as n from public.orders where student_id = $1', [student]))[0].n;
  const before = await count();
  await assert.rejects(
    placeCart([
      { variant_id: VARIANT.maggi70g, qty: 1 },
      { variant_id: VARIANT.notebook, qty: 99 },
    ]),
    /quantity from 1 to 50/,
  );
  assert.equal(await count(), before, 'no shop order was left behind');

  const cart = await threeShopCart();
  const other = await addUser(db, '23bce991@nith.ac.in', 'Other');
  assert.deepEqual(await as(db, other, async () => (await db.query('select id from public.carts where id = $1', [cart.id])).rows), []);
});

test('unified search lists the cola once, with its lowest price and both shops', async () => {
  const hits = await as(db, student, async () =>
    (
      await db.query<{ master_product_id: string; shops: number; min_price_paise: number; available: boolean }>(
        `select * from public.search_catalog('test cola')`,
      )
    ).rows,
  );
  const colaHit = hits.find((h) => h.master_product_id === cola);
  assert.deepEqual(
    { shops: colaHit?.shops, min: colaHit?.min_price_paise, available: colaHit?.available },
    { shops: 2, min: 1800, available: true },
  );
});
