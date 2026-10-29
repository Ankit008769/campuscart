// The attacks the October 2026 security review reproduced, each now refused
// (migration 20261030100000_security_fixes.sql).
import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, settleOrders } from './harness.ts';

let db: PGlite;
let host: string;
let friend: string;
let generalOwner: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('sec.general.owner@gmail.com', 'merchant_owner', $1),
       ('sec.juice.owner@gmail.com', 'merchant_owner', $2),
       ('sec.juice.counter@gmail.com', 'merchant_staff', $2)`,
    [SHOP.general, SHOP.juice],
  );
  kailash = await dropPointId(db, 'Kailash Hostel');
  host = await addUser(db, '24bec401@nith.ac.in', 'Host');
  friend = await addUser(db, '24bec402@nith.ac.in', 'Friend');
  generalOwner = await addUser(db, 'sec.general.owner@gmail.com', 'General Owner');
  await addUser(db, 'sec.juice.owner@gmail.com', 'Juice Owner');
  await addUser(db, 'sec.juice.counter@gmail.com', 'Juice Counter');
  await asOwner(db, `update public.profiles set phone = '+919800000401', room_note = 'Room 101', default_drop_point_id = $2 where id = $1`, [
    host,
    kailash,
  ]);
});

const rowsAs = async <T>(userId: string, sql: string, params: unknown[] = []) =>
  as(db, userId, async () => (await db.query<T>(sql, params)).rows);

const pickup = (studentId: string, shopId: string = SHOP.general) =>
  as(db, studentId, () =>
    placeOrder(db, {
      shopId,
      mode: 'pickup',
      items: [{ variant_id: shopId === SHOP.juice ? VARIANT.mangoShake : VARIANT.maggi70g, qty: 1 }],
    }),
  );

test('a group-order code shows members each other\'s names, never their phone, email or room', async () => {
  const [group] = await rowsAs<{ id: string; code: string }>(host, `select id, code from public.open_group_order($1, $2, 30, 'Room 101')`, [
    SHOP.general,
    kailash,
  ]);
  await as(db, friend, () => db.query('select public.join_group_order($1)', [group.code]));

  const members = await rowsAs<{ student_id: string; display_name: string }>(
    friend,
    'select student_id, display_name from public.group_members where group_order_id = $1 order by display_name',
    [group.id],
  );
  assert.deepEqual(members.map((m) => m.display_name), ['Friend', 'Host']);
  assert.deepEqual(await rowsAs(friend, 'select phone, email, room_note from public.profiles where id = $1', [host]), []);
});

test('a shop owner cannot rewrite an approval the CampusCart team made', async () => {
  await asOwner(db, `insert into public.allowed_logins (email, role, note) values ('sec.new.admin@gmail.com', 'admin', 'not signed in yet')`);
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('sec.juice.next@gmail.com', 'merchant_owner', $1)`, [
    SHOP.juice,
  ]);

  for (const email of ['sec.new.admin@gmail.com', 'sec.juice.next@gmail.com']) {
    await assert.rejects(
      as(db, generalOwner, () => db.query('select public.invite_shop_staff($1, $2)', [SHOP.general, email])),
      /already set up for something else/,
    );
  }
  const approvals = await asOwner<{ email: string; role: string }>(
    db,
    `select email, role from public.allowed_logins where email in ('sec.new.admin@gmail.com', 'sec.juice.next@gmail.com') order by email`,
  );
  assert.deepEqual(approvals, [
    { email: 'sec.juice.next@gmail.com', role: 'merchant_owner' },
    { email: 'sec.new.admin@gmail.com', role: 'admin' },
  ]);

  // Inviting a fresh helper still works, and inviting them again is harmless.
  const invite = () => as(db, generalOwner, async () => (await db.query<{ r: string }>('select public.invite_shop_staff($1, $2) as r', [SHOP.general, 'sec.helper@gmail.com'])).rows[0].r);
  assert.equal(await invite(), 'invited');
  assert.equal(await invite(), 'invited');
});

test('a shop owner cannot pull another shop\'s counter staff into their shop', async () => {
  await assert.rejects(
    as(db, generalOwner, () => db.query('select public.invite_shop_staff($1, $2)', [SHOP.general, 'sec.juice.counter@gmail.com'])),
    /already set up for something else|works at another shop/,
  );
  // Even once the approval row is gone, the staff membership itself is checked.
  await asOwner(db, `delete from public.allowed_logins where email = 'sec.juice.counter@gmail.com'`);
  await assert.rejects(
    as(db, generalOwner, () => db.query('select public.invite_shop_staff($1, $2)', [SHOP.general, 'sec.juice.counter@gmail.com'])),
    /works at another shop/,
  );
  const shops = await asOwner<{ n: number }>(
    db,
    `select count(*)::int as n from public.shop_staff s join public.profiles p on p.id = s.profile_id where p.email = 'sec.juice.counter@gmail.com'`,
  );
  assert.equal(shops[0].n, 1);
});

