import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let admin: string;
let owner: string;
let otherOwner: string;
let student: string;
let rider: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('cash.admin@gmail.com', 'admin', null),
       ('cash.shop@gmail.com', 'merchant_owner', $1),
       ('cash.other@gmail.com', 'merchant_owner', $2)`,
    [SHOP.general, SHOP.stationery],
  );
  admin = await addUser(db, 'cash.admin@gmail.com', 'Ops');
  owner = await addUser(db, 'cash.shop@gmail.com', 'General Owner');
  otherOwner = await addUser(db, 'cash.other@gmail.com', 'Stationery Owner');
  student = await addUser(db, '23bce301@nith.ac.in', 'Tanya');
  rider = await addUser(db, '22bme401@nith.ac.in', 'Arjun');
  kailash = await dropPointId(db, 'Kailash Hostel');
  await asOwner(db, `update public.profiles set phone = '+919800000401' where id = $1`, [rider]);
  await as(db, rider, () => db.query(`select public.apply_as_rider('arjun401@okaxis')`));
  await asOwner(db, `update public.riders set status = 'approved', online = true where profile_id = $1`, [rider]);
});

const call = (userId: string, sql: string, params: unknown[] = []) =>
  as(db, userId, async () => (await db.query<Record<string, unknown>>(sql, params)).rows);

// Places, accepts, claims and delivers one delivery order, paid by cash or by UPI to the shop.
async function deliver(payMethod: 'cash' | 'upi_at_handover' = 'cash') {
  const order =
    payMethod === 'cash'
      ? await as(db, student, () =>
          placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
        )
      : ((await call(student, `select * from public.place_order($1, 'delivery', 'upi_at_handover', $2::jsonb, $3, null)`, [
          SHOP.general,
          JSON.stringify([{ variant_id: VARIANT.maggi70g, qty: 2 }]),
          kailash,
        ]))[0] as { id: string; total_paise: number });
  await as(db, owner, () => transition(db, order.id, 'accepted', { prepMinutes: 5 }));
  await call(rider, 'select public.claim_delivery($1)', [order.id]);
  await as(db, owner, () => transition(db, order.id, 'ready'));
  await as(db, rider, () => transition(db, order.id, 'out_for_delivery'));
  const [{ delivery_otp }] = await asOwner<{ delivery_otp: string }>(db, 'select delivery_otp from public.order_secrets where order_id = $1', [
    order.id,
  ]);
  await as(db, rider, () => transition(db, order.id, 'delivered', { code: delivery_otp }));
  return order;
}

test('cash a rider collects is owed to the shop; UPI paid to the shop is not', async () => {
  const cash = await deliver('cash');
  await deliver('upi_at_handover');

  const mine = await call(rider, 'select * from public.my_rider_cash()');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].shop_id, SHOP.general);
  assert.equal(mine[0].orders, 1, 'only the cash order');
  assert.equal(mine[0].amount_paise, cash.total_paise);
  assert.equal(mine[0].limit_paise, 100000, 'the default limit is ₹1,000');

  const atShop = await call(owner, 'select * from public.shop_rider_cash($1)', [SHOP.general]);
  assert.deepEqual(
    atShop.map((r) => [r.rider_id, r.rider_name, r.amount_paise]),
    [[rider, 'Arjun', cash.total_paise]],
  );
  assert.equal(atShop[0].rider_phone, '+919800000401', 'the shop can call the rider');
});

test('only the shop’s staff and admins see or settle its rider cash', async () => {
  await assert.rejects(call(otherOwner, 'select * from public.shop_rider_cash($1)', [SHOP.general]), /Only this shop/);
  await assert.rejects(call(student, 'select * from public.shop_rider_cash($1)', [SHOP.general]), /Only this shop/);
  await assert.rejects(call(rider, 'select public.settle_rider_cash($1, $2)', [SHOP.general, rider]), /Only this shop/);
  await assert.rejects(call(otherOwner, 'select public.settle_rider_cash($1, $2)', [SHOP.general, rider]), /Only this shop/);
  await assert.rejects(call(student, 'select * from public.rider_cash_report()'), /Only admins/);
  const report = await call(admin, 'select * from public.rider_cash_report()');
  assert.equal(report.length, 1);
  assert.equal(report[0].shop_name, 'Campus General Store');
});

test('a rider at the cash limit cannot take more deliveries until the shop confirms the cash', async () => {
  const [{ amount_paise: held }] = await call(rider, 'select * from public.my_rider_cash()');
  await asOwner(db, `update public.fee_rules set value_paise = $1 where key = 'rider_cash_limit'`, [held]);

  const next = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await as(db, owner, () => transition(db, next.id, 'accepted', { prepMinutes: 5 }));
  await assert.rejects(call(rider, 'select public.claim_delivery($1)', [next.id]), /You are holding ₹\d+ in cash/);

  const [{ settle_rider_cash: settled }] = await call(owner, 'select public.settle_rider_cash($1, $2)', [SHOP.general, rider]);
  assert.equal(settled, held);
  const [push] = await asOwner<{ title: string; body: string }>(
    db,
    `select title, body from public.push_outbox where user_id = $1 and data ->> 'screen' = 'rider' order by id desc limit 1`,
    [rider],
  );
  assert.equal(push.title, 'Cash handed over');
  assert.match(push.body, /Campus General Store confirmed receiving ₹\d+ from you/);
  assert.deepEqual(await call(rider, 'select * from public.my_rider_cash()'), []);
  await assert.rejects(call(owner, 'select public.settle_rider_cash($1, $2)', [SHOP.general, rider]), /no cash to hand over/);

  await call(rider, 'select public.claim_delivery($1)', [next.id]);
  const [settledRow] = await asOwner<{ by: string }>(
    db,
    `select rider_cash_settled_by as by from public.orders where rider_id = $1 and rider_cash_settled_at is not null`,
    [rider],
  );
  assert.equal(settledRow.by, owner, 'the confirming staff member is recorded');
});
