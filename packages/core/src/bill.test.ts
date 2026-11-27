import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_FEE_RULES, calculateBill, deliveryCharge, deliverySurcharge, rulesForShop } from './bill.ts';

test('deliveries under ₹250 pay ₹50 delivery and the ₹4 platform fee', () => {
  const bill = calculateBill(6000, 'delivery');
  assert.deepEqual(bill, {
    subtotalPaise: 6000,
    deliveryFeePaise: 0,
    smallCartFeePaise: 5000,
    platformFeePaise: 400,
    totalPaise: 11400,
  });
  assert.equal(deliveryCharge(bill), 5000);
});

test('deliveries from ₹250 are free, apart from the platform fee', () => {
  const bill = calculateBill(25000, 'delivery');
  assert.equal(deliveryCharge(bill), 0);
  assert.equal(bill.totalPaise, 25400);
});

test('a shop that also charges a flat delivery fee shows both parts as one delivery charge', () => {
  const bill = calculateBill(6000, 'delivery', { deliveryFeePaise: 1500, smallCartLimitPaise: 9900, smallCartFeePaise: 1000, platformFeePaise: 400 });
  assert.equal(deliveryCharge(bill), 2500);
  assert.equal(bill.totalPaise, 8900);
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

test("a shop's own free-delivery minimum replaces the usual one; no setting keeps it", () => {
  const sp = rulesForShop(DEFAULT_FEE_RULES, { free_delivery_min_paise: 30000 });
  assert.equal(sp.smallCartLimitPaise, 30000);
  assert.equal(calculateBill(28000, 'delivery', sp).smallCartFeePaise, DEFAULT_FEE_RULES.smallCartFeePaise);
  assert.equal(calculateBill(30000, 'delivery', sp).smallCartFeePaise, 0);
  assert.equal(calculateBill(28000, 'pickup', sp).smallCartFeePaise, 0);
  assert.equal(rulesForShop(DEFAULT_FEE_RULES, { free_delivery_min_paise: null }), DEFAULT_FEE_RULES);
  assert.equal(rulesForShop(DEFAULT_FEE_RULES, undefined), DEFAULT_FEE_RULES);
});
