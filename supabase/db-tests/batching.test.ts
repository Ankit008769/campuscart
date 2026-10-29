import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let riderA: string;
let riderB: string;
let kailash: string;
const owners: Record<string, string> = {};
const orderIds: string[] = [];

before(async () => {
  db = await createDb();
  for (const [key, shopId] of Object.entries({ general: SHOP.general, juice: SHOP.juice })) {
    await asOwner(db, 'insert into public.allowed_logins (email, role, shop_id) values ($1, $2, $3)', [`batch.${key}@gmail.com`, 'merchant_owner', shopId]);
    owners[shopId] = await addUser(db, `batch.${key}@gmail.com`, key);
  }
  kailash = await dropPointId(db, 'Kailash Hostel');
  riderA = await addUser(db, '22bce801@nith.ac.in', 'Rider A');
  riderB = await addUser(db, '22bce802@nith.ac.in', 'Rider B');
  for (const rider of [riderA, riderB]) {
    await asOwner(db, `update public.profiles set phone = '+919800000800' where id = $1`, [rider]);
    await as(db, rider, () => db.query(`select public.apply_as_rider('rider@okaxis')`));
    await asOwner(db, `update public.riders set status = 'approved', online = true where profile_id = $1`, [rider]);
  }

  // Four students in Kailash order from two shops at dinner time.
  const plan: [string, string][] = [
    [SHOP.general, VARIANT.maggi70g],
    [SHOP.general, VARIANT.laysClassic],
    [SHOP.juice, VARIANT.mangoShake],
    [SHOP.juice, VARIANT.mangoShake],
  ];
  for (const [i, [shopId, variant]] of plan.entries()) {
    const student = await addUser(db, `24bce81${i}@nith.ac.in`, `Student ${i}`);
    const order = await as(db, student, () =>
      placeOrder(db, { shopId, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: variant, qty: 1 }] }),
    );
    await as(db, owners[shopId], () => transition(db, order.id, 'accepted', { prepMinutes: 5 }));
    orderIds.push(order.id);
  }
});

type Offer = { drop_point_id: string; orders: number; shop_names: string[]; payout_paise: number; order_ids: string[] };
const offers = (rider: string) =>
  as(db, rider, async () => (await db.query<Offer>('select * from public.list_batch_offers()')).rows);

test('four orders for one hostel are offered as one batch, from both shops', async () => {
  const [offer] = await offers(riderA);
  assert.equal(offer.drop_point_id, kailash);
  assert.equal(offer.orders, 4);
  assert.deepEqual([...offer.shop_names].sort(), ['Campus General Store', 'Juice Corner']);
  assert.equal(offer.payout_paise, 4 * 1500);
});

test('one rider takes all four in a single trip; the other rider gets none', async () => {
  const [offer] = await offers(riderA);
  const [{ n }] = await as(db, riderA, async () =>
    (await db.query<{ n: number }>('select public.claim_batch($1, $2::uuid[]) as n', [kailash, offer.order_ids])).rows,
  );
  assert.equal(n, 4);
  await assert.rejects(
    as(db, riderB, () => db.query('select public.claim_batch($1, $2::uuid[])', [kailash, offer.order_ids])),
    /Another rider took these/,
  );
  const riders = await asOwner<{ rider_id: string }>(db, 'select distinct rider_id from public.orders where id = any($1::uuid[])', [orderIds]);
  assert.deepEqual(riders, [{ rider_id: riderA }]);
  const [{ trips }] = await asOwner<{ trips: number }>(
    db,
    'select count(distinct batch_id)::int as trips from public.batch_orders where order_id = any($1::uuid[])',
    [orderIds],
  );
  assert.equal(trips, 1);
  assert.deepEqual(await offers(riderB), []);
});

test('each order is still handed over with its own code, and the batch closes after the last', async () => {
  for (const id of orderIds) {
    const [{ shop_id }] = await asOwner<{ shop_id: string }>(db, 'select shop_id from public.orders where id = $1', [id]);
    await as(db, owners[shop_id], () => transition(db, id, 'ready'));
    await as(db, riderA, () => transition(db, id, 'out_for_delivery'));
  }
  const [{ delivery_otp: firstCode }] = await asOwner<{ delivery_otp: string }>(db, 'select delivery_otp from public.order_secrets where order_id = $1', [
    orderIds[0],
  ]);
  const [{ delivery_otp: secondCode }] = await asOwner<{ delivery_otp: string }>(db, 'select delivery_otp from public.order_secrets where order_id = $1', [
    orderIds[1],
  ]);
  if (firstCode !== secondCode) {
    await assert.rejects(as(db, riderA, () => transition(db, orderIds[1], 'delivered', { code: firstCode })), /Wrong delivery code/);
  }
  for (const id of orderIds) {
    const [{ delivery_otp }] = await asOwner<{ delivery_otp: string }>(db, 'select delivery_otp from public.order_secrets where order_id = $1', [id]);
    const [{ closed }] = await asOwner<{ closed: boolean }>(db, 'select b.closed_at is not null as closed from public.batches b join public.batch_orders bo on bo.batch_id = b.id where bo.order_id = $1', [id]);
    assert.equal(closed, false, 'still open until the last order');
    await as(db, riderA, () => transition(db, id, 'delivered', { code: delivery_otp }));
  }
  const [{ closed }] = await asOwner<{ closed: boolean }>(db, 'select bool_and(closed_at is not null) as closed from public.batches');
  assert.equal(closed, true);
});
