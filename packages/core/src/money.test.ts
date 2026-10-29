import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatPaise, parseRupees, rupeesToPaise } from './money.ts';

test('formats whole rupees without decimals', () => {
  assert.equal(formatPaise(9900), '₹99');
  assert.equal(formatPaise(0), '₹0');
});

test('keeps two decimals for paise', () => {
  assert.equal(formatPaise(1205), '₹12.05');
  assert.equal(formatPaise(-350), '-₹3.50');
});

test('uses Indian digit grouping', () => {
  assert.equal(formatPaise(100000), '₹1,000');
  assert.equal(formatPaise(10000000), '₹1,00,000');
  assert.equal(formatPaise(123456789), '₹12,34,567.89');
});

test('converts rupees to paise without float drift', () => {
  assert.equal(rupeesToPaise(19.99), 1999);
  assert.equal(rupeesToPaise(0.1 + 0.2), 30);
});

test('parses typed rupee amounts into exact paise', () => {
  assert.equal(parseRupees('12'), 1200);
  assert.equal(parseRupees('12.5'), 1250);
  assert.equal(parseRupees(' ₹1,250.05 '), 125005);
  assert.equal(parseRupees('0.29'), 29);
  assert.equal(parseRupees(''), null);
  assert.equal(parseRupees('12.345'), null);
  assert.equal(parseRupees('-5'), null);
  assert.equal(parseRupees('abc'), null);
});
