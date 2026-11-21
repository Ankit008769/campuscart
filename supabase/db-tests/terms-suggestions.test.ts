import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, addUser, as, asOwner, createDb } from './harness.ts';

let db: PGlite;
let student: string;
let other: string;
let owner: string;
let admin: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('terms.owner@gmail.com', 'merchant_owner', $1)`, [SHOP.general]);
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('terms.admin@gmail.com', 'admin')`);
  student = await addUser(db, '23bce301@nith.ac.in', 'Kavya');
  other = await addUser(db, '23bce302@nith.ac.in', 'Rohan');
  owner = await addUser(db, 'terms.owner@gmail.com');
  admin = await addUser(db, 'terms.admin@gmail.com');
});

const termsOf = async (id: string) =>
  (await asOwner<{ terms_version: number; terms_accepted_at: string | null }>(db, 'select terms_version, terms_accepted_at from public.profiles where id = $1', [id]))[0];

test('agreeing to the terms records the version and the time', async () => {
  assert.deepEqual(await termsOf(student), { terms_version: 0, terms_accepted_at: null });
  await as(db, student, () => db.query('select public.accept_terms(1)'));
  const first = await termsOf(student);
  assert.equal(first.terms_version, 1);
  assert.ok(first.terms_accepted_at);

  // Agreeing to the same version again keeps the first time; an older version never lowers it.
  await as(db, student, () => db.query('select public.accept_terms(1)'));
  await as(db, student, () => db.query('select public.accept_terms(1)'));
  assert.deepEqual(await termsOf(student), first);

  // Shops agree the same way.
  await as(db, owner, () => db.query('select public.accept_terms(1)'));
  assert.equal((await termsOf(owner)).terms_version, 1);
});

test('nobody can mark themselves as agreed without accept_terms', async () => {
  await assert.rejects(
    as(db, other, () => db.query('update public.profiles set terms_version = 5 where id = $1', [other])),
    /Only admins can change this/,
  );
  await assert.rejects(as(db, null, () => db.query('select public.accept_terms(1)')), /permission denied|Sign in first/);
  await assert.rejects(as(db, other, () => db.query('select public.accept_terms(0)')), /Which version/);
  assert.equal((await termsOf(other)).terms_version, 0);
});

test('students send suggestions that only admins read', async () => {
  await as(db, student, () => db.query(`insert into public.suggestions (profile_id, body) values ($1, '  Add Maggi at night  ')`, [student]));

  // Not as someone else, and not pre-marked as read.
  await assert.rejects(as(db, other, () => db.query(`insert into public.suggestions (profile_id, body) values ($1, 'fake one')`, [student])));
  await assert.rejects(as(db, other, () => db.query(`insert into public.suggestions (profile_id, body) values ($1, 'hi')`, [other])), /check/);

  // Students and shops can't read the list; admins see it with who sent it.
  const seenByStudent = await as(db, student, async () => (await db.query('select id from public.suggestions')).rows);
  assert.equal(seenByStudent.length, 0);
  await assert.rejects(as(db, owner, () => db.query('select * from public.list_suggestions(50)')), /Only admins/);
  const list = await as(db, admin, async () =>
    (await db.query<{ id: string; body: string; name: string; read_at: string | null }>('select * from public.list_suggestions(50)')).rows,
  );
  assert.equal(list.length, 1);
  assert.equal(list[0].body, 'Add Maggi at night');
  assert.equal(list[0].name, 'Kavya');

  // Admins mark them read; nobody else can.
  await as(db, student, () => db.query('update public.suggestions set read_at = now()'));
  assert.equal((await asOwner<{ read_at: string | null }>(db, 'select read_at from public.suggestions'))[0].read_at, null);
  await as(db, admin, () => db.query('update public.suggestions set read_at = now() where id = $1', [list[0].id]));
  assert.ok((await asOwner<{ read_at: string | null }>(db, 'select read_at from public.suggestions'))[0].read_at);
});

test('ten suggestions a day is the most one person can send', async () => {
  for (let i = 0; i < 10; i++) {
    await as(db, other, () => db.query(`insert into public.suggestions (profile_id, body) values ($1, $2)`, [other, `idea number ${i}`]));
  }
  await assert.rejects(
    as(db, other, () => db.query(`insert into public.suggestions (profile_id, body) values ($1, 'one more idea')`, [other])),
    /plenty for today/,
  );
});
