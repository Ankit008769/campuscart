import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder } from './harness.ts';

let db: PGlite;
let admin: string;
let student: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('master.admin@gmail.com', 'admin')`);
  admin = await addUser(db, 'master.admin@gmail.com', 'Ops');
  student = await addUser(db, '24bce950@nith.ac.in', 'Student');
});

/** Adds an item with one size to a shop, as an admin would. */
const addItem = (shopId: string, name: string, size: string, price = 2000) =>
  as(db, admin, async () =>
    (
      await db.query<{ id: string }>(
        `select public.save_product(p_shop_id => $1, p_name => $2, p_variants => $3::jsonb) as id`,
        [shopId, name, JSON.stringify([{ label: size, price_paise: price, mrp_paise: price }])],
      )
    ).rows[0].id,
  );
const masterOf = async (productId: string) =>
  (await asOwner<{ m: string }>(db, 'select master_product_id as m from public.variants where product_id = $1', [productId]))[0].m;

test('every size on every menu maps to exactly one master product', async () => {
  const [{ unmapped }] = await asOwner<{ unmapped: number }>(db, 'select count(*)::int as unmapped from public.variants where master_product_id is null');
  assert.equal(unmapped, 0);
  const [{ variants, masters }] = await asOwner<{ variants: number; masters: number }>(
    db,
    'select count(*)::int as variants, count(distinct master_product_id)::int as masters from public.variants',
  );
  assert.ok(masters > 0 && masters <= variants);
});

test('the same item at two shops is one master with two listings, whatever the spacing or case', async () => {
  const general = await addItem(SHOP.general, 'Parle-G Biscuit', '70 g', 1000);
  const juice = await addItem(SHOP.juice, '  parle-g   biscuit ', '70 G', 1200);
  assert.equal(await masterOf(general), await masterOf(juice));
  const different = await addItem(SHOP.juice, 'Parle-G Biscuit', '250 g', 3000);
  assert.notEqual(await masterOf(different), await masterOf(general));

  const [row] = await as(db, admin, async () =>
    (await db.query<{ shops: number; min_price_paise: number; max_price_paise: number }>(`select * from public.list_master_products('parle-g')`)).rows.filter(
      (r) => r.shops === 2,
    ),
  );
  assert.deepEqual([row.min_price_paise, row.max_price_paise], [1000, 1200]);
});

test('merging duplicates moves listings, keeps old bills as they were, and stays merged', async () => {
  const lays = await addItem(SHOP.general, 'Lays Classic Salted', '52 g');
  const laysApostrophe = await addItem(SHOP.juice, "Lay's Classic Salted", '52 g');
  const keep = await masterOf(lays);
  const merge = await masterOf(laysApostrophe);
  assert.notEqual(keep, merge);

  const [variant] = await asOwner<{ id: string }>(db, 'select id from public.variants where product_id = $1', [laysApostrophe]);
  const order = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.juice, mode: 'pickup', items: [{ variant_id: variant.id, qty: 1 }] }),
  );
  const billBefore = await asOwner(db, 'select name_snapshot, price_paise_snapshot from public.order_items where order_id = $1', [order.id]);

  await assert.rejects(as(db, student, () => db.query('select public.merge_master_products($1, $2)', [keep, merge])), /Only admins/);
  const [{ moved }] = await as(db, admin, async () =>
    (await db.query<{ moved: number }>('select public.merge_master_products($1, $2) as moved', [keep, merge])).rows,
  );
  assert.equal(moved, 1);
  assert.equal(await masterOf(laysApostrophe), keep);
  assert.deepEqual(await asOwner(db, 'select name_snapshot, price_paise_snapshot from public.order_items where order_id = $1', [order.id]), billBefore);

  // Another shop adding the apostrophe spelling joins the kept master, not a new duplicate.
  const again = await addItem(SHOP.stationery, "Lay's Classic Salted", '52 g');
  assert.equal(await masterOf(again), keep);
});

test('students read the master catalog but cannot change it', async () => {
  const [{ m }] = await asOwner<{ m: string }>(db, 'select master_product_id as m from public.variants where id = $1', [VARIANT.maggi70g]);
  await as(db, student, async () => {
    assert.equal((await db.query('select id from public.master_products where id = $1', [m])).rows.length, 1);
    assert.deepEqual((await db.query(`update public.master_products set name = 'x' where id = $1 returning id`, [m])).rows, []);
    assert.deepEqual((await db.query('select * from public.list_master_products()')).rows, []);
  });
});
