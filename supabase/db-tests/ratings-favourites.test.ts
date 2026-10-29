import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder, transition } from './harness.ts';

let db: PGlite;
let owner: string;
let student: string;
let other: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('rate.shop@gmail.com', 'merchant_owner', $1)`, [
    SHOP.general,
  ]);
  owner = await addUser(db, 'rate.shop@gmail.com', 'Owner');
  student = await addUser(db, '24bch400@nith.ac.in', 'Pooja');
  other = await addUser(db, '24bch401@nith.ac.in', 'Sahil');
});

/** A pickup order of Maggi taken all the way to collected. */
async function collectedOrder(userId: string, variantId: string = VARIANT.maggi70g) {
  const order = await as(db, userId, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: variantId, qty: 1 }] }),
  );
  await as(db, owner, async () => {
    await transition(db, order.id, 'accepted', { prepMinutes: 5 });
    await transition(db, order.id, 'ready');
    await transition(db, order.id, 'collected', { code: String(order.token_no) });
  });
  return order;
}

const rate = (userId: string, orderId: string, stars: number, riderStars: number | null = null, comment: string | null = null) =>
  as(db, userId, () => db.query('select public.rate_order($1, $2, $3, $4)', [orderId, stars, riderStars, comment]));

test('students rate completed orders once (changing it is fine), and only their own', async () => {
  const open = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await assert.rejects(rate(student, open.id, 5), /once you have it/);

  const done = await collectedOrder(student);
  await rate(student, done.id, 2, null, 'Cold');
  await rate(student, done.id, 4, null, 'Fine after all');
  const rows = await asOwner<{ shop_stars: number; comment: string }>(db, 'select shop_stars, comment from public.order_ratings where order_id = $1', [
    done.id,
  ]);
  assert.deepEqual(rows, [{ shop_stars: 4, comment: 'Fine after all' }]);

  await assert.rejects(rate(other, done.id, 1), /Order not found/);
  await assert.rejects(rate(student, done.id, 6), /1 to 5 stars/);
  await assert.rejects(rate(student, done.id, 5, 5), /orders a rider delivered/);

  const shopView = await as(db, owner, async () => (await db.query('select order_id from public.order_ratings')).rows);
  assert.equal(shopView.length, 1);
  assert.deepEqual(await as(db, other, async () => (await db.query('select * from public.order_ratings')).rows), []);
});

test('shop averages appear only from 3 ratings', async () => {
  const average = async () =>
    (await as(db, other, async () => (await db.query<{ shop_id: string; average: string; ratings: number }>('select * from public.shop_ratings()')).rows)).find(
      (r) => r.shop_id === SHOP.general,
    );
  assert.equal(await average(), undefined);
  await rate(student, (await collectedOrder(student)).id, 5);
  await rate(other, (await collectedOrder(other)).id, 3);
  const summary = await average();
  assert.equal(summary?.ratings, 3);
  assert.equal(Number(summary?.average), 4);
});

test('favourites and stock alerts are private to each student', async () => {
  const [{ id: productId }] = await asOwner<{ id: string }>(db, 'select product_id as id from public.variants where id = $1', [VARIANT.maggi70g]);
  await as(db, student, () => db.query('insert into public.favourites (product_id) values ($1)', [productId]));
  await assert.rejects(
    as(db, other, () => db.query('insert into public.favourites (student_id, product_id) values ($1, $2)', [student, productId])),
    /row-level security/,
  );
  assert.deepEqual(await as(db, other, async () => (await db.query('select * from public.favourites')).rows), []);
});

test('buy again lists items from completed orders that are on sale now', async () => {
  const items = await as(db, student, async () =>
    (await db.query<{ variant_id: string; shop_name: string }>('select variant_id, shop_name from public.buy_again()')).rows,
  );
  assert.deepEqual(
    items.map((i) => i.variant_id),
    [VARIANT.maggi70g],
  );
  await asOwner(db, 'update public.variants set in_stock = false where id = $1', [VARIANT.maggi70g]);
  assert.deepEqual(await as(db, student, async () => (await db.query('select * from public.buy_again()')).rows), []);
});

test('a size coming back in stock notifies everyone who asked, once', async () => {
  // Maggi is out of stock from the test above.
  await as(db, student, () => db.query('insert into public.stock_alerts (variant_id) values ($1)', [VARIANT.maggi70g]));
  await as(db, other, () => db.query('insert into public.stock_alerts (variant_id) values ($1)', [VARIANT.maggi70g]));
  await as(db, owner, () => db.query('update public.variants set in_stock = true where id = $1', [VARIANT.maggi70g]));

  const pushes = await asOwner<{ user_id: string; title: string }>(
    db,
    `select user_id, title from public.push_outbox where title = 'Back in stock' order by user_id`,
  );
  assert.deepEqual(pushes.map((p) => p.user_id).sort(), [student, other].sort());
  const [{ left }] = await asOwner<{ left: number }>(db, 'select count(*)::int as left from public.stock_alerts');
  assert.equal(left, 0);

  await as(db, owner, async () => {
    await db.query('update public.variants set in_stock = false where id = $1', [VARIANT.maggi70g]);
    await db.query('update public.variants set in_stock = true where id = $1', [VARIANT.maggi70g]);
  });
  const [{ n }] = await asOwner<{ n: number }>(db, `select count(*)::int as n from public.push_outbox where title = 'Back in stock'`);
  assert.equal(n, 2, 'no second round of alerts');
});
