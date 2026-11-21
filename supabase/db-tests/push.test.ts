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

test('a new order rings the shop until it would be dropped; other shop pushes do not ring', async () => {
  const order = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await as(db, student, () => transition(db, order.id, 'cancelled'));
  const rows = await asOwner<{ title: string; ring: string | null; until: string | null; expected: string }>(
    db,
    `select p.title, p.data ->> 'ring' as ring, p.data ->> 'ringUntil' as until,
            (extract(epoch from o.placed_at + interval '7 minutes') * 1000)::bigint::text as expected
     from public.push_outbox p join public.orders o on o.id = $1::uuid
     where p.app = 'merchant' and p.data ->> 'orderId' = $1::text order by p.id`,
    [order.id],
  );
  assert.equal(rows.length, 2);
  assert.match(rows[0].title, /^New order #/);
  assert.equal(rows[0].ring, 'true');
  assert.equal(rows[0].until, rows[0].expected);
  assert.equal(rows[1].ring, null, 'the cancelled note does not ring');
});

test('a shop can cancel an order it accepted or packed, and the student is told who and why', async () => {
  const accepted = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  const packed = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
  );
  await as(db, owner, async () => {
    await transition(db, accepted.id, 'accepted', { prepMinutes: 5 });
    await assert.rejects(transition(db, accepted.id, 'cancelled'), /Give a reason/);
    await transition(db, accepted.id, 'cancelled', { note: 'Accepted by mistake' });
    await transition(db, packed.id, 'accepted', { prepMinutes: 5 });
    await transition(db, packed.id, 'ready');
    await transition(db, packed.id, 'cancelled', { note: 'Item out of stock' });
  });
  // Students still cannot cancel once the shop has accepted.
  const third = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await as(db, owner, () => transition(db, third.id, 'accepted', { prepMinutes: 5 }));
  await as(db, student, async () => {
    await assert.rejects(transition(db, third.id, 'cancelled'), /cannot move from accepted to cancelled/);
  });

  for (const [order, reason] of [
    [accepted, 'Accepted by mistake'],
    [packed, 'Item out of stock'],
  ] as const) {
    const last = (await pushesFor(order.id)).at(-1);
    assert.equal(last?.app, 'consumer');
    assert.match(last?.title ?? '', / had to cancel your order$/);
    assert.equal(last?.body, `${reason}. Nothing to pay. Sorry about that.`);
    const [row] = await asOwner<{ status: string; cancel_reason: string }>(
      db,
      'select status, cancel_reason from public.orders where id = $1',
      [order.id],
    );
    assert.deepEqual(row, { status: 'cancelled', cancel_reason: reason });
  }
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
    await assert.rejects(db.query(`select public.register_device_token('consumer', 'not-a-token')`), /Not a push token/);
  });
});

test('Android phones can register their Firebase token instead', async () => {
  const fcm = `fXyZ12-ab_cd:APA91b${'Hk3_x-Q9'.repeat(18)}`;
  await as(db, student, () => db.query(`select public.register_device_token('consumer', $1)`, [fcm]));
  const rows = await asOwner(db, 'select app from public.device_tokens where expo_token = $1', [fcm]);
  assert.deepEqual(rows, [{ app: 'consumer' }]);
  await as(db, student, async () => {
    await assert.rejects(db.query(`select public.register_device_token('consumer', 'short:token')`), /Not a push token/);
    await assert.rejects(db.query(`select public.register_device_token('consumer', $1)`, [`${'a'.repeat(120)} ${'b'.repeat(10)}`]), /Not a push token/);
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
