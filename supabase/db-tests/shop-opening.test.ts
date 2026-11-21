import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, asOwner, createDb } from './harness.ts';

let db: PGlite;

before(async () => {
  db = await createDb();
  await asOwner(db, `update public.shops set hours = '{"opens":"09:00","closes":"21:00"}', is_open = false where id = $1`, [SHOP.general]);
  await asOwner(db, `update public.shops set hours = '{}', is_open = false where id = $1`, [SHOP.juice]);
});

const isOpen = async (id: string) => (await asOwner<{ is_open: boolean }>(db, 'select is_open from public.shops where id = $1', [id]))[0].is_open;
const openAt = (at: string) => asOwner(db, 'select public.open_shops_at_opening($1::timestamptz)', [at]);
const closeAt = (at: string) => asOwner(db, 'select public.close_shops_after_hours($1::timestamptz)', [at]);

test('a shop with hours opens at its opening time and closes at its closing time', async () => {
  await openAt('2026-11-21 08:57+05:30');
  assert.equal(await isOpen(SHOP.general), false);
  await openAt('2026-11-21 09:02+05:30');
  assert.equal(await isOpen(SHOP.general), true);
  await closeAt('2026-11-21 21:01+05:30');
  assert.equal(await isOpen(SHOP.general), false);
});

test('closed by hand during the day, it stays closed until the next opening', async () => {
  await openAt('2026-11-22 09:01+05:30');
  await asOwner(db, 'update public.shops set is_open = false where id = $1', [SHOP.general]);
  await openAt('2026-11-22 12:00+05:30');
  assert.equal(await isOpen(SHOP.general), false);
  await openAt('2026-11-23 09:03+05:30');
  assert.equal(await isOpen(SHOP.general), true);
});

test('a shop without hours is only ever switched by hand', async () => {
  await openAt('2026-11-24 09:01+05:30');
  assert.equal(await isOpen(SHOP.juice), false);
});
