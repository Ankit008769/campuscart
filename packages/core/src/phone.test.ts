import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeIndianMobile } from './phone.ts';

test('accepts Indian mobiles written the usual ways', () => {
  assert.equal(normalizeIndianMobile('98765 43210'), '+919876543210');
  assert.equal(normalizeIndianMobile('+91 98765-43210'), '+919876543210');
  assert.equal(normalizeIndianMobile('09876543210'), '+919876543210');
  assert.equal(normalizeIndianMobile('919876543210'), '+919876543210');
});

test('rejects numbers that are not Indian mobiles', () => {
  assert.equal(normalizeIndianMobile('12345'), null);
  assert.equal(normalizeIndianMobile('5876543210'), null); // mobiles start 6 to 9
  assert.equal(normalizeIndianMobile('98765432101'), null);
});
