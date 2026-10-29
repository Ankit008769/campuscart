import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, as, asOwner, createDb, dropPointId, placeOrder } from './harness.ts';

const BOOTH4 = '1b49b574-f12e-4a50-8fcf-cd452cd8f9c8';
const CANTEEN = '54477a30-8971-4648-841b-6d397da37cc9';

let db: PGlite;
before(async () => {
  db = await createDb();
});

test('both real shops arrive with their full menus', async () => {
  const rows = await asOwner<{ name: string; products: number; variants: number }>(
    db,
    `select s.name, count(distinct p.id)::int as products, count(v.id)::int as variants
     from public.shops s join public.products p on p.shop_id = s.id join public.variants v on v.product_id = p.id
     where s.id in ($1, $2) group by s.name order by s.name`,
    [BOOTH4, CANTEEN],
  );
  // 108 + 58 menu rows in the CSVs.
  assert.deepEqual(rows.map((r) => [r.name, r.variants]), [
    ['4H Canteen', 58],
    ['Jai Santoshi Maa - Booth 4', 108],
  ]);
});

test('menu prices come through in paise, with MRP equal to price', async () => {
  const [burger] = await asOwner<{ price_paise: number; mrp_paise: number }>(
    db,
    `select v.price_paise, v.mrp_paise from public.variants v join public.products p on p.id = v.product_id
     where p.shop_id = $1 and p.name = 'Aloo Tikki Burger'`,
    [BOOTH4],
  );
  assert.deepEqual(burger, { price_paise: 4000, mrp_paise: 4000 });

  const sizes = await asOwner<{ label: string }>(
    db,
    `select v.label from public.variants v join public.products p on p.id = v.product_id
     where p.shop_id = $1 and p.name = 'Mango Shake' order by v.sort`,
    [BOOTH4],
  );
  assert.equal(sizes.length, 2);
});

test('every photo carries its credit and source, and no item is claimed veg', async () => {
  const [counts] = await asOwner<{ photos: number; uncredited: number; veg: number }>(
    db,
    `select count(*) filter (where image_path is not null)::int as photos,
            count(*) filter (where image_path is not null and (photo_credit is null or photo_source_url is null))::int as uncredited,
            count(*) filter (where is_veg)::int as veg
     from public.products where shop_id in ($1, $2)`,
    [BOOTH4, CANTEEN],
  );
  assert.equal(counts.photos, 123);
  assert.equal(counts.uncredited, 0);
  assert.equal(counts.veg, 0);
});

test('canteen timing notes survive the import', async () => {
  const notes = await asOwner<{ availability_note: string }>(
    db,
    `select distinct availability_note from public.products where shop_id = $1 and availability_note is not null order by 1`,
    [CANTEEN],
  );
  assert.ok(notes.some((n) => n.availability_note === 'Sunday only'));
});

test('a student can order from an imported menu', async () => {
  const student = await addUser(db, '23bec101@nith.ac.in');
  const [variant] = await asOwner<{ id: string }>(
    db,
    `select v.id from public.variants v join public.products p on p.id = v.product_id
     where p.shop_id = $1 and p.name = 'Boiled Egg'`,
    [CANTEEN],
  );
  const kailash = await dropPointId(db, 'Kailash Hostel');
  const order = await as(db, student, () =>
    placeOrder(db, { shopId: CANTEEN, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: variant.id, qty: 2 }] }),
  );
  assert.equal(order.subtotal_paise, 3000);
});
