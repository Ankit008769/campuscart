import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canTransition, isFinal, orderSteps, type OrderActor, type OrderStatus } from './orders.ts';

test('a shop accepts, packs and hands over a delivery order', () => {
  assert.ok(canTransition({ from: 'placed', to: 'accepted', mode: 'delivery', actor: 'shop' }));
  assert.ok(canTransition({ from: 'accepted', to: 'ready', mode: 'delivery', actor: 'shop' }));
  assert.ok(canTransition({ from: 'ready', to: 'out_for_delivery', mode: 'delivery', actor: 'rider' }));
  assert.ok(canTransition({ from: 'out_for_delivery', to: 'delivered', mode: 'delivery', actor: 'rider' }));
});

test('pickup orders are collected, never sent out', () => {
  assert.ok(canTransition({ from: 'ready', to: 'collected', mode: 'pickup', actor: 'shop' }));
  assert.ok(!canTransition({ from: 'ready', to: 'out_for_delivery', mode: 'pickup', actor: 'shop' }));
  assert.ok(!canTransition({ from: 'ready', to: 'collected', mode: 'delivery', actor: 'shop' }));
});

test('students cancel only before the shop accepts', () => {
  assert.ok(canTransition({ from: 'placed', to: 'cancelled', mode: 'delivery', actor: 'student' }));
  assert.ok(!canTransition({ from: 'accepted', to: 'cancelled', mode: 'delivery', actor: 'student' }));
  assert.ok(canTransition({ from: 'accepted', to: 'cancelled', mode: 'delivery', actor: 'shop' }));
});

test('a shop can call off an order it took until it leaves the shop', () => {
  assert.ok(canTransition({ from: 'ready', to: 'cancelled', mode: 'pickup', actor: 'shop' }));
  assert.ok(canTransition({ from: 'ready', to: 'cancelled', mode: 'delivery', actor: 'shop' }));
  assert.ok(!canTransition({ from: 'ready', to: 'cancelled', mode: 'pickup', actor: 'student' }));
  assert.ok(!canTransition({ from: 'out_for_delivery', to: 'cancelled', mode: 'delivery', actor: 'shop' }));
});

test('admins may cancel any open order but not a finished one', () => {
  assert.ok(canTransition({ from: 'ready', to: 'cancelled', mode: 'pickup', actor: 'admin' }));
  assert.ok(!canTransition({ from: 'delivered', to: 'cancelled', mode: 'delivery', actor: 'admin' }));
});

test('only the system expires an order, and only from placed', () => {
  assert.ok(canTransition({ from: 'placed', to: 'expired', mode: 'delivery', actor: 'system' }));
  assert.ok(!canTransition({ from: 'placed', to: 'expired', mode: 'delivery', actor: 'shop' }));
  assert.ok(!canTransition({ from: 'accepted', to: 'expired', mode: 'delivery', actor: 'system' }));
});

test('nobody skips steps', () => {
  assert.ok(!canTransition({ from: 'placed', to: 'ready', mode: 'delivery', actor: 'shop' }));
  assert.ok(!canTransition({ from: 'accepted', to: 'delivered', mode: 'delivery', actor: 'shop' }));
});

test('final statuses and step lists', () => {
  assert.ok(isFinal('delivered'));
  assert.ok(!isFinal('ready'));
  assert.deepEqual(orderSteps('pickup'), ['placed', 'accepted', 'ready', 'collected']);
});

test('scheduled orders are released by the system and cancelled by the student or the system', () => {
  const can = (to: OrderStatus, actor: OrderActor) => canTransition({ from: 'scheduled', to, mode: 'delivery', actor });
  assert.equal(can('placed', 'system'), true);
  assert.equal(can('placed', 'shop'), false);
  assert.equal(can('placed', 'student'), false);
  assert.equal(can('accepted', 'shop'), false, 'the shop cannot accept before release');
  assert.equal(can('cancelled', 'student'), true);
  assert.equal(can('cancelled', 'system'), true);
  assert.equal(can('cancelled', 'admin'), true);
  assert.equal(can('cancelled', 'shop'), false);
  assert.equal(canTransition({ from: 'placed', to: 'placed', mode: 'delivery', actor: 'system' }), false);
});
