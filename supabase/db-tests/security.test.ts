import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder } from './harness.ts';

let db: PGlite;
let asha: string;
let ravi: string;
let generalOwner: string;
let juiceOwner: string;
let admin: string;
let ashaOrderId: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('general.owner@gmail.com', 'merchant_owner', $1),
       ('juice.owner@gmail.com', 'merchant_owner', $2)`,
    [SHOP.general, SHOP.juice],
  );
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('ops.lead@gmail.com', 'admin')`);
  asha = await addUser(db, '22bec045@nith.ac.in', 'Asha');
  ravi = await addUser(db, '21bcs001@nith.ac.in', 'Ravi');
  generalOwner = await addUser(db, 'general.owner@gmail.com');
  juiceOwner = await addUser(db, 'juice.owner@gmail.com');
  admin = await addUser(db, 'ops.lead@gmail.com');
  kailash = await dropPointId(db, 'Kailash Hostel');

  const order = await as(db, asha, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
  );
  ashaOrderId = order.id;
  await as(db, ravi, () =>
    placeOrder(db, { shopId: SHOP.juice, mode: 'pickup', items: [{ variant_id: VARIANT.mangoShake, qty: 1 }] }),
  );
});

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)).rows[0].n);

test('signed-out visitors cannot read anything', async () => {
  await as(db, null, async () => {
    await assert.rejects(db.query('select * from public.shops'), /permission denied/);
    await assert.rejects(db.query('select * from public.orders'), /permission denied/);
  });
});

test('students see only their own orders, items and events', async () => {
  await as(db, asha, async () => {
    assert.equal(await count('select * from public.orders'), 1);
    assert.equal(await count('select * from public.order_items'), 1);
    assert.equal(await count('select * from public.order_events'), 1);
  });
  await as(db, ravi, async () => {
    assert.equal(await count('select * from public.orders where id = $1', [ashaOrderId]), 0);
  });
});

test('shops see only their own shop orders, admins see all', async () => {
  await as(db, generalOwner, async () => {
    const shops = (await db.query<{ shop_id: string }>('select shop_id from public.orders')).rows;
    assert.deepEqual(shops, [{ shop_id: SHOP.general }]);
  });
  await as(db, juiceOwner, async () => {
    assert.equal(await count('select * from public.orders where id = $1', [ashaOrderId]), 0);
  });
  await as(db, admin, async () => {
    assert.equal(await count('select * from public.orders'), 2);
  });
});

test('only the ordering student can read the delivery code', async () => {
  await as(db, asha, async () => {
    const [secret] = (await db.query<{ delivery_otp: string }>('select delivery_otp from public.order_secrets where order_id = $1', [ashaOrderId])).rows;
    assert.match(secret.delivery_otp, /^\d{4}$/);
  });
  await as(db, generalOwner, async () => {
    assert.equal(await count('select * from public.order_secrets'), 0);
  });
  await as(db, ravi, async () => {
    assert.equal(await count('select * from public.order_secrets where order_id = $1', [ashaOrderId]), 0);
  });
});

test('nobody writes orders directly', async () => {
  await as(db, asha, async () => {
    await assert.rejects(
      db.query(`update public.orders set status = 'delivered' where id = $1`, [ashaOrderId]),
      /permission denied/,
    );
    await assert.rejects(db.query(`delete from public.orders where id = $1`, [ashaOrderId]), /permission denied/);
  });
  await as(db, generalOwner, async () => {
    await assert.rejects(
      db.query(`update public.order_secrets set delivery_otp = '0000' where order_id = $1`, [ashaOrderId]),
      /permission denied/,
    );
  });
});

test('internal order functions are off limits to users', async () => {
  await as(db, asha, async () => {
    await assert.rejects(db.query('select public.expire_stale_orders()'), /permission denied/);
    await assert.rejects(
      db.query(`select public.apply_order_transition($1, 'delivered', 'shop', null, null, null)`, [ashaOrderId]),
      /permission denied/,
    );
  });
});

test('students edit their own contact details but not their role', async () => {
  await as(db, asha, async () => {
    await db.query(`update public.profiles set name = 'Asha V', room_note = 'B-214' where id = $1`, [asha]);
    await assert.rejects(db.query(`update public.profiles set role = 'admin' where id = $1`, [asha]), /Only admins/);
    const touched = await db.query(`update public.profiles set name = 'Hacked' where id = $1`, [ravi]);
    assert.equal(touched.affectedRows, 0);
  });
  const [profile] = await asOwner<{ name: string; role: string }>(db, 'select name, role from public.profiles where id = $1', [asha]);
  assert.deepEqual(profile, { name: 'Asha V', role: 'student' });
});

test('shops can see the students who ordered from them, and no one else', async () => {
  await as(db, generalOwner, async () => {
    assert.equal(await count('select * from public.profiles where id = $1', [asha]), 1);
    assert.equal(await count('select * from public.profiles where id = $1', [ravi]), 0);
  });
});

test('shop staff open and close their shop but cannot change commission or other shops', async () => {
  await as(db, generalOwner, async () => {
    await db.query('update public.shops set is_open = false, prep_minutes = 9 where id = $1', [SHOP.general]);
    await assert.rejects(
      db.query('update public.shops set commission_bps = 500 where id = $1', [SHOP.general]),
      /Only admins/,
    );
    const touched = await db.query('update public.shops set is_open = false where id = $1', [SHOP.juice]);
    assert.equal(touched.affectedRows, 0);
  });
  await as(db, admin, async () => {
    await db.query('update public.shops set commission_bps = 800, is_open = true where id = $1', [SHOP.general]);
  });
  const [shop] = await asOwner<{ commission_bps: number; prep_minutes: number }>(
    db,
    'select commission_bps, prep_minutes from public.shops where id = $1',
    [SHOP.general],
  );
  assert.deepEqual(shop, { commission_bps: 800, prep_minutes: 9 });
});

test('students see active items only; staff see and edit their own shop catalog', async () => {
  await asOwner(db, `update public.products set active = false where id = '10000000-0000-4000-8000-000000000003'`);
  await as(db, asha, async () => {
    assert.equal(await count(`select * from public.products where id = '10000000-0000-4000-8000-000000000003'`), 0);
    await assert.rejects(
      db.query(`insert into public.products (shop_id, name) values ($1, 'Free stuff')`, [SHOP.general]),
      /row-level security/,
    );
  });
  await as(db, generalOwner, async () => {
    assert.equal(await count(`select * from public.products where id = '10000000-0000-4000-8000-000000000003'`), 1);
    await db.query(`update public.variants set in_stock = false where id = $1`, [VARIANT.laysClassic]);
    await assert.rejects(
      db.query(`insert into public.products (shop_id, name) values ($1, 'Not my shop')`, [SHOP.juice]),
      /row-level security/,
    );
  });
});

test('approved logins are visible to admins only', async () => {
  await as(db, asha, async () => {
    assert.equal(await count('select * from public.allowed_logins'), 0);
  });
  await as(db, admin, async () => {
    assert.equal(await count('select * from public.allowed_logins'), 3);
  });
});
