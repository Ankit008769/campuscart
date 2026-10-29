import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateBill, deliverySurcharge } from './bill.ts';

test('small delivery orders pay delivery, small-cart and platform fees', () => {
  assert.deepEqual(calculateBill(6000, 'delivery'), {
    subtotalPaise: 6000,
    deliveryFeePaise: 1500,
    smallCartFeePaise: 1000,
    platformFeePaise: 400,
    totalPaise: 8900,
  });
});

test('orders at the small-cart limit skip the small-cart fee', () => {
  assert.equal(calculateBill(9900, 'delivery').smallCartFeePaise, 0);
});

test('pickup orders pay only the platform fee', () => {
  const bill = calculateBill(6000, 'pickup');
  assert.equal(bill.deliveryFeePaise, 0);
  assert.equal(bill.smallCartFeePaise, 0);
  assert.equal(bill.totalPaise, 6400);
});

test('an empty cart costs nothing', () => {
  assert.equal(calculateBill(0, 'delivery').totalPaise, 0);
});

test('deliveries to far drop points and at night cost extra; pickups never do', () => {
  const at = (time: string) => new Date(`2026-10-29T${time}:00+05:30`);
  const base = { mode: 'delivery' as const, dropPointExtraPaise: 500, nightSurchargePaise: 1000 };
  assert.equal(deliverySurcharge({ ...base, at: at('22:59') }), 500);
  assert.equal(deliverySurcharge({ ...base, at: at('23:00') }), 1500);
  assert.equal(deliverySurcharge({ ...base, at: at('05:59') }), 1500);
  assert.equal(deliverySurcharge({ ...base, at: at('06:00') }), 500);
  assert.equal(deliverySurcharge({ ...base, mode: 'pickup', at: at('23:30') }), 0);
});
