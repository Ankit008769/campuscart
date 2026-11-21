import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isUpiVpa, upiPayUrl } from './handover.ts';

test('isUpiVpa accepts UPI IDs and refuses anything else', () => {
  assert.equal(isUpiVpa('4hcanteen@okaxis'), true);
  assert.equal(isUpiVpa(' jsm.booth4@ybl '), true, 'surrounding spaces are ignored');
  assert.equal(isUpiVpa('9876543210@paytm'), true);
  assert.equal(isUpiVpa('not a upi id'), false);
  assert.equal(isUpiVpa('shop@'), false);
  assert.equal(isUpiVpa('@okaxis'), false);
  assert.equal(isUpiVpa('shop@ok axis'), false);
});

test('upiPayUrl fills payee, rupee amount and note, encoded for UPI apps', () => {
  const url = upiPayUrl({ vpa: '4hcanteen@okaxis', payee: '4H Canteen', amountPaise: 13950, note: 'CampusCart 7B58E14E' });
  assert.equal(url, 'upi://pay?pa=4hcanteen%40okaxis&pn=4H%20Canteen&am=139.50&cu=INR&tn=CampusCart%207B58E14E');
  assert.match(upiPayUrl({ vpa: 'a.b@ybl', payee: 'Jai Santoshi Maa - Booth 4', amountPaise: 9900, note: 'x' }), /&am=99\.00&/);
});

test('upiPayUrl refuses bad IDs and amounts', () => {
  assert.throws(() => upiPayUrl({ vpa: 'nope', payee: 'X', amountPaise: 100, note: '' }), /Not a UPI ID/);
  assert.throws(() => upiPayUrl({ vpa: 'ab@ybl', payee: 'X', amountPaise: 0, note: '' }), /positive/);
  assert.throws(() => upiPayUrl({ vpa: 'ab@ybl', payee: 'X', amountPaise: 12.5, note: '' }), /positive/);
});
