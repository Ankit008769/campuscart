import assert from 'node:assert/strict';
import { test } from 'node:test';

import { couponLabel } from './engagement.ts';

const base = { code: 'X', description: '', max_discount_paise: null, min_subtotal_paise: 0 };

test('describes coupons the way students read them', () => {
  assert.equal(couponLabel({ ...base, kind: 'flat', value: 2000 }), '₹20 off');
  assert.equal(couponLabel({ ...base, kind: 'percent', value: 50, max_discount_paise: 3000 }), '50% off, up to ₹30');
  assert.equal(couponLabel({ ...base, kind: 'flat', value: 5000, min_subtotal_paise: 29900 }), '₹50 off on ₹299+');
});
