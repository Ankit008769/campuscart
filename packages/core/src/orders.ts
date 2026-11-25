/**
 * The order state machine from the build plan (Phase 1 · Data model and order rules).
 * The database function `transition_order` must enforce exactly the same rules;
 * the apps use this copy only to decide which buttons to show.
 */

export const ORDER_STATUSES = [
  'scheduled',
  'placed',
  'accepted',
  'ready',
  'out_for_delivery',
  'delivered',
  'collected',
  'rejected',
  'cancelled',
  'expired',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderMode = 'delivery' | 'pickup';
export type OrderActor = 'student' | 'shop' | 'rider' | 'admin' | 'system';

/** A shop must accept within this window, or the order is dropped (nothing to pay). The server reminds the shop at 2 minutes. */
export const ACCEPT_WINDOW_MS = 7 * 60 * 1000;

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // A scheduled order waits, unseen by the shop, until its slot time minus prep and walk time.
  scheduled: ['placed', 'cancelled'],
  placed: ['accepted', 'rejected', 'cancelled', 'expired'],
  // A shop can still call off an order it took (by mistake, or an item ran out) until it leaves the shop.
  accepted: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'collected', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  collected: [],
  rejected: [],
  cancelled: [],
  expired: [],
};

const ACTORS_FOR: Record<Exclude<OrderStatus, 'scheduled' | 'placed' | 'cancelled'>, readonly OrderActor[]> = {
  accepted: ['shop'],
  rejected: ['shop'],
  ready: ['shop'],
  out_for_delivery: ['shop', 'rider'],
  delivered: ['shop', 'rider'],
  collected: ['shop'],
  expired: ['system'],
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  scheduled: 'Scheduled',
  placed: 'Order placed',
  accepted: 'Accepted by shop',
  ready: 'Packed and ready',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  collected: 'Collected',
  rejected: 'Rejected by shop',
  cancelled: 'Cancelled',
  expired: 'The shop was too busy',
};

export function isFinal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

/** The happy-path steps a student sees on the order status screen. */
export function orderSteps(mode: OrderMode): OrderStatus[] {
  return mode === 'delivery'
    ? ['placed', 'accepted', 'ready', 'out_for_delivery', 'delivered']
    : ['placed', 'accepted', 'ready', 'collected'];
}

export function canTransition(args: {
  from: OrderStatus;
  to: OrderStatus;
  mode: OrderMode;
  actor: OrderActor;
}): boolean {
  const { from, to, mode, actor } = args;
  if (isFinal(from)) return false;

  // Admins may finish any open order a shop forgot to finish (admin_complete_order): a delivery
  // becomes delivered, a pickup collected.
  if (actor === 'admin' && (to === 'delivered' || to === 'collected') && (from === 'accepted' || from === 'ready' || from === 'out_for_delivery')) {
    return (to === 'delivered') === (mode === 'delivery');
  }

  // Admins may cancel any open order.
  if (to === 'cancelled' && actor === 'admin') return true;

  if (!ORDER_TRANSITIONS[from].includes(to)) return false;
  if (to === 'out_for_delivery' && mode !== 'delivery') return false;
  if (to === 'collected' && mode !== 'pickup') return false;

  if (to === 'cancelled') {
    // A scheduled order: the student, or the system when the shop is closed at release time.
    if (from === 'scheduled') return actor === 'student' || actor === 'system';
    // Students may cancel only before the shop accepts; after that only the shop can.
    return from === 'placed' ? actor === 'student' : actor === 'shop';
  }
  // Only the system releases a scheduled order to the shop; nothing moves back to scheduled.
  if (to === 'placed') return actor === 'system';
  if (to === 'scheduled') return false;
  return ACTORS_FOR[to].includes(actor);
}
