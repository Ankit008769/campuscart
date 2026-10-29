import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let owner: string;
let student: string;
let rider: string;
let stranger: string;
let orderId: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('track.shop@gmail.com', 'merchant_owner', $1)`, [
    SHOP.general,
  ]);
  owner = await addUser(db, 'track.shop@gmail.com', 'Owner');
  student = await addUser(db, '23bme900@nith.ac.in', 'Student');
  rider = await addUser(db, '22bme901@nith.ac.in', 'Rider');
  stranger = await addUser(db, '22bme902@nith.ac.in', 'Stranger');
  const kailash = await dropPointId(db, 'Kailash Hostel');
  await asOwner(db, `update public.profiles set phone = '+919800000901' where id = $1`, [rider]);
  await as(db, rider, () => db.query(`select public.apply_as_rider('rider@okaxis')`));
  await asOwner(db, `update public.riders set status = 'approved', online = true where profile_id = $1`, [rider]);

  const order = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  orderId = order.id;
  await as(db, owner, () => transition(db, orderId, 'accepted', { prepMinutes: 5 }));
  await as(db, rider, () => db.query('select public.claim_delivery($1)', [orderId]));
  await as(db, owner, () => transition(db, orderId, 'ready'));
});

const may = (userId: string, topic: string, send: boolean) =>
  as(db, userId, async () => (await db.query<{ ok: boolean }>('select public.can_use_tracking_channel($1, $2) as ok', [topic, send])).rows[0].ok);

test('tracking opens only while the rider is on the way, and stops once delivered', async () => {
  const topic = `track:${orderId}`;
  assert.equal(await may(rider, topic, true), false, 'not before pickup');

  await as(db, rider, () => transition(db, orderId, 'out_for_delivery'));
  assert.equal(await may(rider, topic, true), true, 'the rider sends');
  assert.equal(await may(student, topic, false), true, 'the student follows');
  assert.equal(await may(student, topic, true), false, 'the student cannot send positions');
  assert.equal(await may(stranger, topic, false), false, 'nobody else listens');
  assert.equal(await may(owner, topic, false), false, 'not even the shop');

  const [{ delivery_otp }] = await asOwner<{ delivery_otp: string }>(db, 'select delivery_otp from public.order_secrets where order_id = $1', [
    orderId,
  ]);
  await as(db, rider, () => transition(db, orderId, 'delivered', { code: delivery_otp }));
  assert.equal(await may(rider, topic, true), false, 'sending stops at delivery');
  assert.equal(await may(student, topic, false), false, 'and so does listening');
});

test('other topics are never tracking channels', async () => {
  assert.equal(await may(rider, 'track:not-a-uuid', true), false);
  assert.equal(await may(rider, `orders:${orderId}`, true), false);
});
