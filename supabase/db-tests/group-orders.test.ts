import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId } from './harness.ts';

let db: PGlite;
let host: string;
let members: string[];
let outsider: string;
let kailash: string;

before(async () => {
  db = await createDb();
  kailash = await dropPointId(db, 'Kailash Hostel');
  host = await addUser(db, '23bce700@nith.ac.in', 'Host');
  members = [];
  for (let i = 1; i <= 4; i++) members.push(await addUser(db, `23bce70${i}@nith.ac.in`, `Member ${i}`));
  outsider = await addUser(db, '23bce799@nith.ac.in', 'Outsider');
});

const call = <T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) =>
  as(db, userId, async () => (await db.query<T>(sql, params)).rows);
const open = async (minutes = 30) =>
  (await call<{ id: string; code: string }>(host, 'select * from public.open_group_order($1, $2, $3)', [SHOP.general, kailash, minutes]))[0];
const setItems = (userId: string, groupId: string, items: object[]) =>
  call(userId, 'select public.set_group_items($1, $2::jsonb)', [groupId, JSON.stringify(items)]);

test('five students order together: one order, one delivery, shares that add up exactly', async () => {
  const group = await open();
  for (const m of members) await call(m, 'select public.join_group_order($1)', [group.code.toLowerCase()]);

  await setItems(host, group.id, [{ variant_id: VARIANT.maggi70g, qty: 2 }]);
  await setItems(members[0], group.id, [{ variant_id: VARIANT.laysClassic, qty: 1 }]);
  await setItems(members[1], group.id, [{ variant_id: VARIANT.milk, qty: 1 }]);
  await setItems(members[2], group.id, [{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  await setItems(members[3], group.id, [{ variant_id: VARIANT.laysClassic, qty: 2 }]);

  await assert.rejects(setItems(members[0], group.id, [{ variant_id: VARIANT.mangoShake, qty: 1 }]), /from this shop/);
  await assert.rejects(call(members[0], 'select public.place_group_order($1)', [group.id]), /Only the host/);
  await assert.rejects(call(members[0], 'select public.complete_group_order($1, true)', [group.id]), /permission denied/);
  assert.deepEqual(await call(outsider, 'select id from public.group_orders where id = $1', [group.id]), []);

  const [placed] = await call<{ status: string; order_id: string }>(host, 'select * from public.place_group_order($1)', [group.id]);
  assert.equal(placed.status, 'placed');
  const orders = await asOwner<{ id: string; total_paise: number }>(db, 'select id, total_paise from public.orders where id = $1', [placed.order_id]);
  assert.equal(orders.length, 1, 'one order, one delivery');

  const shares = await call<{ share_paise: number; paid: boolean }>(host, 'select share_paise, paid from public.group_members where group_order_id = $1', [group.id]);
  assert.equal(shares.length, 5);
  assert.equal(
    shares.reduce((t, s) => t + s.share_paise, 0),
    orders[0].total_paise,
  );

  // Each member pays the host separately; the host ticks them off. Members can't tick themselves.
  await assert.rejects(call(members[0], 'select public.set_group_paid($1, $2, true)', [group.id, members[0]]), /Only the host/);
  for (const m of members) await call(host, 'select public.set_group_paid($1, $2, true)', [group.id, m]);
  const unpaid = await asOwner<{ n: number }>(db, 'select count(*)::int as n from public.group_members where group_order_id = $1 and not paid', [group.id]);
  assert.equal(unpaid[0].n, 0);
  await assert.rejects(call(members[1], 'select public.join_group_order($1)', [group.code]), /closed/);
});

test('at closing time pg_cron places the order; an empty group is cancelled', async () => {
  const due = await open(10);
  await call(members[0], 'select public.join_group_order($1)', [due.code]);
  await setItems(members[0], due.id, [{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  const empty = await open(10);
  await asOwner(db, `update public.group_orders set closes_at = now() - interval '1 minute' where id = any($1::uuid[])`, [[due.id, empty.id]]);
  await asOwner(db, 'select public.place_due_group_orders()');

  const rows = await asOwner<{ id: string; status: string; problem: string | null }>(
    db,
    'select id, status, problem from public.group_orders where id = any($1::uuid[])',
    [[due.id, empty.id]],
  );
  assert.equal(rows.find((r) => r.id === due.id)?.status, 'placed');
  assert.deepEqual(rows.find((r) => r.id === empty.id), { id: empty.id, status: 'cancelled', problem: 'Nobody added any items' });
});

test('a group order that fails at closing time is cancelled with the reason', async () => {
  const group = await open(10);
  await setItems(host, group.id, [{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  await asOwner(db, 'update public.shops set is_open = false where id = $1', [SHOP.general]);
  await asOwner(db, `update public.group_orders set closes_at = now() - interval '1 minute' where id = $1`, [group.id]);
  await asOwner(db, 'select public.place_due_group_orders()');
  await asOwner(db, 'update public.shops set is_open = true where id = $1', [SHOP.general]);
  const [row] = await asOwner<{ status: string; problem: string }>(db, 'select status, problem from public.group_orders where id = $1', [group.id]);
  assert.deepEqual(row, { status: 'cancelled', problem: 'This shop is closed right now' });
});
