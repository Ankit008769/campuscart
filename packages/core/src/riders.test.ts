import assert from 'node:assert/strict';
import { test } from 'node:test';

import { earningsByWeek, payoutWeekOf } from './riders.ts';

test('payout weeks run Monday to Sunday in Indian time', () => {
  // 2026-11-01 is a Sunday. 23:00 IST on Sunday is still that week; 00:30 IST Monday is the next.
  assert.equal(payoutWeekOf('2026-11-01T17:30:00Z'), '2026-10-26');
  assert.equal(payoutWeekOf('2026-11-01T19:00:00Z'), '2026-11-02');
  assert.equal(payoutWeekOf('2026-10-26T00:00:00+05:30'), '2026-10-26');
});

test('earnings add up delivered orders per week, newest first', () => {
  assert.deepEqual(
    earningsByWeek([
      { status: 'delivered', completed_at: '2026-10-27T10:00:00Z', rider_payout_paise: 1500 },
      { status: 'delivered', completed_at: '2026-10-28T10:00:00Z', rider_payout_paise: 1500 },
      { status: 'delivered', completed_at: '2026-11-03T10:00:00Z', rider_payout_paise: 1200 },
      { status: 'out_for_delivery', completed_at: null, rider_payout_paise: 1500 },
      { status: 'cancelled', completed_at: null, rider_payout_paise: 0 },
    ]),
    [
      { weekStart: '2026-11-02', deliveries: 1, paise: 1200 },
      { weekStart: '2026-10-26', deliveries: 2, paise: 3000 },
    ],
  );
});
