import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { deliverySurcharge } from '../../packages/core/src/bill.ts';
import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, placeOrder, type OrderRow } from './harness.ts';

let db: PGlite;
let student: string;
let kailash: string;

before(async () => {
  db = await createDb();
  student = await addUser(db, '23bec800@nith.ac.in', 'Night Owl');
  kailash = await dropPointId(db, 'Kailash Hostel');
  await asOwner(db, 'update public.drop_points set extra_delivery_fee_paise = 500 where id = $1', [kailash]);
  await asOwner(db, `insert into public.fee_rules (key, value_paise) values ('night_surcharge', 1000)
                     on conflict (key) do update set value_paise = excluded.value_paise`);
});

test('the SQL surcharge matches deliverySurcharge for every half hour, drop point and mode', async () => {
  const rows = await asOwner<{ at: string; mode: 'delivery' | 'pickup'; extra: number; sql: number }>(
    db,
    `select g.at::text as at, m::text as mode, d.extra_delivery_fee_paise as extra,
            public.delivery_surcharge(m, d.id, g.at) as sql
     from generate_series('2026-10-29 00:00+05:30'::timestamptz, '2026-10-29 23:30+05:30', interval '30 minutes') g(at)
     cross join unnest(enum_range(null::public.order_mode)) m
     cross join public.drop_points d`,
  );
  const mismatches = rows.filter(
    (r) => r.sql !== deliverySurcharge({ mode: r.mode, dropPointExtraPaise: r.extra, at: new Date(r.at), nightSurchargePaise: 1000 }),
  );
  assert.ok(rows.length > 96);
  assert.deepEqual(mismatches.slice(0, 3), []);
});

test('orders charge the surcharge, and the total still adds up', async () => {
  const order = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'delivery', dropPointId: kailash, items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
  );
  const [row] = await asOwner<OrderRow & { surcharge_paise: number }>(db, 'select * from public.orders where id = $1', [order.id]);
  const [{ expected }] = await asOwner<{ expected: number }>(db, `select public.delivery_surcharge('delivery', $1, now()) as expected`, [kailash]);
  assert.equal(row.surcharge_paise, expected);
  assert.ok(expected >= 500);
  assert.equal(
    row.total_paise,
    row.subtotal_paise + row.delivery_fee_paise + row.small_cart_fee_paise + row.platform_fee_paise + row.surcharge_paise,
  );

  const pickup = await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: VARIANT.maggi70g, qty: 2 }] }),
  );
  const [pickupRow] = await asOwner<{ surcharge_paise: number }>(db, 'select surcharge_paise from public.orders where id = $1', [pickup.id]);
  assert.equal(pickupRow.surcharge_paise, 0);
});
