import assert from 'node:assert/strict';
import { test } from 'node:test';

import { effectivePrepMinutes, reportCsv, reportPeriods } from './shop-tools.ts';

const ist = (text: string) => new Date(`${text}+05:30`);

test('report periods are Indian-time weeks from Monday and calendar months', () => {
  // Thursday 29 October 2026, 00:30 in India (still Wednesday in UTC).
  const periods = Object.fromEntries(reportPeriods(ist('2026-10-29T00:30:00')).map((p) => [p.key, p]));
  assert.deepEqual(periods['this-week'].from, ist('2026-10-26T00:00:00'));
  assert.deepEqual(periods['this-week'].to, ist('2026-11-02T00:00:00'));
  assert.deepEqual(periods['last-week'].from, ist('2026-10-19T00:00:00'));
  assert.deepEqual(periods['this-month'].from, ist('2026-10-01T00:00:00'));
  assert.deepEqual(periods['this-month'].to, ist('2026-11-01T00:00:00'));
  assert.deepEqual(periods['last-month'].from, ist('2026-09-01T00:00:00'));
});

test('rush mode adds its extra minutes only while it lasts', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const shop = { prep_minutes: 8, rush_extra_minutes: 10 };
  assert.equal(effectivePrepMinutes({ ...shop, rush_until: '2026-10-29T12:30:00Z' }, now), 18);
  assert.equal(effectivePrepMinutes({ ...shop, rush_until: '2026-10-29T11:30:00Z' }, now), 8);
  assert.equal(effectivePrepMinutes({ ...shop, rush_until: null }, now), 8);
});

test('the CSV has a row per day and a total, in rupees', () => {
  const csv = reportCsv([
    { day: '2026-10-27', orders: 3, completed: 2, dropped: 1, sales_paise: 25050, commission_paise: 2505 },
    { day: '2026-10-28', orders: 1, completed: 1, dropped: 0, sales_paise: 10000, commission_paise: 1000 },
  ]);
  assert.deepEqual(csv.split('\n'), [
    'Date,Orders,Completed,Rejected or cancelled,Sales (₹),Commission (₹),Net (₹)',
    '2026-10-27,3,2,1,250.50,25.05,225.45',
    '2026-10-28,1,1,0,100.00,10.00,90.00',
    'Total,4,3,1,350.50,35.05,315.45',
  ]);
});
