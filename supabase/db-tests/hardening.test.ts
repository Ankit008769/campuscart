import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder } from './harness.ts';

let db: PGlite;
let admin: string;
let asha: string;
let ravi: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('funnel.admin@gmail.com', 'admin')`);
  admin = await addUser(db, 'funnel.admin@gmail.com', 'Ops');
  asha = await addUser(db, '23bec011@nith.ac.in', 'Asha');
  ravi = await addUser(db, '23bec012@nith.ac.in', 'Ravi');
});

const log = (userId: string, name: string, shopId: string | null = null) =>
  as(db, userId, () => db.query('insert into public.app_events (name, shop_id) values ($1, $2)', [name, shopId]));

test('the funnel counts students at each step, ending with real orders', async () => {
  for (const student of [asha, ravi]) {
    await log(student, 'app_open');
    await log(student, 'app_open');
    await log(student, 'shop_view', SHOP.general);
  }
  await log(asha, 'add_to_cart', SHOP.general);
  await log(asha, 'checkout_view', SHOP.general);
  await as(db, asha, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );

  const report = await as(db, admin, async () =>
    (
      await db.query<{ step: string; students: number }>(
        `select * from public.funnel_report(now() - interval '1 day', now() + interval '1 minute')`,
      )
    ).rows,
  );
  assert.deepEqual(report, [
    { step: 'app_open', students: 2 },
    { step: 'shop_view', students: 2 },
    { step: 'add_to_cart', students: 1 },
    { step: 'checkout_view', students: 1 },
    { step: 'ordered', students: 1 },
  ]);
});

test('students log only their own events and read none; unknown steps are refused', async () => {
  await as(db, asha, async () => {
    await assert.rejects(
      db.query('insert into public.app_events (user_id, name) values ($1, $2)', [ravi, 'app_open']),
      /row-level security/,
    );
    await assert.rejects(db.query(`insert into public.app_events (name) values ('typed_password')`), /app_events_name_check/);
    assert.deepEqual((await db.query('select * from public.app_events')).rows, []);
  });
  await as(db, null, async () => {
    await assert.rejects(db.query(`insert into public.app_events (name) values ('app_open')`), /permission denied/);
  });
});

test('volume: 100 students order within a minute, each with a distinct code and token', async () => {
  const students: string[] = [];
  for (let i = 0; i < 100; i++) students.push(await addUser(db, `25load${String(i).padStart(3, '0')}@nith.ac.in`, `Load ${i}`));

  const started = Date.now();
  for (const student of students) {
    await as(db, student, () =>
      placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.laysClassic, qty: 2 }] }),
    );
  }
  const seconds = (Date.now() - started) / 1000;
  assert.ok(seconds < 60, `100 orders took ${seconds.toFixed(1)} s`);

  const [counts] = await asOwner<{ orders: number; codes: number; tokens: number }>(
    db,
    `select count(*)::int as orders, count(distinct code)::int as codes, count(distinct token_no)::int as tokens
     from public.orders where student_id = any ($1::uuid[])`,
    [students],
  );
  assert.deepEqual(counts, { orders: 100, codes: 100, tokens: 100 });
});
