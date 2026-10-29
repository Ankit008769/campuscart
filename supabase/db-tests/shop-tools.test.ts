import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder, transition } from './harness.ts';

let db: PGlite;
let owner: string;
let counter: string;
let student: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('tools.owner@gmail.com', 'merchant_owner', $1), ('tools.counter@gmail.com', 'merchant_staff', $1)`,
    [SHOP.general],
  );
  owner = await addUser(db, 'tools.owner@gmail.com', 'Owner');
  counter = await addUser(db, 'tools.counter@gmail.com', 'Counter');
  student = await addUser(db, '24bce700@nith.ac.in', 'Aman');
  await asOwner(db, 'update public.shops set commission_bps = 1000 where id = $1', [SHOP.general]);
});

const call = (userId: string, sql: string, params: unknown[] = []) =>
  as(db, userId, async () => (await db.query<Record<string, unknown>>(sql, params)).rows);
const RANGE = `now() - interval '1 day', now() + interval '1 day'`;

test('the owner sees sales and commission; a counter login sees no money at all', async () => {
  const order = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 3 }] }),
  );
  await as(db, counter, async () => {
    await transition(db, order.id, 'accepted', { prepMinutes: 5 });
    await transition(db, order.id, 'ready');
    await transition(db, order.id, 'collected', { code: String(order.token_no) });
  });
  await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );

  const [day] = await call(owner, `select * from public.shop_report($1, ${RANGE})`, [SHOP.general]);
  assert.equal(day.orders, 2);
  assert.equal(day.completed, 1);
  assert.equal(day.sales_paise, order.subtotal_paise);
  assert.equal(day.commission_paise, Math.floor(order.subtotal_paise / 10));
  const [top] = await call(owner, `select * from public.shop_top_items($1, ${RANGE})`, [SHOP.general]);
  assert.equal(top.qty, 3);

  await assert.rejects(call(counter, `select * from public.shop_report($1, ${RANGE})`, [SHOP.general]), /Only the shop owner/);
  await assert.rejects(call(counter, `select * from public.shop_top_items($1, ${RANGE})`, [SHOP.general]), /Only the shop owner/);
  await assert.rejects(call(owner, `select * from public.shop_report($1, ${RANGE})`, [SHOP.juice]), /Only the shop owner/);
});

test('counter staff can switch rush mode but not commission', async () => {
  await call(counter, `update public.shops set rush_until = now() + interval '30 minutes' where id = $1`, [SHOP.general]);
  await assert.rejects(call(counter, 'update public.shops set commission_bps = 0 where id = $1', [SHOP.general]), /Only admins/);
  await assert.rejects(call(counter, 'update public.shops set rush_extra_minutes = 60 where id = $1', [SHOP.general]), /Only admins/);
});

test('owners add and remove counter staff; counters cannot manage staff', async () => {
  const [{ result: invited }] = await call(owner, `select public.invite_shop_staff($1, 'New.Helper@gmail.com') as result`, [SHOP.general]);
  assert.equal(invited, 'invited');
  const [login] = await asOwner<{ role: string; shop_id: string }>(db, `select role, shop_id from public.allowed_logins where email = 'new.helper@gmail.com'`);
  assert.deepEqual(login, { role: 'merchant_staff', shop_id: SHOP.general });

  await assert.rejects(call(owner, `select public.invite_shop_staff($1, '24bce999@nith.ac.in')`, [SHOP.general]), /personal Gmail/);
  await assert.rejects(call(counter, `select public.invite_shop_staff($1, 'x.y@gmail.com')`, [SHOP.general]), /Only the shop owner/);

  const staff = await call(owner, 'select profile_id, role from public.shop_staff where shop_id = $1 order by role', [SHOP.general]);
  assert.equal(staff.length, 2, 'the owner sees the whole team');
  assert.equal((await call(counter, 'select profile_id from public.shop_staff where shop_id = $1', [SHOP.general])).length, 1);

  await assert.rejects(call(counter, 'select public.remove_shop_staff($1, $2)', [SHOP.general, owner]), /Only the shop owner/);
  await assert.rejects(call(owner, 'select public.remove_shop_staff($1, $2)', [SHOP.general, owner]), /No counter staff/);
  await call(owner, 'select public.remove_shop_staff($1, $2)', [SHOP.general, counter]);
  assert.equal((await call(owner, 'select profile_id from public.shop_staff where shop_id = $1', [SHOP.general])).length, 1);
});
