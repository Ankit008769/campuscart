import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder } from './harness.ts';

let db: PGlite;
let admin: string;
let owner: string;
let student: string;
let otherStudent: string;
let orderCode: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('ops.admin@gmail.com', 'admin', null),
       ('juice.owner@gmail.com', 'merchant_owner', $1)`,
    [SHOP.juice],
  );
  admin = await addUser(db, 'ops.admin@gmail.com', 'Ops');
  owner = await addUser(db, 'juice.owner@gmail.com', 'Juice Owner');
  student = await addUser(db, '22bcs077@nith.ac.in', 'Meera Thakur');
  otherStudent = await addUser(db, '22bcs078@nith.ac.in', 'Rohan');
  await asOwner(db, `update public.profiles set phone = '+919876501234' where id = $1`, [student]);
  const order = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  [{ code: orderCode }] = await asOwner<{ code: string }>(db, 'select code from public.orders where id = $1', [order.id]);
  await as(db, otherStudent, () =>
    placeOrder(db, { shopId: SHOP.juice, mode: 'pickup', items: [{ variant_id: VARIANT.mangoShake, qty: 1 }] }),
  );
});

// --- shop hours -------------------------------------------------------------------------------------

const within = async (hours: object, istTime: string) =>
  (
    await asOwner<{ open: boolean }>(db, `select public.within_shop_hours($1::jsonb, ($2 || ' Asia/Kolkata')::timestamptz) as open`, [
      JSON.stringify(hours),
      istTime,
    ])
  )[0].open;

test('daytime hours, in Indian time', async () => {
  const day = { opens: '09:00', closes: '22:00' };
  assert.equal(await within(day, '2026-10-28 08:59'), false);
  assert.equal(await within(day, '2026-10-28 09:00'), true);
  assert.equal(await within(day, '2026-10-28 21:59'), true);
  assert.equal(await within(day, '2026-10-28 22:00'), false);
});

test('a night canteen open past midnight, closed on Sundays', async () => {
  // 2026-11-01 is a Sunday.
  const night = { opens: '20:00', closes: '02:00', closed_days: ['sun'] };
  assert.equal(await within(night, '2026-10-31 21:00'), true, 'Saturday evening');
  assert.equal(await within(night, '2026-11-01 01:30'), true, "Sunday small hours belong to Saturday's night");
  assert.equal(await within(night, '2026-11-01 21:00'), false, 'Sunday evening');
  assert.equal(await within(night, '2026-11-02 01:30'), false, "Monday small hours belong to Sunday's night");
  assert.equal(await within(night, '2026-11-02 12:00'), false, 'Monday noon');
});

test('bad hours are refused, and shop staff can set their own', async () => {
  await as(db, owner, async () => {
    await assert.rejects(
      db.query(`update public.shops set hours = '{"opens": "25:00", "closes": "23:00"}' where id = $1`, [SHOP.juice]),
      /shops_hours_valid/,
    );
    await db.query(`update public.shops set hours = '{"opens": "10:00", "closes": "21:00", "closed_days": ["sun"]}' where id = $1`, [
      SHOP.juice,
    ]);
    // The hours check must not get in the way of the everyday open/closed switch.
    await db.query('update public.shops set is_open = true where id = $1', [SHOP.juice]);
  });
});

test('after hours, shops still marked open are switched off; none is ever switched on', async () => {
  await asOwner(db, `update public.shops set hours = '{"opens": "08:00", "closes": "20:00"}', is_open = true where id = $1`, [SHOP.stationery]);
  await asOwner(db, `update public.shops set hours = '{"opens": "08:00", "closes": "20:00"}', is_open = false where id = $1`, [SHOP.nightCanteen]);
  await asOwner(db, `update public.shops set hours = '{}', is_open = true where id = $1`, [SHOP.general]);

  const closeAt = async (istTime: string) =>
    (await asOwner<{ n: number }>(db, `select public.close_shops_after_hours(($1 || ' Asia/Kolkata')::timestamptz) as n`, [istTime]))[0].n;
  const isOpen = async (shopId: string) =>
    (await asOwner<{ is_open: boolean }>(db, 'select is_open from public.shops where id = $1', [shopId]))[0].is_open;

  await closeAt('2026-10-28 12:00');
  assert.equal(await isOpen(SHOP.stationery), true, 'within hours: left alone');
  await closeAt('2026-10-28 20:05');
  assert.equal(await isOpen(SHOP.stationery), false, 'after hours: switched off');
  assert.equal(await isOpen(SHOP.nightCanteen), false, 'never switched on');
  assert.equal(await isOpen(SHOP.general), true, 'no hours set: left alone');

  await as(db, student, async () => {
    await assert.rejects(db.query('select public.close_shops_after_hours()'), /permission denied/);
  });
});

// --- order search -----------------------------------------------------------------------------------

type Hit = { code: string; shop_name: string; student_name: string };
const searchAs = (userId: string, query: string | null, extra = '') =>
  as(db, userId, async () => (await db.query<Hit>(`select code, shop_name, student_name from public.search_orders($1${extra})`, [query])).rows);

test('admins find an order by its code, the student name or phone digits', async () => {
  assert.deepEqual((await searchAs(admin, orderCode)).map((h) => h.code), [orderCode]);
  assert.ok((await searchAs(admin, 'meera')).every((h) => h.student_name === 'Meera Thakur'));
  assert.ok((await searchAs(admin, '98765 01234')).some((h) => h.code === orderCode));
  assert.ok((await searchAs(admin, null)).length >= 2);
});

test('shops and students only find orders they could already see', async () => {
  const shopHits = await searchAs(owner, null);
  assert.ok(shopHits.length > 0);
  assert.ok(shopHits.every((h) => h.shop_name === 'Juice Corner'));
  assert.deepEqual(await searchAs(otherStudent, orderCode), []);
  await as(db, null, async () => {
    await assert.rejects(db.query('select * from public.search_orders()'), /permission denied/);
  });
});
