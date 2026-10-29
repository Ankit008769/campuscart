import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, addUser, asOwner, createDb } from './harness.ts';

let db: PGlite;
before(async () => {
  db = await createDb();
});

async function hook(email: string) {
  const [row] = await asOwner<{ result: Record<string, unknown> }>(
    db,
    `select public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', $1::text))) as result`,
    [email],
  );
  return row.result;
}

test('the sign-up hook lets in college accounts, in any letter case', async () => {
  assert.deepEqual(await hook('21bcs001@nith.ac.in'), {});
  assert.deepEqual(await hook('Ravi.Kumar@NITH.AC.IN'), {});
});

test('the sign-up hook refuses other emails with a 403', async () => {
  const result = await hook('someone@gmail.com');
  assert.deepEqual(result, {
    error: { http_code: 403, message: 'Sign in with your @nith.ac.in college account.' },
  });
  assert.notDeepEqual(await hook('fake@nith.ac.in.evil.com'), {});
});

test('the sign-up hook lets in emails an admin approved', async () => {
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('owner.general@gmail.com', 'merchant_owner', $1)`, [SHOP.general]);
  assert.deepEqual(await hook('Owner.General@gmail.com'), {});
});

test('a new college user gets a student profile with their name', async () => {
  const id = await addUser(db, '22bec045@nith.ac.in', 'Asha Verma');
  const [profile] = await asOwner<{ role: string; name: string; email: string }>(
    db,
    'select role, name, email from public.profiles where id = $1',
    [id],
  );
  assert.deepEqual(profile, { role: 'student', name: 'Asha Verma', email: '22bec045@nith.ac.in' });
});

test('an approved shop email becomes the owner of that shop', async () => {
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('juice.owner@gmail.com', 'merchant_owner', $1)`, [SHOP.juice]);
  const id = await addUser(db, 'Juice.Owner@gmail.com');
  const [profile] = await asOwner<{ role: string }>(db, 'select role from public.profiles where id = $1', [id]);
  const staff = await asOwner<{ shop_id: string; role: string }>(db, 'select shop_id, role from public.shop_staff where profile_id = $1', [id]);
  assert.equal(profile.role, 'merchant_owner');
  assert.deepEqual(staff, [{ shop_id: SHOP.juice, role: 'owner' }]);
});

test('shop accounts must name their shop, other approved roles must not', async () => {
  await assert.rejects(
    asOwner(db, `insert into public.allowed_logins (email, role) values ('staff.noshop@gmail.com', 'merchant_staff')`),
    /check constraint/,
  );
  await assert.rejects(
    asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('admin.withshop@gmail.com', 'admin', $1)`, [SHOP.general]),
    /check constraint/,
  );
});

test('approved emails are stored in lower case', async () => {
  await assert.rejects(
    asOwner(db, `insert into public.allowed_logins (email, role) values ('Mixed.Case@gmail.com', 'admin')`),
    /check constraint/,
  );
});
