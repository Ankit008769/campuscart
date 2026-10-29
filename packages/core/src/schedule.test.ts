import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isWithinShopHours } from './hours.ts';
import { releaseTime, scheduleSlots, slotLabel, slotProblem } from './schedule.ts';

const ist = (text: string) => new Date(`${text}:00+05:30`);

test('the shop gets a 6:30 PM order at 6:30 minus prep and walk', () => {
  assert.deepEqual(releaseTime(ist('2026-10-29T18:30'), 6, 10), ist('2026-10-29T18:14'));
});

test('slots are every 15 minutes, far enough ahead, within 2 days and shop hours', () => {
  const now = ist('2026-10-29T17:02');
  const base = { now, prepMinutes: 6, walkMinutes: 10, hours: { opens: '09:00', closes: '22:00', closedDays: [] } };
  assert.equal(slotProblem({ ...base, slot: ist('2026-10-29T17:15') }), 'That time is too soon. Order now instead');
  assert.equal(slotProblem({ ...base, slot: ist('2026-10-29T17:30') }), null);
  assert.equal(slotProblem({ ...base, slot: ist('2026-10-29T17:40') }), 'Pick one of the listed times');
  assert.equal(slotProblem({ ...base, slot: ist('2026-10-29T22:30') }), 'The shop is closed at that time');
  assert.equal(slotProblem({ ...base, slot: ist('2026-10-31T17:15') }), 'You can schedule up to 2 days ahead');

  const slots = scheduleSlots(base);
  assert.deepEqual(slots[0], ist('2026-10-29T17:30'));
  assert.ok(slots.every((s) => s.getUTCMinutes() % 15 === 0));
  // Last slot today: the shop must get it by 21:59, so 22:15 (released 21:59) is the latest.
  assert.ok(slots.some((s) => +s === +ist('2026-10-29T22:15')));
  assert.ok(!slots.some((s) => +s === +ist('2026-10-29T22:30')));
});

test('hours past midnight follow the evening they started', () => {
  const night = { opens: '20:00', closes: '02:00', closedDays: ['sun' as const] };
  assert.equal(isWithinShopHours(night, ist('2026-10-31T21:00')), true);
  assert.equal(isWithinShopHours(night, ist('2026-11-01T01:30')), true);
  assert.equal(isWithinShopHours(night, ist('2026-11-01T21:00')), false);
  assert.equal(isWithinShopHours(night, ist('2026-11-02T01:30')), false);
  assert.equal(isWithinShopHours(null, ist('2026-11-02T03:00')), true);
});

test('labels slots by Indian day and time', () => {
  const now = ist('2026-10-29T23:50');
  assert.deepEqual(slotLabel(ist('2026-10-30T00:15'), now), { day: 'Tomorrow', time: '12:15 AM' });
  assert.deepEqual(slotLabel(ist('2026-10-29T23:55'), now), { day: 'Today', time: '11:55 PM' });
  assert.deepEqual(slotLabel(ist('2026-10-31T18:30'), now), { day: 'Sat 31 Oct', time: '6:30 PM' });
});
