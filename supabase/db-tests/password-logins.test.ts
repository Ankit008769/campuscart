import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, addUser, as, asOwner, createDb } from './harness.ts';

let db: PGlite;
let admin: string;

before(async () => {
  db = await createDb();
  admin = await addUser(db, 'boss@logins.campuscart.invalid', 'Boss');
  await asOwner(db, `update public.profiles set role = 'admin' where id = $1`, [admin]);
});

const isAdmin = (aal: string) =>
  as(db, admin, async () => (await db.query<{ ok: boolean }>('select public.is_admin() as ok')).rows[0].ok, aal);

// What the shop-logins function does: Auth creates the account, then attach_shop_login places it.
async function addShopLogin(id: string, staffRole: string) {
  const user = await addUser(db, `${id}@logins.campuscart.invalid`, 'Shop Person');
  await asOwner(db, `select public.attach_shop_login($1, $2, $3::public.staff_role)`, [user, SHOP.juice, staffRole]);
  return user;
}

test('admin powers need the Authenticator step, not just the password', async () => {
  assert.equal(await isAdmin('aal2'), true);
  assert.equal(await isAdmin('aal1'), false);
  await as(db, admin, () => db.query(`update public.shops set upi_vpa = 'stolen@okaxis' where id = $1`, [SHOP.juice]), 'aal1').catch(() => {});
  const [shop] = await asOwner<{ upi_vpa: string | null }>(db, 'select upi_vpa from public.shops where id = $1', [SHOP.juice]);
  assert.notEqual(shop.upi_vpa, 'stolen@okaxis');
});

test('a new ID joins its shop with the right job', async () => {
  const owner = await addShopLogin('juice.owner', 'owner');
  const counter = await addShopLogin('juice.counter', 'counter');
  const people = await asOwner<{ role: string; staff: string; shop_id: string }>(
    db,
    `select p.role, s.role as staff, s.shop_id from public.profiles p join public.shop_staff s on s.profile_id = p.id
     where p.id in ($1, $2) order by s.role`,
    [owner, counter],
  );
  assert.deepEqual(people, [
    { role: 'merchant_owner', staff: 'owner', shop_id: SHOP.juice },
    { role: 'merchant_staff', staff: 'counter', shop_id: SHOP.juice },
  ]);
});

test('only admins past the code manage owners, and an owner only their own counter staff', async () => {
  const owner = await addShopLogin('juice.boss', 'owner');
  const may = (who: string, shop: string, job: string, aal = 'aal2') =>
    as(
      db,
      who,
      async () => (await db.query<{ ok: boolean }>('select public.can_manage_shop_logins($1, $2::public.staff_role) as ok', [shop, job])).rows[0].ok,
      aal,
    );
  assert.equal(await may(admin, SHOP.juice, 'owner'), true);
  assert.equal(await may(admin, SHOP.juice, 'owner', 'aal1'), false);
  assert.equal(await may(owner, SHOP.juice, 'counter', 'aal1'), true);
  assert.equal(await may(owner, SHOP.juice, 'owner'), false);
  assert.equal(await may(owner, SHOP.general, 'counter'), false);
  await assert.rejects(
    as(db, null, () => db.query(`select public.can_manage_shop_logins($1, 'counter')`, [SHOP.juice])),
    /permission denied/,
  );
});

test('nobody signed in can place an ID at a shop themselves', async () => {
  const student = await addUser(db, '24bce500@nith.ac.in', 'Student');
  await assert.rejects(
    as(db, student, () => db.query(`select public.attach_shop_login($1, $2, 'owner')`, [student, SHOP.juice])),
    /permission denied/,
  );
});

test('the migration ended Gmail approvals for shops', async () => {
  const fresh = await createDb();
  const rows = await asOwner(fresh, `select email from public.allowed_logins where role in ('merchant_owner', 'merchant_staff')`);
  assert.deepEqual(rows, []);
});
