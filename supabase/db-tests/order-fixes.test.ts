import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let student: string;
let noPhone: string;
let owner: string;
let otherOwner: string;
let admin: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('fix.general@gmail.com', 'merchant_owner', $1), ('fix.juice@gmail.com', 'merchant_owner', $2)`,
    [SHOP.general, SHOP.juice],
  );
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('fix.admin@gmail.com', 'admin')`);
  student = await addUser(db, '23bce101@nith.ac.in', 'Neha');
  noPhone = await addUser(db, '23bce102@nith.ac.in', 'Arjun', { phone: false });
  owner = await addUser(db, 'fix.general@gmail.com');
  otherOwner = await addUser(db, 'fix.juice@gmail.com');
  admin = await addUser(db, 'fix.admin@gmail.com');
  kailash = await dropPointId(db, 'Kailash Hostel');
});

const order = () =>
  as(db, student, () =>
    placeOrder(db, {
      shopId: SHOP.general,
      mode: 'delivery',
      dropPointId: kailash,
      items: [
        { variant_id: VARIANT.maggi70g, qty: 2 },
        { variant_id: VARIANT.milk, qty: 1 },
        { variant_id: VARIANT.laysClassic, qty: 1 },
      ],
    }),
  );

test('a student without a mobile number cannot order', async () => {
  await assert.rejects(
    as(db, noPhone, () => placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] })),
    /Add your mobile number/,
  );
});

test('the shop drops what it does not have; the rest is re-priced, fees never go up', async () => {
  const placed = await order();
  const items = await asOwner<{ id: string; variant_id: string; price_paise_snapshot: number; qty: number }>(
    db,
    'select id, variant_id, price_paise_snapshot, qty from public.order_items where order_id = $1',
    [placed.id],
  );
  const gone = items.filter((i) => i.variant_id !== VARIANT.maggi70g);
  const kept = items.find((i) => i.variant_id === VARIANT.maggi70g)!;

  const [after] = await as(db, owner, async () =>
    (await db.query<Record<string, number>>('select * from public.remove_order_items($1, $2)', [placed.id, gone.map((i) => i.id)])).rows,
  );
  assert.equal(after.subtotal_paise, kept.price_paise_snapshot * kept.qty);
  assert.equal(after.small_cart_fee_paise, placed.small_cart_fee_paise, 'fees stay as they were');
  assert.equal(after.delivery_fee_paise, placed.delivery_fee_paise);
  assert.equal(after.total_paise, after.subtotal_paise + after.delivery_fee_paise + after.small_cart_fee_paise + after.platform_fee_paise);

  const stock = await asOwner<{ in_stock: boolean }>(db, 'select in_stock from public.variants where id = any ($1)', [gone.map((i) => i.variant_id)]);
  assert.ok(stock.every((v) => !v.in_stock), 'the missing items are marked out of stock');
  const [push] = await asOwner<{ title: string; body: string }>(
    db,
    `select title, body from public.push_outbox where user_id = $1 order by id desc limit 1`,
    [student],
  );
  assert.equal(push.title, "Some items weren't available");
  assert.match(push.body, /Your order is now ₹/);

  await asOwner(db, 'update public.variants set in_stock = true where id = any ($1)', [gone.map((i) => i.variant_id)]);
});

test('the last item cannot be removed, nor items from another shop or a packed order', async () => {
  const placed = await order();
  const ids = (await asOwner<{ id: string }>(db, 'select id from public.order_items where order_id = $1', [placed.id])).map((i) => i.id);
  await as(db, owner, async () => {
    await assert.rejects(db.query('select public.remove_order_items($1, $2)', [placed.id, ids]), /reject the order instead/);
  });
  await as(db, otherOwner, async () => {
    await assert.rejects(db.query('select public.remove_order_items($1, $2)', [placed.id, ids.slice(0, 1)]), /Only this shop/);
  });
  await as(db, owner, async () => {
    await transition(db, placed.id, 'accepted', { prepMinutes: 10 });
    await transition(db, placed.id, 'ready');
    await assert.rejects(db.query('select public.remove_order_items($1, $2)', [placed.id, ids.slice(0, 1)]), /before the order is packed/);
  });
});

test('admins see each shop’s monthly platform fee; nobody else does', async () => {
  const placed = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await asOwner(db, `update public.orders set status = 'collected', completed_at = now() where id = $1`, [placed.id]);

  const month = new Date().toISOString().slice(0, 10);
  const bills = await as(db, admin, async () =>
    (await db.query<{ shop_id: string; orders: number; platform_fee_paise: number }>('select * from public.shop_monthly_bills($1)', [month])).rows,
  );
  const general = bills.find((b) => b.shop_id === SHOP.general)!;
  assert.ok(general.orders >= 1);
  assert.equal(general.platform_fee_paise % 400, 0);
  const lines = await as(db, admin, async () =>
    (await db.query<{ order_id: string }>('select * from public.shop_month_orders($1, $2)', [SHOP.general, month])).rows,
  );
  assert.ok(lines.some((l) => l.order_id === placed.id));

  await as(db, owner, async () => {
    await assert.rejects(db.query('select * from public.shop_monthly_bills($1)', [month]), /Only admins/);
  });
});

test('everyone reads the minimum app version; only admins raise it', async () => {
  const read = await as(db, null, async () => (await db.query<{ min_android_version_code: number }>('select min_android_version_code from public.app_settings')).rows);
  assert.deepEqual(read, [{ min_android_version_code: 0 }]);
  await as(db, student, () => db.query('update public.app_settings set min_android_version_code = 9'));
  assert.equal((await asOwner<{ v: number }>(db, 'select min_android_version_code as v from public.app_settings'))[0].v, 0);
  await as(db, admin, () => db.query('update public.app_settings set min_android_version_code = 4'));
  assert.equal((await asOwner<{ v: number }>(db, 'select min_android_version_code as v from public.app_settings'))[0].v, 4);
});
