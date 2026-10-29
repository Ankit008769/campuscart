import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let student: string;
let owner: string;
let kailash: string;

const STUDENT_TOKEN = 'ExponentPushToken[student-phone-0001]';
const SHOP_TOKEN = 'ExponentPushToken[shop-tablet-0001]';

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values ('push.owner@gmail.com', 'merchant_owner', $1)`,
    [SHOP.general],
  );
  student = await addUser(db, '23bee050@nith.ac.in', 'Kabir');
  owner = await addUser(db, 'push.owner@gmail.com', 'Shop Owner');
  kailash = await dropPointId(db, 'Kailash Hostel');
  await as(db, student, () => db.query(`select public.register_device_token('consumer', $1)`, [STUDENT_TOKEN]));
  await as(db, owner, () => db.query(`select public.register_device_token('merchant', $1)`, [SHOP_TOKEN]));
});

type Push = { user_id: string; app: string; title: string; body: string };
const pushesFor = async (orderId: string) =>
  asOwner<Push>(db, `select user_id, app, title, body from public.push_outbox where data ->> 'orderId' = $1 order by id`, [
    orderId,
  ]);

test('a new order alerts the shop, and each step after it tells the student', async () => {
  const order = await as(db, student, () =>
    placeOrder(db, {
      shopId: SHOP.general,
      mode: 'delivery',
      dropPointId: kailash,
      items: [{ variant_id: VARIANT.maggi70g, qty: 2 }],
    }),
  );
  await as(db, owner, async () => {
    await transition(db, order.id, 'accepted', { prepMinutes: 7 });
    await transition(db, order.id, 'ready');
    await transition(db, order.id, 'out_for_delivery');
  });

  const pushes = await pushesFor(order.id);
  assert.deepEqual(
    pushes.map((p) => [p.app, p.user_id === student ? 'student' : p.user_id === owner ? 'owner' : 'other', p.title]),
    [
      ['merchant', 'owner', pushes[0].title],
      ['consumer', 'student', pushes[1].title],
      ['consumer', 'student', 'Your order is packed'],
      ['consumer', 'student', 'On the way'],
    ],
  );
  assert.match(pushes[0].title, /^New order #/);
  assert.match(pushes[0].body, /^2 items · ₹\d+(\.\d\d)? · Deliver to Kailash Hostel$/);
  assert.equal(pushes[1].body, 'Ready in about 7 min.');
  // The delivery code never goes on the lock screen.
  const [{ delivery_otp }] = await asOwner<{ delivery_otp: string }>(
    db,
    'select delivery_otp from public.order_secrets where order_id = $1',
    [order.id],
  );
  assert.ok(pushes.every((p) => !p.body.includes(delivery_otp)));
});

test('a student cancelling tells the shop; a shop rejecting tells the student why', async () => {
  const cancelled = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await as(db, student, () => transition(db, cancelled.id, 'cancelled'));
  const cancelPushes = await pushesFor(cancelled.id);
  assert.deepEqual(
    cancelPushes.map((p) => p.app),
    ['merchant', 'merchant'],
  );
  assert.match(cancelPushes[0].title, /^New order #/);
  assert.match(cancelPushes[1].title, /^Order #.+ was cancelled$/);

  const rejected = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await as(db, owner, () => transition(db, rejected.id, 'rejected', { note: 'Out of Maggi' }));
  const last = (await pushesFor(rejected.id)).at(-1);
  assert.equal(last?.app, 'consumer');
  assert.equal(last?.body, 'Out of Maggi. Nothing to pay.');
});

test('send-push claims each message once, one row per registered device', async () => {
  const claim = async () => {
    await db.exec('set role service_role');
    try {
      return (await db.query<{ expo_token: string }>('select * from public.claim_push_batch(100)')).rows;
    } finally {
      await db.exec('reset role');
    }
  };
  const first = await claim();
  assert.ok(first.length > 0);
  assert.ok(first.every((row) => row.expo_token === STUDENT_TOKEN || row.expo_token === SHOP_TOKEN));
  const again = await claim();
  assert.equal(again.length, 0);
});

test('a phone that signs into another account moves its token, and bad tokens are refused', async () => {
  const friend = await addUser(db, '23bee051@nith.ac.in', 'Friend');
  await as(db, friend, () => db.query(`select public.register_device_token('consumer', $1)`, [STUDENT_TOKEN]));
  const owners = await asOwner<{ user_id: string }>(db, 'select user_id from public.device_tokens where expo_token = $1', [
    STUDENT_TOKEN,
  ]);
  assert.deepEqual(owners, [{ user_id: friend }]);

  await as(db, friend, async () => {
    await assert.rejects(db.query(`select public.register_device_token('consumer', 'not-a-token')`), /Not an Expo push token/);
  });
});

test('app users cannot read the outbox or call the sender functions', async () => {
  await as(db, student, async () => {
    await assert.rejects(db.query('select * from public.push_outbox'), /permission denied/);
    await assert.rejects(db.query('select * from public.claim_push_batch(10)'), /permission denied/);
    await assert.rejects(db.query(`select public.forget_device_tokens(array['x'])`), /permission denied/);
  });
  await as(db, null, async () => {
    await assert.rejects(db.query(`select public.register_device_token('consumer', $1)`, [STUDENT_TOKEN]), /permission denied/);
  });
});
