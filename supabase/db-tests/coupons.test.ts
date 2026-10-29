import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, settleOrders, transition, type OrderRow } from './harness.ts';

let db: PGlite;
let admin: string;
let owner: string;
let student: string;
let maggiPaise: number;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('coupon.admin@gmail.com', 'admin', null),
       ('coupon.shop@gmail.com', 'merchant_owner', $1)`,
    [SHOP.general],
  );
  admin = await addUser(db, 'coupon.admin@gmail.com', 'Ops');
  owner = await addUser(db, 'coupon.shop@gmail.com', 'Owner');
  student = await addUser(db, '24bec300@nith.ac.in', 'Kiran');
  [{ price: maggiPaise }] = await asOwner<{ price: number }>(db, 'select price_paise as price from public.variants where id = $1', [
    VARIANT.maggi70g,
  ]);
  await asOwner(
    db,
    `insert into public.coupons (code, kind, value, max_discount_paise, min_subtotal_paise, per_student_limit, max_uses, ends_at, shop_id, first_order_only, listed) values
       ('FLAT20',   'flat',    2000, null, 0,     5, null, null, null, false, true),
       ('HALF',     'percent', 50,   3000, 0,     5, null, null, null, false, false),
       ('BIGCART',  'flat',    5000, null, 50000, 5, null, null, null, false, false),
       ('ONCE',     'flat',    1000, null, 0,     1, null, null, null, false, false),
       ('TWOUSES',  'flat',    1000, null, 0,     5, 2,    null, null, false, false),
       ('JUICEONLY','flat',    1000, null, 0,     5, null, null, $1,   false, false),
       ('WELCOME',  'flat',    1500, null, 0,     1, null, null, null, true,  true),
       ('HUGE',     'flat',    999999, null, 0,   5, null, null, null, false, false)`,
    [SHOP.juice],
  );
  await asOwner(
    db,
    `insert into public.coupons (code, kind, value, starts_at, ends_at) values ('OLD', 'flat', 1000, now() - interval '2 days', now() - interval '1 day')`,
  );
  await asOwner(db, `insert into public.coupons (code, kind, value, active) values ('OFF', 'flat', 1000, false)`);
});

const order = (code: string | null, qty = 2, userId = student) =>
  as(db, userId, async () =>
    (
      await db.query<OrderRow & { discount_paise: number; coupon_code: string | null }>(
        `select * from public.place_order($1, 'pickup', 'cash', $2::jsonb, null, null, $3)`,
        [SHOP.general, JSON.stringify([{ variant_id: VARIANT.maggi70g, qty }]), code],
      )
    ).rows[0],
  );
const preview = (code: string, subtotal: number) =>
  as(db, student, async () =>
    (await db.query<{ d: number }>('select public.preview_coupon($1, $2, $3) as d', [code, SHOP.general, subtotal])).rows[0].d,
  );

test('the first order can use a welcome coupon; the bill adds up with the discount', async () => {
  const placed = await order('welcome');
  assert.equal(placed.discount_paise, 1500);
  assert.equal(placed.coupon_code, 'WELCOME');
  assert.equal(
    placed.total_paise,
    placed.subtotal_paise + placed.delivery_fee_paise + placed.small_cart_fee_paise + placed.platform_fee_paise - 1500,
  );
  await assert.rejects(order('WELCOME'), /first order|already used/);
});

test('percent coupons are capped, and no coupon takes off more than the items cost', async () => {
  const subtotal = maggiPaise * 2;
  assert.equal(await preview('HALF', subtotal), Math.min(Math.floor(subtotal / 2), 3000));
  const huge = await order('HUGE', 1);
  assert.equal(huge.discount_paise, maggiPaise, 'never more than the item total');
  assert.ok(huge.total_paise >= 0);
  assert.equal(huge.total_paise, huge.platform_fee_paise + huge.delivery_fee_paise + huge.small_cart_fee_paise);
});

test('every invalid coupon is refused with its reason, and the order is not placed', async () => {
  const [{ before }] = await asOwner<{ before: number }>(db, 'select count(*)::int as before from public.orders where student_id = $1', [student]);
  const cases: [string, RegExp][] = [
    ['NOPE', /doesn't exist/],
    ['OFF', /doesn't exist/],
    ['OLD', /expired/],
    ['BIGCART', /Add items worth ₹500 or more/],
    ['JUICEONLY', /works only at Juice Corner/],
  ];
  for (const [code, reason] of cases) {
    await assert.rejects(order(code), reason, code);
    await assert.rejects(preview(code, maggiPaise * 2), reason, `preview ${code}`);
  }
  const [{ after }] = await asOwner<{ after: number }>(db, 'select count(*)::int as after from public.orders where student_id = $1', [student]);
  assert.equal(after, before);
});

test('per-student and total limits hold, and a rejected order gives its use back', async () => {
  await settleOrders(db, student);
  const first = await order('ONCE');
  await assert.rejects(order('ONCE'), /already used/);
  await as(db, owner, () => transition(db, first.id, 'rejected', { note: 'Out of stock' }));
  const again = await order('ONCE');
  assert.equal(again.discount_paise, 1000, 'the rejected order no longer counts');

  const other = await addUser(db, '24bec301@nith.ac.in', 'Other');
  const third = await addUser(db, '24bec302@nith.ac.in', 'Third');
  await order('TWOUSES', 2, student);
  await order('TWOUSES', 2, other);
  await assert.rejects(order('TWOUSES', 2, third), /used up/);
});

test('students see listed running coupons only, and cannot create or edit coupons', async () => {
  const listed = await as(db, student, async () =>
    (await db.query<{ code: string }>('select code from public.coupons order by code')).rows.map((r) => r.code),
  );
  assert.deepEqual(listed, ['FLAT20', 'WELCOME']);
  await as(db, student, async () => {
    await assert.rejects(db.query(`insert into public.coupons (code, kind, value) values ('MINE', 'flat', 99999)`), /row-level security/);
    const { rows } = await db.query(`update public.coupons set value = 99999 where code = 'FLAT20' returning code`);
    assert.deepEqual(rows, []);
    await assert.rejects(db.query(`select public.coupon_discount('FLAT20', $1, $2, 10000)`, [student, SHOP.general]), /permission denied/);
  });
  await as(db, admin, () => db.query(`insert into public.coupons (code, kind, value) values ('NEWONE', 'flat', 500)`));
});
