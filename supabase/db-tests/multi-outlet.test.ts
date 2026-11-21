import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder, transition } from './harness.ts';

// One owner, several outlets, one phone: the owner's login is staff at each outlet (the shop-logins
// function's link action adds it), and every outlet's orders reach it while each order stays with
// the outlet it was placed at.
let db: PGlite;
let student: string;
let owner: string;
let otherOwner: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('outlets.owner@gmail.com', 'merchant_owner', $1), ('outlets.other@gmail.com', 'merchant_owner', $2)`,
    [SHOP.general, SHOP.juice],
  );
  student = await addUser(db, '23bce201@nith.ac.in', 'Ira');
  owner = await addUser(db, 'outlets.owner@gmail.com');
  otherOwner = await addUser(db, 'outlets.other@gmail.com');
  // What the link action does: the same login, owner at a second outlet.
  await asOwner(db, `insert into public.shop_staff (shop_id, profile_id, role) values ($1, $2, 'owner')`, [SHOP.stationery, owner]);
});

test("one login gets both outlets' orders, each kept at its own outlet", async () => {
  const atGeneral = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  const atStationery = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.stationery, mode: 'pickup', items: [{ variant_id: VARIANT.notebook, qty: 1 }] }),
  );

  const seen = await as(db, owner, async () =>
    (
      await db.query<{ id: string; shop_id: string }>('select id, shop_id from public.orders where shop_id = any ($1::uuid[])', [
        [SHOP.general, SHOP.stationery],
      ])
    ).rows,
  );
  assert.deepEqual(
    new Map(seen.map((o) => [o.id, o.shop_id])),
    new Map([
      [atGeneral.id, SHOP.general],
      [atStationery.id, SHOP.stationery],
    ]),
  );

  // It runs the second outlet's order like its own, and can listen to both outlets live.
  const accepted = await as(db, owner, () => transition(db, atStationery.id, 'accepted', { prepMinutes: 10 }));
  assert.equal(accepted.status, 'accepted');
  const may = (topic: string) =>
    as(db, owner, async () => (await db.query<{ ok: boolean }>('select public.can_watch_orders_channel($1) as ok', [topic])).rows[0].ok);
  assert.equal(await may(`orders:shop_id=eq.${SHOP.general}:a1`), true);
  assert.equal(await may(`orders:shop_id=eq.${SHOP.stationery}:a1`), true);
  assert.equal(await may(`orders:shop_id=eq.${SHOP.juice}:a1`), false);

  // The new-order notification for the second outlet reaches the shared login.
  const pushes = await asOwner<{ user_id: string }>(
    db,
    `select user_id from public.push_outbox where app = 'merchant' and data ->> 'orderId' = $1`,
    [atStationery.id],
  );
  assert.ok(pushes.some((p) => p.user_id === owner));
});

test("another shop's owner still sees none of them", async () => {
  const seen = await as(db, otherOwner, async () =>
    (await db.query('select id from public.orders where shop_id = any ($1::uuid[])', [[SHOP.general, SHOP.stationery]])).rows,
  );
  assert.equal(seen.length, 0);
});
