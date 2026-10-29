import assert from 'node:assert/strict';
import { test } from 'node:test';

import { distanceMetres, etaMinutes, trackingTopic } from './tracking.ts';

test('distances on campus come out in metres', () => {
  // About 111 m per 0.001 degree of latitude.
  const d = distanceMetres({ lat: 31.708, lng: 76.527 }, { lat: 31.709, lng: 76.527 });
  assert.ok(Math.abs(d - 111) < 1, String(d));
  assert.equal(distanceMetres({ lat: 31.7, lng: 76.5 }, { lat: 31.7, lng: 76.5 }), 0);
});

test('arrival estimates are whole minutes at walking pace, never zero', () => {
  assert.equal(etaMinutes(0), 1);
  assert.equal(etaMinutes(400), 5);
  assert.equal(etaMinutes(401), 6);
});

test('each order has its own channel', () => {
  assert.equal(trackingTopic('abc'), 'track:abc');
});
