import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { isWithinShopHours, parseShopHours } from '../../packages/core/src/hours.ts';
import { slotProblem } from '../../packages/core/src/schedule.ts';
import { SHOP, VARIANT, addUser, as, asOwner, createDb, dropPointId, transition } from './harness.ts';

let db: PGlite;
let owner: string;
let student: string;
let kailash: string;

before(async () => {
  db = await createDb();
  await asOwner(db, `insert into public.allowed_logins (email, role, shop_id) values ('slot.shop@gmail.com', 'merchant_owner', $1)`, [
    SHOP.general,
  ]);
  owner = await addUser(db, 'slot.shop@gmail.com', 'Owner');
  student = await addUser(db, '24bar500@nith.ac.in', 'Ira');
  kailash = await dropPointId(db, 'Kailash Hostel');
});

/** Tomorrow at hh:mm Indian time, as an ISO string. */
const tomorrowAt = async (time: string) =>
  (
    await asOwner<{ at: string }>(
      db,
      `select ((((now() at time zone 'Asia/Kolkata')::date + 1) + $1::time) at time zone 'Asia/Kolkata')::text as at`,
      [time],
    )
  )[0].at;

type Scheduled = { id: string; status: string; token_no: number; release_at: string; scheduled_for: string };
const schedule = (slot: string, mode: 'delivery' | 'pickup' = 'delivery') =>
  as(db, student, async () =>
    (
      await db.query<Scheduled>(
        `select * from public.place_order(p_shop_id => $1, p_mode => $2::public.order_mode, p_pay_method => 'cash',
           p_items => $3::jsonb, p_drop_point_id => $4, p_scheduled_for => $5::timestamptz)`,
        [SHOP.general, mode, JSON.stringify([{ variant_id: VARIANT.maggi70g, qty: 1 }]), mode === 'delivery' ? kailash : null, slot],
      )
    ).rows[0],
  );
const release = async (at: string) =>
  (await asOwner<{ n: number }>(db, 'select public.release_scheduled_orders($1::timestamptz) as n', [at]))[0].n;
const shopPushes = async (orderId: string) =>
  asOwner<{ title: string }>(db, `select title from public.push_outbox where app = 'merchant' and data ->> 'orderId' = $1`, [orderId]);

test('a 6:30 PM delivery reaches the shop at 6:30 minus prep and walk, and the student around 6:30', async () => {
  const slot = await tomorrowAt('18:30');
  const order = await schedule(slot);
  assert.equal(order.status, 'scheduled');
  assert.equal(order.token_no, 0, 'the token comes on the day of release');

  const [{ prep, walk }] = await asOwner<{ prep: number; walk: number }>(
    db,
    `select s.prep_minutes as prep, public.walk_minutes(s.id, 'delivery', $2) as walk from public.shops s where s.id = $1`,
    [SHOP.general, kailash],
  );
  const releaseAt = Date.parse(order.release_at);
  assert.equal(releaseAt, Date.parse(slot) - (prep + walk) * 60_000);

  // Until then the shop neither sees it among open orders nor can act on it.
  await assert.rejects(as(db, owner, () => transition(db, order.id, 'accepted', { prepMinutes: prep })), /cannot move from scheduled/);
  assert.deepEqual(await shopPushes(order.id), []);
  assert.equal(await release(new Date(releaseAt - 60_000).toISOString()), 0);
  assert.equal(await release(order.release_at), 1);

  const [released] = await asOwner<{ status: string; token_no: number; released_at: string }>(
    db,
    'select status, token_no, released_at from public.orders where id = $1',
    [order.id],
  );
  assert.equal(released.status, 'placed');
  assert.ok(released.token_no > 0);
  const pushes = await shopPushes(order.id);
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].title, /^New order #/);

  // The shop takes a minute to accept, cooks for its prep time, and the walk takes walk minutes.
  const arrives = releaseAt + (1 + prep + walk) * 60_000;
  const minutesFromSlot = (arrives - Date.parse(slot)) / 60_000;
  assert.ok(minutesFromSlot >= -10 && minutesFromSlot <= 10, `arrives ${minutesFromSlot} min from the slot`);
});