test('an approved rider who changes their payout UPI ID goes back to admins, and not mid-delivery', async () => {
  const rider = await addUser(db, '24bec403@nith.ac.in', 'Rider');
  await asOwner(db, `update public.profiles set phone = '+919800000403' where id = $1`, [rider]);
  await as(db, rider, () => db.query(`select public.apply_as_rider('rider@okaxis')`));
  await asOwner(db, `update public.riders set status = 'approved', online = true where profile_id = $1`, [rider]);
  const riderRow = () =>
    asOwner<{ status: string; online: boolean; upi_vpa: string; admin_note: string | null }>(
      db,
      'select status, online, upi_vpa, admin_note from public.riders where profile_id = $1',
      [rider],
    ).then((rows) => rows[0]);

  // Saving the same UPI ID changes nothing.
  await as(db, rider, () => db.query(`select public.apply_as_rider('rider@okaxis')`));
  assert.equal((await riderRow()).status, 'approved');

  // Not while carrying an order.
  const carried = await pickup(friend);
  await asOwner(db, 'update public.orders set rider_id = $2 where id = $1', [carried.id, rider]);
  await assert.rejects(as(db, rider, () => db.query(`select public.apply_as_rider('thief@ybl')`)), /Finish your deliveries/);
  await asOwner(db, `update public.orders set status = 'collected', completed_at = now() where id = $1`, [carried.id]);

  await as(db, rider, () => db.query(`select public.apply_as_rider('new.account@ybl')`));
  const after = await riderRow();
  assert.equal(after.status, 'applied');
  assert.equal(after.online, false);
  assert.equal(after.upi_vpa, 'new.account@ybl');
  assert.match(after.admin_note ?? '', /UPI ID/);

  // A suspended rider stays suspended whatever they change.
  await asOwner(db, `update public.riders set status = 'suspended' where profile_id = $1`, [rider]);
  await as(db, rider, () => db.query(`select public.apply_as_rider('another@ybl')`));
  assert.equal((await riderRow()).status, 'suspended');
});

test('a student holds at most 3 open checkouts; a multi-shop cart counts once, a handed-over order frees a slot', async () => {
  const student = await addUser(db, '24bec404@nith.ac.in', 'Busy Student');
  const cart = () =>
    as(db, student, () =>
      db.query(`select * from public.place_cart($1::jsonb, 'pickup', 'cash')`, [
        JSON.stringify([
          { variant_id: VARIANT.maggi70g, qty: 1 },
          { variant_id: VARIANT.notebook, qty: 1 },
        ]),
      ]),
    );

  await cart();
  await pickup(student);
  await pickup(student, SHOP.juice);
  const open = await asOwner<{ n: number }>(
    db,
    `select count(*)::int as n from public.orders where student_id = $1 and status = 'placed'`,
    [student],
  );
  assert.equal(open[0].n, 4, 'the cart made two shop orders, yet three checkouts were allowed');

  await assert.rejects(pickup(student), /already have 3 orders on the way/);
  await assert.rejects(cart(), /already have 3 orders on the way/);

  await settleOrders(db, student);
  await pickup(student);
});

test('shops see a customer while an order is open and for 7 days after; riders only while delivering', async () => {
  const customer = await addUser(db, '24bec405@nith.ac.in', 'Customer');
  await asOwner(db, `update public.profiles set phone = '+919800000405' where id = $1`, [customer]);
  const order = await pickup(customer);
  const shopSees = async () => (await rowsAs(generalOwner, 'select phone from public.profiles where id = $1', [customer])).length;

  assert.equal(await shopSees(), 1, 'open order');
  await asOwner(db, `update public.orders set status = 'collected', completed_at = now() - interval '6 days' where id = $1`, [order.id]);
  assert.equal(await shopSees(), 1, '6 days after');
  await asOwner(db, `update public.orders set completed_at = now() - interval '8 days' where id = $1`, [order.id]);
  assert.equal(await shopSees(), 0, '8 days after');

  const rider = await addUser(db, '24bec406@nith.ac.in', 'Rider Two');
  const delivery = await as(db, customer, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
  );
  await asOwner(db, `update public.orders set rider_id = $2, status = 'out_for_delivery' where id = $1`, [delivery.id, rider]);
  const riderSees = async () => (await rowsAs(rider, 'select phone from public.profiles where id = $1', [customer])).length;
  assert.equal(await riderSees(), 1, 'on the way');
  await asOwner(db, `update public.orders set status = 'delivered', completed_at = now() where id = $1`, [delivery.id]);
  assert.equal(await riderSees(), 0, 'delivered');
});
