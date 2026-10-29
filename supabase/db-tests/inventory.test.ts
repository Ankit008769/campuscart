import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder, transition } from './harness.ts';

let db: PGlite;
let owner: string;
let student: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('stock.owner@gmail.com', 'merchant_owner', $1)`, [SHOP.general]);
  owner = await addUser(db, 'stock.owner@gmail.com', 'Owner');
  student = await addUser(db, '24bce600@nith.ac.in', 'Student');
});

const stock = async (variantId: string) =>
  (await asOwner<{ stock_qty: number | null; in_stock: boolean }>(db, 'select stock_qty, in_stock from public.variants where id = $1', [variantId]))[0];
const buy = (variantId: string, qty: number) =>
  as(db, student, () => placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: variantId, qty }] }));

test('orders take stock, and the last one sends the item out of the catalog on its own', async () => {
  // The shop counts 5 packets; staff may set the count themselves.
  await as(db, owner, () => db.query('update public.variants set stock_qty = 5 where id = $1', [VARIANT.laysClassic]));
  await buy(VARIANT.laysClassic, 3);
  assert.deepEqual(await stock(VARIANT.laysClassic), { stock_qty: 2, in_stock: true });

  const low = await asOwner<{ title: string; user_id: string }>(db, `select title, user_id from public.push_outbox where data ->> 'variantId' = $1`, [
    VARIANT.laysClassic,
  ]);
  assert.deepEqual(low, [{ title: 'Running low', user_id: owner }]);

  await assert.rejects(buy(VARIANT.laysClassic, 3), /Only 2 left of Lays Classic/);
  assert.deepEqual(await stock(VARIANT.laysClassic), { stock_qty: 2, in_stock: true }, 'a failed order takes nothing');

  await buy(VARIANT.laysClassic, 2);
  assert.deepEqual(await stock(VARIANT.laysClassic), { stock_qty: 0, in_stock: false });
  const hits = await as(db, student, async () =>
    (await db.query<{ available: boolean; name: string }>(`select name, available from public.search_catalog('lays classic')`)).rows,
  );
  assert.ok(hits.every((h) => !h.available), 'no longer offered to students');
});

test('a rejected order puts its items back on the shelf', async () => {
  await asOwner(db, 'update public.variants set stock_qty = 1, in_stock = true where id = $1', [VARIANT.milk]);
  const order = await buy(VARIANT.milk, 1);
  assert.deepEqual(await stock(VARIANT.milk), { stock_qty: 0, in_stock: false });
  await as(db, owner, () => transition(db, order.id, 'rejected', { note: 'Spilt' }));
  assert.deepEqual(await stock(VARIANT.milk), { stock_qty: 1, in_stock: true });
});

test('sizes the shop does not count are never limited', async () => {
  assert.equal((await stock(VARIANT.maggi70g)).stock_qty, null);
  await buy(VARIANT.maggi70g, 50);
  assert.deepEqual(await stock(VARIANT.maggi70g), { stock_qty: null, in_stock: true });
});

test('missed searches are kept without who searched, and shown to owners and admins only', async () => {
  for (let i = 0; i < 3; i++) await as(db, student, () => db.query(`select public.log_search('Red  Bull', 0)`));
  await as(db, student, () => db.query(`select public.log_search('maggi', 4)`));
  await as(db, student, () => db.query(`select public.log_search('x', 0)`));

  const columns = await asOwner<{ column_name: string }>(db, `select column_name from information_schema.columns where table_name = 'search_logs'`);
  assert.ok(!columns.some((c) => /student|user|profile/.test(c.column_name)), 'no column says who searched');

  const report = await as(db, owner, async () =>
    (await db.query<{ query: string; searches: number }>(`select * from public.missed_demand(now() - interval '1 day', now() + interval '1 minute')`)).rows,
  );
  assert.deepEqual(report.map((r) => [r.query, r.searches]), [['red bull', 3]]);
  await assert.rejects(as(db, student, () => db.query(`select * from public.missed_demand(now() - interval '1 day', now())`)), /Only admins and shop owners/);
  await assert.rejects(as(db, student, () => db.query('select * from public.search_logs')), /permission denied/);
});
