import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { calculateBill } from '../../packages/core/src/bill.ts';
import { ORDER_STATUSES, canTransition, type OrderActor, type OrderMode } from '../../packages/core/src/orders.ts';
import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, transition } from './harness.ts';

let db: PGlite;
let asha: string;
let ravi: string;
let generalOwner: string;
let admin: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values ('general.owner@gmail.com', 'merchant_owner', $1)`,
    [SHOP.general],
  );
  await asOwner(db, `insert into public.allowed_logins (email, role) values ('ops.lead@gmail.com', 'admin')`);
  asha = await addUser(db, '22bec045@nith.ac.in', 'Asha');
  ravi = await addUser(db, '21bcs001@nith.ac.in', 'Ravi');
  generalOwner = await addUser(db, 'general.owner@gmail.com');
  admin = await addUser(db, 'ops.lead@gmail.com');
  kailash = await dropPointId(db, 'Kailash Hostel');
});

const deliveryOrder = (items: { variant_id: string; qty: number }[], shopId: string = SHOP.general) =>
  as(db, asha, () => placeOrder(db, { shopId, mode: 'delivery', dropPointId: kailash, items }));

const otpFor = async (orderId: string) =>
  (await asOwner<{ delivery_otp: string }>(db, 'select delivery_otp from public.order_secrets where order_id = $1', [orderId]))[0]
    .delivery_otp;

// --- parity with packages/core --------------------------------------------------------------------

test('can_transition agrees with canTransition for every status, mode and actor', async () => {
  const actors: OrderActor[] = ['student', 'shop', 'rider', 'admin', 'system'];
  const modes: OrderMode[] = ['delivery', 'pickup'];
  const { rows } = await db.query<{ from_s: string; to_s: string; mode: string; actor: string; allowed: boolean }>(`
    select f::text as from_s, t::text as to_s, m::text as mode, a as actor,
           public.can_transition(f, t, m, a) as allowed
    from unnest(enum_range(null::public.order_status)) f,
         unnest(enum_range(null::public.order_status)) t,
         unnest(enum_range(null::public.order_mode)) m,
         unnest(array['student', 'shop', 'rider', 'admin', 'system']) a
  `);
  assert.equal(rows.length, ORDER_STATUSES.length ** 2 * modes.length * actors.length);
  const mismatches = rows.filter(
    (r) =>
      r.allowed !==
      canTransition({
        from: r.from_s as (typeof ORDER_STATUSES)[number],
        to: r.to_s as (typeof ORDER_STATUSES)[number],
        mode: r.mode as OrderMode,
        actor: r.actor as OrderActor,
      }),
  );
  assert.deepEqual(mismatches, []);
});

test('calculate_bill agrees with calculateBill around the small-cart limit', async () => {
  for (const subtotal of [0, 1, 5000, 9899, 9900, 9901, 25000]) {
    for (const mode of ['delivery', 'pickup'] as const) {
      const [row] = (
        await db.query<Record<string, number>>(`select * from public.calculate_bill($1, $2::public.order_mode)`, [subtotal, mode])
      ).rows;
      const expected = calculateBill(subtotal, mode);
      assert.deepEqual(
        {
          subtotalPaise: row.subtotal_paise,
          deliveryFeePaise: row.delivery_fee_paise,
          smallCartFeePaise: row.small_cart_fee_paise,
          platformFeePaise: row.platform_fee_paise,
          totalPaise: row.total_paise,
        },
        expected,
        `subtotal ${subtotal}, ${mode}`,
      );
    }
  }
});

// --- place_order ----------------------------------------------------------------------------------

test('place_order prices the cart from the database and merges repeated items', async () => {
  const order = await deliveryOrder([
    { variant_id: VARIANT.maggi70g, qty: 2 },
    { variant_id: VARIANT.maggi70g, qty: 1 },
    { variant_id: VARIANT.milk, qty: 1 },
  ]);
  // 3 x ₹14 + ₹27 = ₹69: below the ₹99 small-cart limit.
  assert.deepEqual(
    {
      subtotal: order.subtotal_paise,
      delivery: order.delivery_fee_paise,
      smallCart: order.small_cart_fee_paise,
      platform: order.platform_fee_paise,
      total: order.total_paise,
      status: order.status,
    },
    { subtotal: 6900, delivery: 1500, smallCart: 1000, platform: 400, total: 9800, status: 'placed' },
  );
  const items = await asOwner<{ name_snapshot: string; qty: number; price_paise_snapshot: number }>(
    db,
    'select name_snapshot, qty, price_paise_snapshot from public.order_items where order_id = $1 order by name_snapshot',
    [order.id],
  );
  assert.deepEqual(items, [
    { name_snapshot: 'Maggi Masala Noodles (70 g)', qty: 3, price_paise_snapshot: 1400 },
    { name_snapshot: 'Toned Milk (500 ml)', qty: 1, price_paise_snapshot: 2700 },
  ]);
});

test('pickup orders pay no delivery or small-cart fee', async () => {
  const order = await as(db, asha, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  assert.equal(order.total_paise, 1400 + 400);
});

test('pickup tokens count up for each shop', async () => {
  const first = await as(db, ravi, () =>
    placeOrder(db, { shopId: SHOP.stationery, mode: 'pickup', items: [{ variant_id: VARIANT.notebook, qty: 1 }] }),
  );
  const second = await as(db, ravi, () =>
    placeOrder(db, { shopId: SHOP.stationery, mode: 'pickup', items: [{ variant_id: VARIANT.notebook, qty: 2 }] }),
  );
  assert.equal(first.token_no, 1);
  assert.equal(second.token_no, 2);
});

test('place_order refuses bad carts with a clear reason', async () => {
  await assert.rejects(deliveryOrder([]), /cart is empty/);
  await assert.rejects(deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 0 }]), /quantity from 1 to 50/);
  await assert.rejects(deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 30 }, { variant_id: VARIANT.maggi70g, qty: 30 }]), /quantity from 1 to 50/);
  await assert.rejects(deliveryOrder([{ variant_id: VARIANT.mangoShake, qty: 1 }]), /not sold by this shop/);
  await assert.rejects(deliveryOrder([{ variant_id: '20000000-0000-4000-8000-0000000000ff', qty: 1 }]), /not sold by this shop/);
  await assert.rejects(deliveryOrder([{ variant_id: VARIANT.maggiPlate, qty: 1 }], SHOP.nightCanteen), /closed right now/);
  await assert.rejects(
    as(db, asha, () => placeOrder(db, { shopId: SHOP.general, mode: 'delivery', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] })),
    /Choose where to deliver/,
  );

  await asOwner(db, 'update public.variants set in_stock = false where id = $1', [VARIANT.laysClassic]);
  await assert.rejects(deliveryOrder([{ variant_id: VARIANT.laysClassic, qty: 1 }]), /out of stock/);
});

test('signed-out callers and blocked students cannot order', async () => {
  await assert.rejects(
    as(db, null, () => placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] })),
    /permission denied/,
  );
  const blocked = await addUser(db, '20bme999@nith.ac.in');
  await asOwner(db, 'update public.profiles set blocked = true where id = $1', [blocked]);
  await assert.rejects(
    as(db, blocked, () => placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] })),
    /cannot place orders/,
  );
});

// --- transition_order -----------------------------------------------------------------------------

test('a delivery runs placed → accepted → ready → out → delivered, closed by the OTP', async () => {
  const order = await deliveryOrder([{ variant_id: VARIANT.milk, qty: 4 }]);
  const accepted = await as(db, generalOwner, () => transition(db, order.id, 'accepted', { prepMinutes: 5 }));
  assert.equal(accepted.prep_minutes, 5);
  await as(db, generalOwner, () => transition(db, order.id, 'ready'));
  await as(db, generalOwner, () => transition(db, order.id, 'out_for_delivery'));

  const otp = await otpFor(order.id);
  const wrong = otp === '0000' ? '1111' : '0000';
  await assert.rejects(as(db, generalOwner, () => transition(db, order.id, 'delivered', { code: wrong })), /Wrong delivery code/);
  const delivered = await as(db, generalOwner, () => transition(db, order.id, 'delivered', { code: otp }));
  assert.equal(delivered.status, 'delivered');

  const events = await asOwner<{ to_status: string; actor: string }>(
    db,
    'select to_status, actor from public.order_events where order_id = $1 order by id',
    [order.id],
  );
  assert.deepEqual(events.map((e) => `${e.actor}:${e.to_status}`), [
    'student:placed',
    'shop:accepted',
    'shop:ready',
    'shop:out_for_delivery',
    'shop:delivered',
  ]);
});

test('a pickup is handed over with its token and never goes out for delivery', async () => {
  const order = await as(db, asha, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 1 }] }),
  );
  await as(db, generalOwner, () => transition(db, order.id, 'accepted'));
  await as(db, generalOwner, () => transition(db, order.id, 'ready'));
  await assert.rejects(as(db, generalOwner, () => transition(db, order.id, 'out_for_delivery')), /cannot move/);
  await assert.rejects(as(db, generalOwner, () => transition(db, order.id, 'collected', { code: '999' })), /Wrong pickup token/);
  const done = await as(db, generalOwner, () => transition(db, order.id, 'collected', { code: String(order.token_no) }));
  assert.equal(done.status, 'collected');
});

test('students cancel only before the shop accepts', async () => {
  const early = await deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  const cancelled = await as(db, asha, () => transition(db, early.id, 'cancelled'));
  assert.equal(cancelled.status, 'cancelled');

  const late = await deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  await as(db, generalOwner, () => transition(db, late.id, 'accepted'));
  await assert.rejects(as(db, asha, () => transition(db, late.id, 'cancelled')), /cannot move/);
});

test('shops and admins must give a reason to reject or cancel', async () => {
  const order = await deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  await assert.rejects(as(db, generalOwner, () => transition(db, order.id, 'rejected')), /Give a reason/);
  const rejected = await as(db, generalOwner, () => transition(db, order.id, 'rejected', { note: 'Out of Maggi' }));
  assert.equal(rejected.cancel_reason, 'Out of Maggi');

  const another = await deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  await as(db, generalOwner, () => transition(db, another.id, 'accepted'));
  await as(db, generalOwner, () => transition(db, another.id, 'ready'));
  const byAdmin = await as(db, admin, () => transition(db, another.id, 'cancelled', { note: 'Student unreachable' }));
  assert.equal(byAdmin.status, 'cancelled');
});

test('other students cannot touch an order, or even learn it exists', async () => {
  const order = await deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  await assert.rejects(as(db, ravi, () => transition(db, order.id, 'cancelled')), /Order not found/);
});

test('orders left unaccepted for 3 minutes expire', async () => {
  const stale = await deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  const fresh = await deliveryOrder([{ variant_id: VARIANT.maggi70g, qty: 1 }]);
  await asOwner(db, `update public.orders set placed_at = now() - interval '4 minutes' where id = $1`, [stale.id]);

  const [{ expired }] = await asOwner<{ expired: number }>(db, 'select public.expire_stale_orders() as expired');
  assert.ok(expired >= 1);

  const rows = await asOwner<{ id: string; status: string; cancel_reason: string | null }>(
    db,
    'select id, status, cancel_reason from public.orders where id in ($1, $2)',
    [stale.id, fresh.id],
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId[stale.id], { id: stale.id, status: 'expired', cancel_reason: 'Not accepted in time' });
  assert.equal(byId[fresh.id].status, 'placed');
});
