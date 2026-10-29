import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder, transition } from './harness.ts';

let db: PGlite;
let admin: string;
let owner: string;
let student: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values ('picks.owner@gmail.com', 'merchant_owner', $1), ('picks.admin@gmail.com', 'admin', null)`,
    [SHOP.general],
  );
  owner = await addUser(db, 'picks.owner@gmail.com', 'Owner');
  admin = await addUser(db, 'picks.admin@gmail.com', 'Ops');
  student = await addUser(db, '24bce500@nith.ac.in', 'Student');

  // Three completed orders of Maggi with Lays, one of Maggi with milk.
  const baskets = [
    [VARIANT.maggi70g, VARIANT.laysClassic],
    [VARIANT.maggi70g, VARIANT.laysClassic],
    [VARIANT.maggi70g, VARIANT.laysClassic],
    [VARIANT.maggi70g, VARIANT.milk],
  ];
  for (const basket of baskets) {
    const order = await as(db, student, () =>
      placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: basket.map((variant_id) => ({ variant_id, qty: 1 })) }),
    );
    await as(db, owner, async () => {
      await transition(db, order.id, 'accepted', { prepMinutes: 5 });
      await transition(db, order.id, 'ready');
      await transition(db, order.id, 'collected', { code: String(order.token_no) });
    });
  }
});

const master = async (variantId: string) =>
  (await asOwner<{ m: string }>(db, 'select master_product_id as m from public.variants where id = $1', [variantId]))[0].m;

test('the nightly refresh learns what is bought together, and picks follow it', async () => {
  const [{ pairs }] = await asOwner<{ pairs: number }>(db, 'select public.refresh_smart_picks() as pairs');
  assert.ok(pairs >= 4);
  const picks = await as(db, student, async () =>
    (await db.query<{ master_product_id: string; together: number }>('select * from public.smart_picks($1::uuid[])', [[VARIANT.maggi70g]])).rows,
  );
  assert.deepEqual(
    picks.map((p) => [p.master_product_id, p.together]),
    [
      [await master(VARIANT.laysClassic), 3],
      [await master(VARIANT.milk), 1],
    ],
  );

  // What's already in the cart, or out of stock, is never suggested.
  const withLays = await as(db, student, async () =>
    (await db.query<{ master_product_id: string }>('select * from public.smart_picks($1::uuid[])', [[VARIANT.maggi70g, VARIANT.laysClassic]])).rows,
  );
  assert.deepEqual(withLays.map((p) => p.master_product_id), [await master(VARIANT.milk)]);
  await asOwner(db, 'update public.variants set in_stock = false where id = $1', [VARIANT.milk]);
  assert.deepEqual(
    await as(db, student, async () => (await db.query('select * from public.smart_picks($1::uuid[])', [[VARIANT.maggi70g, VARIANT.laysClassic]])).rows),
    [],
  );
});

test('admins curate collections; students see running ones with what is available', async () => {
  const [{ id }] = await as(db, admin, async () =>
    (await db.query<{ id: string }>(`insert into public.collections (title, subtitle) values ('Exam night kit', 'Stay up, stay fed') returning id`)).rows,
  );
  await as(db, admin, async () => {
    await db.query('insert into public.collection_items (collection_id, master_product_id) values ($1, $2), ($1, $3)', [
      id,
      await master(VARIANT.maggi70g),
      await master(VARIANT.notebook),
    ]);
  });
  const shown = await as(db, student, async () => (await db.query<{ title: string; name: string }>('select * from public.collection_products()')).rows);
  assert.equal(shown.length, 2);
  assert.ok(shown.every((r) => r.title === 'Exam night kit'));
  await assert.rejects(as(db, student, () => db.query(`insert into public.collections (title) values ('Mine')`)), /row-level security/);
});