test('slots too soon, too far, off the quarter hour or outside shop hours are refused', async () => {
  const [{ soon }] = await asOwner<{ soon: string }>(
    db,
    `select (date_trunc('hour', now()) + interval '1 hour')::text as soon`,
  );
  // The next full hour is under 60 minutes away, but the shop needs prep + walk + 10 minutes of notice.
  // The next quarter hour after now: at most 15 minutes away, so always inside prep + walk + 10.
  const tooSoon = new Date(Date.now() + 60_000);
  tooSoon.setUTCMinutes(Math.ceil(tooSoon.getUTCMinutes() / 15) * 15, 0, 0);
  await assert.rejects(schedule(tooSoon.toISOString()), /too soon/);
  await assert.rejects(schedule(new Date(Date.parse(soon) + 3 * 24 * 3600_000).toISOString()), /2 days ahead/);
  await assert.rejects(schedule(await tomorrowAt('18:40')), /listed times/);

  await asOwner(db, `update public.shops set hours = '{"opens": "09:00", "closes": "12:00"}' where id = $1`, [SHOP.general]);
  await assert.rejects(schedule(await tomorrowAt('18:30')), /closed at that time/);
  await asOwner(db, `update public.shops set hours = '{}' where id = $1`, [SHOP.general]);
});

test('a shop closed at release time cancels the order and tells the student why', async () => {
  const order = await schedule(await tomorrowAt('13:00'), 'pickup');
  await asOwner(db, 'update public.shops set is_open = false where id = $1', [SHOP.general]);
  await release(order.release_at);
  await asOwner(db, 'update public.shops set is_open = true where id = $1', [SHOP.general]);

  const [row] = await asOwner<{ status: string; cancel_reason: string }>(db, 'select status, cancel_reason from public.orders where id = $1', [
    order.id,
  ]);
  assert.deepEqual(row, { status: 'cancelled', cancel_reason: 'The shop was closed at your scheduled time' });
  const [push] = await asOwner<{ title: string }>(
    db,
    `select title from public.push_outbox where app = 'consumer' and data ->> 'orderId' = $1`,
    [order.id],
  );
  assert.equal(push.title, 'Your order was cancelled');
});

test('students cancel a scheduled order without the shop hearing of it; released orders expire from release', async () => {
  const order = await schedule(await tomorrowAt('14:00'));
  await as(db, student, () => transition(db, order.id, 'cancelled'));
  assert.deepEqual(await shopPushes(order.id), []);

  const later = await schedule(await tomorrowAt('15:00'));
  await release(later.release_at);
  // Booked long ago but released 1 minute ago: still has time to be accepted.
  await asOwner(db, `update public.orders set placed_at = now() - interval '1 day', released_at = now() - interval '1 minute' where id = $1`, [
    later.id,
  ]);
  await asOwner(db, 'select public.expire_stale_orders()');
  assert.equal((await asOwner<{ status: string }>(db, 'select status from public.orders where id = $1', [later.id]))[0].status, 'placed');
  await asOwner(db, `update public.orders set released_at = now() - interval '8 minutes' where id = $1`, [later.id]);
  await asOwner(db, 'select public.expire_stale_orders()');
  assert.equal((await asOwner<{ status: string }>(db, 'select status from public.orders where id = $1', [later.id]))[0].status, 'expired');
});

test('the slot rules and shop hours agree with packages/core for every quarter hour over 2 days', async () => {
  const now = '2026-10-29T17:02:00+05:30';
  const configs = [{}, { opens: '09:00', closes: '22:00' }, { opens: '20:00', closes: '02:00', closed_days: ['sat'] }];
  for (const hours of configs) {
    await asOwner(db, 'update public.shops set hours = $2::jsonb where id = $1', [SHOP.stationery, JSON.stringify(hours)]);
    const rows = await asOwner<{ slot: string; problem: string | null; release: string; within: boolean; prep: number; walk: number }>(
      db,
      `select g.slot::text as slot,
              public.schedule_problem($1, 'delivery', $2, g.slot, $3::timestamptz) as problem,
              (g.slot - make_interval(mins => s.prep_minutes + public.walk_minutes($1, 'delivery', $2)))::text as release,
              public.within_shop_hours(s.hours, g.slot) as within,
              s.prep_minutes as prep, public.walk_minutes($1, 'delivery', $2) as walk
       from generate_series($3::timestamptz - interval '1 hour', $3::timestamptz + interval '2 days 2 hours', interval '5 minutes') as g(slot)
       cross join public.shops s where s.id = $1`,
      [SHOP.stationery, kailash, now],
    );
    const parsed = parseShopHours(hours);
    const mismatches = rows.filter(
      (r) =>
        (r.problem ?? null) !==
          slotProblem({ slot: new Date(r.slot), now: new Date(now), prepMinutes: r.prep, walkMinutes: r.walk, hours: parsed }) ||
        r.within !== isWithinShopHours(parsed, new Date(r.slot)),
    );
    assert.deepEqual(mismatches.slice(0, 3), [], JSON.stringify(hours));
  }
});
