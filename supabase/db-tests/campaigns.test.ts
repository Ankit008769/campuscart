import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, as, asOwner, createDb, dropPointId } from './harness.ts';

let db: PGlite;
let admin: string;
let kailashStudent: string;
let otherHostelStudent: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('campaign.admin@gmail.com', 'admin')`);
  admin = await addUser(db, 'campaign.admin@gmail.com', 'Ops');
  kailashStudent = await addUser(db, '22bec045@nith.ac.in', 'Kailash 22');
  otherHostelStudent = await addUser(db, '24bme010@nith.ac.in', 'Elsewhere 24');
  kailash = await dropPointId(db, 'Kailash Hostel');
  await asOwner(db, 'update public.profiles set default_drop_point_id = $2 where id = $1', [kailashStudent, kailash]);
});

const call = (userId: string, sql: string, params: unknown[] = []) =>
  as(db, userId, async () => (await db.query<Record<string, unknown>>(sql, params)).rows);

test('batches come from roll-number emails only', async () => {
  const batches = await asOwner<{ b: string | null }>(
    db,
    `select public.student_batch(e) as b from unnest(array['22bec045@nith.ac.in', '24BME010@nith.ac.in', 'someone@gmail.com', 'faculty@nith.ac.in']) e`,
  );
  assert.deepEqual(batches.map((r) => r.b), ['22', '24', null, null]);
});

test('banners reach only their hostel or batch', async () => {
  await call(admin, `insert into public.banners (title, drop_point_id) values ('Kailash night offer', $1)`, [kailash]);
  await call(admin, `insert into public.banners (title, batch) values ('Welcome, 24 batch', '24')`);
  await call(admin, `insert into public.banners (title) values ('For everyone')`);
  await call(admin, `insert into public.banners (title, ends_at, starts_at) values ('Over', now() - interval '1 hour', now() - interval '1 day')`);

  const titles = async (userId: string) => (await call(userId, 'select title from public.my_banners() order by title')).map((r) => r.title);
  assert.deepEqual(await titles(kailashStudent), ['For everyone', 'Kailash night offer']);
  assert.deepEqual(await titles(otherHostelStudent), ['For everyone', 'Welcome, 24 batch']);
  await assert.rejects(call(kailashStudent, `insert into public.banners (title) values ('Mine')`), /row-level security/);
});

test('a campaign queues one push per student in the audience, and at most 3 go out a day', async () => {
  const [{ n }] = await call(admin, `select public.send_campaign('Maggi at ₹20', 'Tonight only at Kailash', $1) as n`, [kailash]);
  assert.equal(n, 1);
  const pushed = await asOwner<{ user_id: string }>(db, `select user_id from public.push_outbox where data ->> 'campaign' = 'true'`);
  assert.deepEqual(pushed.map((p) => p.user_id), [kailashStudent]);

  const [{ batch24 }] = await call(admin, `select public.send_campaign('Hi 24', 'Exam kits are in', null, '24') as batch24`);
  assert.equal(batch24, 1);
  await call(admin, `select public.send_campaign('Everyone', 'New shop on campus')`);
  await assert.rejects(call(admin, `select public.send_campaign('Fourth', 'Too many')`), /Three campaigns/);
  await assert.rejects(call(kailashStudent, `select public.send_campaign('Spam', 'Spam')`), /Only admins/);
});

test('the platform report has a row for every day, and only admins can read it', async () => {
  const rows = await call(admin, `select * from public.platform_report(now() - interval '3 days', now())`);
  assert.ok(rows.length >= 3 && rows.length <= 4, `${rows.length} days`);
  const today = rows.at(-1);
  assert.ok(Number(today?.new_students) >= 2, 'the students added in this file signed up today');
  await assert.rejects(call(kailashStudent, `select * from public.platform_report(now() - interval '1 day', now())`), /Only admins/);
});
