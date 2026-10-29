import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let admin: string;
let owner: string;
let student: string;
let riderA: string;
let riderB: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('rider.admin@gmail.com', 'admin', null),
       ('rider.shop@gmail.com', 'merchant_owner', $1)`,
    [SHOP.general],
  );
  admin = await addUser(db, 'rider.admin@gmail.com', 'Ops');
  owner = await addUser(db, 'rider.shop@gmail.com', 'General Owner');
  student = await addUser(db, '23bce101@nith.ac.in', 'Tanya');
  riderA = await addUser(db, '22bme201@nith.ac.in', 'Arjun');
  riderB = await addUser(db, '22bme202@nith.ac.in', 'Bhavya');
  kailash = await dropPointId(db, 'Kailash Hostel');
  await asOwner(db, `update public.profiles set phone = '+919800000101' where id = $1`, [student]);
});

const call = (userId: string, sql: string, params: unknown[] = []) =>
  as(db, userId, async () => (await db.query<Record<string, unknown>>(sql, params)).rows);

const deliveryOrder = () =>
  as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
  );

test('students apply with a phone number and a UPI ID, and admins approve them', async () => {
  await assert.rejects(call(riderA, `select public.apply_as_rider('arjun@okaxis')`), /mobile number/);
  for (const [rider, phone] of [
    [riderA, '+919800000201'],
    [riderB, '+919800000202'],
  ]) {
    await asOwner(db, 'update public.profiles set phone = $2 where id = $1', [rider, phone]);
  }
  await assert.rejects(call(riderA, `select public.apply_as_rider('not a upi id')`), /UPI ID/);
  await call(riderA, `select public.apply_as_rider('arjun@okaxis')`);
  await call(riderB, `select public.apply_as_rider('bhavya.2@ybl')`);

  await assert.rejects(call(riderA, 'select public.set_rider_online(true)'), /Only approved riders/);
  await assert.rejects(call(riderA, `select public.decide_rider($1, 'approved')`, [riderA]), /Only admins/);
  for (const rider of [riderA, riderB]) {
    await call(admin, `select public.decide_rider($1, 'approved')`, [rider]);
    await call(rider, 'select public.set_rider_online(true)');
  }
});

test('online riders see the offer, without the student’s details, and the first to claim wins', async () => {
  const order = await deliveryOrder();
  assert.deepEqual(await call(riderA, 'select * from public.list_delivery_offers()'), [], 'not offered before the shop accepts');
  await as(db, owner, () => transition(db, order.id, 'accepted', { prepMinutes: 8 }));

  const [offer] = await call(riderA, 'select * from public.list_delivery_offers()');
  assert.equal(offer.id, order.id);
  assert.equal(offer.drop_point_name, 'Kailash Hostel');
  assert.equal(offer.items, 2);
  assert.equal(offer.payout_paise, 1500);
  assert.ok(!('student_id' in offer) && !('room_note' in offer));

  const pushes = await asOwner<{ user_id: string; title: string }>(
    db,
    `select user_id, title from public.push_outbox where data ->> 'deliveryId' = $1`,
    [order.id],
  );
  assert.deepEqual(pushes.map((p) => p.user_id).sort(), [riderA, riderB].sort());

  await call(riderA, 'select public.claim_delivery($1)', [order.id]);
  await assert.rejects(call(riderB, 'select public.claim_delivery($1)', [order.id]), /Another rider took this delivery/);
  assert.deepEqual(await call(riderB, 'select * from public.list_delivery_offers()'), []);
  assert.deepEqual(await call(riderB, 'select id from public.orders where id = $1', [order.id]), [], 'B cannot read it');

  // The rider sees who to hand it to; the student sees who is coming.
  const [customer] = await call(riderA, 'select phone from public.profiles where id = $1', [student]);
  assert.equal(customer.phone, '+919800000101');
  const [rider] = await call(student, 'select name from public.profiles where id = $1', [riderA]);
  assert.equal(rider.name, 'Arjun');
});

test('the rider picks up once it is ready and delivers only with the student’s code', async () => {
  const order = await deliveryOrder();
  await as(db, owner, () => transition(db, order.id, 'accepted', { prepMinutes: 5 }));
  await call(riderA, 'select public.claim_delivery($1)', [order.id]);

  await assert.rejects(as(db, riderA, () => transition(db, order.id, 'out_for_delivery')), /cannot move from accepted/);
  await as(db, owner, () => transition(db, order.id, 'ready'));
  const [ready] = await asOwner<{ title: string }>(
    db,
    `select title from public.push_outbox where user_id = $1 and data ->> 'deliveryId' = $2 order by id desc limit 1`,
    [riderA, order.id],
  );
  assert.equal(ready.title, 'Ready for pickup');

  await as(db, riderA, () => transition(db, order.id, 'out_for_delivery'));
  await assert.rejects(as(db, riderA, () => transition(db, order.id, 'cancelled', { note: 'meh' })), /cannot move/);
  await assert.rejects(as(db, riderA, () => transition(db, order.id, 'delivered', { code: '0000x' })), /Wrong delivery code/);
  const [{ delivery_otp }] = await asOwner<{ delivery_otp: string }>(
    db,
    'select delivery_otp from public.order_secrets where order_id = $1',
    [order.id],
  );
  const delivered = await as(db, riderA, () => transition(db, order.id, 'delivered', { code: delivery_otp }));
  assert.equal(delivered.status, 'delivered');
  assert.deepEqual(await call(riderA, 'select delivery_otp from public.order_secrets where order_id = $1', [order.id]), []);
});

test('riders never get their own orders, hold two at most, and can give one back before pickup', async () => {
  const own = await as(db, riderB, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await as(db, owner, () => transition(db, own.id, 'accepted', { prepMinutes: 5 }));
  assert.ok(!(await call(riderB, 'select id from public.list_delivery_offers()')).some((o) => o.id === own.id));
  await assert.rejects(call(riderB, 'select public.claim_delivery($1)', [own.id]), /no longer open/);

  const [first, second, third] = [await deliveryOrder(), await deliveryOrder(), await deliveryOrder()];
  for (const o of [first, second, third]) await as(db, owner, () => transition(db, o.id, 'accepted', { prepMinutes: 5 }));
  await call(riderB, 'select public.claim_delivery($1)', [first.id]);
  await call(riderB, 'select public.claim_delivery($1)', [second.id]);
  await assert.rejects(call(riderB, 'select public.claim_delivery($1)', [third.id]), /two at a time/);

  await call(riderB, 'select public.release_delivery($1)', [second.id]);
  assert.ok((await call(riderA, 'select id from public.list_delivery_offers()')).some((o) => o.id === second.id));
});

test('suspending a rider takes them offline; weekly payouts are prepared once and paid with a reference', async () => {
  await call(admin, `select public.decide_rider($1, 'suspended', 'Late twice')`, [riderB]);
  const [record] = await asOwner<{ online: boolean; status: string }>(db, 'select online, status from public.riders where profile_id = $1', [
    riderB,
  ]);
  assert.deepEqual(record, { online: false, status: 'suspended' });
  await assert.rejects(call(riderB, 'select public.claim_delivery(gen_random_uuid())'), /Go online/);

  // Move Arjun's delivery into last week, which is over.
  const [{ monday }] = await asOwner<{ monday: string }>(
    db,
    `select (date_trunc('week', now() at time zone 'Asia/Kolkata')::date - 7)::text as monday`,
  );
  await asOwner(
    db,
    `update public.orders set completed_at = ($2::date + 2)::timestamp at time zone 'Asia/Kolkata'
     where rider_id = $1 and status = 'delivered'`,
    [riderA, monday],
  );
  await assert.rejects(call(student, 'select public.prepare_rider_payouts($1::date)', [monday]), /Only admins/);
  const [{ made }] = await call(admin, 'select public.prepare_rider_payouts($1::date) as made', [monday]);
  assert.equal(made, 1);
  const [{ again }] = await call(admin, 'select public.prepare_rider_payouts($1::date) as again', [monday]);
  assert.equal(again, 0);

  const [payout] = await call(riderA, 'select id, deliveries, amount_paise, paid_at from public.rider_payouts');
  assert.deepEqual({ deliveries: payout.deliveries, amount: payout.amount_paise, paid: payout.paid_at }, { deliveries: 1, amount: 1500, paid: null });
  await assert.rejects(call(admin, `select public.mark_payout_paid($1, ' ')`, [payout.id]), /UPI reference/);
  await call(admin, `select public.mark_payout_paid($1, 'UPI 4321')`, [payout.id]);
  assert.deepEqual(await call(riderB, 'select id from public.rider_payouts'), [], "riders don't see each other's payouts");
});

test('admins can set what riders earn per delivery', async () => {
  await asOwner(db, `insert into public.fee_rules (key, value_paise) values ('rider_payout', 1200)`);
  const [{ pay }] = await asOwner<{ pay: number }>(db, `select value_paise as pay from public.fee_rules where key = 'rider_payout'`);
  assert.equal(pay, 1200);
});
