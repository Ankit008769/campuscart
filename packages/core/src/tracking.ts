/**
 * Live rider tracking. The rider's phone broadcasts positions on the private Realtime channel
 * trackingTopic(order id) while the order is out for delivery; can_use_tracking_channel in SQL
 * decides who may send and listen. Positions are never stored.
 */

export type RiderPosition = { lat: number; lng: number; at: number };

/** How often the rider's phone sends its position. */
export const TRACKING_INTERVAL_MS = 5000;
/** Riders walk or cycle short campus distances; about 80 m a minute is a fair walking pace. */
const METRES_PER_MINUTE = 80;

export const trackingTopic = (orderId: string) => `track:${orderId}`;

/** Straight-line distance in metres between two points (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

/** Minutes until arrival at walking pace, at least 1. */
export function etaMinutes(metres: number): number {
  return Math.max(1, Math.ceil(metres / METRES_PER_MINUTE));
}
