import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let owner: string;
let otherOwner: string;
let student: string;
let rider: string;
let stranger: string;
let admin: string;
let orderId: string;
let cartId: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('channels.shop@gmail.com', 'merchant_owner', $1),
       ('channels.other@gmail.com', 'merchant_owner', $2),
       ('channels.admin@gmail.com', 'admin', null)`,
    [SHOP.general, SHOP.stationery],
  );
  owner = await addUser(db, 'channels.shop@gmail.com', 'Owner');
  otherOwner = await addUser(db, 'channels.other@gmail.com', 'Other owner');
  admin = await addUser(db, 'channels.admin@gmail.com', 'Admin');
  student = await addUser(db, '23bme910@nith.ac.in', 'Student');
  rider = await addUser(db, '22bme911@nith.ac.in', 'Rider');
  stranger = await addUser(db, '22bme912@nith.ac.in', 'Stranger');
  const kailash = await dropPointId(db, 'Kailash Hostel');
  await asOwner(db, `update public.profiles set phone = '+919800000911' where id = $1`, [rider]);
  await as(db, rider, () => db.query(`select public.apply_as_rider('rider911@okaxis')`));
  await asOwner(db, `update public.riders set status = 'approved', online = true where profile_id = $1`, [rider]);

  const order = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  orderId = order.id;
  await as(db, owner, () => transition(db, orderId, 'accepted', { prepMinutes: 5 }));
  await as(db, rider, () => db.query('select public.claim_delivery($1)', [orderId]));

  [{ id: cartId }] = await asOwner<{ id: string }>(db, `insert into public.carts (student_id, mode) values ($1, 'pickup') returning id`, [
    student,
  ]);
});

const may = (userId: string, topic: string) =>
  as(db, userId, async () => (await db.query<{ ok: boolean }>('select public.can_watch_orders_channel($1) as ok', [topic])).rows[0].ok);

test('students, riders and shops join only their own order lists', async () => {
  assert.equal(await may(student, `orders:student_id=eq.${student}:abc123`), true, 'own orders');
  assert.equal(await may(stranger, `orders:student_id=eq.${student}:abc123`), false, "someone else's orders");
  assert.equal(await may(rider, `orders:rider_id=eq.${rider}:x9`), true, 'own deliveries');
  assert.equal(await may(student, `orders:rider_id=eq.${rider}:x9`), false, "a rider's deliveries");
  assert.equal(await may(owner, `orders:shop_id=eq.${SHOP.general}:k2`), true, 'own shop');
  assert.equal(await may(otherOwner, `orders:shop_id=eq.${SHOP.general}:k2`), false, 'another shop');
  assert.equal(await may(student, `orders:shop_id=eq.${SHOP.general}:k2`), false, 'a student on a shop list');
});

test('one order is watched by the people on it, and a cart only by its student', async () => {
  const topic = `orders:id=eq.${orderId}:q1`;
  assert.equal(await may(student, topic), true, 'the student');
  assert.equal(await may(rider, topic), true, 'the rider');
  assert.equal(await may(owner, topic), true, 'the shop');
  assert.equal(await may(otherOwner, topic), false, 'another shop');
  assert.equal(await may(stranger, topic), false, 'a stranger');
  assert.equal(await may(student, `orders:cart_id=eq.${cartId}:z`), true, 'own cart');
  assert.equal(await may(stranger, `orders:cart_id=eq.${cartId}:z`), false, "someone else's cart");
});

test('only admins watch every order, and admins may watch any list', async () => {
  assert.equal(await may(admin, 'orders:all:b7'), true);
  assert.equal(await may(owner, 'orders:all:b7'), false);
  assert.equal(await may(student, 'orders:all:b7'), false);
  assert.equal(await may(admin, `orders:shop_id=eq.${SHOP.general}:b7`), true);
  assert.equal(await may(admin, `orders:id=eq.${orderId}:b7`), true);
});

test('other topics and malformed filters are refused', async () => {
  assert.equal(await may(student, `track:${orderId}`), false, 'tracking channels have their own rule');
  assert.equal(await may(student, `orders:student_id=eq.${student}`), false, 'no suffix');
  assert.equal(await may(student, `orders:student_id=neq.${student}:a`), false, 'other operators');
  assert.equal(await may(student, `orders:status=eq.placed:a`), false, 'other columns');
  assert.equal(await may(student, `orders:student_id=eq.not-a-uuid:a`), false, 'not a uuid');
  assert.equal(await may(student, `orders:student_id=eq.${student}:a:b`), false, 'extra parts');
});
