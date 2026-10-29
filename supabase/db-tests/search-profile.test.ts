import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder } from './harness.ts';

let db: PGlite;
let student: string;
before(async () => {
  db = await createDb();
  student = await addUser(db, '24bcs010@nith.ac.in', 'Neha');
});

type Hit = { name: string; shop_name: string; min_price_paise: number };
const search = (query: string | null, categoryId: string | null = null) =>
  as(db, student, async () =>
    (await db.query<Hit>('select name, shop_name, min_price_paise from public.search_products($1, $2)', [query, categoryId])).rows,
  );

test('search forgives typos: "magi" finds Maggi', async () => {
  const names = (await search('magi')).map((h) => h.name);
  assert.ok(names.includes('Maggi Masala Noodles'), names.join(', '));
});

test('search matches inside names, across shops, in any letter case', async () => {
  const hits = await search('SHAKE');
  assert.ok(hits.some((h) => h.name === 'Mango Shake' && h.shop_name === 'Juice Corner'));
  assert.ok(hits.some((h) => h.shop_name === 'Jai Santoshi Maa - Booth 4'));
});

test('a category filter narrows results, and an empty query lists the category', async () => {
  const [stationery] = await asOwner<{ id: string }>(db, `select id from public.categories where name = 'Stationery'`);
  const hits = await search(null, stationery.id);
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => h.shop_name === 'Stationery and Print Corner'));
});

test('search results carry the photo credit the CC licences require', async () => {
  await asOwner(
    db,
    `update public.products set photo_credit = 'Photo: A. Person, CC BY 4.0', photo_source_url = 'https://example.org/p' where name = 'Mango Shake'`,
  );
  const [hit] = await as(db, student, async () =>
    (
      await db.query<{ photo_credit: string; photo_source_url: string }>(
        `select photo_credit, photo_source_url from public.search_products('mango shake')`,
      )
    ).rows,
  );
  assert.deepEqual(hit, { photo_credit: 'Photo: A. Person, CC BY 4.0', photo_source_url: 'https://example.org/p' });
});

test('signed-out visitors cannot search', async () => {
  await as(db, null, async () => {
    await assert.rejects(db.query(`select * from public.search_products('maggi')`), /permission denied/);
  });
});

test('category tiles only list categories with active products', async () => {
  await asOwner(db, `insert into public.categories (name, sort) values ('Empty shelf', 999)`);
  const names = await as(db, student, async () =>
    (await db.query<{ name: string }>('select name from public.list_categories()')).rows.map((r) => r.name),
  );
  assert.ok(names.includes('Snacks'));
  assert.ok(!names.includes('Empty shelf'));
});

test('a deletion request wipes contact details, blocks the account and keeps past orders', async () => {
  const kailash = await dropPointId(db, 'Kailash Hostel');
  const leaver = await addUser(db, '20bme777@nith.ac.in', 'Leaving Student');
  await as(db, leaver, async () => {
    await db.query(`update public.profiles set phone = '+919800000000', room_note = 'C-12', default_drop_point_id = $2 where id = $1`, [leaver, kailash]);
    await placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] });
    await db.query('select public.request_account_deletion()');
  });

  const [profile] = await asOwner<Record<string, unknown>>(
    db,
    'select phone, room_note, default_drop_point_id, blocked, deletion_requested_at is not null as requested from public.profiles where id = $1',
    [leaver],
  );
  assert.deepEqual(profile, { phone: null, room_note: null, default_drop_point_id: null, blocked: true, requested: true });

  const [{ n }] = await asOwner<{ n: number }>(db, 'select count(*)::int as n from public.orders where student_id = $1', [leaver]);
  assert.equal(n, 1);

  await assert.rejects(
    as(db, leaver, () => placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] })),
    /cannot place orders/,
  );
});

test('students cannot set their own deletion flag directly', async () => {
  await as(db, student, async () => {
    await assert.rejects(
      db.query('update public.profiles set deletion_requested_at = now() where id = $1', [student]),
      /Only admins/,
    );
  });
});
