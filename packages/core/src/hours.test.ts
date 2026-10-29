import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeShopHours, formatTime, parseShopHours, shopHoursValue } from './hours.ts';

test('formats 24-hour times the way people say them', () => {
  assert.equal(formatTime('00:00'), '12 AM');
  assert.equal(formatTime('09:30'), '9:30 AM');
  assert.equal(formatTime('12:00'), '12 PM');
  assert.equal(formatTime('23:05'), '11:05 PM');
});

test('reads stored hours and ignores anything malformed', () => {
  assert.deepEqual(parseShopHours({ opens: '20:00', closes: '02:00', closed_days: ['sun', 'xyz'] }), {
    opens: '20:00',
    closes: '02:00',
    closedDays: ['sun'],
  });
  assert.equal(parseShopHours({}), null);
  assert.equal(parseShopHours({ opens: '9:00', closes: '23:00' }), null);
  assert.equal(parseShopHours(null), null);
});

test('writes hours back in week order, and none as an empty object', () => {
  assert.deepEqual(shopHoursValue({ opens: '09:00', closes: '22:00', closedDays: ['sun', 'mon'] }), {
    opens: '09:00',
    closes: '22:00',
    closed_days: ['mon', 'sun'],
  });
  assert.deepEqual(shopHoursValue(null), {});
});

test('describes hours for students', () => {
  assert.equal(describeShopHours({ opens: '09:00', closes: '23:00', closedDays: [] }), '9 AM to 11 PM');
  assert.equal(describeShopHours({ opens: '20:00', closes: '02:00', closedDays: ['sun'] }), '8 PM to 2 AM, closed Sun');
  assert.equal(describeShopHours({ opens: '00:00', closes: '00:00', closedDays: [] }), 'Open all day');
});
