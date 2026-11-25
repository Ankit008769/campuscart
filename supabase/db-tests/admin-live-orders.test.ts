import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

// Admin → Live orders (migration 20261125100000): every open order with its code, finishing an order
// a shop forgot to mark, and a push to admins for every new order.

let db: PGlite;
let student: string;
let owner: string;
let admin: string;
let kailash: string;

type Live = { id: string; status: string; shop_name: string; student_name: string; delivery_otp: string | null; token_no: number; items: string };

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('live.general@gmail.com', 'merchant_owner', $1)`, [SHOP.general]);
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('live.admin@gmail.com', 'admin')`);
  student = await addUser(db, '23bce201@nith.ac.in', 'Yash');
  owner = await addUser(db, 'live.general@gmail.com');
  admin = await addUser(db, 'live.admin@gmail.com');
  kailash = await dropPointId(db, 'Kailash Hostel');
});

const deliveryOrder = () =>
  as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
  );

const live = (who: string, aal = 'aal2') =>
  as(db, who, async () => (await db.query<Live>('select * from public.admin_live_orders()')).rows, aal);

test('admins see every open order with its delivery code; nobody else can', async () => {
  const placed = await deliveryOrder();
  const [secret] = await asOwner<{ delivery_otp: string }>(db, 'select delivery_otp from public.order_secrets where order_id = $1', [placed.id]);

  const rows = await live(admin);
  const row = rows.find((r) => r.id === placed.id);
  assert.ok(row, 'the new order is listed');
  assert.equal(row.status, 'placed');
  assert.equal(row.student_name, 'Yash');
  assert.equal(row.delivery_otp, secret.delivery_otp);
  assert.match(row.items, /2× /);

  await assert.rejects(live(owner), /Only admins/);
  await assert.rejects(live(student), /Only admins/);
  // An admin who has not passed the Authenticator step is not an admin yet.
  await assert.rejects(live(admin, 'aal1'), /Only admins/);
});

test('an admin finishes an order without the code, with a reason kept on its history', async () => {
  const placed = await deliveryOrder();
  await as(db, owner, () => transition(db, placed.id, 'accepted'));
  await as(db, owner, () => transition(db, placed.id, 'ready'));
  await as(db, owner, () => transition(db, placed.id, 'out_for_delivery'));

  // A reason is required, and only admins may use this path.
  await assert.rejects(as(db, admin, () => db.query('select * from public.admin_complete_order($1, $2)', [placed.id, ' '])), /Give a reason/);
  await assert.rejects(
    as(db, owner, () => db.query('select * from public.admin_complete_order($1, $2)', [placed.id, 'forgot'])),
    /Only admins/,
  );

  const done = await as(db, admin, async () =>
    (await db.query<{ status: string }>('select * from public.admin_complete_order($1, $2)', [placed.id, 'Shop forgot to mark it'])).rows[0],
  );
  assert.equal(done.status, 'delivered');
  const [event] = await asOwner<{ actor: string; note: string }>(
    db,
    `select actor, note from public.order_events where order_id = $1 and to_status = 'delivered'`,
    [placed.id],
  );
  assert.deepEqual(event, { actor: 'admin', note: 'Shop forgot to mark it' });
  assert.ok(!(await live(admin)).some((r) => r.id === placed.id), 'finished orders leave the live list');

  // Nothing finished can be finished again.
  await assert.rejects(as(db, admin, () => db.query('select * from public.admin_complete_order($1, $2)', [placed.id, 'again'])), /cannot move/);
});

test('a pickup an admin finishes is collected, even straight from accepted', async () => {
  const placed = await as(db, student, () => placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.milk, qty: 1 }] }));
  await as(db, owner, () => transition(db, placed.id, 'accepted'));
  const done = await as(db, admin, async () =>
    (await db.query<{ status: string }>('select * from public.admin_complete_order($1, $2)', [placed.id, 'Student took it'])).rows[0],
  );
  assert.equal(done.status, 'collected');
});

test('the normal path still needs the code, even for admins', async () => {
  const placed = await deliveryOrder();
  await as(db, owner, () => transition(db, placed.id, 'accepted'));
  await as(db, owner, () => transition(db, placed.id, 'ready'));
  await as(db, owner, () => transition(db, placed.id, 'out_for_delivery'));
  await assert.rejects(as(db, admin, () => transition(db, placed.id, 'delivered', { code: '0000x' })), /Wrong delivery code/);
  await as(db, admin, () => db.query('select * from public.admin_complete_order($1, $2)', [placed.id, 'tidy up']));
});

test('every new order sends admins a push that opens live orders', async () => {
  const placed = await deliveryOrder();
  const pushes = await asOwner<{ app: string; title: string; data: { adminOrderId?: string } }>(
    db,
    `select app, title, data from public.push_outbox where user_id = $1 and data ->> 'adminOrderId' = $2`,
    [admin, placed.id],
  );
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].app, 'consumer');
  assert.match(pushes[0].title, /^New order at /);
  // The shop still gets its own ringing push.
  const [shopPush] = await asOwner<{ count: number }>(
    db,
    `select count(*)::int as count from public.push_outbox where user_id = $1 and app = 'merchant' and data ->> 'orderId' = $2`,
    [owner, placed.id],
  );
  assert.equal(shopPush.count, 1);
});
